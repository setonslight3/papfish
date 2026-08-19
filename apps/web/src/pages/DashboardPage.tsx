import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { formatSanLine, weakestPositions } from '@papfish/core';
import { Badge, Button, EmptyState, Panel, ProgressBar, Spinner, StatTile } from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';
import { useRepertoires } from '@/repertoire/RepertoireProvider';
import { allCandidates, buildRepertoireViews, summarizeMastery } from '@/repertoire/selectors';
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
  const weak = useMemo(() => weakestPositions(allCandidates(views), 5), [views]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400">
        <Spinner /> Loading your progress…
      </div>
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
          <Button>Start training</Button>
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

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Overall mastery" value={`${summary.overall}%`} sublabel="across every repertoire" />
        <StatTile label="White mastery" value={`${summary.white}%`} tone="white" sublabel="White repertoires only" />
        <StatTile label="Black mastery" value={`${summary.black}%`} tone="black" sublabel="Black repertoires only" />
      </div>

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
