import { describe, expect, it } from 'vitest';
import {
  aggregateMastery,
  applyAttempt,
  computeMastery,
  repertoireMastery,
  speedScore,
} from '../src/mastery.js';

const perfect = {
  attempts: 10,
  correctAttempts: 10,
  streak: 10,
  engineQuality: 1,
  recognition: 1,
  averageResponseMs: 1500,
};

describe('mastery scoring', () => {
  it('is clamped to 0-100', () => {
    expect(computeMastery(perfect)).toBeLessThanOrEqual(100);
    expect(computeMastery({ ...perfect, attempts: 0 })).toBe(0);
    expect(
      computeMastery({ ...perfect, correctAttempts: 0, streak: 0, engineQuality: 0, recognition: 0, averageResponseMs: 60000 }),
    ).toBe(0);
  });

  it('does not treat a single correct answer as mastery', () => {
    const single = computeMastery({ ...perfect, attempts: 1, correctAttempts: 1, streak: 1 });
    const many = computeMastery(perfect);
    expect(single).toBeLessThan(40);
    expect(many).toBeGreaterThan(single);
  });

  it('rewards speed but weights correctness far more', () => {
    const fast = computeMastery(perfect);
    const slow = computeMastery({ ...perfect, averageResponseMs: 30000 });
    const wrong = computeMastery({ ...perfect, correctAttempts: 2, streak: 0 });
    expect(fast - slow).toBeLessThanOrEqual(10);
    expect(fast - wrong).toBeGreaterThan(30);
  });

  it('scores response speed on a decreasing ramp', () => {
    expect(speedScore(1000)).toBe(1);
    expect(speedScore(30000)).toBe(0);
    expect(speedScore(10000)).toBeGreaterThan(0);
    expect(speedScore(10000)).toBeLessThan(1);
  });
});

describe('attempt folding', () => {
  it('creates a record from the first attempt', () => {
    const result = applyAttempt({
      previous: null,
      verdict: 'repertoire',
      responseTimeMs: 2000,
      engineQuality: 1,
    });
    expect(result.attempts).toBe(1);
    expect(result.correctAttempts).toBe(1);
    expect(result.streak).toBe(1);
    expect(result.averageResponseMs).toBe(2000);
    expect(result.masteryScore).toBeGreaterThan(0);
  });

  it('resets the streak and raises difficulty on a failure', () => {
    const first = applyAttempt({ previous: null, verdict: 'repertoire', responseTimeMs: 2000, engineQuality: 1 });
    const second = applyAttempt({
      previous: { ...first },
      verdict: 'mistake',
      responseTimeMs: 9000,
      engineQuality: 0.2,
    });
    expect(second.streak).toBe(0);
    expect(second.correctAttempts).toBe(1);
    expect(second.attempts).toBe(2);
    expect(second.difficulty).toBeGreaterThan(first.difficulty);
    expect(second.masteryScore).toBeLessThan(first.masteryScore + 25);
  });

  it('keeps a running mean response time', () => {
    const first = applyAttempt({ previous: null, verdict: 'repertoire', responseTimeMs: 1000, engineQuality: 1 });
    const second = applyAttempt({ previous: first, verdict: 'repertoire', responseTimeMs: 3000, engineQuality: 1 });
    expect(second.averageResponseMs).toBe(2000);
  });

  it('grows with repeated success', () => {
    let record = applyAttempt({ previous: null, verdict: 'repertoire', responseTimeMs: 1500, engineQuality: 1 });
    const scores = [record.masteryScore];
    for (let i = 0; i < 10; i += 1) {
      record = applyAttempt({ previous: record, verdict: 'repertoire', responseTimeMs: 1500, engineQuality: 1 });
      scores.push(record.masteryScore);
    }
    expect(scores.at(-1)!).toBeGreaterThan(scores[0]);
    expect(scores.at(-1)!).toBeGreaterThan(70);
  });
});

describe('aggregation', () => {
  it('averages position scores', () => {
    expect(aggregateMastery([])).toBe(0);
    expect(aggregateMastery([50, 100])).toBe(75);
  });

  it('counts untrained positions as zero coverage', () => {
    expect(repertoireMastery(4, [100, 100])).toBe(50);
    expect(repertoireMastery(0, [])).toBe(0);
  });
});
