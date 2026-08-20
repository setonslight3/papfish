/**
 * Spaced repetition scheduling.
 *
 * An SM-2 inspired scheduler, deliberately isolated in one module so the
 * formula can be tuned later without touching anything that consumes it.
 * Nothing outside this file should know how an interval is computed.
 */

/** Simplified recall scale used throughout the app. */
export type RecallScore = 0 | 1 | 2 | 3 | 4 | 5;

export interface ReviewState {
  /** Consecutive successful reviews. Reset by a failure. */
  repetitions: number;
  /** SM-2 ease factor; higher means the position is easier for this user. */
  easeFactor: number;
  /** Current interval in days. */
  intervalDays: number;
}

export interface ReviewOutcome extends ReviewState {
  nextReviewAt: string;
}

export const MIN_EASE_FACTOR = 1.3;
export const MAX_EASE_FACTOR = 3.0;
export const DEFAULT_EASE_FACTOR = 2.5;

/** A score below this counts as a lapse and restarts the interval. */
export const PASSING_SCORE: RecallScore = 3;

export const INITIAL_STATE: ReviewState = {
  repetitions: 0,
  easeFactor: DEFAULT_EASE_FACTOR,
  intervalDays: 0,
};

function clampEase(value: number): number {
  return Math.max(MIN_EASE_FACTOR, Math.min(MAX_EASE_FACTOR, Number(value.toFixed(3))));
}

/**
 * Fold one review into a position's schedule.
 *
 * Passing scores lengthen the interval geometrically (1 day, 3 days, then
 * multiplied by the ease factor); a lapse drops back to same-day review and
 * makes the position permanently a little harder until it is answered well
 * several times.
 */
export function scheduleReview(
  previous: ReviewState | null,
  score: RecallScore,
  now: Date = new Date(),
): ReviewOutcome {
  const state = previous ?? INITIAL_STATE;
  const passed = score >= PASSING_SCORE;

  // SM-2 ease update; a perfect answer nudges it up, a poor one pulls it down.
  const easeFactor = clampEase(
    state.easeFactor + (0.1 - (5 - score) * (0.08 + (5 - score) * 0.02)),
  );

  let repetitions: number;
  let intervalDays: number;

  if (!passed) {
    repetitions = 0;
    // Same-day retry rather than a full day, so a failed position comes back
    // inside the session it was failed in.
    intervalDays = 0;
  } else {
    repetitions = state.repetitions + 1;
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 3;
    else intervalDays = Math.round(Math.max(1, state.intervalDays) * easeFactor);
  }

  intervalDays = Math.min(intervalDays, 365);

  const nextReviewAt = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  // A same-day retry is due in ten minutes, not immediately, so it does not
  // dominate the rest of the session.
  if (intervalDays === 0) {
    nextReviewAt.setTime(now.getTime() + 10 * 60 * 1000);
  }

  return { repetitions, easeFactor, intervalDays, nextReviewAt: nextReviewAt.toISOString() };
}

export function isDue(nextReviewAt: string | null, now: Date = new Date()): boolean {
  if (!nextReviewAt) return true;
  const due = new Date(nextReviewAt).getTime();
  return Number.isNaN(due) ? true : due <= now.getTime();
}

/** Days until a review comes up; negative when it is overdue. */
export function daysUntilReview(nextReviewAt: string | null, now: Date = new Date()): number {
  if (!nextReviewAt) return 0;
  const due = new Date(nextReviewAt).getTime();
  if (Number.isNaN(due)) return 0;
  return Math.round((due - now.getTime()) / (24 * 60 * 60 * 1000));
}

export function describeInterval(intervalDays: number): string {
  if (intervalDays <= 0) return 'again shortly';
  if (intervalDays === 1) return 'tomorrow';
  if (intervalDays < 30) return `in ${intervalDays} days`;
  if (intervalDays < 365) return `in ${Math.round(intervalDays / 30)} months`;
  return 'in a year';
}
