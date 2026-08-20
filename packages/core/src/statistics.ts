/**
 * Training statistics.
 *
 * Everything here is derived from stored attempts, so the numbers on the
 * dashboard can always be traced back to something the user actually did.
 */
import type { Color, MasteryRecord, MoveVerdict, TrainingAttemptRecord } from './types.js';

export interface DailyAccuracy {
  /** ISO date, YYYY-MM-DD. */
  date: string;
  attempts: number;
  correct: number;
  accuracy: number;
  averageResponseMs: number;
}

function isoDay(iso: string): string {
  return iso.slice(0, 10);
}

/** Accuracy per day, oldest first, with empty days filled in. */
export function dailyAccuracy(
  attempts: TrainingAttemptRecord[],
  days = 14,
  now: Date = new Date(),
): DailyAccuracy[] {
  const buckets = new Map<string, { attempts: number; correct: number; totalMs: number }>();

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getTime() - offset * 24 * 60 * 60 * 1000);
    buckets.set(date.toISOString().slice(0, 10), { attempts: 0, correct: 0, totalMs: 0 });
  }

  for (const attempt of attempts) {
    const key = isoDay(attempt.createdAt);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.attempts += 1;
    bucket.totalMs += attempt.responseTimeMs;
    if (attempt.result === 'repertoire') bucket.correct += 1;
  }

  return Array.from(buckets.entries()).map(([date, bucket]) => ({
    date,
    attempts: bucket.attempts,
    correct: bucket.correct,
    accuracy: bucket.attempts > 0 ? Math.round((bucket.correct / bucket.attempts) * 100) : 0,
    averageResponseMs: bucket.attempts > 0 ? Math.round(bucket.totalMs / bucket.attempts) : 0,
  }));
}

export interface VerdictBreakdown {
  verdict: MoveVerdict;
  count: number;
  share: number;
}

export function verdictBreakdown(attempts: TrainingAttemptRecord[]): VerdictBreakdown[] {
  const counts = new Map<MoveVerdict, number>();
  for (const attempt of attempts) {
    counts.set(attempt.result, (counts.get(attempt.result) ?? 0) + 1);
  }
  const total = attempts.length;
  return Array.from(counts.entries())
    .map(([verdict, count]) => ({
      verdict,
      count,
      share: total > 0 ? (count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

export interface ColorSplit {
  color: Color;
  attempts: number;
  accuracy: number;
  averageResponseMs: number;
}

export function accuracyByColor(attempts: TrainingAttemptRecord[]): ColorSplit[] {
  return (['white', 'black'] as Color[]).map((color) => {
    const relevant = attempts.filter((attempt) => attempt.color === color);
    const correct = relevant.filter((attempt) => attempt.result === 'repertoire').length;
    return {
      color,
      attempts: relevant.length,
      accuracy: relevant.length > 0 ? Math.round((correct / relevant.length) * 100) : 0,
      averageResponseMs:
        relevant.length > 0
          ? Math.round(
              relevant.reduce((sum, attempt) => sum + attempt.responseTimeMs, 0) / relevant.length,
            )
          : 0,
    };
  });
}

/** Distribution of positions across mastery bands, for a progress histogram. */
export interface MasteryBand {
  label: string;
  min: number;
  max: number;
  count: number;
}

export function masteryDistribution(mastery: MasteryRecord[], untrained = 0): MasteryBand[] {
  const bands: MasteryBand[] = [
    { label: 'Untrained', min: -1, max: -1, count: untrained },
    { label: '0-24', min: 0, max: 24, count: 0 },
    { label: '25-49', min: 25, max: 49, count: 0 },
    { label: '50-74', min: 50, max: 74, count: 0 },
    { label: '75-100', min: 75, max: 100, count: 0 },
  ];

  for (const record of mastery) {
    const band = bands.find(
      (item) => item.min >= 0 && record.masteryScore >= item.min && record.masteryScore <= item.max,
    );
    if (band) band.count += 1;
  }

  return bands;
}

export interface StudyStreak {
  /** Consecutive days up to today with at least one attempt. */
  current: number;
  longest: number;
  /** Days studied in the window. */
  activeDays: number;
}

export function studyStreak(
  attempts: TrainingAttemptRecord[],
  now: Date = new Date(),
): StudyStreak {
  const days = new Set(attempts.map((attempt) => isoDay(attempt.createdAt)));
  if (days.size === 0) return { current: 0, longest: 0, activeDays: 0 };

  const sorted = Array.from(days).sort();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    const previous = new Date(`${sorted[i - 1]}T00:00:00Z`).getTime();
    const current = new Date(`${sorted[i]}T00:00:00Z`).getTime();
    const gap = Math.round((current - previous) / (24 * 60 * 60 * 1000));
    run = gap === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  let current = 0;
  for (let offset = 0; offset < 400; offset += 1) {
    const date = new Date(now.getTime() - offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (days.has(date)) current += 1;
    else if (offset > 0) break;
    // Missing today does not break a streak that ran until yesterday.
  }

  return { current, longest, activeDays: days.size };
}

export interface SessionTotals {
  attempts: number;
  correct: number;
  accuracy: number;
  medianResponseMs: number;
}

export function sessionTotals(attempts: TrainingAttemptRecord[]): SessionTotals {
  if (attempts.length === 0) {
    return { attempts: 0, correct: 0, accuracy: 0, medianResponseMs: 0 };
  }
  const correct = attempts.filter((attempt) => attempt.result === 'repertoire').length;
  const sorted = attempts.map((attempt) => attempt.responseTimeMs).sort((a, b) => a - b);
  return {
    attempts: attempts.length,
    correct,
    accuracy: Math.round((correct / attempts.length) * 100),
    medianResponseMs: sorted[Math.floor(sorted.length / 2)],
  };
}
