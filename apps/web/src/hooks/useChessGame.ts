import { useCallback, useMemo, useReducer } from 'react';
import { Chess } from 'chess.js';
import type { PlayedMove, SideToMove } from '@papfish/core';
import { START_FEN, legalSanMoves, replaySan, toUci } from '@papfish/core';

interface GameState {
  startFen: string;
  moves: PlayedMove[];
  /** Number of plies currently shown (0 = start position). */
  index: number;
}

type GameAction =
  | { type: 'play'; move: PlayedMove }
  | { type: 'goTo'; index: number }
  | { type: 'undo' }
  | { type: 'reset'; startFen: string }
  | { type: 'setLine'; startFen: string; moves: PlayedMove[]; index?: number };

function reducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'play': {
      // Playing from a rewound position starts a new branch from there.
      const moves = state.moves.slice(0, state.index).concat(action.move);
      return { ...state, moves, index: moves.length };
    }
    case 'goTo': {
      const index = Math.max(0, Math.min(action.index, state.moves.length));
      return { ...state, index };
    }
    case 'undo': {
      if (state.moves.length === 0) return state;
      const moves = state.moves.slice(0, Math.max(0, state.index - 1));
      return { ...state, moves, index: moves.length };
    }
    case 'reset':
      return { startFen: action.startFen, moves: [], index: 0 };
    case 'setLine':
      return {
        startFen: action.startFen,
        moves: action.moves,
        index: action.index ?? action.moves.length,
      };
    default:
      return state;
  }
}

export interface ChessGame {
  fen: string;
  startFen: string;
  moves: PlayedMove[];
  /** Moves currently on the board (respects rewind). */
  visibleMoves: PlayedMove[];
  index: number;
  turn: SideToMove;
  isAtStart: boolean;
  isAtEnd: boolean;
  legalMoves: string[];
  lastMove: PlayedMove | null;
  /** FEN after each visible ply, for opening detection. */
  fenPath: string[];
  sanPath: string[];
  play(san: string): PlayedMove | null;
  playUci(uci: string): PlayedMove | null;
  goTo(index: number): void;
  back(): void;
  forward(): void;
  toStart(): void;
  toEnd(): void;
  undo(): void;
  reset(startFen?: string): void;
  setLine(sanMoves: string[], options?: { startFen?: string; index?: number }): void;
}

/**
 * Board state: a move list plus a cursor into it.
 *
 * Rewinding does not discard the line, and playing a move from a rewound
 * position replaces the continuation - which is exactly the branch behaviour
 * the explorer needs. All legality comes from chess.js.
 */
export function useChessGame(initialFen: string = START_FEN): ChessGame {
  const [state, dispatch] = useReducer(reducer, {
    startFen: initialFen,
    moves: [],
    index: 0,
  });

  const visibleMoves = useMemo(() => state.moves.slice(0, state.index), [state.moves, state.index]);
  const fen = visibleMoves.at(-1)?.after ?? state.startFen;
  const legalMoves = useMemo(() => legalSanMoves(fen), [fen]);

  const play = useCallback(
    (san: string): PlayedMove | null => {
      const chess = new Chess(fen);
      let move;
      try {
        move = chess.move(san);
      } catch {
        return null;
      }
      if (!move) return null;
      const played: PlayedMove = {
        san: move.san,
        uci: toUci(move.from, move.to, move.promotion),
        before: fen,
        after: chess.fen(),
        ply: visibleMoves.length + 1,
      };
      dispatch({ type: 'play', move: played });
      return played;
    },
    [fen, visibleMoves.length],
  );

  const playUci = useCallback(
    (uci: string): PlayedMove | null => {
      const chess = new Chess(fen);
      try {
        const move = chess.move({
          from: uci.slice(0, 2),
          to: uci.slice(2, 4),
          promotion: uci.length > 4 ? uci[4] : undefined,
        });
        if (!move) return null;
        return play(move.san);
      } catch {
        return null;
      }
    },
    [fen, play],
  );

  const setLine = useCallback(
    (sanMoves: string[], options?: { startFen?: string; index?: number }) => {
      const startFen = options?.startFen ?? START_FEN;
      const moves = replaySan(sanMoves, startFen);
      dispatch({ type: 'setLine', startFen, moves, index: options?.index });
    },
    [],
  );

  return {
    fen,
    startFen: state.startFen,
    moves: state.moves,
    visibleMoves,
    index: state.index,
    turn: fen.split(' ')[1] === 'b' ? 'b' : 'w',
    isAtStart: state.index === 0,
    isAtEnd: state.index === state.moves.length,
    legalMoves,
    lastMove: visibleMoves.at(-1) ?? null,
    fenPath: visibleMoves.map((move) => move.after),
    sanPath: visibleMoves.map((move) => move.san),
    play,
    playUci,
    goTo: useCallback((index: number) => dispatch({ type: 'goTo', index }), []),
    back: useCallback(() => dispatch({ type: 'goTo', index: state.index - 1 }), [state.index]),
    forward: useCallback(() => dispatch({ type: 'goTo', index: state.index + 1 }), [state.index]),
    toStart: useCallback(() => dispatch({ type: 'goTo', index: 0 }), []),
    toEnd: useCallback(() => dispatch({ type: 'goTo', index: state.moves.length }), [state.moves.length]),
    undo: useCallback(() => dispatch({ type: 'undo' }), []),
    reset: useCallback((startFen: string = START_FEN) => dispatch({ type: 'reset', startFen }), []),
    setLine,
  };
}
