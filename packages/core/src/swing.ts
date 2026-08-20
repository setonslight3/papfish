/**
 * Judging a move by how much it changed the position's outlook.
 *
 * Opening training grades against a repertoire; a game played out has no
 * repertoire past the first few moves, so moves are judged by the swing they
 * caused. Winning chances are used rather than raw centipawns, because losing
 * 100 centipawns matters far more at level than it does when already winning.
 */
import { centipawnLoss, winningChances } from './evaluation.js';
import type { EngineScore } from './types.js';

export type SwingSeverity = 'ok' | 'inaccuracy' | 'mistake' | 'blunder';

export interface MoveSwing {
  severity: SwingSeverity;
  centipawnLoss: number;
  /** Percentage points of winning chances given away, 0-100. */
  winChanceDrop: number;
}

/** Thresholds in winning-chance percentage points, kept in one place. */
export const SWING_THRESHOLDS = {
  inaccuracy: 6,
  mistake: 12,
  blunder: 20,
} as const;

/**
 * Compare the position before a move with the position after it, both scored
 * from the mover's point of view.
 */
export function classifySwing(before: EngineScore, after: EngineScore): MoveSwing {
  const drop = Math.max(0, winningChances(before) - winningChances(after));
  const loss = centipawnLoss(before, after);

  const severity: SwingSeverity =
    drop >= SWING_THRESHOLDS.blunder
      ? 'blunder'
      : drop >= SWING_THRESHOLDS.mistake
        ? 'mistake'
        : drop >= SWING_THRESHOLDS.inaccuracy
          ? 'inaccuracy'
          : 'ok';

  return { severity, centipawnLoss: loss, winChanceDrop: Math.round(drop * 10) / 10 };
}

export interface CriticalMoment {
  ply: number;
  fen: string;
  positionKey: string;
  movePlayed: string;
  bestMove: string | null;
  swing: MoveSwing;
}

/**
 * The moments in a game worth revisiting: the mover's own worst decisions,
 * hardest first. Only the user's moves are considered - the opponent's
 * mistakes are not the user's training material.
 */
export function criticalMoments(moments: CriticalMoment[], limit = 5): CriticalMoment[] {
  return moments
    .filter((moment) => moment.swing.severity !== 'ok')
    .sort((a, b) => b.swing.winChanceDrop - a.swing.winChanceDrop)
    .slice(0, limit);
}

export const SWING_LABELS: Record<SwingSeverity, string> = {
  ok: 'Fine',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
};
