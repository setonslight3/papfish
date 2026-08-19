import { describe, expect, it } from 'vitest';
import {
  START_FEN,
  START_POSITION_KEY,
  fenAfterSan,
  formatSanLine,
  isLegalSan,
  isMoveOfColor,
  isTurnOf,
  legalSanMoves,
  plyFromFen,
  positionKey,
  replaySan,
  sanToUci,
  uciToSan,
} from '../src/position.js';

describe('position identity', () => {
  it('strips move counters from the FEN', () => {
    expect(positionKey(START_FEN)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -');
    expect(START_POSITION_KEY).toBe(positionKey(START_FEN));
  });

  it('gives the same key to a position reached by transposition', () => {
    const viaOne = replaySan(['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7']);
    const viaTwo = replaySan(['c4', 'Nf6', 'd4', 'g6', 'Nc3', 'Bg7']);
    expect(positionKey(viaOne.at(-1)!.after)).toBe(positionKey(viaTwo.at(-1)!.after));
  });

  it('rejects a malformed FEN', () => {
    expect(() => positionKey('not a fen')).toThrow();
  });
});

describe('move replay', () => {
  it('replays a legal line and records SAN, UCI and ply', () => {
    const played = replaySan(['e4', 'e5', 'Nf3']);
    expect(played).toHaveLength(3);
    expect(played[0]).toMatchObject({ san: 'e4', uci: 'e2e4', ply: 1 });
    expect(played[2]).toMatchObject({ san: 'Nf3', uci: 'g1f3', ply: 3 });
    expect(played[1].before).toBe(played[0].after);
  });

  it('reports the ply of an illegal move', () => {
    expect(() => replaySan(['e4', 'e5', 'Ke2', 'Ke7', 'Qh8'])).toThrow(/ply 5/);
  });

  it('validates legality without mutating shared state', () => {
    expect(isLegalSan(START_FEN, 'e4')).toBe(true);
    expect(isLegalSan(START_FEN, 'e5')).toBe(false);
    expect(fenAfterSan(START_FEN, 'Ke2')).toBeNull();
    expect(legalSanMoves(START_FEN)).toHaveLength(20);
  });

  it('converts between SAN and UCI', () => {
    expect(sanToUci(START_FEN, 'Nf3')).toBe('g1f3');
    expect(uciToSan(START_FEN, 'g1f3')).toBe('Nf3');
    expect(sanToUci(START_FEN, 'Nf6')).toBeNull();
    expect(uciToSan(START_FEN, 'e2e5')).toBeNull();
  });

  it('handles promotion in both notations', () => {
    const fen = '8/P6k/8/8/8/8/7K/8 w - - 0 1';
    expect(sanToUci(fen, 'a8=Q')).toBe('a7a8q');
    expect(uciToSan(fen, 'a7a8q')).toBe('a8=Q');
  });
});

describe('ply helpers', () => {
  it('maps plies onto colours', () => {
    expect(isMoveOfColor(1, 'white')).toBe(true);
    expect(isMoveOfColor(2, 'white')).toBe(false);
    expect(isMoveOfColor(2, 'black')).toBe(true);
  });

  it('derives ply and turn from a FEN', () => {
    expect(plyFromFen(START_FEN)).toBe(0);
    const after = replaySan(['e4', 'e5', 'Nf3']);
    expect(plyFromFen(after.at(-1)!.after)).toBe(3);
    expect(isTurnOf(after.at(-1)!.after, 'black')).toBe(true);
  });

  it('formats a numbered move line', () => {
    expect(formatSanLine(['e4', 'e5', 'Nf3'])).toBe('1. e4 e5 2. Nf3');
    expect(formatSanLine(['e5', 'Nf3'], 2)).toBe('1... e5 2. Nf3');
  });
});
