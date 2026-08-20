import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EASE_FACTOR,
  MIN_EASE_FACTOR,
  daysUntilReview,
  describeInterval,
  isDue,
  scheduleReview,
  type ReviewState,
} from '../src/spaced-repetition.js';

const NOW = new Date('2026-03-01T12:00:00.000Z');

describe('scheduleReview', () => {
  it('starts a new position at one day after a good answer', () => {
    const result = scheduleReview(null, 4, NOW);
    expect(result.repetitions).toBe(1);
    expect(result.intervalDays).toBe(1);
    expect(result.nextReviewAt).toBe('2026-03-02T12:00:00.000Z');
  });

  it('grows the interval as the position is repeatedly recalled', () => {
    let state: ReviewState | null = null;
    const intervals: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const result = scheduleReview(state, 5, NOW);
      intervals.push(result.intervalDays);
      state = result;
    }
    expect(intervals[0]).toBe(1);
    expect(intervals[1]).toBe(3);
    expect(intervals.at(-1)!).toBeGreaterThan(intervals[2]);
    for (let i = 1; i < intervals.length; i += 1) {
      expect(intervals[i]).toBeGreaterThanOrEqual(intervals[i - 1]);
    }
  });

  it('sends a failed position back to the same session', () => {
    const learned = scheduleReview(scheduleReview(null, 5, NOW), 5, NOW);
    expect(learned.intervalDays).toBe(3);

    const lapsed = scheduleReview(learned, 1, NOW);
    expect(lapsed.repetitions).toBe(0);
    expect(lapsed.intervalDays).toBe(0);
    expect(new Date(lapsed.nextReviewAt).getTime() - NOW.getTime()).toBe(10 * 60 * 1000);
  });

  it('makes repeatedly failed positions permanently harder, within bounds', () => {
    let state = scheduleReview(null, 5, NOW);
    const startingEase = state.easeFactor;
    for (let i = 0; i < 12; i += 1) state = scheduleReview(state, 0, NOW);
    expect(state.easeFactor).toBeLessThan(startingEase);
    expect(state.easeFactor).toBeGreaterThanOrEqual(MIN_EASE_FACTOR);
  });

  it('keeps the ease factor inside its bounds when everything is perfect', () => {
    let state = scheduleReview(null, 5, NOW);
    for (let i = 0; i < 20; i += 1) state = scheduleReview(state, 5, NOW);
    expect(state.easeFactor).toBeLessThanOrEqual(3);
    expect(state.intervalDays).toBeLessThanOrEqual(365);
  });

  it('treats 3 as the lowest passing score', () => {
    expect(scheduleReview(null, 3, NOW).intervalDays).toBe(1);
    expect(scheduleReview(null, 2, NOW).intervalDays).toBe(0);
  });

  it('starts from the default ease factor', () => {
    expect(scheduleReview(null, 4, NOW).easeFactor).toBeCloseTo(DEFAULT_EASE_FACTOR, 1);
  });
});

describe('due dates', () => {
  it('treats a position with no schedule as due', () => {
    expect(isDue(null, NOW)).toBe(true);
    expect(isDue('not a date', NOW)).toBe(true);
  });

  it('compares against the clock', () => {
    expect(isDue('2026-02-28T12:00:00.000Z', NOW)).toBe(true);
    expect(isDue('2026-03-05T12:00:00.000Z', NOW)).toBe(false);
  });

  it('counts the days until a review', () => {
    expect(daysUntilReview('2026-03-04T12:00:00.000Z', NOW)).toBe(3);
    expect(daysUntilReview('2026-02-27T12:00:00.000Z', NOW)).toBe(-2);
  });

  it('describes intervals in words', () => {
    expect(describeInterval(0)).toBe('again shortly');
    expect(describeInterval(1)).toBe('tomorrow');
    expect(describeInterval(10)).toBe('in 10 days');
    expect(describeInterval(90)).toBe('in 3 months');
  });
});
