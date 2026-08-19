import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Color, MoveVerdict } from '@papfish/core';
import { formatSanLine, replaySan } from '@papfish/core';
import { Board } from '@/components/Board';
import { EnginePanel } from '@/components/EnginePanel';
import { OpeningBadge } from '@/components/OpeningBadge';
import { PopularityPanel } from '@/components/PopularityPanel';
import { Badge, Button, EmptyState, Panel, ProgressBar, Select, Spinner } from '@/components/ui';
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

type ColorFilter = Color | 'both';

/** Train: answer first, then receive feedback. The answer is never shown up front. */
export function TrainPage(): React.JSX.Element {
  const { repertoires, nodes, mastery, loading } = useRepertoires();
  const { settings, update } = useSettings();
  const session = useTrainingSession();
  const [colorFilter, setColorFilter] = useState<ColorFilter>('both');
  const [showWhy, setShowWhy] = useState(false);

  const views = useMemo(
    () => buildRepertoireViews(repertoires, nodes, mastery),
    [mastery, nodes, repertoires],
  );

  const candidates = useMemo(
    () => allCandidates(views, colorFilter === 'both' ? undefined : colorFilter),
    [colorFilter, views],
  );

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

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400">
        <Spinner /> Loading your repertoires…
      </div>
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
                repertoire.
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

        <Panel title="Session setup">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="block text-sm font-medium text-slate-300">Repertoire colour</span>
              <Select value={colorFilter} onChange={(event) => setColorFilter(event.target.value as ColorFilter)}>
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
          </div>

          <p className="mt-4 text-xs text-slate-500">
            {candidates.length} positions available in this pool.
          </p>

          <Button
            className="mt-4"
            onClick={() => {
              setShowWhy(false);
              session.start(candidates, settings.trainingSessionSize);
            }}
          >
            Start training
          </Button>
        </Panel>
      </div>
    );
  }

  const feedback = state.feedback;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Training</h1>
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
                Make your move on the board. Nothing is revealed until you commit.
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
                  <Badge tone={VERDICT_TONE[feedback.verdict]}>{feedback.headline}</Badge>
                  {feedback.centipawnLoss !== null && feedback.verdict !== 'repertoire' ? (
                    <span className="text-xs text-slate-500 tabular-nums">
                      -{(feedback.centipawnLoss / 100).toFixed(2)}
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-slate-300">{feedback.detail}</p>

                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void session.advance()}>Continue</Button>
                  <Button variant="secondary" onClick={() => setShowWhy((value) => !value)}>
                    {showWhy ? 'Hide why' : 'Why?'}
                  </Button>
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
