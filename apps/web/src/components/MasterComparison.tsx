import type { PositionStats } from '@papfish/core';
import { getRatingBucket, type RatingBucket } from '@papfish/core';
import { formatGames, formatPercent } from '@/lib/format';
import { Spinner } from './ui';

export interface MasterComparisonProps {
  /** Statistics for the rating band the user selected. */
  club: PositionStats | null;
  /** Statistics for the master population. */
  masters: PositionStats | null;
  loading: boolean;
  ratingBucket: RatingBucket;
  /** Engine's preferred move, when it has an opinion. */
  engineBest?: string | null;
  maxMoves?: number;
}

/**
 * Club players against masters, side by side.
 *
 * These are two different populations answering the same question, and the
 * gaps are the interesting part: a move that is popular at your level and
 * absent from master practice is worth knowing about. Neither column is
 * "correct" - the engine's opinion is shown separately, because popularity and
 * quality are different things.
 */
export function MasterComparison({
  club,
  masters,
  loading,
  ratingBucket,
  engineBest,
  maxMoves = 6,
}: MasterComparisonProps): React.JSX.Element {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Spinner /> Comparing populations…
      </div>
    );
  }

  if (!masters || masters.totalGames === 0) {
    return (
      <p className="text-sm text-slate-500">
        No master games recorded for this position. That is itself informative: the line is
        either very new, or not played at that level.
      </p>
    );
  }

  const clubShare = new Map(club?.moves.map((move) => [move.san, move.percentage]) ?? []);
  const masterShare = new Map(masters.moves.map((move) => [move.san, move.percentage]));
  const moves = Array.from(new Set([...masterShare.keys(), ...clubShare.keys()]))
    .map((san) => ({
      san,
      club: clubShare.get(san) ?? 0,
      masters: masterShare.get(san) ?? 0,
    }))
    .sort((a, b) => b.masters - a.masters)
    .slice(0, maxMoves);

  const bucketLabel = getRatingBucket(ratingBucket).shortLabel;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{formatGames(masters.totalGames)} master games</span>
        <span>{club ? `${formatGames(club.totalGames)} at ${bucketLabel}` : 'no club data'}</span>
      </div>

      <ul className="space-y-2">
        {moves.map((move) => {
          const gap = move.masters - move.club;
          return (
            <li key={move.san} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="flex items-center gap-1.5 font-semibold text-slate-100">
                  {move.san}
                  {engineBest === move.san ? (
                    <span className="text-[10px] font-medium text-sky-300">engine pick</span>
                  ) : null}
                </span>
                <span className="text-xs tabular-nums text-slate-400">
                  {formatPercent(move.masters, 0)} vs {formatPercent(move.club, 0)}
                  {Math.abs(gap) >= 10 ? (
                    <span className={gap > 0 ? ' text-emerald-300' : ' text-amber-300'}>
                      {' '}
                      {gap > 0 ? '↑' : '↓'}
                      {Math.abs(Math.round(gap))}
                    </span>
                  ) : null}
                </span>
              </div>
              {/* Two bars, same scale: masters above, your level below. */}
              <div className="space-y-0.5">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full rounded-full bg-sky-300" style={{ width: `${move.masters}%` }} />
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full rounded-full bg-cyan-700" style={{ width: `${move.club}%` }} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-[11px] text-slate-500">
        Top bar: masters. Bottom bar: {bucketLabel}. A large gap means the two populations
        disagree about this position.
      </p>
    </div>
  );
}
