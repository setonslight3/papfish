import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { START_FEN } from '@papfish/core';
import { clearStatsCache, fetchPositionStats } from './statsService';

const getPositionStats = vi.fn();

vi.mock('@/data', () => ({
  getRepository: () => ({ getPositionStats }),
}));

const EXPLORER_BODY = {
  white: 520,
  draws: 60,
  black: 420,
  moves: [
    { uci: 'e2e4', san: 'e4', white: 300, draws: 30, black: 240, averageRating: 1520 },
    { uci: 'd2d4', san: 'd4', white: 220, draws: 30, black: 180, averageRating: 1540 },
  ],
};

describe('fetchPositionStats', () => {
  beforeEach(() => {
    clearStatsCache();
    getPositionStats.mockReset();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefers the aggregated database table', async () => {
    getPositionStats.mockResolvedValue({
      positionKey: 'k',
      ratingBucket: '1400-1599',
      timeControl: 'all',
      source: 'lichess',
      totalGames: 1000,
      moves: [
        { san: 'e4', uci: 'e2e4', games: 600, whiteWins: 300, draws: 100, blackWins: 200, averageRating: 1500, percentage: 0 },
      ],
    });

    const result = await fetchPositionStats({
      fen: START_FEN,
      ratingBucket: '1400-1599',
      timeControl: 'all',
    });

    expect(result.origin).toBe('database');
    expect(result.stats?.moves[0].percentage).toBeCloseTo(60, 5);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('falls back to the live explorer when the position is not aggregated yet', async () => {
    getPositionStats.mockResolvedValue(null);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => EXPLORER_BODY,
    } as Response);

    const result = await fetchPositionStats({
      fen: START_FEN,
      ratingBucket: '1600-1799',
      timeControl: 'blitz',
    });

    expect(result.origin).toBe('lichess-live');
    expect(result.stats?.totalGames).toBe(1000);
    expect(result.stats?.moves[0].san).toBe('e4');
    expect(result.stats?.moves[0].percentage).toBeCloseTo(57, 0);

    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(url).toContain('ratings=1600');
    expect(url).toContain('speeds=blitz');
  });

  it('queries the master database for the master population', async () => {
    getPositionStats.mockResolvedValue(null);
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => EXPLORER_BODY } as Response);

    const result = await fetchPositionStats({
      fen: START_FEN,
      ratingBucket: 'masters',
      timeControl: 'all',
    });

    expect(vi.mocked(fetch).mock.calls[0][0]).toContain('/masters');
    expect(result.stats?.source).toBe('masters');
  });

  it('returns nothing rather than inventing numbers when no source has data', async () => {
    getPositionStats.mockResolvedValue(null);
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 404 } as Response);

    const result = await fetchPositionStats({
      fen: START_FEN,
      ratingBucket: 'beginner',
      timeControl: 'rapid',
    });

    expect(result.stats).toBeNull();
    expect(result.origin).toBe('none');
  });

  it('survives a database error by falling through to the explorer', async () => {
    getPositionStats.mockRejectedValue(new Error('offline'));
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => EXPLORER_BODY } as Response);

    const result = await fetchPositionStats({
      fen: START_FEN,
      ratingBucket: '1200-1399',
      timeControl: 'all',
    });
    expect(result.origin).toBe('lichess-live');
  });

  it('caches a position so repeated lookups do not refetch', async () => {
    getPositionStats.mockResolvedValue(null);
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => EXPLORER_BODY } as Response);

    const request = { fen: START_FEN, ratingBucket: '1400-1599' as const, timeControl: 'all' as const };
    const [first, second] = await Promise.all([
      fetchPositionStats(request),
      fetchPositionStats(request),
    ]);
    await fetchPositionStats(request);

    expect(first).toBe(second);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });
});
