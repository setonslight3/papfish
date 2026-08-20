import { describe, expect, it } from 'vitest';
import {
  buildAdaptiveSession,
  classifyCandidate,
  poolCandidates,
  reviewLoad,
} from '../src/adaptive-training.js';
import { DRILL_LEVELS, getDrillLevel, scoreDrill, summarizeDrill } from '../src/drills.js';
import { START_FEN } from '../src/position.js';
import type { TrainingCandidate } from '../src/training.js';
import type { MasteryRecord, RepertoireNodeRecord } from '../src/types.js';

const NOW = new Date('2026-03-10T12:00:00.000Z');

function candidate(
  id: string,
  ply: number,
  mastery: Partial<MasteryRecord> | null,
): TrainingCandidate {
  const node = {
    id,
    repertoireId: 'rep',
    parentNodeId: null,
    fen: START_FEN,
    positionKey: 'key',
    moveSan: 'e4',
    moveUci: 'e2e4',
    ply,
    openingName: null,
    variationName: null,
    isUserMove: true,
    notes: null,
    createdAt: '',
    updatedAt: '',
  } as RepertoireNodeRecord;

  return {
    node: { ...node, children: [] } as never,
    repertoireId: 'rep',
    sanPath: [],
    fen: START_FEN,
    mastery: mastery
      ? ({
          userId: 'u',
          positionKey: 'key',
          repertoireId: 'rep',
          color: 'white',
          attempts: 3,
          correctAttempts: 3,
          masteryScore: 80,
          difficulty: 2.5,
          streak: 3,
          averageResponseMs: 2000,
          intervalDays: 3,
          nextReviewAt: '2026-03-20T12:00:00.000Z',
          lastReviewedAt: null,
          updatedAt: '',
          ...mastery,
        } as MasteryRecord)
      : null,
  };
}

describe('candidate classification', () => {
  it('sorts positions into the pool that describes them', () => {
    expect(classifyCandidate(candidate('a', 1, null), NOW)).toBe('new');
    expect(classifyCandidate(candidate('b', 1, { attempts: 0 }), NOW)).toBe('new');
    expect(classifyCandidate(candidate('c', 1, { streak: 0 }), NOW)).toBe('failed');
    expect(
      classifyCandidate(candidate('d', 1, { nextReviewAt: '2026-03-01T00:00:00.000Z' }), NOW),
    ).toBe('due');
    expect(classifyCandidate(candidate('e', 1, { masteryScore: 30 }), NOW)).toBe('weak');
    expect(classifyCandidate(candidate('f', 1, {}), NOW)).toBe('frequent');
  });

  it('groups a mixed set', () => {
    const pools = poolCandidates(
      [
        candidate('a', 1, null),
        candidate('b', 1, { streak: 0 }),
        candidate('c', 1, { nextReviewAt: '2026-01-01T00:00:00.000Z' }),
      ],
      NOW,
    );
    expect(pools.new).toHaveLength(1);
    expect(pools.failed).toHaveLength(1);
    expect(pools.due).toHaveLength(1);
  });
});

