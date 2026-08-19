import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useChessGame } from './useChessGame';

describe('useChessGame', () => {
  it('starts from the initial position', () => {
    const { result } = renderHook(() => useChessGame());
    expect(result.current.fen).toContain('rnbqkbnr/pppppppp');
    expect(result.current.turn).toBe('w');
    expect(result.current.legalMoves).toHaveLength(20);
  });

  it('plays legal moves and records history', () => {
    const { result } = renderHook(() => useChessGame());
    act(() => {
      result.current.play('e4');
    });
    act(() => {
      result.current.play('e5');
    });
    expect(result.current.sanPath).toEqual(['e4', 'e5']);
    expect(result.current.turn).toBe('w');
    expect(result.current.lastMove?.uci).toBe('e7e5');
  });

  it('refuses illegal moves without changing the position', () => {
    const { result } = renderHook(() => useChessGame());
    const before = result.current.fen;
    let played: unknown;
    act(() => {
      played = result.current.play('e5');
    });
    expect(played).toBeNull();
    expect(result.current.fen).toBe(before);
    expect(result.current.moves).toHaveLength(0);
  });

  it('accepts UCI input, including promotions', () => {
    const { result } = renderHook(() => useChessGame('8/P6k/8/8/8/8/7K/8 w - - 0 1'));
    act(() => {
      result.current.playUci('a7a8q');
    });
    expect(result.current.sanPath).toEqual(['a8=Q']);
  });

  it('rewinds without discarding the line', () => {
    const { result } = renderHook(() => useChessGame());
    act(() => {
      result.current.setLine(['e4', 'e5', 'Nf3', 'Nc6']);
    });
    expect(result.current.index).toBe(4);

    act(() => {
      result.current.goTo(2);
    });
    expect(result.current.sanPath).toEqual(['e4', 'e5']);
    expect(result.current.moves).toHaveLength(4);
    expect(result.current.isAtEnd).toBe(false);

    act(() => {
      result.current.toEnd();
    });
    expect(result.current.sanPath).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
  });

  it('branches when a move is played from a rewound position', () => {
    const { result } = renderHook(() => useChessGame());
    act(() => {
      result.current.setLine(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']);
    });
    act(() => {
      result.current.goTo(4);
    });
    act(() => {
      result.current.play('Bb5');
    });
    expect(result.current.sanPath).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
    expect(result.current.moves).toHaveLength(5);
  });

  it('steps back and forth and resets', () => {
    const { result } = renderHook(() => useChessGame());
    act(() => {
      result.current.setLine(['d4', 'Nf6']);
    });
    act(() => {
      result.current.back();
    });
    expect(result.current.index).toBe(1);
    act(() => {
      result.current.forward();
    });
    expect(result.current.index).toBe(2);
    act(() => {
      result.current.undo();
    });
    expect(result.current.moves).toHaveLength(1);
    act(() => {
      result.current.reset();
    });
    expect(result.current.moves).toHaveLength(0);
    expect(result.current.index).toBe(0);
  });
});
