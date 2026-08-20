import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearTablebaseCache,
  describeTablebase,
  isTablebaseEligible,
  pieceCount,
  probeTablebase,
} from './tablebase';

const KRK = '8/8/8/4k3/8/8/4K3/6R1 w - - 0 1';
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('tablebase eligibility', () => {
  it('counts pieces from the placement field only', () => {
    expect(pieceCount(KRK)).toBe(3);
    expect(pieceCount(START)).toBe(32);
  });

  it('only consults the tablebase where it is authoritative', () => {
    expect(isTablebaseEligible(KRK)).toBe(true);
    expect(isTablebaseEligible(START)).toBe(false);
  });
});

describe('probeTablebase', () => {
  beforeEach(() => {
    clearTablebaseCache();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => vi.unstubAllGlobals());

  it('does not call the network for positions out of range', async () => {
    expect(await probeTablebase(START)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports the outcome and the moves that preserve it', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        category: 'win',
        dtm: 14,
        moves: [
          { uci: 'g1g5', category: 'loss', dtm: -13 },
          { uci: 'g1a1', category: 'draw', dtm: null },
        ],
      }),
    } as Response);

    const result = await probeTablebase(KRK);
    expect(result?.category).toBe('win');
    expect(result?.dtm).toBe(14);
    expect(result?.bestMoves).toEqual(['g1g5']);
  });

  it('returns null instead of guessing when the service is unreachable', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await probeTablebase(KRK)).toBeNull();
  });

  it('caches a position so a session does not re-ask', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ category: 'draw', moves: [] }),
    } as Response);

    await probeTablebase(KRK);
    await probeTablebase(KRK);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });
});

describe('describeTablebase', () => {
  it('states the theoretical result plainly', () => {
    expect(describeTablebase({ category: 'win', dtm: 12, bestMoves: [] }, true)).toMatch(
      /You are theoretically winning \(mate in 12\)/,
    );
    expect(describeTablebase({ category: 'draw', dtm: null, bestMoves: [] }, true)).toMatch(
      /theoretical draw/,
    );
    expect(describeTablebase({ category: 'loss', dtm: -3, bestMoves: [] }, false)).toMatch(
      /Your opponent is theoretically lost/,
    );
    expect(describeTablebase({ category: 'unknown', dtm: null, bestMoves: [] }, true)).toMatch(
      /no verdict/,
    );
  });
});
