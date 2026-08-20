import { describe, expect, it } from 'vitest';
import { SWING_THRESHOLDS, classifySwing, criticalMoments, type CriticalMoment } from '../src/swing.js';
import { buildOpeningReport, bookDepthTrend, weeklyImprovement } from '../src/reports.js';
import { buildTree } from '../src/repertoire.js';
import type { ImportedGameRecord, TrainingAttemptRecord } from '../src/types.js';

describe('classifySwing', () => {
  it('calls an equal-keeping move fine', () => {
    const swing = classifySwing({ type: 'cp', value: 30 }, { type: 'cp', value: 20 });
    expect(swing.severity).toBe('ok');
    expect(swing.winChanceDrop).toBeLessThan(SWING_THRESHOLDS.inaccuracy);
  });

  it('grades by winning chances, not raw centipawns', () => {
    // 100cp given away near equality matters; the same loss when already
    // winning by a queen barely moves the needle.
    const nearLevel = classifySwing({ type: 'cp', value: 20 }, { type: 'cp', value: -80 });
    const alreadyWinning = classifySwing({ type: 'cp', value: 900 }, { type: 'cp', value: 800 });
    expect(nearLevel.centipawnLoss).toBe(alreadyWinning.centipawnLoss);
    expect(nearLevel.winChanceDrop).toBeGreaterThan(alreadyWinning.winChanceDrop);
    expect(alreadyWinning.severity).toBe('ok');
  });

  it('escalates through inaccuracy, mistake and blunder', () => {
    expect(classifySwing({ type: 'cp', value: 0 }, { type: 'cp', value: -70 }).severity).toBe('inaccuracy');
    expect(classifySwing({ type: 'cp', value: 0 }, { type: 'cp', value: -150 }).severity).toBe('mistake');
    expect(classifySwing({ type: 'cp', value: 0 }, { type: 'cp', value: -400 }).severity).toBe('blunder');
  });

  it('treats throwing away a mate as a blunder', () => {
    expect(classifySwing({ type: 'mate', value: 3 }, { type: 'cp', value: 0 }).severity).toBe('blunder');
  });

  it('never reports a negative drop when the move improved things', () => {
    const swing = classifySwing({ type: 'cp', value: -100 }, { type: 'cp', value: 100 });
    expect(swing.winChanceDrop).toBe(0);
    expect(swing.severity).toBe('ok');
  });
});

describe('criticalMoments', () => {
  const moment = (ply: number, before: number, after: number): CriticalMoment => ({
    ply,
    fen: 'x',
    positionKey: `k${ply}`,
    movePlayed: 'e4',
    bestMove: 'd4',
    swing: classifySwing({ type: 'cp', value: before }, { type: 'cp', value: after }),
  });

  it('keeps only real errors, worst first', () => {
    const moments = criticalMoments([
      moment(1, 0, -10),
      moment(2, 0, -500),
      moment(3, 0, -120),
    ]);
    expect(moments).toHaveLength(2);
    expect(moments[0].ply).toBe(2);
    expect(moments[1].ply).toBe(3);
  });

  it('limits how many it returns', () => {
    const many = Array.from({ length: 10 }, (_, index) => moment(index, 0, -300));
    expect(criticalMoments(many, 3)).toHaveLength(3);
  });
});

describe('reports', () => {
  const now = new Date('2026-03-10T12:00:00.000Z');

  function attempt(daysAgo: number, correct: boolean): TrainingAttemptRecord {
    return {
      id: `${daysAgo}-${correct}-${Math.random()}`,
      userId: 'u',
      repertoireId: 'rep',
      repertoireNodeId: null,
      positionKey: 'k',
      color: 'white',
      attemptedMove: 'e4',
      expectedMove: 'e4',
      engineEvaluation: null,
      result: correct ? 'repertoire' : 'mistake',
      responseTimeMs: 2000,
      mode: 'train',
      createdAt: new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  it('summarises an untrained repertoire honestly', () => {
    const report = buildOpeningReport({
      repertoire: {
        id: 'rep',
        userId: 'u',
        name: 'Italian Game',
        color: 'white',
        openingCode: 'C50',
        openingName: 'Italian Game',
        description: null,
        createdAt: '',
        updatedAt: '',
      },
      tree: buildTree([]),
      mastery: [],
      attempts: [],
      games: [],
      gamePositions: [],
      pathFor: () => [],
    });

    expect(report.trainedPositions).toBe(0);
    expect(report.masteryScore).toBe(0);
    expect(report.trainingAccuracy).toBeNull();
    expect(report.headline).toMatch(/Not trained yet/);
  });

  it('reports how deep games stayed in book', () => {
    const games: ImportedGameRecord[] = [
      { inBookPlies: 4, userColor: 'white', id: 'g1', playedAt: '2026-03-01' } as ImportedGameRecord,
      { inBookPlies: 8, userColor: 'white', id: 'g2', playedAt: '2026-03-02' } as ImportedGameRecord,
      { inBookPlies: 20, userColor: 'black', id: 'g3', playedAt: '2026-03-03' } as ImportedGameRecord,
    ];

    const report = buildOpeningReport({
      repertoire: {
        id: 'rep',
        userId: 'u',
        name: 'Italian Game',
        color: 'white',
        openingCode: null,
        openingName: null,
        description: null,
        createdAt: '',
        updatedAt: '',
      },
      tree: buildTree([]),
      mastery: [],
      attempts: [],
      games,
      gamePositions: [],
      pathFor: () => [],
    });

    expect(report.games).toBe(2);
    expect(report.averageInBookPlies).toBe(6);
    expect(bookDepthTrend(games)).toEqual([4, 8, 20]);
  });

  it('tracks accuracy week by week, on Monday-based weeks', () => {
    // now is Tue 10 Mar; 1 day ago is Mon 9 Mar (same week), 8 days ago is
    // Mon 2 Mar, and 9 days ago is Sun 1 Mar - the week before that.
    const points = weeklyImprovement(
      [attempt(0, true), attempt(1, true), attempt(8, false), attempt(9, true)],
      3,
      now,
    );
    expect(points.map((point) => point.weekStart)).toEqual([
      '2026-02-23',
      '2026-03-02',
      '2026-03-09',
    ]);
    expect(points.at(-1)!).toMatchObject({ attempts: 2, accuracy: 100 });
    expect(points[1]).toMatchObject({ attempts: 1, accuracy: 0 });
    expect(points[0]).toMatchObject({ attempts: 1, accuracy: 100 });
  });
});