describe('buildAdaptiveSession', () => {
  const mixed: TrainingCandidate[] = [
    ...Array.from({ length: 8 }, (_, i) =>
      candidate(`due${i}`, 1, { nextReviewAt: '2026-03-01T00:00:00.000Z' }),
    ),
    ...Array.from({ length: 5 }, (_, i) => candidate(`failed${i}`, 1, { streak: 0 })),
    ...Array.from({ length: 5 }, (_, i) => candidate(`weak${i}`, 1, { masteryScore: 20 })),
    ...Array.from({ length: 6 }, (_, i) => candidate(`new${i}`, 1, null)),
  ];

  it('draws from every pool rather than one ranked list', () => {
    const session = buildAdaptiveSession(mixed, { size: 10, now: NOW, random: () => 0.5 });
    expect(session).toHaveLength(10);
    const sources = new Set(session.map((item) => item.source));
    expect(sources.has('due')).toBe(true);
    expect(sources.has('new')).toBe(true);
    expect(sources.size).toBeGreaterThanOrEqual(3);
  });

  it('never repeats a position within a session', () => {
    const session = buildAdaptiveSession(mixed, { size: 20, now: NOW, random: () => 0.3 });
    expect(new Set(session.map((item) => item.candidate.node.id)).size).toBe(session.length);
  });

  it('fills the session from other pools when one is empty', () => {
    const onlyNew = Array.from({ length: 12 }, (_, i) => candidate(`n${i}`, 1, null));
    const session = buildAdaptiveSession(onlyNew, { size: 8, now: NOW, random: () => 0.5 });
    expect(session).toHaveLength(8);
    expect(session.every((item) => item.source === 'new')).toBe(true);
  });

  it('honours a colour filter', () => {
    const both = [candidate('w', 1, null), candidate('b', 2, null)];
    const white = buildAdaptiveSession(both, { size: 5, now: NOW, color: 'white' });
    expect(white).toHaveLength(1);
    expect(white[0].candidate.node.id).toBe('w');
  });

  it('cannot return more than exists', () => {
    expect(buildAdaptiveSession([], { size: 10, now: NOW })).toHaveLength(0);
    expect(buildAdaptiveSession(mixed, { size: 999, now: NOW }).length).toBe(mixed.length);
  });
});

describe('reviewLoad', () => {
  it('buckets by calendar day, so a review due in minutes is today', () => {
    const load = reviewLoad(
      [
        candidate('soon', 1, { nextReviewAt: new Date(NOW.getTime() + 10 * 60 * 1000).toISOString() }),
        candidate('overdue', 1, { nextReviewAt: '2026-02-01T00:00:00.000Z' }),
        candidate('tomorrow', 1, { nextReviewAt: '2026-03-11T06:00:00.000Z' }),
      ],
      NOW,
    );
    expect(load.upcoming[0]).toBe(2);
    expect(load.upcoming[1]).toBe(1);
  });

  it('counts what is waiting and what is coming', () => {
    const load = reviewLoad(
      [
        candidate('a', 1, { nextReviewAt: '2026-03-01T00:00:00.000Z' }),
        candidate('b', 1, { streak: 0 }),
        candidate('c', 1, { masteryScore: 10 }),
        candidate('d', 1, null),
        candidate('e', 1, { nextReviewAt: '2026-03-12T12:00:00.000Z' }),
      ],
      NOW,
    );
    expect(load.due).toBe(1);
    expect(load.failed).toBe(1);
    expect(load.weak).toBe(1);
    expect(load.new).toBe(1);
    expect(load.total).toBe(5);
    expect(load.upcoming[2]).toBe(1);
  });
});

describe('speed drills', () => {
  it('scores a fast correct answer highest', () => {
    const fast = scoreDrill('repertoire', 1000, 8000);
    const slow = scoreDrill('repertoire', 7000, 8000);
    expect(fast.score).toBeGreaterThan(slow.score);
    expect(fast.clean).toBe(true);
    expect(fast.score).toBeLessThanOrEqual(100);
  });

  it('scores nothing for a timeout, a late answer or a wrong move', () => {
    expect(scoreDrill('timeout', 8000, 8000).score).toBe(0);
    expect(scoreDrill('repertoire', 9000, 8000).clean).toBe(false);
    expect(scoreDrill('mistake', 1000, 8000).score).toBe(0);
  });

  it('summarises a run of drills', () => {
    const summary = summarizeDrill([
      scoreDrill('repertoire', 1000, 8000),
      scoreDrill('repertoire', 2000, 8000),
      scoreDrill('mistake', 3000, 8000),
      scoreDrill('repertoire', 1500, 8000),
    ]);
    expect(summary.attempts).toBe(4);
    expect(summary.clean).toBe(3);
    expect(summary.bestStreak).toBe(2);
    expect(summary.averageScore).toBeGreaterThan(0);
    expect(summarizeDrill([]).attempts).toBe(0);
  });

  it('offers levels and falls back to the standard one', () => {
    expect(DRILL_LEVELS.length).toBeGreaterThanOrEqual(3);
    expect(getDrillLevel('blitz').timeLimitMs).toBe(4000);
    expect(getDrillLevel('nonsense').id).toBe('standard');
  });
});
