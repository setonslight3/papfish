/**
 * Minimal client for the Lichess opening explorer.
 *
 * The explorer is the aggregation of the Lichess Open Database, which is the
 * source of every popularity number in Papfish. Nothing here estimates,
 * smooths or invents a statistic: rows are stored exactly as the source
 * reports them, and percentages are derived from the raw game counts later.
 *
 * The explorer is rate limited, so requests are serialised with a delay and a
 * disk cache. This is a background pipeline - it never runs in a user request.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { MoveStat, PositionStats, RatingBucket, TimeControl } from '@papfish/core';
import { getRatingBucket, positionKey, TIME_CONTROLS } from '@papfish/core';
import { OUT_DIR } from './paths.js';

const LICHESS_ENDPOINT = 'https://explorer.lichess.ovh/lichess';
const MASTERS_ENDPOINT = 'https://explorer.lichess.ovh/masters';
const CACHE_DIR = resolve(OUT_DIR, 'cache');

interface ExplorerMove {
  uci: string;
  san: string;
  white: number;
  draws: number;
  black: number;
  averageRating?: number | null;
  averageOpponentRating?: number | null;
}

interface ExplorerResponse {
  white: number;
  draws: number;
  black: number;
  moves: ExplorerMove[];
}

export interface ExplorerQuery {
  fen: string;
  ratingBucket: RatingBucket;
  timeControl: TimeControl;
  moves?: number;
}

export interface ExplorerClientOptions {
  /** Milliseconds between requests. The public API tolerates roughly one per second. */
  delayMs?: number;
  maxRetries?: number;
  useCache?: boolean;
  fetchImpl?: typeof fetch;
}

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

function cacheKey(url: string): string {
  return createHash('sha1').update(url).digest('hex');
}

export class LichessExplorerClient {
  private readonly delayMs: number;
  private readonly maxRetries: number;
  private readonly useCache: boolean;
  private readonly fetchImpl: typeof fetch;
  private lastRequestAt = 0;

  constructor(options: ExplorerClientOptions = {}) {
    this.delayMs = options.delayMs ?? 1100;
    this.maxRetries = options.maxRetries ?? 4;
    this.useCache = options.useCache ?? true;
    this.fetchImpl = options.fetchImpl ?? fetch;
    if (this.useCache) mkdirSync(CACHE_DIR, { recursive: true });
  }

  buildUrl(query: ExplorerQuery): string {
    const bucket = getRatingBucket(query.ratingBucket);
    const speeds =
      TIME_CONTROLS.find((tc) => tc.id === query.timeControl)?.lichessSpeeds ??
      TIME_CONTROLS[0].lichessSpeeds;

    const params = new URLSearchParams({
      variant: 'standard',
      fen: query.fen,
      moves: String(query.moves ?? 12),
      topGames: '0',
      recentGames: '0',
    });

    if (bucket.source === 'masters') {
      return `${MASTERS_ENDPOINT}?${params.toString()}`;
    }
    params.set('ratings', bucket.lichessRatingGroups.join(','));
    params.set('speeds', speeds.join(','));
    return `${LICHESS_ENDPOINT}?${params.toString()}`;
  }

  private async request(url: string): Promise<ExplorerResponse> {
    const file = resolve(CACHE_DIR, `${cacheKey(url)}.json`);
    if (this.useCache && existsSync(file)) {
      return JSON.parse(readFileSync(file, 'utf8')) as ExplorerResponse;
    }

    let attempt = 0;
    for (;;) {
      const waitFor = this.delayMs - (Date.now() - this.lastRequestAt);
      if (waitFor > 0) await sleep(waitFor);
      this.lastRequestAt = Date.now();

      const response = await this.fetchImpl(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'papfish-pipeline' },
      });

      if (response.ok) {
        const body = (await response.json()) as ExplorerResponse;
        if (this.useCache) writeFileSync(file, JSON.stringify(body), 'utf8');
        return body;
      }

      attempt += 1;
      if (attempt > this.maxRetries) {
        throw new Error(`Explorer request failed (${response.status}) after ${attempt} attempts: ${url}`);
      }
      const backoff = response.status === 429 ? 60_000 : 2 ** attempt * 1000;
      console.warn(`Explorer ${response.status}; retrying in ${Math.round(backoff / 1000)}s`);
      await sleep(backoff);
    }
  }

  /** Fetch aggregated statistics for one position and one population. */
  async fetchPosition(query: ExplorerQuery): Promise<PositionStats> {
    const body = await this.request(this.buildUrl(query));
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
        percentage: totalGames > 0 ? (games / totalGames) * 100 : 0,
      };
    });

    return {
      positionKey: positionKey(query.fen),
      ratingBucket: query.ratingBucket,
      timeControl: getRatingBucket(query.ratingBucket).source === 'masters' ? 'all' : query.timeControl,
      source: getRatingBucket(query.ratingBucket).source,
      totalGames,
      moves,
      updatedAt: new Date().toISOString(),
    };
  }
}
