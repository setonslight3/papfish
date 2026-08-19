import { isLegalSan, sanToUci } from './position.js';
import { pickPopularMove, selectCandidatePool, type PopularityFilter, type RandomSource } from './popularity.js';
import type { CandidatePolicy, MoveStat, PositionStats } from './types.js';

export type OpponentMoveSource = 'human-popularity' | 'engine' | 'none';

export interface OpponentDecision {
  san: string;
  uci: string;
  source: OpponentMoveSource;
  /** Human share of games for this move, when it came from statistics. */
  percentage: number | null;
  games: number | null;
  /** Human-readable justification, shown in the UI so behaviour is never opaque. */
  reason: string;
}

export interface HumanOpponentRequest {
  fen: string;
  stats: PositionStats | null;
  policy: CandidatePolicy;
  filter?: PopularityFilter;
  random?: RandomSource;
  /**
   * Optional engine-quality gate. Return false to reject a candidate move.
   * Kept as a callback so the engine never leaks into popularity data itself.
   */
  qualityFilter?: (move: MoveStat) => boolean;
}

/**
 * Human-pattern opponent.
 *
 * 1. take the position, 2. take its popularity statistics, 3. apply the rating
 * filter (already applied when the statistics were fetched), 4. narrow to the
 * configured candidate pool, 5. optionally apply a quality gate,
 * 6. play the selected move.
 *
 * Returns null when there is no usable statistical data - the caller then
 * decides what to do, rather than this function inventing a move.
 */
export function chooseHumanMove(request: HumanOpponentRequest): OpponentDecision | null {
  const { fen, stats, policy } = request;
  if (!stats || stats.moves.length === 0 || stats.totalGames <= 0) return null;

  const legalStats: PositionStats = {
    ...stats,
    moves: stats.moves.filter((move) => isLegalSan(fen, move.san)),
  };
  if (legalStats.moves.length === 0) return null;

  const pool = selectCandidatePool(legalStats, policy, request.filter);
  const gated = request.qualityFilter ? pool.filter(request.qualityFilter) : pool;
  const candidates = gated.length > 0 ? gated : pool;
  if (candidates.length === 0) return null;

  const chosen =
    policy === 'top1'
      ? candidates[0]
      : pickPopularMove(
          { ...legalStats, moves: candidates },
          policy === 'weighted' ? 'weighted' : policy,
          { filter: request.filter, random: request.random },
        );

  if (!chosen) return null;
  const uci = sanToUci(fen, chosen.san);
  if (!uci) return null;

  const share = chosen.percentage.toFixed(1);
  const reason =
    policy === 'top1'
      ? `Most popular reply at this level (${share}% of ${stats.totalGames.toLocaleString()} games)`
      : `Chosen from the ${candidates.length} most popular replies (${share}% of games)`;

  return {
    san: chosen.san,
    uci,
    source: 'human-popularity',
    percentage: chosen.percentage,
    games: chosen.games,
    reason,
  };
}

export interface EngineStrengthProfile {
  id: string;
  label: string;
  /** UCI_Elo target, null to play at full strength. */
  elo: number | null;
  /** Search depth cap. */
  depth: number;
  /** Search time cap in milliseconds. */
  movetimeMs: number;
}

/**
 * Engine opponent strength presets. Deliberately separate from the
 * human-pattern opponent: the two modes must never be blended.
 */
export const ENGINE_STRENGTH_PROFILES: EngineStrengthProfile[] = [
  { id: 'gentle', label: 'Gentle (~1320)', elo: 1320, depth: 6, movetimeMs: 250 },
  { id: 'club', label: 'Club (~1600)', elo: 1600, depth: 8, movetimeMs: 400 },
  { id: 'strong', label: 'Strong (~2000)', elo: 2000, depth: 12, movetimeMs: 700 },
  { id: 'expert', label: 'Expert (~2400)', elo: 2400, depth: 16, movetimeMs: 1200 },
  { id: 'full', label: 'Full strength', elo: null, depth: 20, movetimeMs: 2000 },
];

export function getEngineStrengthProfile(id: string): EngineStrengthProfile {
  return ENGINE_STRENGTH_PROFILES.find((profile) => profile.id === id) ?? ENGINE_STRENGTH_PROFILES[1];
}
