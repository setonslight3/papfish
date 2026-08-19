import type { MoveStat, PositionStats, RatingBucket, TimeControl } from '@papfish/core';
import { getRatingBucket, normalizeStats, positionKey, TIME_CONTROLS } from '@papfish/core';
import { env } from '@/lib/env';
import { getRepository } from '@/data';

export interface StatsRequest {
  fen: string;
  ratingBucket: RatingBucket;
  timeControl: TimeControl;
}

export interface StatsResult {
  stats: PositionStats | null;
  /** Where the numbers came from, so the UI can be honest about the sample. */
  origin: 'database' | 'lichess-live' | 'none';
}

interface ExplorerMove {
  uci: string;
  san: string;
  white: number;
  draws: number;
  black: number;
  averageRating?: number | null;
}

interface ExplorerResponse {
  white: number;
  draws: number;
  black: number;
  moves: ExplorerMove[];
}

const cache = new Map<string, StatsResult>();
const inFlight = new Map<string, Promise<StatsResult>>();

function cacheKey(request: StatsRequest): string {
  return `${positionKey(request.fen)}|${request.ratingBucket}|${request.timeControl}`;
}

function explorerUrl(request: StatsRequest): string {
  const bucket = getRatingBucket(request.ratingBucket);
  const params = new URLSearchParams({
    variant: 'standard',
    fen: request.fen,
    moves: '12',
    topGames: '0',
    recentGames: '0',
  });
  if (bucket.source === 'masters') {
    return `${env.explorerBaseUrl}/masters?${params.toString()}`;
  }
  const speeds =
    TIME_CONTROLS.find((tc) => tc.id === request.timeControl)?.lichessSpeeds ??
    TIME_CONTROLS[0].lichessSpeeds;
  params.set('ratings', bucket.lichessRatingGroups.join(','));
  params.set('speeds', speeds.join(','));
  return `${env.explorerBaseUrl}/lichess?${params.toString()}`;
}

function fromExplorer(request: StatsRequest, body: ExplorerResponse): PositionStats {
  const totalGames = (body.white ?? 0) + (body.draws ?? 0) + (body.black ?? 0);
  const moves: MoveStat[] = (body.moves ?? []).map((move) => {
    const games = (move.white ?? 0) + (move.draws ?? 0) + (move.black ?? 0);
    return {
      san: move.san,
      uci: move.uci,
      games,
      whiteWins: move.white ?? 0,
      draws: move.draws ?? 0,
      blackWins: move.black ?? 0,
      averageRating: move.averageRating ?? null,
      percentage: 0,
    };
  });

  return normalizeStats({
    positionKey: positionKey(request.fen),
    ratingBucket: request.ratingBucket,
    timeControl: getRatingBucket(request.ratingBucket).source === 'masters' ? 'all' : request.timeControl,
    source: getRatingBucket(request.ratingBucket).source,
    totalGames,
    moves,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Opening popularity for a position.
 *
 * The aggregated statistics table produced by the pipeline is the primary
 * source. When a position has not been aggregated yet, and live lookups are
 * enabled, the public Lichess explorer is queried directly and the answer is
 * cached for the session. If neither has data, the result is `null` - the
 * application never manufactures popularity, and never substitutes an engine
 * evaluation for it.
 */
export async function fetchPositionStats(request: StatsRequest): Promise<StatsResult> {
  const key = cacheKey(request);
  const cached = cache.get(key);
  if (cached) return cached;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = (async (): Promise<StatsResult> => {
    try {
      const stored = await getRepository().getPositionStats({
        positionKey: positionKey(request.fen),
        ratingBucket: request.ratingBucket,
        timeControl: request.timeControl,
      });
      if (stored && stored.totalGames > 0) {
        // Percentages are always re-derived from the raw counts, whatever the
        // provider returned, so a stale share can never be displayed.
        return { stats: normalizeStats(stored), origin: 'database' };
      }
    } catch (error) {
      console.warn('[papfish] statistics lookup failed', error);
    }

    if (!env.liveExplorerEnabled) return { stats: null, origin: 'none' };

    try {
      const response = await fetch(explorerUrl(request), { headers: { Accept: 'application/json' } });
      if (!response.ok) return { stats: null, origin: 'none' };
      const body = (await response.json()) as ExplorerResponse;
      const stats = fromExplorer(request, body);
      return stats.totalGames > 0
        ? { stats, origin: 'lichess-live' }
        : { stats, origin: 'lichess-live' };
    } catch {
      return { stats: null, origin: 'none' };
    }
  })();

  inFlight.set(key, promise);
  const result = await promise;
  inFlight.delete(key);
  cache.set(key, result);
  return result;
}

export function clearStatsCache(): void {
  cache.clear();
  inFlight.clear();
}
