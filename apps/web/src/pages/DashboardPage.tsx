import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { formatSanLine, reviewLoad, studyStreak, weakestPositions } from '@papfish/core';
import { Badge, Button, EmptyState, Panel, ProgressBar, StatTile } from '@/components/ui';
import { PapfishLoader } from '@/components/brand';
import { useAuth } from '@/auth/AuthProvider';
import { useRepertoires } from '@/repertoire/RepertoireProvider';
import { allCandidates, buildRepertoireViews, summarizeMastery } from '@/repertoire/selectors';
import { ReviewForecast } from '@/components/charts';
import { formatRelativeTime } from '@/lib/format';

const VERDICT_LABEL: Record<string, { text: string; tone: 'success' | 'info' | 'warning' | 'danger' | 'neutral' }> = {
  repertoire: { text: 'correct', tone: 'success' },
  'strong-alternative': { text: 'strong alternative', tone: 'info' },
  inaccuracy: { text: 'inaccuracy', tone: 'warning' },
  mistake: { text: 'mistake', tone: 'danger' },
  blunder: { text: 'blunder', tone: 'danger' },
  illegal: { text: 'illegal', tone: 'neutral' },
};

export function DashboardPage(): React.JSX.Element {
  const { user } = useAuth();
  const { repertoires, nodes, mastery, attempts, loading } = useRepertoires();

  const views = useMemo(
    () => buildRepertoireViews(repertoires, nodes, mastery),
    [mastery, nodes, repertoires],
  );
  const summary = useMemo(() => summarizeMastery(views), [views]);
  const candidates = useMemo(() => allCandidates(views), [views]);
  const weak = useMemo(() => weakestPositions(candidates, 5), [candidates]);
  const load = useMemo(() => reviewLoad(candidates), [candidates]);
  const streak = useMemo(() => studyStreak(attempts), [attempts]);

  if (loading) {
    return (
      <PapfishLoader full={false} label="Loading your progress" />
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-100">
            Hello{user?.displayName ? `, ${user.displayName}` : ''}
          </h1>
          <p className="text-sm text-slate-400">
            Explore → choose your moves → train → review. Here is where you stand.
          </p>
        </div>
        <Link to="/train">
          <Button>{load.due + load.failed > 0 ? `Review ${load.due + load.failed} positions` : 'Start training'}</Button>
        </Link>
      </header>

      {repertoires.length === 0 ? (
        <EmptyState
          title="Build your first repertoire"
          description="Papfish ships with an Italian Game repertoire for White and a King's Indian Defence for Black. Create one and you can train it straight away."
          action={
            <Link to="/repertoires">
              <Button>Choose a repertoire</Button>
            </Link>
          }
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="Overall mastery" value={`${summary.overall}%`} sublabel="across every repertoire" />
        <StatTile label="White mastery" value={`${summary.white}%`} tone="white" sublabel="White repertoires only" />
        <StatTile label="Black mastery" value={`${summary.black}%`} tone="black" sublabel="Black repertoires only" />
        <StatTile
          label="Study streak"
          value={streak.current > 0 ? `${streak.current}d` : '-'}
          sublabel={streak.longest > 0 ? `longest ${streak.longest}d` : 'train to start one'}
        />
      </div>

      {candidates.length > 0 ? (
        <Panel
          title="Review schedule"
          actions={
            <Link to="/train" className="text-xs font-semibold text-sky-400 hover:text-sky-300">
              Train now
            </Link>
          }
        >
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <ReviewForecast upcoming={load.upcoming} />
            <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-1">
              <li className="flex justify-between gap-3">
                <span className="text-slate-400">Due now</span>
                <span className="text-slate-100 tabular-nums">{load.due}</span>
              </li>
              <li className="flex justify-between gap-3">
                <span className="text-slate-400">Failed last time</span>
                <span className="text-rose-300 tabular-nums">{load.failed}</span>
              </li>
              <li className="flex justify-between gap-3">
                <span className="text-slate-400">Weak</span>
                <span className="text-amber-300 tabular-nums">{load.weak}</span>
              </li>
              <li className="flex justify-between gap-3">
                <span className="text-slate-400">Never trained</span>
                <span className="text-emerald-300 tabular-nums">{load.new}</span>
              </li>
            </ul>
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Repertoires">
          {views.length === 0 ? (
            <p className="text-sm text-slate-500">No repertoires yet.</p>
          ) : (
            <ul className="space-y-4">
              {views.map((view) => (
                <li key={view.repertoire.id} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-100">
                      {view.repertoire.name}
                    </span>
                    <Badge tone={view.repertoire.color === 'white' ? 'neutral' : 'info'}>
                      {view.repertoire.color}
                    </Badge>
                  </div>
                  <ProgressBar value={view.masteryScore} tone="emerald" />
                  <p className="text-xs text-slate-500">
                    {view.trainedCount}/{view.trainableCount} positions practised
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Weak positions">
          {weak.length === 0 ? (
            <p className="text-sm text-slate-500">
              Train a few positions and the ones that need work will appear here.
            </p>
          ) : (
            <ul className="space-y-2">
              {weak.map(({ candidate, masteryScore, attempts: tries }) => (
                <li key={candidate.node.id} className="rounded-lg border border-slate-800 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-slate-200">
                      {candidate.sanPath.length > 0
                        ? formatSanLine(candidate.sanPath)
                        : 'Starting position'}
                    </span>
                    <span className="text-xs text-slate-400 tabular-nums">{masteryScore}%</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {tries} attempt{tries === 1 ? '' : 's'} · your move:{' '}
                    <span className="text-slate-300">{candidate.node.moveSan}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Recent training">
        {attempts.length === 0 ? (
          <p className="text-sm text-slate-500">No attempts recorded yet.</p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {attempts.slice(0, 8).map((attempt) => {
              const label = VERDICT_LABEL[attempt.result] ?? VERDICT_LABEL.illegal;
              return (
                <li key={attempt.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="flex items-center gap-2 text-sm text-slate-300">
                    <Badge tone={label.tone}>{label.text}</Badge>
                    played {attempt.attemptedMove}
                    {attempt.expectedMove && attempt.expectedMove !== attempt.attemptedMove
                      ? ` · repertoire ${attempt.expectedMove}`
                      : ''}
                  </span>
                  <span className="text-xs text-slate-500">
                    {attempt.color} · {formatRelativeTime(attempt.createdAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
