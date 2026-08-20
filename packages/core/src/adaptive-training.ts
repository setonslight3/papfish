/**
 * Adaptive session building.
 *
 * A session is assembled from five pools rather than one ranked list, so it
 * always contains a mix: what is due for review, what was just failed, what is
 * weak, what comes up most often, and something new. Version 1's simple
 * weighted queue remains available for sessions that do not want scheduling.
 */
import { isDue } from './spaced-repetition.js';
import type { TrainingCandidate } from './training.js';
import { candidateWeight } from './training.js';
import type { RandomSource } from './popularity.js';
import type { Color } from './types.js';

export type TrainingSource = 'due' | 'failed' | 'weak' | 'frequent' | 'new';

export interface AdaptiveItem {
  candidate: TrainingCandidate;
  source: TrainingSource;
}

export interface AdaptiveOptions {
  size: number;
  now?: Date;
  random?: RandomSource;
  color?: Color;
  /** Share of the session each pool should contribute when it can. */
  mix?: Partial<Record<TrainingSource, number>>;
}

const DEFAULT_MIX: Record<TrainingSource, number> = {
  due: 0.4,
  failed: 0.2,
  weak: 0.2,
  new: 0.15,
  frequent: 0.05,
};

/** Which pool a position belongs to. Order matters: the first match wins. */
export function classifyCandidate(candidate: TrainingCandidate, now: Date): TrainingSource {
  const mastery = candidate.mastery;
  if (!mastery || mastery.attempts === 0) return 'new';
  if (mastery.streak === 0) return 'failed';
  if (isDue(mastery.nextReviewAt, now)) return 'due';
  if (mastery.masteryScore < 60) return 'weak';
  return 'frequent';
}

export function poolCandidates(
  candidates: TrainingCandidate[],
  now: Date,
): Record<TrainingSource, TrainingCandidate[]> {
  const pools: Record<TrainingSource, TrainingCandidate[]> = {
    due: [],
    failed: [],
    weak: [],
    frequent: [],
    new: [],
  };
  for (const candidate of candidates) {
    pools[classifyCandidate(candidate, now)].push(candidate);
  }
  return pools;
}

function takeWeighted(
  pool: TrainingCandidate[],
  count: number,
  random: RandomSource,
): TrainingCandidate[] {
  const remaining = pool.slice();
  const taken: TrainingCandidate[] = [];

  while (taken.length < count && remaining.length > 0) {
    const weights = remaining.map(candidateWeight);
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let ticket = Math.min(Math.max(random(), 0), 0.999999999) * total;
    let index = remaining.length - 1;
    for (let i = 0; i < remaining.length; i += 1) {
      ticket -= weights[i];
      if (ticket < 0) {
        index = i;
        break;
      }
    }
    taken.push(remaining[index]);
    remaining.splice(index, 1);
  }

  return taken;
}

/**
 * Build a session. Pools that cannot fill their share hand the remainder to the
 * others, so a user with nothing due still gets a full session, and a user
 * with a large backlog still meets something new.
 */
export function buildAdaptiveSession(
  candidates: TrainingCandidate[], 
  options: AdaptiveOptions,
): AdaptiveItem[] {
  const now = options.now ?? new Date();
  const random = options.random ?? Math.random;
  const mix = { ...DEFAULT_MIX, ...options.mix };

  const eligible = options.color
    ? candidates.filter((candidate) =>
        options.color === 'white' ? candidate.node.ply % 2 === 1 : candidate.node.ply % 2 === 0,
      )
    : candidates;

  const size = Math.max(0, Math.min(options.size, eligible.length));
  if (size === 0) return [];

  const pools = poolCandidates(eligible, now);
  const order: TrainingSource[] = ['due', 'failed', 'weak', 'new', 'frequent'];
  const session: AdaptiveItem[] = [];
  const used = new Set<string>();

  for (const source of order) {
    const target = Math.round(size * (mix[source] ?? 0));
    const available = pools[source].filter((candidate) => !used.has(candidate.node.id));
    for (const candidate of takeWeighted(available, target, random)) {
      used.add(candidate.node.id);
      session.push({ candidate, source });
    }
  }

  // Top up from whatever is left, strongest need first.
  if (session.length < size) {
    for (const source of order) {
      if (session.length >= size) break;
      const available = pools[source].filter((candidate) => !used.has(candidate.node.id));
      for (const candidate of takeWeighted(available, size - session.length, random)) {
        used.add(candidate.node.id);
        session.push({ candidate, source });
      }
    }
  }

  return session.slice(0, size);
}

export interface ReviewLoad {
  due: number;
  failed: number;
  weak: number;
  new: number;
  total: number;
  /** Positions due within the next seven days, by day offset. */
  upcoming: number[];
}

/** What the user is facing right now - drives the dashboard's review widget. */
export function reviewLoad(candidates: TrainingCandidate[], now: Date = new Date()): ReviewLoad {
  const pools = poolCandidates(candidates, now);
  const upcoming = Array.from({ length: 7 }, () => 0);

  // Bucket by calendar day, not by elapsed hours: something due in ten minutes
  // belongs under "today", not under "tomorrow".
  const startOfDay = (date: Date) =>
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const today = startOfDay(now);

  for (const candidate of candidates) {
    const next = candidate.mastery?.nextReviewAt;
    if (!next) continue;
    const due = new Date(next);
    if (Number.isNaN(due.getTime())) continue;
    const days = Math.round((startOfDay(due) - today) / (24 * 60 * 60 * 1000));
    if (days <= 0) upcoming[0] += 1;
    else if (days < upcoming.length) upcoming[days] += 1;
  }

  return {
    due: pools.due.length,
    failed: pools.failed.length,
    weak: pools.weak.length,
    new: pools.new.length,
    total: candidates.length,
    upcoming,
  };
}

export const TRAINING_SOURCE_LABELS: Record<TrainingSource, string> = {
  due: 'Due for review',
  failed: 'Failed last time',
  weak: 'Weak',
  frequent: 'Reinforcement',
  new: 'New position',
};
