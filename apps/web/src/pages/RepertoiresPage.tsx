import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { RepertoireTreeNode } from '@papfish/core';
import { STARTER_REPERTOIRES, childrenOf, formatMoveNumber, summarize } from '@papfish/core';
import { Badge, Button, EmptyState, ErrorNote, Panel, ProgressBar, Spinner } from '@/components/ui';
import { useRepertoires } from '@/repertoire/RepertoireProvider';
import { buildRepertoireViews } from '@/repertoire/selectors';
import type { RepertoireView } from '@/repertoire/selectors';

/** Repertoire management: create from a shipped opening, inspect and prune the tree. */
export function RepertoiresPage(): React.JSX.Element {
  const { repertoires, nodes, mastery, loading, error, createStarter, deleteRepertoire } =
    useRepertoires();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const views = useMemo(
    () => buildRepertoireViews(repertoires, nodes, mastery),
    [mastery, nodes, repertoires],
  );

  const existingKeys = new Set(repertoires.map((item) => item.openingName));

  const handleCreate = async (key: string) => {
    setBusyKey(key);
    setActionError(null);
    try {
      await createStarter(key);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not create the repertoire');
    } finally {
      setBusyKey(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400">
        <Spinner /> Loading repertoires…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-slate-100">Repertoires</h1>
        <p className="text-sm text-slate-400">
          Your White and Black repertoires are separate trees. Add branches from Explore whenever
          you meet a new position.
        </p>
      </header>

      <ErrorNote>{error ?? actionError}</ErrorNote>

      {repertoires.length === 0 ? (
        <EmptyState
          title="No repertoires yet"
          description="Start from one of the openings below - each one creates a branching move tree you can extend and train immediately."
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {views.map((view) => (
          <RepertoireCard
            key={view.repertoire.id}
            view={view}
            onDelete={() => deleteRepertoire(view.repertoire.id)}
          />
        ))}
      </div>

      <Panel title="Add a repertoire">
        <div className="grid gap-3 sm:grid-cols-2">
          {STARTER_REPERTOIRES.map((starter) => {
            const alreadyAdded = existingKeys.has(starter.openingName);
            return (
              <div key={starter.key} className="rounded-lg border border-slate-800 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-slate-100">{starter.name}</h3>
                  <Badge tone={starter.color === 'white' ? 'neutral' : 'info'}>{starter.color}</Badge>
                </div>
                <p className="mt-1 text-xs text-slate-400">{starter.description}</p>
                <p className="mt-2 text-xs text-slate-500">{starter.lines.length} main lines</p>
                <Button
                  className="mt-3"
                  variant={alreadyAdded ? 'secondary' : 'primary'}
                  disabled={busyKey === starter.key}
                  onClick={() => handleCreate(starter.key)}
                >
                  {busyKey === starter.key
                    ? 'Creating…'
                    : alreadyAdded
                      ? 'Add another copy'
                      : 'Create repertoire'}
                </Button>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

function RepertoireCard({
  view,
  onDelete,
}: {
  view: RepertoireView;
  onDelete: () => Promise<void>;
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const stats = summarize(view.tree, view.repertoire.color);

  return (
    <Panel
      title={view.repertoire.name}
      actions={<Badge tone={view.repertoire.color === 'white' ? 'neutral' : 'info'}>{view.repertoire.color}</Badge>}
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-400">{view.repertoire.description}</p>

        <div className="grid grid-cols-3 gap-2 text-center">
          <Metric label="Moves" value={stats.nodeCount} />
          <Metric label="Your decisions" value={stats.trainableCount} />
          <Metric label="Lines" value={stats.lineCount} />
        </div>

        <ProgressBar value={view.masteryScore} label="Mastery" tone="emerald" />
        <p className="text-xs text-slate-500">
          {view.trainedCount} of {view.trainableCount} positions trained at least once
        </p>

        <div className="flex flex-wrap gap-2">
          <Link to="/train">
            <Button variant="secondary">Train this colour</Button>
          </Link>
          <Button variant="ghost" onClick={() => setExpanded((value) => !value)}>
            {expanded ? 'Hide tree' : 'Show tree'}
          </Button>
          {confirming ? (
            <>
              <Button variant="danger" onClick={onDelete}>
                Confirm delete
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => setConfirming(true)}>
              Delete
            </Button>
          )}
        </div>

        {expanded ? (
          <div className="scrollbar-thin max-h-80 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/50 p-3">
            <TreeBranch nodes={view.tree.roots} tree={view} depth={0} />
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function Metric({ label, value }: { label: string; value: number }): React.JSX.Element {
  return (
    <div className="rounded-lg bg-slate-800/60 px-2 py-2">
      <p className="text-lg font-semibold text-slate-100 tabular-nums">{value}</p>
      <p className="text-[10px] tracking-wide text-slate-400 uppercase">{label}</p>
    </div>
  );
}

function TreeBranch({
  nodes,
  tree,
  depth,
}: {
  nodes: RepertoireTreeNode[];
  tree: RepertoireView;
  depth: number;
}): React.JSX.Element {
  return (
    <ul className={depth === 0 ? 'space-y-0.5' : 'ml-3 space-y-0.5 border-l border-slate-800 pl-3'}>
      {nodes.map((node) => (
        <li key={node.id}>
          <span className="text-sm">
            <span className="text-slate-600">{formatMoveNumber(node.ply)}</span>{' '}
            <span className={node.isUserMove ? 'font-semibold text-sky-300' : 'text-slate-300'}>
              {node.moveSan}
            </span>
            {node.variationName ? (
              <span className="ml-2 text-[11px] text-slate-500">{node.variationName}</span>
            ) : null}
          </span>
          {childrenOf(tree.tree, node.id).length > 0 ? (
            <TreeBranch nodes={childrenOf(tree.tree, node.id)} tree={tree} depth={depth + 1} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
