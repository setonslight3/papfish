import { describe, expect, it } from 'vitest';
import {
  filterCandidates,
  normalizeStats,
  pickPopularMove,
  resultShares,
  selectCandidatePool,
  weightedPick,
  withPercentages,
} from '../src/popularity.js';
import { chooseHumanMove } from '../src/opponent.js';
import { START_FEN, replaySan } from '../src/position.js';
import type { MoveStat, PositionStats } from '../src/types.js';

/** Test fixture only - real percentages always come from the statistics pipeline. */
function stat(san: string, uci: string, games: number, extra: Partial<MoveStat> = {}): MoveStat {
  return {
    san,
    uci,
    games,
    whiteWins: Math.round(games * 0.5),
    draws: Math.round(games * 0.1),
    blackWins: games - Math.round(games * 0.5) - Math.round(games * 0.1),
    averageRating: 1500,
    percentage: 0,
    ...extra,
  };
}

const fixture: PositionStats = {
  positionKey: 'test',
  ratingBucket: '1400-1599',
  timeControl: 'all',
  source: 'lichess',
  totalGames: 1000,
  moves: [
    stat('Nf6', 'g8f6', 580),
    stat('Bc5', 'f8c5', 240),
    stat('Be7', 'f8e7', 110),
    stat('d6', 'd7d6', 68),
    stat('h6', 'h7h6', 2),
  ],
};

describe('popularity maths', () => {
  it('derives percentages from raw game counts', () => {
    const moves = withPercentages(fixture.moves);
    expect(moves[0].percentage).toBeCloseTo(58, 5);
    expect(moves[1].percentage).toBeCloseTo(24, 5);
    expect(moves.reduce((sum, m) => sum + m.percentage, 0)).toBeCloseTo(100, 5);
  });

  it('recomputes the total when a row does not carry one', () => {
    const normalized = normalizeStats({ ...fixture, totalGames: 0 });
    expect(normalized.totalGames).toBe(1000);
  });

  it('sorts moves by frequency', () => {
    const normalized = normalizeStats({
      ...fixture,
      moves: [stat('h6', 'h7h6', 2), stat('Nf6', 'g8f6', 580)],
    });
    expect(normalized.moves.map((m) => m.san)).toEqual(['Nf6', 'h6']);
  });

  it('reports 0% for an empty position rather than dividing by zero', () => {
    const empty = normalizeStats({ ...fixture, totalGames: 0, moves: [] });
    expect(empty.totalGames).toBe(0);
    expect(empty.moves).toEqual([]);
  });

  it('splits results into shares', () => {
    const shares = resultShares(stat('Nf6', 'g8f6', 100));
    expect(shares.white + shares.draw + shares.black).toBeCloseTo(100, 5);
  });
});

describe('candidate filtering', () => {
  it('drops moves below the sample-size and rarity thresholds', () => {
    const candidates = filterCandidates(fixture, { minGames: 5, minPercentage: 1 });
    expect(candidates.map((m) => m.san)).toEqual(['Nf6', 'Bc5', 'Be7', 'd6']);
  });

  it('never returns an empty pool when the position has data', () => {
    const candidates = filterCandidates(fixture, { minGames: 100000 });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].san).toBe('Nf6');
  });

  it('limits the pool by policy', () => {
    expect(selectCandidatePool(fixture, 'top1').map((m) => m.san)).toEqual(['Nf6']);
    expect(selectCandidatePool(fixture, 'top3').map((m) => m.san)).toEqual(['Nf6', 'Bc5', 'Be7']);
    expect(selectCandidatePool(fixture, 'top5', { minGames: 1, minPercentage: 0 }).map((m) => m.san)).toEqual([
      'Nf6',
      'Bc5',
      'Be7',
      'd6',
      'h6',
    ]);
  });
});

describe('weighted sampling', () => {
  it('respects popularity weights at the boundaries', () => {
    const moves = normalizeStats(fixture).moves;
    expect(weightedPick(moves, () => 0)!.san).toBe('Nf6');
    expect(weightedPick(moves, () => 0.999)!.san).toBe('h6');
    expect(weightedPick(moves, () => 0.99)!.san).toBe('d6');
    expect(weightedPick(moves, () => 0.6)!.san).toBe('Bc5');
  });

  it('is deterministic in top1 mode', () => {
    for (let i = 0; i < 10; i += 1) {
      expect(pickPopularMove(fixture, 'top1', { random: () => i / 10 })!.san).toBe('Nf6');
    }
  });

  it('converges on the underlying distribution', () => {
    let seed = 42;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const counts = new Map<string, number>();
    for (let i = 0; i < 4000; i += 1) {
      const move = pickPopularMove(fixture, 'weighted', { random })!;
      counts.set(move.san, (counts.get(move.san) ?? 0) + 1);
    }
    const nf6Share = (counts.get('Nf6') ?? 0) / 4000;
    expect(nf6Share).toBeGreaterThan(0.5);
    expect(nf6Share).toBeLessThan(0.66);
  });
});

describe('human-pattern opponent', () => {
  const afterThreeMoves = replaySan(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']).at(-1)!.after;

  it('plays the most popular legal reply in top1 mode', () => {
    const decision = chooseHumanMove({ fen: afterThreeMoves, stats: fixture, policy: 'top1' });
    expect(decision).not.toBeNull();
    expect(decision!.san).toBe('Nf6');
    expect(decision!.source).toBe('human-popularity');
    expect(decision!.percentage).toBeCloseTo(58, 5);
  });

  it('ignores statistics rows that are illegal in the position', () => {
    const decision = chooseHumanMove({
      fen: START_FEN,
      stats: { ...fixture, moves: [...fixture.moves] },
      policy: 'top1',
    });
    expect(decision).toBeNull();
  });

  it('returns null instead of inventing a move when there is no data', () => {
    expect(
      chooseHumanMove({ fen: afterThreeMoves, stats: null, policy: 'weighted' }),
    ).toBeNull();
    expect(
      chooseHumanMove({
        fen: afterThreeMoves,
        stats: { ...fixture, moves: [], totalGames: 0 },
        policy: 'weighted',
      }),
    ).toBeNull();
  });

  it('applies an engine quality gate when one is supplied', () => {
    const decision = chooseHumanMove({
      fen: afterThreeMoves,
      stats: fixture,
      policy: 'top3',
      qualityFilter: (move) => move.san !== 'Nf6',
      random: () => 0,
    });
    expect(decision!.san).toBe('Bc5');
  });
});
