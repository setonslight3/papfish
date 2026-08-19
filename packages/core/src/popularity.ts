import type { CandidatePolicy, MoveStat, PositionStats } from './types.js';

export interface PopularityFilter {
  /** Drop moves played in fewer than this many games. */
  minGames?: number;
  /** Drop moves below this share of the position's games (0-100). */
  minPercentage?: number;
  /** Never return more than this many candidates. */
  maxCandidates?: number;
}

export const DEFAULT_POPULARITY_FILTER: Required<PopularityFilter> = {
  minGames: 5,
  minPercentage: 0.5,
  maxCandidates: 12,
};

/**
 * popularity(move) = games_with_move / total_games_at_position.
 *
 * Percentages are always recomputed from raw game counts so that a stale or
 * partially filtered statistics row can never present invented shares.
 */
export function withPercentages(moves: MoveStat[], totalGamesOverride?: number): MoveStat[] {
  const total =
    totalGamesOverride ?? moves.reduce((sum, move) => sum + Math.max(0, move.games), 0);
  if (total <= 0) {
    return moves.map((move) => ({ ...move, percentage: 0 }));
  }
  return moves.map((move) => ({
    ...move,
    percentage: (Math.max(0, move.games) / total) * 100,
  }));
}

export function normalizeStats(stats: PositionStats): PositionStats {
  const totalGames =
    stats.totalGames > 0
      ? stats.totalGames
      : stats.moves.reduce((sum, move) => sum + Math.max(0, move.games), 0);
  const moves = withPercentages(stats.moves, totalGames).sort((a, b) => b.games - a.games);
  return { ...stats, totalGames, moves };
}

/** Apply sample-size and rarity thresholds. Always keeps at least the top move. */
export function filterCandidates(
  stats: PositionStats,
  filter: PopularityFilter = {},
): MoveStat[] {
  const options = { ...DEFAULT_POPULARITY_FILTER, ...filter };
  const normalized = normalizeStats(stats);
  const kept = normalized.moves.filter(
    (move) => move.games >= options.minGames && move.percentage >= options.minPercentage,
  );
  const candidates = kept.length > 0 ? kept : normalized.moves.slice(0, 1);
  return candidates.slice(0, options.maxCandidates);
}

export function candidatePoolSize(policy: CandidatePolicy): number {
  switch (policy) {
    case 'top1':
      return 1;
    case 'top3':
      return 3;
    case 'top5':
      return 5;
    case 'weighted':
      return Number.POSITIVE_INFINITY;
  }
}

export type RandomSource = () => number;

/**
 * Pick one move from `moves` using popularity weights.
 * `random` is injectable so opponent behaviour is deterministic under test.
 */
export function weightedPick(moves: MoveStat[], random: RandomSource = Math.random): MoveStat | null {
  if (moves.length === 0) return null;
  const total = moves.reduce((sum, move) => sum + Math.max(0, move.games), 0);
  if (total <= 0) return moves[0];
  let ticket = Math.min(Math.max(random(), 0), 0.999999999) * total;
  for (const move of moves) {
    ticket -= Math.max(0, move.games);
    if (ticket < 0) return move;
  }
  return moves[moves.length - 1];
}

/**
 * Narrow the legal, popular candidates according to the selected policy.
 * `top1` is deterministic; the other policies sample by popularity weight
 * inside their pool, which is what makes the opponent feel human.
 */
export function selectCandidatePool(
  stats: PositionStats,
  policy: CandidatePolicy,
  filter: PopularityFilter = {},
): MoveStat[] {
  const candidates = filterCandidates(stats, filter);
  const poolSize = candidatePoolSize(policy);
  if (!Number.isFinite(poolSize)) return candidates;
  return candidates.slice(0, poolSize);
}

export function pickPopularMove(
  stats: PositionStats,
  policy: CandidatePolicy,
  options: { filter?: PopularityFilter; random?: RandomSource } = {},
): MoveStat | null {
  const pool = selectCandidatePool(stats, policy, options.filter);
  if (pool.length === 0) return null;
  if (policy === 'top1') return pool[0];
  return weightedPick(pool, options.random);
}

/** Score share for each result, expressed as percentages of games. */
export function resultShares(move: MoveStat): { white: number; draw: number; black: number } {
  const total = move.whiteWins + move.draws + move.blackWins;
  if (total <= 0) return { white: 0, draw: 0, black: 0 };
  return {
    white: (move.whiteWins / total) * 100,
    draw: (move.draws / total) * 100,
    black: (move.blackWins / total) * 100,
  };
}

export function emptyStats(
  positionKey: string,
  overrides: Partial<PositionStats> = {},
): PositionStats {
  return {
    positionKey,
    ratingBucket: '1400-1599',
    timeControl: 'all',
    source: 'none',
    totalGames: 0,
    moves: [],
    ...overrides,
  };
}
