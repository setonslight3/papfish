import { useCallback, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import type { EndgamePosition, EndgameVerdict, PlayedMove } from '@papfish/core';
import { judgeEndgame, toUci } from '@papfish/core';
import { useEngine } from '@/engine/EngineProvider';
import {
  describeTablebase,
  isTablebaseEligible,
  probeTablebase,
  type TablebaseResult,
} from '@/services/tablebase';

export type EndgamePhase = 'idle' | 'playing' | 'thinking' | 'finished';

export interface EndgameState {
  phase: EndgamePhase;
  position: EndgamePosition | null;
  fen: string;
  moves: PlayedMove[];
  verdict: EndgameVerdict | null;
  /** Theoretical result of the current position, when the tablebase knows it. */
  theory: string | null;
  /** Set when the last move threw away the theoretical result. */
  warning: string | null;
  ply: number;
  maxPly: number;
}

const MAX_PLY = 80;

const IDLE: EndgameState = {
  phase: 'idle',
  position: null,
  fen: '',
  moves: [],
  verdict: null,
  theory: null,
  warning: null,
  ply: 0,
  maxPly: MAX_PLY,
};

/**
 * Play a theoretical endgame out against the engine.
 *
 * There is no solution line to memorise: the engine defends properly, and the
 * attempt is graded on whether the goal was actually achieved. Where the
 * tablebase is authoritative it is the judge - so "you were still winning
 * before that move" is a fact, not the engine's opinion.
 */
export function useEndgameSession() {
  const { engine } = useEngine();
  const [state, setState] = useState<EndgameState>(IDLE);
  const gameRef = useRef<Chess | null>(null);
  const positionRef = useRef<EndgamePosition | null>(null);

  const finish = useCallback((chess: Chess, position: EndgamePosition, ply: number) => {
    const verdict = judgeEndgame({
      goal: position.goal,
      color: position.color,
      isCheckmate: chess.isCheckmate(),
      isDraw: chess.isDraw() || chess.isStalemate() || chess.isThreefoldRepetition(),
      sideToMove: chess.turn() === 'w' ? 'white' : 'black',
      ply,
      maxPly: MAX_PLY,
    });

    if (verdict.outcome === 'ongoing') return false;

    setState((previous) => ({ ...previous, phase: 'finished', verdict }));
    return true;
  }, []);

  const describeCurrentTheory = useCallback(async (fen: string, position: EndgamePosition) => {
    if (!isTablebaseEligible(fen)) return null;
    const result = await probeTablebase(fen);
    if (!result) return null;
    const sideToMove = fen.split(/\s+/)[1] === 'w' ? 'white' : 'black';
    return describeTablebase(result, sideToMove === position.color);
  }, []);

  const start = useCallback(
    async (position: EndgamePosition) => {
      const chess = new Chess(position.fen);
      gameRef.current = chess;
      positionRef.current = position;

      setState({
        ...IDLE,
        phase: 'playing',
        position,
        fen: position.fen,
        maxPly: MAX_PLY,
      });

      const theory = await describeCurrentTheory(position.fen, position);
      setState((previous) => (previous.position?.id === position.id ? { ...previous, theory } : previous));
    },
    [describeCurrentTheory],
  );

  /** Was this move a theoretical mistake? Only the tablebase can say for sure. */
  const checkMoveAgainstTheory = useCallback(
    async (before: string, uci: string): Promise<string | null> => {
      if (!isTablebaseEligible(before)) return null;
      const result: TablebaseResult | null = await probeTablebase(before);
      if (!result || result.bestMoves.length === 0) return null;
      if (result.bestMoves.includes(uci)) return null;

      return result.category === 'win'
        ? 'That move gives away the win - the position was theoretically winning.'
        : 'That move gives away the draw.';
    },
    [],
  );

  const playEngineReply = useCallback(async () => {
    const chess = gameRef.current;
    const position = positionRef.current;
    if (!chess || !position) return;

    setState((previous) => ({ ...previous, phase: 'thinking' }));

    // The defence is played at full strength: a theoretical win has to be
    // proved against best play, not against a weakened opponent.
    let replyUci: string | null;
    try {
      const result = await engine.bestMove(chess.fen(), { depth: 16, movetimeMs: 700, elo: null });
      replyUci = result.uci;
    } catch {
      replyUci = null;
    }

    if (!replyUci) {
      const legal = chess.moves({ verbose: true });
      const fallback = legal[0];
      replyUci = fallback ? toUci(fallback.from, fallback.to, fallback.promotion) : null;
    }
    if (!replyUci) return;

    const before = chess.fen();
    let move;
    try {
      move = chess.move({
        from: replyUci.slice(0, 2),
        to: replyUci.slice(2, 4),
        promotion: replyUci.length > 4 ? replyUci[4] : undefined,
      });
    } catch {
      return;
    }
    if (!move) return;

    const played: PlayedMove = {
      san: move.san,
      uci: replyUci,
      before,
      after: chess.fen(),
      ply: chess.history().length,
    };

    setState((previous) => ({
      ...previous,
      phase: 'playing',
      fen: chess.fen(),
      moves: [...previous.moves, played],
      ply: chess.history().length,
    }));

    if (finish(chess, position, chess.history().length)) return;

    const theory = await describeCurrentTheory(chess.fen(), position);
    setState((previous) => ({ ...previous, theory }));
  }, [describeCurrentTheory, engine, finish]);

  const playMove = useCallback(
    async (san: string) => {
      const chess = gameRef.current;
      const position = positionRef.current;
      if (!chess || !position || state.phase !== 'playing') return;

      const before = chess.fen();
      let move;
      try {
        move = chess.move(san);
      } catch {
        return;
      }
      if (!move) return;

      const uci = toUci(move.from, move.to, move.promotion);
      const played: PlayedMove = {
        san: move.san,
        uci,
        before,
        after: chess.fen(),
        ply: chess.history().length,
      };

      setState((previous) => ({
        ...previous,
        fen: chess.fen(),
        moves: [...previous.moves, played],
        ply: chess.history().length,
        warning: null,
      }));

      const warning = await checkMoveAgainstTheory(before, uci);
      if (warning) setState((previous) => ({ ...previous, warning }));

      if (finish(chess, position, chess.history().length)) return;
      await playEngineReply();
    },
    [checkMoveAgainstTheory, finish, playEngineReply, state.phase],
  );

  const resign = useCallback(() => {
    const position = positionRef.current;
    setState((previous) => ({
      ...previous,
      phase: 'finished',
      verdict: {
        outcome: 'failed',
        detail: position?.goal === 'win' ? 'Given up on the win.' : 'Given up on the defence.',
      },
    }));
  }, []);

  const reset = useCallback(() => {
    gameRef.current = null;
    positionRef.current = null;
    setState(IDLE);
  }, []);

  return { state, start, playMove, resign, reset };
}
