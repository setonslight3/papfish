import { useCallback, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import type { Arrow } from 'react-chessboard';
import type { Color } from '@papfish/core';
import { classNames } from '@/lib/format';

export interface BoardProps {
  fen: string;
  orientation: Color;
  /** Called with a SAN move when the user completes a legal move. */
  onMove?: (san: string) => void;
  interactive?: boolean;
  lastMove?: { from: string; to: string } | null;
  /** Long-algebraic moves to draw as hint arrows. */
  arrows?: { from: string; to: string; color?: string }[];
  /** Extra square colouring, e.g. training feedback. */
  highlight?: { square: string; color: string }[];
  showCoordinates?: boolean;
  className?: string;
}

const LIGHT = '#e9edf2';
const DARK = '#6f8ba4';
const SELECTED = 'rgba(56, 189, 248, 0.55)';
const LAST_MOVE = 'rgba(250, 204, 21, 0.35)';
const TARGET = 'radial-gradient(circle, rgba(15,23,42,0.35) 22%, transparent 24%)';
const CAPTURE_TARGET =
  'radial-gradient(circle, transparent 55%, rgba(15,23,42,0.35) 56%, rgba(15,23,42,0.35) 64%, transparent 65%)';

interface PendingPromotion {
  from: string;
  to: string;
}

/**
 * Interactive chessboard.
 *
 * Move legality is delegated entirely to chess.js: the board proposes a move
 * and the caller decides what to do with it. Supports dragging and
 * tap-to-move, which is what makes it usable on a phone.
 */
export function Board({
  fen,
  orientation,
  onMove,
  interactive = true,
  lastMove = null,
  arrows = [],
  highlight = [],
  showCoordinates = true,
  className,
}: BoardProps): React.JSX.Element {
  const [selected, setSelected] = useState<string | null>(null);
  const [promotion, setPromotion] = useState<PendingPromotion | null>(null);

  const chess = useMemo(() => new Chess(fen), [fen]);

  const legalTargets = useMemo(() => {
    if (!selected) return [];
    return chess
      .moves({ square: selected as never, verbose: true })
      .map((move) => ({ to: move.to, capture: Boolean(move.captured) }));
  }, [chess, selected]);

  const isPromotion = useCallback(
    (from: string, to: string): boolean =>
      chess
        .moves({ square: from as never, verbose: true })
        .some((move) => move.to === to && Boolean(move.promotion)),
    [chess],
  );

  const attemptMove = useCallback(
    (from: string, to: string, promotionPiece?: string): boolean => {
      if (!interactive || !onMove) return false;
      const probe = new Chess(fen);
      try {
        const move = probe.move({ from, to, promotion: promotionPiece ?? 'q' });
        if (!move) return false;
        onMove(move.san);
        setSelected(null);
        return true;
      } catch {
        return false;
      }
    },
    [fen, interactive, onMove],
  );

  const handleDrop = useCallback(
    ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) => {
      if (!targetSquare) return false;
      if (isPromotion(sourceSquare, targetSquare)) {
        setPromotion({ from: sourceSquare, to: targetSquare });
        setSelected(null);
        return false;
      }
      return attemptMove(sourceSquare, targetSquare);
    },
    [attemptMove, isPromotion],
  );

  const handleSquareClick = useCallback(
    ({ square }: { square: string }) => {
      if (!interactive) return;
      if (selected === square) {
        setSelected(null);
        return;
      }
      if (selected) {
        if (isPromotion(selected, square)) {
          setPromotion({ from: selected, to: square });
          setSelected(null);
          return;
        }
        if (attemptMove(selected, square)) return;
      }
      const piece = chess.get(square as never);
      if (piece && piece.color === chess.turn()) {
        setSelected(square);
      } else {
        setSelected(null);
      }
    },
    [attemptMove, chess, interactive, isPromotion, selected],
  );

  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (lastMove) {
      styles[lastMove.from] = { background: LAST_MOVE };
      styles[lastMove.to] = { background: LAST_MOVE };
    }
    for (const item of highlight) {
      styles[item.square] = { ...styles[item.square], boxShadow: `inset 0 0 0 4px ${item.color}` };
    }
    if (selected) {
      styles[selected] = { ...styles[selected], background: SELECTED };
      for (const target of legalTargets) {
        styles[target.to] = {
          ...styles[target.to],
          backgroundImage: target.capture ? CAPTURE_TARGET : TARGET,
        };
      }
    }
    return styles;
  }, [highlight, lastMove, legalTargets, selected]);

  const boardArrows: Arrow[] = useMemo(
    () =>
      arrows.map((arrow) => ({
        startSquare: arrow.from,
        endSquare: arrow.to,
        color: arrow.color ?? '#38bdf8',
      })),
    [arrows],
  );

  return (
    <div className={classNames('relative w-full', className)} data-testid="board">
      <Chessboard
        options={{
          position: fen,
          boardOrientation: orientation,
          allowDragging: interactive,
          showNotation: showCoordinates,
          animationDurationInMs: 160,
          onPieceDrop: handleDrop,
          onSquareClick: handleSquareClick,
          squareStyles,
          arrows: boardArrows,
          lightSquareStyle: { backgroundColor: LIGHT },
          darkSquareStyle: { backgroundColor: DARK },
          boardStyle: { borderRadius: '0.75rem', overflow: 'hidden' },
          darkSquareNotationStyle: { color: LIGHT },
          lightSquareNotationStyle: { color: DARK },
        }}
      />

      {promotion ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-slate-950/80">
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-xl">
            <p className="mb-3 text-center text-sm text-slate-300">Promote to</p>
            <div className="flex gap-2">
              {(['q', 'r', 'b', 'n'] as const).map((piece) => (
                <button
                  key={piece}
                  type="button"
                  className="h-12 w-12 rounded-lg border border-slate-600 bg-slate-800 text-2xl font-semibold text-slate-100 transition hover:border-sky-400 hover:bg-slate-700"
                  onClick={() => {
                    attemptMove(promotion.from, promotion.to, piece);
                    setPromotion(null);
                  }}
                >
                  {{ q: '♕', r: '♖', b: '♗', n: '♘' }[piece]}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
