import { useMemo, useState } from 'react';
import type { Color } from '@papfish/core';
import { RATING_BUCKETS, TIME_CONTROLS, formatSanLine, uciToSan } from '@papfish/core';
import { Board } from '@/components/Board';
import { BoardControls } from '@/components/BoardControls';
import { EnginePanel, EvalBar } from '@/components/EnginePanel';
import { MoveList } from '@/components/MoveList';
import { OpeningBadge } from '@/components/OpeningBadge';
import { PopularityPanel } from '@/components/PopularityPanel';
import { MasterComparison } from '@/components/MasterComparison';
import { Badge, Button, ErrorNote, Panel, Select } from '@/components/ui';
import { useChessGame } from '@/hooks/useChessGame';
import { useEngineAnalysis } from '@/hooks/useEngineAnalysis';
import { useOpeningIdentification } from '@/hooks/useOpeningBook';
import { usePositionStats } from '@/hooks/usePositionStats';
import { useSettings } from '@/settings/SettingsProvider';
import { useRepertoires } from '@/repertoire/RepertoireProvider';
import { repertoireMoveFor } from '@/repertoire/repertoireService';

/**
 * Explore: free navigation with human statistics, engine analysis and the
 * ability to commit a move to a repertoire.
 */
export function ExplorePage(): React.JSX.Element {
  const game = useChessGame();
  const { settings, update } = useSettings();
  const { repertoires, nodes, addMove } = useRepertoires();

  const [orientation, setOrientation] = useState<Color>('white');
  const [showMasters, setShowMasters] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const identification = useOpeningIdentification(game.fenPath);
  const { stats, origin, loading } = usePositionStats(
    game.fen,
    settings.ratingBucket,
    settings.timeControl,
  );
  // The master database is a separate population, fetched only when asked for.
  const masterStats = usePositionStats(
    showMasters ? game.fen : null,
    'masters',
    'all',
    showMasters,
  );
  const { analysis, analyzing, error: engineError } = useEngineAnalysis(game.fen, {
    enabled: settings.engineEnabled,
    depth: settings.analysisDepth,
    multiPv: 3,
  });

  const activeRepertoires = useMemo(
    () => repertoires.filter((item) => item.color === (game.turn === 'w' ? 'white' : 'black')),
    [game.turn, repertoires],
  );

  const repertoireMove = useMemo(() => {
    for (const repertoire of activeRepertoires) {
      const match = repertoireMoveFor(
        nodes.filter((node) => node.repertoireId === repertoire.id),
        game.sanPath,
      );
      if (match) return match;
    }
    return null;
  }, [activeRepertoires, game.sanPath, nodes]);

  const bestMoveArrow = useMemo(() => {
    const best = analysis?.bestMove;
    if (!best || !settings.engineEnabled) return [];
    return [{ from: best.slice(0, 2), to: best.slice(2, 4), color: '#38bdf8' }];
  }, [analysis?.bestMove, settings.engineEnabled]);

  const handleSelectRepertoireMove = async (repertoireId: string) => {
    const lastMove = game.lastMove;
    if (!lastMove) {
      setError('Play the move on the board first, then add it to a repertoire.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await addMove(repertoireId, game.sanPath.slice(0, -1), lastMove.san);
      setMessage(`${lastMove.san} saved to your repertoire.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the move');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Explore</h1>
          <p className="text-sm text-slate-400">
            Play through a line, compare what humans play with what the engine likes, and choose
            your repertoire move.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select
            aria-label="Opponent rating range"
            value={settings.ratingBucket}
            onChange={(event) => update({ ratingBucket: event.target.value as never })}
            className="w-44"
          >
            {RATING_BUCKETS.map((bucket) => (
              <option key={bucket.id} value={bucket.id}>
                {bucket.label}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Time control"
            value={settings.timeControl}
            onChange={(event) => update({ timeControl: event.target.value as never })}
            className="w-40"
          >
            {TIME_CONTROLS.map((control) => (
              <option key={control.id} value={control.id}>
                {control.label}
              </option>
            ))}
          </Select>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-3">
          <Panel bodyClassName="p-3">
            <OpeningBadge identification={identification} className="mb-3" />
            <div className="flex gap-3">
              {settings.engineEnabled ? (
                <div className="hidden sm:block">
                  <EvalBar fen={game.fen} analysis={analysis} />
                </div>
              ) : null}
              <div className="mx-auto w-full max-w-[560px]">
                <Board
                  fen={game.fen}
                  orientation={orientation}
                  onMove={(san) => {
                    setMessage(null);
                    game.play(san);
                  }}
                  lastMove={
                    game.lastMove
                      ? { from: game.lastMove.uci.slice(0, 2), to: game.lastMove.uci.slice(2, 4) }
                      : null
                  }
                  arrows={bestMoveArrow}
                  showCoordinates={settings.showCoordinates}
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <BoardControls
                onStart={game.toStart}
                onBack={game.back}
                onForward={game.forward}
                onEnd={game.toEnd}
                onFlip={() => setOrientation((current) => (current === 'white' ? 'black' : 'white'))}
                canBack={!game.isAtStart}
                canForward={!game.isAtEnd}
              />
              <Button variant="ghost" onClick={() => game.reset()}>
                New position
              </Button>
            </div>
          </Panel>

          <Panel title="Line">
            <p className="mb-2 text-xs text-slate-500">
              {game.sanPath.length > 0 ? formatSanLine(game.sanPath) : 'Starting position'}
            </p>
            <MoveList moves={game.moves} index={game.index} onSelect={game.goTo} />
          </Panel>
        </div>

        <div className="space-y-3">
          <Panel
            title="Human popularity"
            actions={<Badge>{game.turn === 'w' ? 'White to move' : 'Black to move'}</Badge>}
          >
            <PopularityPanel
              stats={stats}
              origin={origin}
              loading={loading}
              repertoireMove={repertoireMove?.moveSan ?? null}
              onSelectMove={(san) => {
                setMessage(null);
                game.play(san);
              }}
            />
          </Panel>

          <Panel
            title="Masters vs your level"
            actions={
              <Button
                variant="ghost"
                className="px-2 py-1 text-xs"
                onClick={() => setShowMasters((value) => !value)}
              >
                {showMasters ? 'Hide' : 'Compare'}
              </Button>
            }
          >
            {showMasters ? (
              <MasterComparison
                club={stats}
                masters={masterStats.stats}
                loading={masterStats.loading}
                ratingBucket={settings.ratingBucket}
                engineBest={
                  analysis?.bestMove ? (uciToSan(game.fen, analysis.bestMove) ?? null) : null
                }
              />
            ) : (
              <p className="text-sm text-slate-500">
                See how master practice differs from play at your rating in this exact position.
              </p>
            )}
          </Panel>

          <Panel
            title="Engine"
            actions={
              <Button
                variant="ghost"
                className="px-2 py-1 text-xs"
                onClick={() => update({ engineEnabled: !settings.engineEnabled })}
              >
                {settings.engineEnabled ? 'Turn off' : 'Turn on'}
              </Button>
            }
          >
            {settings.engineEnabled ? (
              <EnginePanel
                fen={game.fen}
                analysis={analysis}
                state={analyzing ? 'analyzing' : 'ready'}
                analyzing={analyzing}
                error={engineError}
              />
            ) : (
              <p className="text-sm text-slate-500">
                Engine analysis is off. Human popularity is unaffected - the two are independent.
              </p>
            )}
          </Panel>

          <Panel title="Repertoire">
            {game.lastMove ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-300">
                  Save <span className="font-semibold text-slate-100">{game.lastMove.san}</span> as
                  your move in this position.
                </p>
                {repertoires.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Create a repertoire first on the Repertoires page.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {repertoires.map((repertoire) => (
                      <Button
                        key={repertoire.id}
                        variant="secondary"
                        disabled={busy}
                        onClick={() => handleSelectRepertoireMove(repertoire.id)}
                      >
                        Add to {repertoire.name} ({repertoire.color})
                      </Button>
                    ))}
                  </div>
                )}
                {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
                <ErrorNote>{error}</ErrorNote>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                Play a move to add it to a repertoire. Branches are kept as a tree, so several
                answers to the same position can live side by side.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
