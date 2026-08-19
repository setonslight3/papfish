import type { MasteryRecord, MoveVerdict } from './types.js';
import { isSuccessfulVerdict } from './classification.js';

/**
 * Initial mastery weighting from the technical blueprint. These are defaults,
 * not permanent truths - they live here alone so they can be re-tuned without
 * touching anything that consumes a mastery score.
 */
export const MASTERY_WEIGHTS = {
  correctness: 0.3,
  consistency: 0.25,
  engineQuality: 0.2,
  recognition: 0.15,
  speed: 0.1,
} as const;

/** Attempts needed before a position can approach its uncapped score. */
export const CONFIDENCE_CONSTANT = 3;

/** Response time (ms) at or below which recall counts as immediate. */
export const FAST_RESPONSE_MS = 3000;
/** Response time (ms) beyond which speed scores zero. */
export const SLOW_RESPONSE_MS = 20000;

export interface MasteryInput {
  attempts: number;
  correctAttempts: number;
  /** Current run of consecutive correct answers. */
  streak: number;
  /** 0-1 average engine quality of the moves actually played. */
  engineQuality: number;
  /** 0-1 familiarity with the position (repeat exposure without failure). */
  recognition: number;
  /** Mean response time in milliseconds. */
  averageResponseMs: number;
}

export function speedScore(averageResponseMs: number): number {
  if (!Number.isFinite(averageResponseMs) || averageResponseMs <= 0) return 0;
  if (averageResponseMs <= FAST_RESPONSE_MS) return 1;
  if (averageResponseMs >= SLOW_RESPONSE_MS) return 0;
  return 1 - (averageResponseMs - FAST_RESPONSE_MS) / (SLOW_RESPONSE_MS - FAST_RESPONSE_MS);
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Mastery for a single position, 0-100.
 *
 * The raw weighted score is damped by a sample-size confidence factor so that
 * one lucky answer never reads as mastered.
 */
export function computeMastery(input: MasteryInput): number {
  const attempts = Math.max(0, input.attempts);
  if (attempts === 0) return 0;

  const correctness = clamp01(input.correctAttempts / attempts);
  const consistency = clamp01(input.streak / Math.max(3, Math.min(attempts, 6)));
  const engineQuality = clamp01(input.engineQuality);
  const recognition = clamp01(input.recognition);
  const speed = clamp01(speedScore(input.averageResponseMs));

  const raw =
    correctness * MASTERY_WEIGHTS.correctness +
    consistency * MASTERY_WEIGHTS.consistency +
    engineQuality * MASTERY_WEIGHTS.engineQuality +
    recognition * MASTERY_WEIGHTS.recognition +
    speed * MASTERY_WEIGHTS.speed;

  const confidence = attempts / (attempts + CONFIDENCE_CONSTANT);
  return Math.max(0, Math.min(100, Math.round(raw * confidence * 100)));
}

export interface MasteryUpdateInput {
  previous: Pick<
    MasteryRecord,
    'attempts' | 'correctAttempts' | 'streak' | 'averageResponseMs' | 'difficulty'
  > | null;
  verdict: MoveVerdict;
  responseTimeMs: number;
  /** 0-1 engine quality of the played move; 1 for the repertoire move. */
  engineQuality: number;
}

export interface MasteryUpdateResult {
  attempts: number;
  correctAttempts: number;
  streak: number;
  averageResponseMs: number;
  masteryScore: number;
  difficulty: number;
}

/**
 * Fold one training attempt into a position's mastery record.
 * Difficulty rises when the position is failed and decays slowly on success,
 * which is what the V2 spaced-repetition scheduler will read.
 */
export function applyAttempt(input: MasteryUpdateInput): MasteryUpdateResult {
  const prev = input.previous ?? {
    attempts: 0,
    correctAttempts: 0,
    streak: 0,
    averageResponseMs: 0,
    difficulty: 2.5,
  };

  const correct = isSuccessfulVerdict(input.verdict);
  const attempts = prev.attempts + 1;
  const correctAttempts = prev.correctAttempts + (correct ? 1 : 0);
  const streak = correct ? prev.streak + 1 : 0;
  const responseMs = Math.max(0, input.responseTimeMs);
  const averageResponseMs =
    prev.attempts === 0
      ? responseMs
      : Math.round((prev.averageResponseMs * prev.attempts + responseMs) / attempts);

  const difficulty = Math.max(
    1.3,
    Math.min(4, correct ? prev.difficulty - 0.08 : prev.difficulty + 0.25),
  );

  const recognition = clamp01(streak === 0 ? 0.2 : Math.min(1, 0.35 + streak * 0.2));

  const masteryScore = computeMastery({
    attempts,
    correctAttempts,
    streak,
    engineQuality: input.engineQuality,
    recognition,
    averageResponseMs,
  });

  return { attempts, correctAttempts, streak, averageResponseMs, masteryScore, difficulty };
}

/** Average of position mastery scores, 0-100; 0 when there is nothing to average. */
export function aggregateMastery(scores: number[]): number {
  if (scores.length === 0) return 0;
  const sum = scores.reduce((total, score) => total + score, 0);
  return Math.round(sum / scores.length);
}

/**
 * Coverage-aware mastery for a repertoire: positions that have never been
 * trained count as zero, so a repertoire is only "mastered" once it has
 * actually been practised.
 */
export function repertoireMastery(trainableCount: number, scores: number[]): number {
  if (trainableCount <= 0) return 0;
  const sum = scores.reduce((total, score) => total + score, 0);
  return Math.round(sum / trainableCount);
}
