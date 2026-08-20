import { useMemo, useState } from 'react';
import type { EndgameCategory, EndgamePosition } from '@papfish/core';
import {
  ENDGAME_CATEGORY_LABELS,
  ENDGAME_POSITIONS,
  formatSanLine,
  endgamesByCategory,
} from '@papfish/core';
import { Board } from '@/components/Board';
import { Badge, Button, Panel, Spinner } from '@/components/ui';
import { useEndgameSession } from '@/training/useEndgameSession';
import { useSettings } from '@/settings/SettingsProvider';
import { isTablebaseEligible } from '@/services/tablebase';

const CATEGORY_ORDER: EndgameCategory[] = ['checkmate', 'pawn', 'rook', 'queen', 'minor'];

/**
 * Endgame training: play a theoretically decided position out against the
 * engine. There is no solution line to memorise - the goal is the goal, and
 * any route that achieves it counts.
 */
export function EndgamesPage(): React.JSX.Element {
  const { settings } = useSettings();
  const session = useEndgameSession();
  const [category, setCategory] = useState<EndgameCategory>('checkmate');

  const positions = useMemo(() => endgamesByCategory(category), [category]);
  const { state } = session;

  if (state.phase !== 'idle' && state.position) {
    const finished = state.phase === 'finished';
    const achieved = state.verdict?.outcome === 'achieved';

    return (
      <div className="space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-100">{state.position.name}</h1>
            <p className="text-sm text-slate-400">
              You are {state.position.color} · your goal is to{' '}
              <span className="font-semibold text-slate-200">
                {state.position.goal === 'win' ? 'win' : 'hold the draw'}
              </span>
              .
            </p>
          </div>
          <Button variant="ghost" onClick={() => session.reset()}>
            Leave
          </Button>
        </header>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Panel bodyClassName="p-3">
            <div className="mx-auto w-full max-w-[520px]">
              <Board
                fen={state.fen}
                orientation={state.position.color}
                interactive={state.phase === 'playing'}
                onMove={(san) => void session.playMove(san)}
                showCoordinates={settings.showCoordinates}
              />
            </div>
            <p className="mt-3 text-xs text-slate-500">
              {state.moves.length > 0
                ? formatSanLine(state.moves.map((move) => move.san))
                : 'Your move.'}
            </p>
          </Panel>

          <div className="space-y-3">
            <Panel title="Position">
              <p className="text-sm text-slate-300">{state.position.idea}</p>
              <p className="mt-3 text-xs text-slate-500">
                Move {Math.ceil(state.ply / 2)} of at most {Math.ceil(state.maxPly / 2)}.
              </p>
            </Panel>

            <Panel title="Verdict">
              {state.phase === 'thinking' ? (
                <p className="flex items-center gap-2 text-sm text-slate-400">
                  <Spinner /> The engine is defending…
                </p>
              ) : null}

              {finished ? (
                <div className="space-y-3">
                  <Badge tone={achieved ? 'success' : 'danger'}>
                    {achieved ? 'Goal achieved' : 'Not this time'}
                  </Badge>
                  <p className="text-sm text-slate-300">{state.verdict?.detail}</p>
                  <div className="flex gap-2">
                    <Button onClick={() => void session.start(state.position!)}>Try again</Button>
                    <Button variant="secondary" onClick={() => session.reset()}>
                      Choose another
                    </Button>
                  </div>
                </div>
              ) : null}

              {!finished && state.warning ? (
                <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                  {state.warning}
                </p>
              ) : null}

              {!finished && !state.warning && state.phase === 'playing' ? (
                <p className="text-sm text-slate-400">
                  Play on. The engine defends at full strength, so the win has to be real.
                </p>
              ) : null}

              {state.theory ? (
                <p className="mt-3 text-xs text-emerald-300">{state.theory}</p>
              ) : isTablebaseEligible(state.fen) ? (
                <p className="mt-3 text-xs text-slate-500">
                  Tablebase unavailable, so moves are not being checked against theory.
                </p>
              ) : null}

              {!finished ? (
                <Button variant="ghost" className="mt-3 px-0" onClick={() => session.resign()}>
                  Give up
                </Button>
              ) : null}
            </Panel>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-slate-100">Endgames</h1>
        <p className="text-sm text-slate-400">
          Theoretically decided positions, played out against the engine. Where the tablebase can
          reach, it judges your moves - so a warning here is fact, not opinion.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {CATEGORY_ORDER.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setCategory(item)}
            className={
              item === category
                ? 'rounded-full border border-sky-500/40 bg-sky-500/15 px-3 py-1 text-xs font-semibold text-sky-200'
                : 'rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-400 hover:border-slate-600 hover:text-slate-200'
            }
          >
            {ENDGAME_CATEGORY_LABELS[item]}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {positions.map((position) => (
          <EndgameCard key={position.id} position={position} onStart={() => void session.start(position)} />
        ))}
      </div>

      <p className="text-xs text-slate-500">
        {ENDGAME_POSITIONS.length} positions, each verified against Stockfish before shipping.
      </p>
    </div>
  );
}

function EndgameCard({
  position,
  onStart,
}: {
  position: EndgamePosition;
  onStart: () => void;
}): React.JSX.Element {
  return (
    <Panel bodyClassName="p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">{position.name}</h2>
          <p className="mt-1 text-xs text-slate-400">{position.idea}</p>
        </div>
        <Badge tone={position.goal === 'win' ? 'success' : 'info'}>
          {position.goal === 'win' ? 'Win' : 'Draw'}
        </Badge>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-500">
          Playing {position.color} · {'★'.repeat(position.difficulty)}
        </span>
        <Button variant="secondary" onClick={onStart}>
          Play it out
        </Button>
      </div>
    </Panel>
  );
}
