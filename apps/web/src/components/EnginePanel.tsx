import { Chess } from 'chess.js';
import type { EngineAnalysis, EngineState } from '@papfish/core';
import { formatScore, toWhitePerspective, winningChances } from '@papfish/core';
import { Badge, Spinner } from './ui';
import { classNames } from '@/lib/format';

export interface EnginePanelProps {
  fen: string;
  analysis: EngineAnalysis | null;
  state: EngineState;
  analyzing: boolean;
  error?: string | null;
  maxLines?: number;
}

const STATE_LABEL: Record<EngineState, { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }> = {
  idle: { label: 'Engine idle', tone: 'neutral' },
  loading: { label: 'Starting engine', tone: 'info' },
  ready: { label: 'Engine ready', tone: 'success' },
  analyzing: { label: 'Analysing', tone: 'info' },
  error: { label: 'Engine unavailable', tone: 'danger' },
};

/** Convert a UCI principal variation into readable SAN. */
export function pvToSan(fen: string, pv: string[], limit = 6): string[] {
  const chess = new Chess(fen);
  const out: string[] = [];
  for (const uci of pv.slice(0, limit)) {
    try {
      const move = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length > 4 ? uci[4] : undefined,
      });
      if (!move) break;
      out.push(move.san);
    } catch {
      break;
    }
  }
  return out;
}

export function EngineStatusBadge({ state }: { state: EngineState }): React.JSX.Element {
  const { label, tone } = STATE_LABEL[state];
  return (
    <Badge tone={tone}>
      {state === 'analyzing' || state === 'loading' ? <Spinner className="h-3 w-3" /> : null}
      {label}
    </Badge>
  );
}

/** Evaluation bar, always drawn from White's point of view. */
export function EvalBar({ fen, analysis }: { fen: string; analysis: EngineAnalysis | null }): React.JSX.Element {
  const side = fen.split(' ')[1] === 'b' ? 'b' : 'w';
  const score = analysis?.lines[0]?.score ?? null;
  const white = score ? toWhitePerspective(score, side) : null;
  const share = white ? winningChances(white) : 50;

  return (
    <div className="flex h-full w-9 flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
      <div className="relative flex-1">
        {/* Black's share on top, White's below - the usual orientation. */}
        <div
          className="absolute inset-x-0 top-0 bg-slate-800 transition-all"
          style={{ height: `${100 - share}%` }}
        />
        <div
          className="absolute inset-x-0 bottom-0 bg-slate-100 transition-all"
          style={{ height: `${share}%` }}
        />
      </div>
      <span className="shrink-0 bg-slate-950/90 px-0.5 py-1 text-center text-[10px] font-semibold text-slate-200 tabular-nums">
        {white ? formatScore(white) : '–'}
      </span>
    </div>
  );
}

export function EnginePanel({
  fen,
  analysis,
  state,
  analyzing,
  error,
  maxLines = 3,
}: EnginePanelProps): React.JSX.Element {
  const side = fen.split(' ')[1] === 'b' ? 'b' : 'w';

  if (state === 'error') {
    return (
      <div className="space-y-2 text-sm text-slate-400">
        <EngineStatusBadge state={state} />
        <p>
          Analysis is not available in this browser. Everything else keeps working - training
          feedback falls back to your repertoire and human statistics.
        </p>
        {error ? <p className="text-xs text-slate-500">{error}</p> : null}
      </div>
    );
  }

  const lines = analysis?.lines.slice(0, maxLines) ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <EngineStatusBadge state={analyzing ? 'analyzing' : state} />
        {analysis?.depth ? <span className="text-xs text-slate-500">depth {analysis.depth}</span> : null}
      </div>

      {lines.length === 0 ? (
        <p className="text-sm text-slate-500">
          {analyzing ? 'Thinking…' : 'No evaluation yet for this position.'}
        </p>
      ) : (
        <ol className="space-y-1.5">
          {lines.map((line) => {
            const white = toWhitePerspective(line.score, side);
            const san = pvToSan(fen, line.pv);
            return (
              <li key={line.multipv} className="flex items-baseline gap-2 text-sm">
                <span
                  className={classNames(
                    'w-14 shrink-0 rounded px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums',
                    white.value >= 0 ? 'bg-slate-100 text-slate-900' : 'bg-slate-700 text-slate-100',
                  )}
                >
                  {formatScore(white)}
                </span>
                <span className="truncate text-slate-300">{san.join(' ')}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
