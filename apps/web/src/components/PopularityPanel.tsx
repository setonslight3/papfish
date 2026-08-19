import type { MoveStat, PositionStats } from '@papfish/core';
import { resultShares } from '@papfish/core';
import type { StatsResult } from '@/stats/statsService';
import { formatGames, formatPercent } from '@/lib/format';
import { Badge, Spinner } from './ui';

export interface PopularityPanelProps {
  stats: PositionStats | null;
  origin: StatsResult['origin'];
  loading: boolean;
  /** Highlight the move the user has chosen for this position. */
  repertoireMove?: string | null;
  onSelectMove?: (san: string) => void;
  maxMoves?: number;
}

function OriginBadge({ origin }: { origin: StatsResult['origin'] }): React.JSX.Element | null {
  if (origin === 'database') return <Badge tone="success">aggregated dataset</Badge>;
  if (origin === 'lichess-live') return <Badge tone="info">live Lichess explorer</Badge>;
  return null;
}

function ResultBar({ move }: { move: MoveStat }): React.JSX.Element {
  const shares = resultShares(move);
  return (
    <div
      className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-800"
      title={`White ${shares.white.toFixed(0)}% / Draw ${shares.draw.toFixed(0)}% / Black ${shares.black.toFixed(0)}%`}
    >
      <div className="bg-slate-100" style={{ width: `${shares.white}%` }} />
      <div className="bg-slate-500" style={{ width: `${shares.draw}%` }} />
      <div className="bg-slate-900" style={{ width: `${shares.black}%` }} />
    </div>
  );
}

/**
 * Human move popularity for the current position.
 *
 * Popularity is a description of what people play - it is deliberately kept
 * visually separate from the engine's opinion, because the two answer
 * different questions.
 */
export function PopularityPanel({
  stats,
  origin,
  loading,
  repertoireMove,
  onSelectMove,
  maxMoves = 8,
}: PopularityPanelProps): React.JSX.Element {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Spinner /> Loading human statistics…
      </div>
    );
  }

  if (!stats || stats.totalGames === 0) {
    return (
      <p className="text-sm text-slate-500">
        No human games recorded for this position in the selected population. Try a wider rating
        band, or a shallower position.
      </p>
    );
  }

  const moves = stats.moves.slice(0, maxMoves);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <span>{formatGames(stats.totalGames)} games</span>
        <OriginBadge origin={origin} />
      </div>

      <ul className="space-y-2">
        {moves.map((move) => {
          const isRepertoire = repertoireMove === move.san;
          const content = (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex items-center gap-1.5 font-semibold text-slate-100">
                  {move.san}
                  {isRepertoire ? <Badge tone="success">your move</Badge> : null}
                </span>
                <span className="text-sm text-slate-300 tabular-nums">
                  {formatPercent(move.percentage)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full rounded-full bg-sky-500" style={{ width: `${move.percentage}%` }} />
                </div>
                <span className="w-12 text-right text-[11px] text-slate-500 tabular-nums">
                  {formatGames(move.games)}
                </span>
              </div>
              <div className="mt-1">
                <ResultBar move={move} />
              </div>
            </>
          );

          return (
            <li key={move.san}>
              {onSelectMove ? (
                <button
                  type="button"
                  onClick={() => onSelectMove(move.san)}
                  className="w-full rounded-lg border border-transparent px-2 py-1.5 text-left transition hover:border-slate-700 hover:bg-slate-800/60"
                >
                  {content}
                </button>
              ) : (
                <div className="px-2 py-1.5">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
