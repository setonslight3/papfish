import { useMemo } from 'react';
import {
  accuracyByColor,
  dailyAccuracy,
  formatSanLine,
  masteryDistribution,
  reviewLoad,
  studyStreak,
  verdictBreakdown,
  weakestPositions,
} from '@papfish/core';
import { Badge, Panel, ProgressBar, Spinner, StatTile } from '@/components/ui';
import { AccuracyTrend, MasteryDistribution, ReviewForecast } from '@/components/charts';
import { useRepertoires } from '@/repertoire/RepertoireProvider';
import { allCandidates, buildRepertoireViews, summarizeMastery } from '@/repertoire/selectors';
import { formatDuration, formatRelativeTime } from '@/lib/format';

/** Progress: mastery detail, split by colour and by opening. */
export function ProgressPage(): React.JSX.Element {
  const { repertoires, nodes, mastery, attempts, loading } = useRepertoires();

  const views = useMemo(
    () => buildRepertoireViews(repertoires, nodes, mastery),
    [mastery, nodes, repertoires],
  );
  const summary = useMemo(() => summarizeMastery(views), [views]);
  const weak = useMemo(() => weakestPositions(allCandidates(views), 10), [views]);

  const accuracy = useMemo(() => {
    if (attempts.length === 0) return 0;
    const correct = attempts.filter((attempt) => attempt.result === 'repertoire').length;
    return Math.round((correct / attempts.length) * 100);
  }, [attempts]);

  const trend = useMemo(() => dailyAccuracy(attempts, 14), [attempts]);
  const streak = useMemo(() => studyStreak(attempts), [attempts]);
  const colorSplit = useMemo(() => accuracyByColor(attempts), [attempts]);
  const verdicts = useMemo(() => verdictBreakdown(attempts), [attempts]);
  const candidates = useMemo(() => allCandidates(views), [views]);
  const load = useMemo(() => reviewLoad(candidates), [candidates]);
  const bands = useMemo(
    () => masteryDistribution(mastery, Math.max(0, candidates.length - mastery.length)),
    [candidates.length, mastery],
  );

  const medianResponse = useMemo(() => {
    if (attempts.length === 0) return 0;
    const sorted = attempts.map((attempt) => attempt.responseTimeMs).sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }, [attempts]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400">
        <Spinner /> Loading progress…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-slate-100">Progress</h1>
        <p className="text-sm text-slate-400">
          Mastery is measured per position, and White and Black are tracked separately.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="Overall" value={`${summary.overall}%`} />
        <StatTile label="White" value={`${summary.white}%`} tone="white" />
        <StatTile label="Black" value={`${summary.black}%`} tone="black" />
        <StatTile
          label="Study streak"
          value={`${streak.current}d`}
          sublabel={`longest ${streak.longest}d · ${streak.activeDays} active days`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Accuracy, last 14 days">
          <AccuracyTrend series={trend} />
          <p className="mt-3 text-xs text-slate-500">
            {accuracy}% across your {attempts.length} most recent attempts.
          </p>
        </Panel>

        <Panel title="Review forecast">
          <ReviewForecast upcoming={load.upcoming} />
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
            <span>{load.due} due now</span>
            <span>{load.failed} failed last time</span>
            <span>{load.new} never trained</span>
          </div>
        </Panel>

        <Panel title="Positions by mastery">
          <MasteryDistribution bands={bands} />
        </Panel>

        <Panel title="How your answers land">
          {verdicts.length === 0 ? (
            <p className="text-sm text-slate-500">No attempts yet.</p>
          ) : (
            <ul className="space-y-2">
              {verdicts.map((entry) => (
                <li key={entry.verdict} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 text-xs text-slate-400">{entry.verdict}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={
                        entry.verdict === 'repertoire' ? 'h-full bg-emerald-500' : 'h-full bg-slate-500'
                      }
                      style={{ width: `${entry.share}%` }}
                    />
                  </div>
                  <span className="w-10 text-right text-xs text-slate-300 tabular-nums">
                    {entry.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3">
            {colorSplit.map((split) => (
              <div key={split.color} className="rounded-lg border border-slate-800 p-3">
                <p className="text-xs tracking-wide text-slate-400 uppercase">{split.color}</p>
                <p className="text-lg font-semibold text-slate-100 tabular-nums">{split.accuracy}%</p>
                <p className="text-[11px] text-slate-500">{split.attempts} attempts</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Mastery by opening">
          {views.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing to measure yet.</p>
          ) : (
            <ul className="space-y-4">
              {views.map((view) => (
                <li key={view.repertoire.id} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-100">
                      {view.repertoire.openingName ?? view.repertoire.name}
                    </span>
                    <Badge tone={view.repertoire.color === 'white' ? 'neutral' : 'info'}>
                      {view.repertoire.color}
                    </Badge>
                  </div>
                  <ProgressBar value={view.masteryScore} tone="emerald" />
                  <p className="text-xs text-slate-500">
                    {view.trainedCount}/{view.trainableCount} positions practised · median response{' '}
                    {formatDuration(medianResponse)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Weakest branches">
          {weak.length === 0 ? (
            <p className="text-sm text-slate-500">Train some positions to populate this list.</p>
          ) : (
            <ol className="space-y-2">
              {weak.map(({ candidate, masteryScore, attempts: tries }) => (
                <li key={candidate.node.id} className="rounded-lg border border-slate-800 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-slate-200">
                      {candidate.sanPath.length > 0
                        ? formatSanLine(candidate.sanPath)
                        : 'Starting position'}
                    </span>
                    <span className="text-xs tabular-nums text-slate-400">{masteryScore}%</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    your move {candidate.node.moveSan} · {tries} attempt{tries === 1 ? '' : 's'}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      <Panel title="Training history">
        {attempts.length === 0 ? (
          <p className="text-sm text-slate-500">No attempts yet.</p>
        ) : (
          <div className="scrollbar-thin max-h-96 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="py-2">Result</th>
                  <th className="py-2">Played</th>
                  <th className="py-2">Repertoire</th>
                  <th className="py-2">Time</th>
                  <th className="py-2">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {attempts.map((attempt) => (
                  <tr key={attempt.id}>
                    <td className="py-2">
                      <Badge tone={attempt.result === 'repertoire' ? 'success' : 'warning'}>
                        {attempt.result}
                      </Badge>
                    </td>
                    <td className="py-2 text-slate-200">{attempt.attemptedMove}</td>
                    <td className="py-2 text-slate-400">{attempt.expectedMove ?? '-'}</td>
                    <td className="py-2 text-slate-400 tabular-nums">
                      {formatDuration(attempt.responseTimeMs)}
                    </td>
                    <td className="py-2 text-slate-500">{formatRelativeTime(attempt.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
