import { useMemo } from 'react';
import {
  accuracyByColor,
  bookDepthTrend,
  buildOpeningReport,
  dailyAccuracy,
  formatSanLine,
  masteryDistribution,
  reviewLoad,
  sanPathTo,
  studyStreak,
  verdictBreakdown,
  weakestPositions,
  weeklyImprovement,
} from '@papfish/core';
import { Badge, Panel, ProgressBar, Spinner, StatTile } from '@/components/ui';
import { AccuracyTrend, MasteryDistribution, ReviewForecast } from '@/components/charts';
import { useRepertoires } from '@/repertoire/RepertoireProvider';
import { allCandidates, buildRepertoireViews, summarizeMastery } from '@/repertoire/selectors';
import { formatDuration, formatRelativeTime } from '@/lib/format';

/** Progress: mastery detail, split by colour and by opening. */
function ReportStat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="rounded-lg bg-slate-800/50 px-2 py-1.5">
      <p className="text-[10px] tracking-wide text-slate-400 uppercase">{label}</p>
      <p className="text-sm font-semibold text-slate-100 tabular-nums">{value}</p>
    </div>
  );
}

export function ProgressPage(): React.JSX.Element {
  const { repertoires, nodes, mastery, attempts, games, gamePositions, loading } = useRepertoires();

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

  const reports = useMemo(
    () =>
      views.map((view) =>
        buildOpeningReport({
          repertoire: view.repertoire,
          tree: view.tree,
          mastery,
          attempts,
          games,
          gamePositions,
          pathFor: (nodeId) => sanPathTo(view.tree, nodeId),
        }),
      ),
    [attempts, gamePositions, games, mastery, views],
  );

  const weekly = useMemo(() => weeklyImprovement(attempts, 8), [attempts]);
  const bookDepth = useMemo(() => bookDepthTrend(games), [games]);

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

      {reports.length > 0 ? (
        <Panel title="Opening reports">
          <ul className="space-y-4">
            {reports.map((report) => (
              <li key={report.repertoireId} className="rounded-lg border border-slate-800 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-100">
                    {report.openingName ?? report.name}
                  </h3>
                  <Badge tone={report.color === 'white' ? 'neutral' : 'info'}>{report.color}</Badge>
                </div>
                <p className="mt-1 text-sm text-slate-300">{report.headline}</p>

                <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                  <ReportStat label="Mastery" value={`${report.masteryScore}%`} />
                  <ReportStat
                    label="Trained"
                    value={`${report.trainedPositions}/${report.trainablePositions}`}
                  />
                  <ReportStat
                    label="Accuracy"
                    value={report.trainingAccuracy === null ? '-' : `${report.trainingAccuracy}%`}
                  />
                  <ReportStat
                    label="In book"
                    value={
                      report.averageInBookPlies === null
                        ? 'no games'
                        : `${report.averageInBookPlies} plies`
                    }
                  />
                </div>

                {report.weakest.length > 0 ? (
                  <ul className="mt-3 space-y-1 border-t border-slate-800 pt-3">
                    {report.weakest.map((line) => (
                      <li key={`${report.repertoireId}-${line.sanPath.join('')}${line.moveSan}`} className="flex justify-between gap-3 text-xs">
                        <span className="truncate text-slate-400">
                          {line.sanPath.length > 0 ? formatSanLine(line.sanPath) : 'start'} →{' '}
                          <span className="text-slate-200">{line.moveSan}</span>
                        </span>
                        <span className="shrink-0 text-slate-500 tabular-nums">
                          {line.masteryScore}% · {line.attempts}x
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {report.games > 0 ? (
                  <p className="mt-3 text-xs text-slate-500">
                    {report.games} imported game{report.games === 1 ? '' : 's'} ·{' '}
                    {report.deviations} position{report.deviations === 1 ? '' : 's'} flagged from play
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {weekly.some((week) => week.attempts > 0) ? (
        <Panel title="Long-term trend">
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs tracking-wide text-slate-400 uppercase">
                Accuracy by week
              </p>
              <ul className="space-y-1.5">
                {weekly.map((week) => (
                  <li key={week.weekStart} className="flex items-center gap-2 text-xs">
                    <span className="w-16 shrink-0 text-slate-500">
                      {week.weekStart.slice(5)}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-sky-500"
                        style={{ width: `${week.accuracy}%` }}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-right text-slate-400 tabular-nums">
                      {week.attempts > 0 ? `${week.accuracy}%` : '-'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="mb-2 text-xs tracking-wide text-slate-400 uppercase">
                How deep your games stayed in book
              </p>
              {bookDepth.length === 0 ? (
                <p className="text-sm text-slate-500">Import games to see this.</p>
              ) : (
                <div className="flex h-24 items-end gap-1">
                  {bookDepth.map((depth, index) => (
                    <div
                      key={index}
                      className="flex-1 rounded-t bg-cyan-700"
                      style={{ height: `${Math.max(4, (depth / Math.max(...bookDepth, 1)) * 100)}%` }}
                      title={`${depth} plies`}
                    />
                  ))}
                </div>
              )}
              <p className="mt-2 text-[11px] text-slate-500">
                Oldest to newest. Rising bars mean your preparation is holding up longer.
              </p>
            </div>
          </div>
        </Panel>
      ) : null}

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
