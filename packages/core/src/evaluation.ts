import type { EngineScore, SideToMove } from './types.js';

/** Engine scores are side-to-move relative; convert to White's point of view. */
export function toWhitePerspective(score: EngineScore, side: SideToMove): EngineScore {
  if (side === 'w') return score;
  return { type: score.type, value: -score.value };
}

/** Approximate a score in centipawns, clamping mates to a large finite value. */
export function scoreToCentipawns(score: EngineScore): number {
  if (score.type === 'mate') {
    const magnitude = 100000 - Math.abs(score.value) * 100;
    return score.value >= 0 ? magnitude : -magnitude;
  }
  return score.value;
}

/**
 * Lichess-style win probability for the side to move, 0-100.
 * Used only for display and for the "how big is this mistake" scale.
 */
export function winningChances(score: EngineScore): number {
  if (score.type === 'mate') return score.value > 0 ? 100 : 0;
  const cp = Math.max(-1000, Math.min(1000, score.value));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

export function formatScore(score: EngineScore): string {
  if (score.type === 'mate') {
    return score.value >= 0 ? `+M${Math.abs(score.value)}` : `-M${Math.abs(score.value)}`;
  }
  const pawns = score.value / 100;
  if (Math.abs(pawns) < 0.005) return '0.00';
  return `${pawns > 0 ? '+' : '-'}${Math.abs(pawns).toFixed(2)}`;
}

/** Format a score already converted to White's perspective, for an eval bar label. */
export function formatWhiteScore(score: EngineScore): string {
  if (score.type === 'mate') {
    return score.value > 0 ? `M${Math.abs(score.value)}` : `-M${Math.abs(score.value)}`;
  }
  return formatScore(score);
}

/**
 * Centipawn loss of `played` compared with `best`, both from the mover's point
 * of view *before* the move. Never negative.
 */
export function centipawnLoss(best: EngineScore, played: EngineScore): number {
  const bestCp = scoreToCentipawns(best);
  const playedCp = scoreToCentipawns(played);
  return Math.max(0, bestCp - playedCp);
}

/** Engine quality on a 0-1 scale, used by the mastery calculation. */
export function engineQualityFromLoss(loss: number): number {
  if (!Number.isFinite(loss) || loss <= 0) return 1;
  return Math.max(0, 1 - loss / 300);
}
