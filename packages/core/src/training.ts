import type { RepertoireTreeNode } from './repertoire.js';
import type { MasteryRecord } from './types.js';
import type { RandomSource } from './popularity.js';

export interface TrainingCandidate {
  node: RepertoireTreeNode;
  repertoireId: string;
  mastery: MasteryRecord | null;
  /** SAN moves leading to the position the user must answer. */
  sanPath: string[];
  /** FEN of the position the user is asked about (before their move). */
  fen: string;
}

export interface TrainingQueueOptions {
  size: number;
  random?: RandomSource;
  /** Never take more than this share of the queue from one repertoire. */
  maxSharePerRepertoire?: number;
}

/**
 * Selection weight for a position.
 *
 * V1 keeps this deliberately simple: unseen positions first, then weak ones,
 * then shallow (high-frequency) positions. The spaced-repetition scheduler in
 * V2 replaces this function without touching its callers.
 */
export function candidateWeight(candidate: TrainingCandidate): number {
  const mastery = candidate.mastery;
  if (!mastery || mastery.attempts === 0) return 4;
  const weakness = (100 - mastery.masteryScore) / 100;
  const depthBonus = candidate.node.ply <= 6 ? 0.5 : 0;
  const failureBonus = mastery.streak === 0 ? 0.75 : 0;
  return 0.4 + weakness * 3 + depthBonus + failureBonus;
}

function weightedSampleWithoutReplacement(
  items: TrainingCandidate[],
  count: number,
  random: RandomSource,
): TrainingCandidate[] {
  const pool = items.map((item) => ({ item, weight: candidateWeight(item) }));
  const picked: TrainingCandidate[] = [];
  while (picked.length < count && pool.length > 0) {
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
    let ticket = Math.min(Math.max(random(), 0), 0.999999999) * total;
    let index = pool.length - 1;
    for (let i = 0; i < pool.length; i += 1) {
      ticket -= pool[i].weight;
      if (ticket < 0) {
        index = i;
        break;
      }
    }
    picked.push(pool[index].item);
    pool.splice(index, 1);
  }
  return picked;
}

/**
 * Build a training session queue.
 *
 * White and Black pools are kept separate by the caller (each repertoire has a
 * colour); this function only guarantees that a single repertoire cannot
 * monopolise a mixed session.
 */
export function buildTrainingQueue(
  candidates: TrainingCandidate[],
  options: TrainingQueueOptions,
): TrainingCandidate[] {
  const random = options.random ?? Math.random;
  const size = Math.max(0, Math.min(options.size, candidates.length));
  if (size === 0) return [];

  const repertoireIds = Array.from(new Set(candidates.map((c) => c.repertoireId)));
  if (repertoireIds.length <= 1) {
    return weightedSampleWithoutReplacement(candidates, size, random);
  }

  const maxShare = options.maxSharePerRepertoire ?? 0.7;
  const cap = Math.max(1, Math.ceil(size * maxShare));
  const perRepertoire = new Map<string, number>();
  const queue: TrainingCandidate[] = [];
  let remaining = candidates.slice();

  while (queue.length < size && remaining.length > 0) {
    const eligible = remaining.filter(
      (candidate) => (perRepertoire.get(candidate.repertoireId) ?? 0) < cap,
    );
    const source = eligible.length > 0 ? eligible : remaining;
    const [next] = weightedSampleWithoutReplacement(source, 1, random);
    if (!next) break;
    queue.push(next);
    perRepertoire.set(next.repertoireId, (perRepertoire.get(next.repertoireId) ?? 0) + 1);
    remaining = remaining.filter((candidate) => candidate.node.id !== next.node.id);
  }

  return queue;
}

export interface WeakPosition {
  candidate: TrainingCandidate;
  masteryScore: number;
  attempts: number;
}

/** Trained positions ordered from weakest to strongest. */
export function weakestPositions(
  candidates: TrainingCandidate[],
  limit = 5,
): WeakPosition[] {
  return candidates
    .filter((candidate) => candidate.mastery && candidate.mastery.attempts > 0)
    .map((candidate) => ({
      candidate,
      masteryScore: candidate.mastery!.masteryScore,
      attempts: candidate.mastery!.attempts,
    }))
    .sort((a, b) => a.masteryScore - b.masteryScore || b.attempts - a.attempts)
    .slice(0, limit);
}
