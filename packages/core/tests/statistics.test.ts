import { describe, expect, it } from 'vitest';
import {
  accuracyByColor,
  dailyAccuracy,
  masteryDistribution,
  sessionTotals,
  studyStreak,
  verdictBreakdown,
} from '../src/statistics.js';
import type { MasteryRecord, MoveVerdict, TrainingAttemptRecord } from '../src/types.js';

const NOW = new Date('2026-03-10T18:00:00.000Z');

function attempt(
  daysAgo: number,
  result: MoveVerdict,
  color: 'white' | 'black' = 'white',
  responseTimeMs = 2000,
): TrainingAttemptRecord {
  return {
    id: `${daysAgo}-${result}-${Math.random()}`,
    userId: 'u',
    repertoireId: 'rep',
    repertoireNodeId: 'node',
    positionKey: 'key',
    color,
    attemptedMove: 'e4',
    expectedMove: 'e4',
    engineEvaluation: null,
    result,
    responseTimeMs,
    mode: 'train',
    createdAt: new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
  };
}

describe('dailyAccuracy', () => {
  it('fills every day in the window, including empty ones', () => {
    const series = dailyAccuracy([attempt(0, 'repertoire'), attempt(2, 'mistake')], 7, NOW);
    expect(series).toHaveLength(7);
    expect(series.at(-1)!.date).toBe('2026-03-10');
    expect(series.at(-1)!.accuracy).toBe(100);
    expect(series.find((day) => day.date === '2026-03-08')!.accuracy).toBe(0);
    expect(series.find((day) => day.date === '2026-03-09')!.attempts).toBe(0);
  });

  it('averages several attempts in a day', () => {
    const series = dailyAccuracy(
      [attempt(0, 'repertoire', 'white', 1000), attempt(0, 'mistake', 'white', 3000)],
      3,
      NOW,
    );
    const today = series.at(-1)!;
    expect(today.attempts).toBe(2);
    expect(today.accuracy).toBe(50);
    expect(today.averageResponseMs).toBe(2000);
  });

  it('ignores attempts outside the window', () => {
    const series = dailyAccuracy([attempt(30, 'repertoire')], 7, NOW);
    expect(series.every((day) => day.attempts === 0)).toBe(true);
  });
});

describe('breakdowns', () => {
  it('counts verdicts and their shares', () => {
    const breakdown = verdictBreakdown([
      attempt(0, 'repertoire'),
      attempt(0, 'repertoire'),
      attempt(0, 'mistake'),
    ]);
    expect(breakdown[0]).toMatchObject({ verdict: 'repertoire', count: 2 });
    expect(breakdown[0].share).toBeCloseTo(66.7, 0);
    expect(verdictBreakdown([])).toEqual([]);
  });

  it('keeps White and Black separate', () => {
    const split = accuracyByColor([
      attempt(0, 'repertoire', 'white'),
      attempt(0, 'mistake', 'white'),
      attempt(0, 'repertoire', 'black'),
    ]);
    expect(split.find((item) => item.color === 'white')!.accuracy).toBe(50);
    expect(split.find((item) => item.color === 'black')!.accuracy).toBe(100);
  });

  it('reports zero rather than dividing by nothing', () => {
    expect(accuracyByColor([]).every((item) => item.accuracy === 0)).toBe(true);
    expect(sessionTotals([])).toEqual({ attempts: 0, correct: 0, accuracy: 0, medianResponseMs: 0 });
  });
});

describe('masteryDistribution', () => {
  it('bands trained positions and counts the untrained ones', () => {
    const records = [10, 30, 60, 90, 95].map(
      (score) => ({ masteryScore: score }) as MasteryRecord,
    );
    const bands = masteryDistribution(records, 4);
    expect(bands[0]).toMatchObject({ label: 'Untrained', count: 4 });
    expect(bands.find((band) => band.label === '75-100')!.count).toBe(2);
    expect(bands.reduce((sum, band) => sum + band.count, 0)).toBe(9);
  });
});

describe('studyStreak', () => {
  it('counts consecutive days up to today', () => {
    const streak = studyStreak(
      [attempt(0, 'repertoire'), attempt(1, 'repertoire'), attempt(2, 'repertoire')],
      NOW,
    );
    expect(streak.current).toBe(3);
    expect(streak.longest).toBe(3);
    expect(streak.activeDays).toBe(3);
  });

  it('does not break a streak that ran until yesterday', () => {
    const streak = studyStreak([attempt(1, 'repertoire'), attempt(2, 'repertoire')], NOW);
    expect(streak.current).toBe(2);
  });

  it('handles no history', () => {
    expect(studyStreak([], NOW)).toEqual({ current: 0, longest: 0, activeDays: 0 });
  });

  it('remembers the longest run even after a gap', () => {
    const streak = studyStreak(
      [attempt(10, 'repertoire'), attempt(9, 'repertoire'), attempt(8, 'repertoire'), attempt(0, 'repertoire')],
      NOW,
    );
    expect(streak.longest).toBe(3);
    expect(streak.current).toBe(1);
  });
});

describe('sessionTotals', () => {
  it('reports accuracy and a median response time', () => {
    const totals = sessionTotals([
      attempt(0, 'repertoire', 'white', 1000),
      attempt(0, 'mistake', 'white', 5000),
      attempt(0, 'repertoire', 'white', 3000),
    ]);
    expect(totals).toMatchObject({ attempts: 3, correct: 2, accuracy: 67, medianResponseMs: 3000 });
  });
});
