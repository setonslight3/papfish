import type { MoveVerdict } from './types.js';

/**
 * Speed drills: recognise the position and play the repertoire move before the
 * clock runs out. The point is recall under time pressure, so the scoring is
 * deliberately harsher about hesitation than normal training.
 */
export interface DrillSettings {
  id: string;
  label: string;
  /** Time allowed per position, in milliseconds. */
  timeLimitMs: number;
  description: string;
}

export const DRILL_LEVELS: DrillSettings[] = [
  { id: 'relaxed', label: 'Relaxed', timeLimitMs: 15000, description: '15 seconds a move' },
  { id: 'standard', label: 'Standard', timeLimitMs: 8000, description: '8 seconds a move' },
  { id: 'blitz', label: 'Blitz', timeLimitMs: 4000, description: '4 seconds a move' },
];

export function getDrillLevel(id: string): DrillSettings {
  return DRILL_LEVELS.find((level) => level.id === id) ?? DRILL_LEVELS[1];
}

export interface DrillResult {
  verdict: MoveVerdict | 'timeout';
  responseTimeMs: number;
  timeLimitMs: number;
  /** 0-100; combines correctness with how much of the clock was left. */
  score: number;
  /** Contribution to the drill streak: correct and inside the limit. */
  clean: boolean;
}

export function scoreDrill(
  verdict: MoveVerdict | 'timeout',
  responseTimeMs: number,
  timeLimitMs: number,
): DrillResult {
  if (verdict === 'timeout' || responseTimeMs > timeLimitMs) {
    return { verdict, responseTimeMs, timeLimitMs, score: 0, clean: false };
  }
  if (verdict !== 'repertoire') {
    return { verdict, responseTimeMs, timeLimitMs, score: 0, clean: false };
  }

  const remaining = Math.max(0, 1 - responseTimeMs / timeLimitMs);
  // Half the score is for being right, half for how quickly.
  const score = Math.round(50 + remaining * 50);
  return { verdict, responseTimeMs, timeLimitMs, score, clean: true };
}

export interface DrillSummary {
  attempts: number;
  clean: number;
  bestStreak: number;
  averageScore: number;
  averageResponseMs: number;
}

export function summarizeDrill(results: DrillResult[]): DrillSummary {
  if (results.length === 0) {
    return { attempts: 0, clean: 0, bestStreak: 0, averageScore: 0, averageResponseMs: 0 };
  }

  let streak = 0;
  let bestStreak = 0;
  for (const result of results) {
    streak = result.clean ? streak + 1 : 0;
    bestStreak = Math.max(bestStreak, streak);
  }

  return {
    attempts: results.length,
    clean: results.filter((result) => result.clean).length,
    bestStreak,
    averageScore: Math.round(
      results.reduce((sum, result) => sum + result.score, 0) / results.length,
    ),
    averageResponseMs: Math.round(
      results.reduce((sum, result) => sum + result.responseTimeMs, 0) / results.length,
    ),
  };
}
