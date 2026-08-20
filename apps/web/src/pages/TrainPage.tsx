import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdaptiveItem, Color, MoveVerdict, TrainingSource } from '@papfish/core';
import {
  DRILL_LEVELS,
  TRAINING_SOURCE_LABELS,
  buildAdaptiveSession,
  formatSanLine,
  getDrillLevel,
  poolCandidates,
  replaySan,
  reviewLoad,
} from '@papfish/core';
import { Board } from '@/components/Board';
import { EnginePanel } from '@/components/EnginePanel';
import { OpeningBadge } from '@/components/OpeningBadge';
import { PopularityPanel } from '@/components/PopularityPanel';
import { Badge, Button, EmptyState, Panel, ProgressBar, Select, Spinner } from '@/components/ui';
import { PapfishLoader } from '@/components/brand';
import { useEngineAnalysis } from '@/hooks/useEngineAnalysis';
import { useOpeningIdentification } from '@/hooks/useOpeningBook';
import { usePositionStats } from '@/hooks/usePositionStats';
import { useRepertoires } from '@/repertoire/RepertoireProvider';
import { allCandidates, buildRepertoireViews } from '@/repertoire/selectors';
import { useSettings } from '@/settings/SettingsProvider';
import { useTrainingSession } from '@/training/useTrainingSession';

const VERDICT_TONE: Record<MoveVerdict, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  repertoire: 'success',
  'strong-alternative': 'info',
  inaccuracy: 'warning',
  mistake: 'danger',
  blunder: 'danger',
  illegal: 'neutral',
};

const SOURCE_TONE: Record<TrainingSource, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  due: 'info',
  failed: 'danger',
  weak: 'warning',
  frequent: 'neutral',
  new: 'success',
};

type ColorFilter = Color | 'both';
type SessionKind = 'adaptive' | 'due' | 'weak' | 'new' | 'drill';

const SESSION_KINDS: { id: SessionKind; label: string; description: string }[] = [
  { id: 'adaptive', label: 'Adaptive', description: 'A mix of reviews, weak spots and new positions' },
  { id: 'due', label: 'Due reviews', description: 'Only what the scheduler says is due' },
  { id: 'weak', label: 'Weak positions', description: 'The ones you keep getting wrong' },
  { id: 'new', label: 'New positions', description: 'Positions you have never trained' },
  { id: 'drill', label: 'Speed drill', description: 'Recall against the clock' },
];

