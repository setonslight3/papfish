import { useEffect, useRef } from 'react';
import type { PlayedMove } from '@papfish/core';
import { classNames } from '@/lib/format';

export interface MoveListProps {
  moves: PlayedMove[];
  /** Number of plies currently shown on the board. */
  index: number;
  onSelect(index: number): void;
  className?: string;
}

/** Numbered move history; clicking a move rewinds the board to it. */
export function MoveList({ moves, index, onSelect, className }: MoveListProps): React.JSX.Element {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [index]);

  if (moves.length === 0) {
    return (
      <p className={classNames('text-sm text-slate-500', className)}>
        No moves yet - play a move on the board to begin.
      </p>
    );
  }

  const rows: { number: number; white: PlayedMove | null; black: PlayedMove | null }[] = [];
  moves.forEach((move) => {
    const moveNumber = Math.ceil(move.ply / 2);
    const row = rows.find((item) => item.number === moveNumber) ?? {
      number: moveNumber,
      white: null,
      black: null,
    };
    if (move.ply % 2 === 1) row.white = move;
    else row.black = move;
    if (!rows.includes(row)) rows.push(row);
  });

  const renderMove = (move: PlayedMove | null) => {
    if (!move) return <span className="px-2 text-slate-600">…</span>;
    const isActive = move.ply === index;
    return (
      <button
        ref={isActive ? activeRef : undefined}
        type="button"
        onClick={() => onSelect(move.ply)}
        className={classNames(
          'rounded px-2 py-0.5 text-left font-medium transition',
          isActive ? 'bg-sky-500/20 text-sky-200' : 'text-slate-300 hover:bg-slate-800',
        )}
      >
        {move.san}
      </button>
    );
  };

  return (
    <ol
      className={classNames(
        'scrollbar-thin grid max-h-64 grid-cols-[auto_1fr_1fr] items-center gap-x-2 gap-y-0.5 overflow-y-auto text-sm',
        className,
      )}
    >
      {rows.map((row) => (
        <li key={row.number} className="contents">
          <span className="text-xs text-slate-500 tabular-nums">{row.number}.</span>
          {renderMove(row.white)}
          {renderMove(row.black)}
        </li>
      ))}
    </ol>
  );
}
