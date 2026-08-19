import { centipawnLoss } from './evaluation.js';
import type { AttemptClassification, EngineScore, MoveVerdict } from './types.js';

/**
 * Centipawn-loss thresholds used to grade a move that is not the repertoire
 * move. Kept in one place so they can be tuned without touching the UI.
 */
export const CLASSIFICATION_THRESHOLDS = {
  strongAlternative: 30,
  inaccuracy: 90,
  mistake: 250,
} as const;

export function verdictFromLoss(loss: number): MoveVerdict {
  if (loss <= CLASSIFICATION_THRESHOLDS.strongAlternative) return 'strong-alternative';
  if (loss <= CLASSIFICATION_THRESHOLDS.inaccuracy) return 'inaccuracy';
  if (loss <= CLASSIFICATION_THRESHOLDS.mistake) return 'mistake';
  return 'blunder';
}

export interface ClassifyInput {
  playedSan: string;
  /** The repertoire move for this position, when the user has chosen one. */
  expectedSan: string | null;
  /** Whether the played move was legal at all. */
  legal: boolean;
  /** Best engine score for the position before the move (mover's view). */
  bestScore?: EngineScore | null;
  /** Engine score after the played move, converted to the mover's view. */
  playedScore?: EngineScore | null;
  bestSan?: string | null;
  /** Share of human games that played this move, when statistics are available. */
  popularityPercentage?: number | null;
}

/**
 * Grade a training attempt.
 *
 * The repertoire move always wins: a move can be objectively best and still be
 * "not your repertoire move", which is the distinction the product is built on.
 * Engine numbers only decide how bad a non-repertoire move is, and are optional
 * so feedback still works before the engine has finished thinking.
 */
export function classifyAttempt(input: ClassifyInput): AttemptClassification {
  const { playedSan, expectedSan, legal } = input;

  if (!legal) {
    return {
      verdict: 'illegal',
      centipawnLoss: null,
      expectedSan,
      playedSan,
      bestSan: input.bestSan ?? null,
      headline: 'Not a legal move',
      detail: 'That move is not legal in this position. Try again.',
    };
  }

  if (expectedSan && playedSan === expectedSan) {
    return {
      verdict: 'repertoire',
      centipawnLoss: 0,
      expectedSan,
      playedSan,
      bestSan: input.bestSan ?? null,
      headline: 'Correct - repertoire move',
      detail: `${playedSan} is the move you chose for this position.`,
    };
  }

  const loss =
    input.bestScore && input.playedScore
      ? centipawnLoss(input.bestScore, input.playedScore)
      : null;

  if (loss === null) {
    return {
      verdict: 'strong-alternative',
      centipawnLoss: null,
      expectedSan,
      playedSan,
      bestSan: input.bestSan ?? null,
      headline: expectedSan ? 'Not your repertoire move' : 'Playable move',
      detail: expectedSan
        ? `Your repertoire plays ${expectedSan} here. ${playedSan} has not been evaluated yet.`
        : `${playedSan} was played. No repertoire move is stored for this position yet.`,
    };
  }

  const verdict = verdictFromLoss(loss);
  const lossText = `${(loss / 100).toFixed(2)} pawns`;
  const bestText = input.bestSan ? ` The engine prefers ${input.bestSan}.` : '';

  const headline: Record<Exclude<MoveVerdict, 'repertoire' | 'illegal'>, string> = {
    'strong-alternative': expectedSan ? 'Strong, but not your repertoire' : 'Strong move',
    inaccuracy: 'Inaccuracy',
    mistake: 'Mistake',
    blunder: 'Blunder',
  };

  const detail =
    verdict === 'strong-alternative'
      ? expectedSan
        ? `${playedSan} is objectively fine (${lossText} behind the best move), but your repertoire plays ${expectedSan}.`
        : `${playedSan} keeps the evaluation (${lossText} behind the best move).${bestText}`
      : `${playedSan} loses about ${lossText} compared with the best move.${bestText}${
          expectedSan ? ` Your repertoire move is ${expectedSan}.` : ''
        }`;

  return {
    verdict,
    centipawnLoss: loss,
    expectedSan,
    playedSan,
    bestSan: input.bestSan ?? null,
    headline: headline[verdict as Exclude<MoveVerdict, 'repertoire' | 'illegal'>],
    detail,
  };
}

export function isSuccessfulVerdict(verdict: MoveVerdict): boolean {
  return verdict === 'repertoire';
}

/** Map a verdict onto the 0-5 recall scale used by the scheduler (V2 will consume this). */
export function verdictToRecallScore(verdict: MoveVerdict, responseMs: number): number {
  switch (verdict) {
    case 'repertoire':
      if (responseMs <= 3000) return 5;
      if (responseMs <= 8000) return 4;
      return 3;
    case 'strong-alternative':
      return 2;
    case 'inaccuracy':
      return 1;
    default:
      return 0;
  }
}
