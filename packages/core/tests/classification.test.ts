import { describe, expect, it } from 'vitest';
import { classifyAttempt, verdictFromLoss, verdictToRecallScore } from '../src/classification.js';
import { centipawnLoss, formatScore, scoreToCentipawns, toWhitePerspective, winningChances } from '../src/evaluation.js';

describe('evaluation helpers', () => {
  it('converts engine scores to White perspective', () => {
    expect(toWhitePerspective({ type: 'cp', value: 40 }, 'w')).toEqual({ type: 'cp', value: 40 });
    expect(toWhitePerspective({ type: 'cp', value: 40 }, 'b')).toEqual({ type: 'cp', value: -40 });
    expect(toWhitePerspective({ type: 'mate', value: 3 }, 'b')).toEqual({ type: 'mate', value: -3 });
  });

  it('orders mate scores above every centipawn score', () => {
    expect(scoreToCentipawns({ type: 'mate', value: 1 })).toBeGreaterThan(
      scoreToCentipawns({ type: 'cp', value: 5000 }),
    );
    expect(scoreToCentipawns({ type: 'mate', value: -1 })).toBeLessThan(
      scoreToCentipawns({ type: 'cp', value: -5000 }),
    );
  });

  it('formats scores for display', () => {
    expect(formatScore({ type: 'cp', value: 160 })).toBe('+1.60');
    expect(formatScore({ type: 'cp', value: -35 })).toBe('-0.35');
    expect(formatScore({ type: 'cp', value: 0 })).toBe('0.00');
    expect(formatScore({ type: 'mate', value: -4 })).toBe('-M4');
  });

  it('never reports a negative centipawn loss', () => {
    expect(centipawnLoss({ type: 'cp', value: 30 }, { type: 'cp', value: 80 })).toBe(0);
    expect(centipawnLoss({ type: 'cp', value: 80 }, { type: 'cp', value: 30 })).toBe(50);
  });

  it('maps evaluations onto winning chances', () => {
    expect(winningChances({ type: 'cp', value: 0 })).toBeCloseTo(50, 5);
    expect(winningChances({ type: 'mate', value: 2 })).toBe(100);
    expect(winningChances({ type: 'cp', value: 300 })).toBeGreaterThan(70);
  });
});

describe('attempt classification', () => {
  it('accepts the repertoire move', () => {
    const result = classifyAttempt({ playedSan: 'Bc4', expectedSan: 'Bc4', legal: true });
    expect(result.verdict).toBe('repertoire');
    expect(result.centipawnLoss).toBe(0);
  });

  it('separates a strong alternative from the repertoire move', () => {
    const result = classifyAttempt({
      playedSan: 'Bb5',
      expectedSan: 'Bc4',
      legal: true,
      bestScore: { type: 'cp', value: 40 },
      playedScore: { type: 'cp', value: 30 },
      bestSan: 'Bb5',
    });
    expect(result.verdict).toBe('strong-alternative');
    expect(result.detail).toContain('Bc4');
  });

  it('grades inaccuracies, mistakes and blunders by centipawn loss', () => {
    expect(verdictFromLoss(10)).toBe('strong-alternative');
    expect(verdictFromLoss(60)).toBe('inaccuracy');
    expect(verdictFromLoss(200)).toBe('mistake');
    expect(verdictFromLoss(600)).toBe('blunder');

    const blunder = classifyAttempt({
      playedSan: 'Qh5',
      expectedSan: 'Bc4',
      legal: true,
      bestScore: { type: 'cp', value: 40 },
      playedScore: { type: 'cp', value: -500 },
      bestSan: 'Bc4',
    });
    expect(blunder.verdict).toBe('blunder');
    expect(blunder.centipawnLoss).toBe(540);
  });

  it('flags illegal input without pretending to evaluate it', () => {
    const result = classifyAttempt({ playedSan: 'Ke3', expectedSan: 'Bc4', legal: false });
    expect(result.verdict).toBe('illegal');
    expect(result.centipawnLoss).toBeNull();
  });

  it('still gives feedback before the engine has an opinion', () => {
    const result = classifyAttempt({ playedSan: 'd3', expectedSan: 'c3', legal: true });
    expect(result.verdict).toBe('strong-alternative');
    expect(result.headline).toBe('Not your repertoire move');
  });

  it('maps verdicts onto the 0-5 recall scale', () => {
    expect(verdictToRecallScore('repertoire', 1000)).toBe(5);
    expect(verdictToRecallScore('repertoire', 12000)).toBe(3);
    expect(verdictToRecallScore('mistake', 1000)).toBe(0);
  });
});