/** Train: answer first, then feedback. The answer is never shown up front. */
export function TrainPage(): React.JSX.Element {
  const { repertoires, nodes, mastery, loading } = useRepertoires();
  const { settings, update } = useSettings();
  const session = useTrainingSession();
  const [colorFilter, setColorFilter] = useState<ColorFilter>('both');
  const [sessionKind, setSessionKind] = useState<SessionKind>('adaptive');
  const [drillLevelId, setDrillLevelId] = useState('standard');
  const [showWhy, setShowWhy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const views = useMemo(
    () => buildRepertoireViews(repertoires, nodes, mastery),
    [mastery, nodes, repertoires],
  );

  const candidates = useMemo(
    () => allCandidates(views, colorFilter === 'both' ? undefined : colorFilter),
    [colorFilter, views],
  );

  const load = useMemo(() => reviewLoad(candidates), [candidates]);
  const { state } = session;
  const active = state.phase !== 'idle' && state.phase !== 'complete';

  const linePositions = useMemo(() => {
    try {
      return replaySan(state.sanPath).map((move) => move.after);
    } catch {
      return [];
    }
  }, [state.sanPath]);
  const identification = useOpeningIdentification(linePositions);

  const { stats, origin, loading: statsLoading } = usePositionStats(
    state.phase === 'feedback' ? state.fen : null,
    settings.ratingBucket,
    settings.timeControl,
    state.phase === 'feedback',
  );
  const { analysis, analyzing } = useEngineAnalysis(
    state.phase === 'feedback' && showWhy ? state.fen : null,
    { enabled: settings.engineEnabled && showWhy, depth: settings.analysisDepth, multiPv: 3 },
  );

  // Drill clock. The deadline lives in the session; this only renders it and
  // reports the timeout once. `now` ticks on an interval, so nothing is set
  // synchronously while rendering.
  const timedOutFor = useRef<string | null>(null);
  const running = Boolean(state.deadlineAt) && state.phase === 'waiting';

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (!running || !state.deadlineAt) return;
    if (now < state.deadlineAt) return;
    const key = String(state.deadlineAt);
    if (timedOutFor.current === key) return;
    timedOutFor.current = key;
    void session.timeout();
  }, [now, running, session, state.deadlineAt]);

  const remainingMs =
    running && state.deadlineAt ? Math.max(0, state.deadlineAt - now) : null;

  const startSession = () => {
    setShowWhy(false);
    const size = settings.trainingSessionSize;
    const color = colorFilter === 'both' ? undefined : colorFilter;
    const pools = poolCandidates(candidates, new Date());

    if (sessionKind === 'drill') {
      const level = getDrillLevel(drillLevelId);
      const items = buildAdaptiveSession(candidates, { size, color });
      session.start(items, { mode: 'drill', timeLimitMs: level.timeLimitMs });
      return;
    }

    if (sessionKind === 'adaptive') {
      session.start(buildAdaptiveSession(candidates, { size, color }), { mode: 'train' });
      return;
    }

    const pool =
      sessionKind === 'due'
        ? [...pools.due, ...pools.failed]
        : sessionKind === 'weak'
          ? [...pools.weak, ...pools.failed]
          : pools.new;

    const items: AdaptiveItem[] = pool
      .slice(0, size)
      .map((candidate) => ({ candidate, source: sessionKind === 'due' ? 'due' : sessionKind === 'weak' ? 'weak' : 'new' }));

    session.start(items, { mode: sessionKind === 'due' ? 'review' : 'train' });
  };

  if (loading) {
    return (
      <PapfishLoader full={false} label="Loading your repertoires" />
    );
  }

  if (candidates.length === 0) {
    return (
      <EmptyState
        title="Nothing to train yet"
        description="Create a repertoire and choose your moves - every move you pick becomes a training position."
        action={
          <Link to="/repertoires">
            <Button>Go to repertoires</Button>
          </Link>
        }
      />
    );
  }

  if (!active) {
    const selected = SESSION_KINDS.find((kind) => kind.id === sessionKind)!;
    const available =
      sessionKind === 'due'
        ? load.due + load.failed
        : sessionKind === 'weak'
          ? load.weak + load.failed
          : sessionKind === 'new'
            ? load.new
            : candidates.length;

    return (
      <div className="space-y-4">
        <header>
          <h1 className="text-xl font-bold text-slate-100">Train</h1>
          <p className="text-sm text-slate-400">
            You will be shown a position and must play your move before anything is revealed.
          </p>
        </header>

        {state.phase === 'complete' ? (
          <Panel title="Session complete">
            <div className="space-y-3">
              <p className="text-slate-200">
                {state.progress.correct} of {state.progress.answered} answers matched your
                repertoire
                {state.mode === 'drill' ? ` · ${state.drillScore} drill points` : ''}.
              </p>
              <ProgressBar
                value={
                  state.progress.answered > 0
                    ? (state.progress.correct / state.progress.answered) * 100
                    : 0
                }
                tone="emerald"
                label="Accuracy"
              />
              <Button onClick={() => session.reset()}>Back to setup</Button>
            </div>
          </Panel>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-4">
          <ReviewTile label="Due now" value={load.due} tone="info" />
          <ReviewTile label="Failed last time" value={load.failed} tone="danger" />
          <ReviewTile label="Weak" value={load.weak} tone="warning" />
          <ReviewTile label="Never trained" value={load.new} tone="success" />
        </div>

        <Panel title="Session setup">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="block text-sm font-medium text-slate-300">Session type</span>
              <Select
                value={sessionKind}
                onChange={(event) => setSessionKind(event.target.value as SessionKind)}
              >
                {SESSION_KINDS.map((kind) => (
                  <option key={kind.id} value={kind.id}>
                    {kind.label}
                  </option>
                ))}
              </Select>
              <span className="block text-xs text-slate-500">{selected.description}</span>
            </label>

            <label className="space-y-1.5">
              <span className="block text-sm font-medium text-slate-300">Repertoire colour</span>
              <Select
                value={colorFilter}
                onChange={(event) => setColorFilter(event.target.value as ColorFilter)}
              >
                <option value="both">White and Black</option>
                <option value="white">White only</option>
                <option value="black">Black only</option>
              </Select>
            </label>

            <label className="space-y-1.5">
              <span className="block text-sm font-medium text-slate-300">Positions</span>
              <Select
                value={settings.trainingSessionSize}
                onChange={(event) => update({ trainingSessionSize: Number(event.target.value) })}
              >
                {[5, 10, 15, 20, 30].map((size) => (
                  <option key={size} value={size}>
                    {size} positions
                  </option>
                ))}
              </Select>
            </label>

            {sessionKind === 'drill' ? (
              <label className="space-y-1.5">
                <span className="block text-sm font-medium text-slate-300">Clock</span>
                <Select value={drillLevelId} onChange={(event) => setDrillLevelId(event.target.value)}>
                  {DRILL_LEVELS.map((level) => (
                    <option key={level.id} value={level.id}>
                      {level.label} - {level.description}
                    </option>
                  ))}
                </Select>
              </label>
            ) : (
              <>
                <label className="space-y-1.5">
                  <span className="block text-sm font-medium text-slate-300">Opponent</span>
                  <Select
                    value={settings.opponentMode}
                    onChange={(event) => update({ opponentMode: event.target.value as never })}
                  >
                    <option value="human">Human patterns (popularity)</option>
                    <option value="engine">Stockfish</option>
                  </Select>
                </label>

                <label className="space-y-1.5">
                  <span className="block text-sm font-medium text-slate-300">Candidate replies</span>
                  <Select
                    value={settings.candidatePolicy}
                    onChange={(event) => update({ candidatePolicy: event.target.value as never })}
                    disabled={settings.opponentMode !== 'human'}
                  >
                    <option value="top1">Most popular only</option>
                    <option value="top3">Top 3</option>
                    <option value="top5">Top 5</option>
                    <option value="weighted">Weighted by popularity</option>
                  </Select>
                </label>
              </>
            )}
          </div>

          <p className="mt-4 text-xs text-slate-500">
            {available} position{available === 1 ? '' : 's'} available for this session type.
          </p>

          <Button className="mt-4" onClick={startSession} disabled={available === 0}>
            {available === 0 ? 'Nothing to train here' : 'Start training'}
          </Button>
        </Panel>
      </div>
    );
  }

  const feedback = state.feedback;
  const clockShare =
    state.timeLimitMs && remainingMs !== null ? (remainingMs / state.timeLimitMs) * 100 : null;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-100">
            {state.mode === 'drill' ? 'Speed drill' : 'Training'}
            {state.source ? (
              <Badge tone={SOURCE_TONE[state.source]}>{TRAINING_SOURCE_LABELS[state.source]}</Badge>
            ) : null}
          </h1>
          <p className="text-sm text-slate-400">
            {state.orientation === 'white' ? 'White' : 'Black'} to move - play your repertoire move.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400 tabular-nums">
            {state.progress.index}/{state.progress.total}
          </span>
          <Button variant="ghost" onClick={() => session.reset()}>
            End session
          </Button>
        </div>
      </header>

      {clockShare !== null ? (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full rounded-full transition-[width] duration-100 ${
              clockShare > 40 ? 'bg-sky-500' : clockShare > 15 ? 'bg-amber-500' : 'bg-rose-500'
            }`}
            style={{ width: `${clockShare}%` }}
          />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel bodyClassName="p-3">
          <div className="mx-auto w-full max-w-[560px]">
            <Board
              fen={state.fen}
              orientation={state.orientation}
              interactive={state.phase === 'waiting'}
              onMove={(san) => void session.submitMove(san)}
              showCoordinates={settings.showCoordinates}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              {state.sanPath.length > 0 ? formatSanLine(state.sanPath) : 'From the starting position'}
            </p>
            {state.phase === 'waiting' ? (
              <Button variant="ghost" onClick={() => session.skip()}>
                Skip
              </Button>
            ) : null}
          </div>
        </Panel>

        <div className="space-y-3">
          <Panel title="Feedback">
            {state.phase === 'waiting' ? (
              <p className="text-sm text-slate-400">
                {state.timeLimitMs
                  ? `Play your move within ${Math.round(state.timeLimitMs / 1000)} seconds.`
                  : 'Make your move on the board. Nothing is revealed until you commit.'}
              </p>
            ) : null}

            {state.phase === 'grading' ? (
              <p className="flex items-center gap-2 text-sm text-slate-400">
                <Spinner /> Checking your move…
              </p>
            ) : null}

            {state.phase === 'opponent' ? (
              <div className="space-y-2 text-sm text-slate-300">
                <p className="flex items-center gap-2">
                  <Spinner /> Opponent is replying…
                </p>
                {state.opponentMove ? (
                  <p>
                    <span className="font-semibold text-slate-100">{state.opponentMove.san}</span> -{' '}
                    {state.opponentMove.reason}
                  </p>
                ) : null}
              </div>
            ) : null}

            {feedback && state.phase === 'feedback' ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={state.timedOut ? 'danger' : VERDICT_TONE[feedback.verdict]}>
                    {feedback.headline}
                  </Badge>
                  {feedback.centipawnLoss !== null && feedback.verdict !== 'repertoire' ? (
                    <span className="text-xs text-slate-500 tabular-nums">
                      -{(feedback.centipawnLoss / 100).toFixed(2)}
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-slate-300">{feedback.detail}</p>

                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void session.advance()}>Continue</Button>
                  {state.mode !== 'drill' ? (
                    <Button variant="secondary" onClick={() => setShowWhy((value) => !value)}>
                      {showWhy ? 'Hide why' : 'Why?'}
                    </Button>
                  ) : null}
                </div>

                {state.engineUnavailable ? (
                  <p className="text-xs text-slate-500">
                    Engine analysis is unavailable, so this move was graded against your repertoire
                    only.
                  </p>
                ) : null}
              </div>
            ) : null}

            {state.opponentNote ? (
              <p className="mt-3 text-xs text-amber-300">{state.opponentNote}</p>
            ) : null}
          </Panel>

          {showWhy && state.phase === 'feedback' ? (
            <>
              <Panel title="What humans play here">
                <PopularityPanel stats={stats} origin={origin} loading={statsLoading} />
              </Panel>
              <Panel title="Engine view">
                <EnginePanel
                  fen={state.fen}
                  analysis={analysis}
                  state={analyzing ? 'analyzing' : 'ready'}
                  analyzing={analyzing}
                />
              </Panel>
            </>
          ) : null}

          <Panel title="Session">
            <ProgressBar
              value={state.progress.total > 0 ? (state.progress.index / state.progress.total) * 100 : 0}
              label="Progress"
            />
            <p className="mt-3 text-sm text-slate-400">
              {state.progress.correct} correct of {state.progress.answered} answered
              {state.mode === 'drill' ? ` · ${state.drillScore} points` : ''}
            </p>
            <div className="mt-2">
              <OpeningBadge identification={identification} />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function ReviewTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'info' | 'danger' | 'warning' | 'success';
}): React.JSX.Element {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs tracking-wide text-slate-400 uppercase">{label}</p>
        <Badge tone={tone}>{value}</Badge>
      </div>
    </div>
  );
}
