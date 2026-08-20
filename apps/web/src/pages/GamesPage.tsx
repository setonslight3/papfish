import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ImportedGameRecord, PersonalGamePositionRecord } from '@papfish/core';
import { formatSanLine } from '@papfish/core';
import { Badge, Button, EmptyState, ErrorNote, Panel, Spinner, TextInput } from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';
import { useRepertoires } from '@/repertoire/RepertoireProvider';
import { gameOpeningLabel } from '@/repertoire/gameImport';
import { formatRelativeTime } from '@/lib/format';

const RESULT_LABEL: Record<string, string> = {
  '1-0': 'White won',
  '0-1': 'Black won',
  '1/2-1/2': 'Draw',
  '*': 'Unfinished',
};

/**
 * Import personal games and see what they say about the repertoire.
 *
 * An imported game never rewrites a repertoire. It reports where play left
 * preparation and which positions keep coming up; adding anything to the
 * repertoire stays a deliberate action in Explore.
 */
export function GamesPage(): React.JSX.Element {
  const { user } = useAuth();
  const { games, gamePositions, repertoires, importGames, deleteGame, loading } = useRepertoires();
  const fileRef = useRef<HTMLInputElement>(null);

  const [pgn, setPgn] = useState('');
  const [aliases, setAliases] = useState(
    () => user?.displayName ?? user?.email?.split('@')[0] ?? '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const positionsByGame = useMemo(() => {
    const map = new Map<string, PersonalGamePositionRecord[]>();
    for (const position of gamePositions) {
      const list = map.get(position.importedGameId) ?? [];
      list.push(position);
      map.set(position.importedGameId, list);
    }
    return map;
  }, [gamePositions]);

  const recommendations = useMemo(() => {
    const buckets = new Map<
      string,
      { position: PersonalGamePositionRecord; games: Set<string> }
    >();
    for (const position of gamePositions) {
      if (!position.trainingRecommended) continue;
      const bucket = buckets.get(position.positionKey) ?? {
        position,
        games: new Set<string>(),
      };
      bucket.games.add(position.importedGameId);
      buckets.set(position.positionKey, bucket);
    }
    return Array.from(buckets.values())
      .sort((a, b) => b.games.size - a.games.size)
      .slice(0, 8);
  }, [gamePositions]);

  const handleImport = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const outcome = await importGames(
        pgn,
        aliases.split(',').map((alias) => alias.trim()),
      );
      const parts = [`Imported ${outcome.imported.length} game${outcome.imported.length === 1 ? '' : 's'}.`];
      if (outcome.skipped.length > 0) parts.push(`${outcome.skipped.length} skipped.`);
      if (outcome.warnings.length > 0) parts.push(outcome.warnings[0]);
      setNotice(parts.join(' '));
      setPgn('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not import those games');
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      setPgn(await file.text());
    } catch {
      setError('Could not read that file.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400">
        <Spinner /> Loading your games…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-slate-100">Your games</h1>
        <p className="text-sm text-slate-400">
          Import games you have played. Papfish compares them with your repertoire and points at
          the positions worth practising - it never changes your repertoire on its own.
        </p>
      </header>

      <Panel title="Import PGN">
        <div className="space-y-3">
          <label className="block space-y-1.5">
            <span className="block text-sm font-medium text-slate-300">
              The names you play under
            </span>
            <TextInput
              value={aliases}
              onChange={(event) => setAliases(event.target.value)}
              placeholder="your-lichess-name, your-chesscom-name"
            />
            <span className="block text-xs text-slate-500">
              Comma separated. This is how Papfish works out which side you played.
            </span>
          </label>

          <label className="block space-y-1.5">
            <span className="block text-sm font-medium text-slate-300">PGN</span>
            <textarea
              value={pgn}
              onChange={(event) => setPgn(event.target.value)}
              rows={6}
              spellCheck={false}
              placeholder={'[Event "Rated blitz game"]\n[White "you"]\n...\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4'}
              className="scrollbar-thin w-full rounded-lg border border-slate-700 bg-slate-950/60 p-3 font-mono text-xs text-slate-100 placeholder:text-slate-600 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleImport} disabled={busy || pgn.trim().length === 0}>
              {busy ? 'Importing…' : 'Import games'}
            </Button>
            <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
              Choose a .pgn file
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".pgn,text/plain"
              className="hidden"
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
          </div>

          <ErrorNote>{error}</ErrorNote>
          {notice ? <p className="text-sm text-emerald-300">{notice}</p> : null}
          {repertoires.length === 0 ? (
            <p className="text-xs text-amber-300">
              You have no repertoires yet, so games will be stored but not compared against
              anything. <Link to="/repertoires" className="underline">Create one first</Link>.
            </p>
          ) : null}
        </div>
      </Panel>

      {recommendations.length > 0 ? (
        <Panel title="Worth training">
          <ul className="space-y-2">
            {recommendations.map(({ position, games: gameIds }) => (
              <li key={position.positionKey} className="rounded-lg border border-slate-800 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-slate-200">
                    {position.expectedMove
                      ? `You played ${position.movePlayed}, repertoire says ${position.expectedMove}`
                      : `Opponent played ${position.movePlayed}`}
                  </span>
                  <Badge tone={gameIds.size > 1 ? 'danger' : 'warning'}>
                    {gameIds.size} game{gameIds.size === 1 ? '' : 's'}
                  </Badge>
                </div>
                {position.note ? (
                  <p className="mt-1 text-xs text-slate-500">{position.note}</p>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            Open these in Explore to decide what you want to play, then train them.
          </p>
        </Panel>
      ) : null}

      {games.length === 0 ? (
        <EmptyState
          title="No games imported yet"
          description="Paste a PGN from Lichess or Chess.com above. You can import a whole month at once."
        />
      ) : (
        <Panel title={`Imported games (${games.length})`}>
          <ul className="divide-y divide-slate-800">
            {games.map((game) => (
              <GameRow
                key={game.id}
                game={game}
                positions={positionsByGame.get(game.id) ?? []}
                expanded={expanded === game.id}
                onToggle={() => setExpanded(expanded === game.id ? null : game.id)}
                onDelete={() => deleteGame(game.id)}
              />
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function GameRow({
  game,
  positions,
  expanded,
  onToggle,
  onDelete,
}: {
  game: ImportedGameRecord;
  positions: PersonalGamePositionRecord[];
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => Promise<void>;
}): React.JSX.Element {
  const deviations = positions.filter((position) => position.note);
  const opponent = game.userColor === 'white' ? game.blackPlayer : game.whitePlayer;
  const won =
    (game.result === '1-0' && game.userColor === 'white') ||
    (game.result === '0-1' && game.userColor === 'black');
  const drew = game.result === '1/2-1/2';

  return (
    <li className="py-3">
      <button type="button" onClick={onToggle} className="w-full text-left">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-medium text-slate-100">
            <Badge tone={game.userColor === 'white' ? 'neutral' : 'info'}>{game.userColor}</Badge>
            vs {opponent}
          </span>
          <span className="flex items-center gap-2">
            <Badge tone={won ? 'success' : drew ? 'neutral' : 'danger'}>
              {RESULT_LABEL[game.result] ?? game.result}
            </Badge>
            <span className="text-xs text-slate-500">
              {game.playedAt ? formatRelativeTime(game.playedAt) : 'date not in PGN'}
            </span>
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          {gameOpeningLabel(game)} · followed your repertoire for {game.inBookPlies} plies
          {deviations.length > 0 ? ` · ${deviations.length} deviation${deviations.length === 1 ? '' : 's'}` : ''}
        </p>
      </button>

      {expanded ? (
        <div className="mt-3 space-y-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
          {deviations.length === 0 ? (
            <p className="text-sm text-slate-500">
              This game stayed inside your repertoire for as far as it goes.
            </p>
          ) : (
            <ul className="space-y-2">
              {deviations.map((position) => (
                <li key={position.id} className="text-sm">
                  <span className="text-slate-300">{position.note}</span>
                  <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                    after {formatSanLine(
                      positions
                        .filter((item) => item.ply < position.ply)
                        .map((item) => item.movePlayed),
                    ) || 'the start'}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2">
            <Link to="/explore">
              <Button variant="secondary">Open Explore</Button>
            </Link>
            <Button variant="ghost" onClick={onDelete}>
              Remove game
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
