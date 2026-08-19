import { useState } from 'react';
import { env } from '@/lib/env';
import { Button } from './ui';

type Result =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'reachable'; status: number }
  | { kind: 'rejected'; status: number; body: string }
  | { kind: 'unreachable'; message: string }
  | { kind: 'unconfigured' };

/**
 * Ask the browser to contact Supabase directly and report exactly what came
 * back. When sign-in fails with a network error there is no way to tell a
 * wrong URL from a blocked connection from a paused project - this separates
 * them, on the device that is actually failing.
 */
export function ConnectionCheck(): React.JSX.Element | null {
  const [result, setResult] = useState<Result>({ kind: 'idle' });

  if (!env.supabaseConfigured) return null;

  const run = async () => {
    setResult({ kind: 'running' });
    try {
      const response = await fetch(`${env.supabaseUrl}/auth/v1/health`, {
        headers: { apikey: env.supabaseAnonKey },
      });
      if (response.ok) {
        setResult({ kind: 'reachable', status: response.status });
        return;
      }
      const body = (await response.text()).slice(0, 160);
      setResult({ kind: 'rejected', status: response.status, body });
    } catch (error) {
      setResult({
        kind: 'unreachable',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const host = (() => {
    try {
      return new URL(env.supabaseUrl).host;
    } catch {
      return env.supabaseUrl;
    }
  })();

  return (
    <div className="mt-4 border-t border-slate-800 pt-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">Trouble signing in?</p>
        <Button
          variant="ghost"
          className="px-2 py-1 text-xs"
          onClick={run}
          disabled={result.kind === 'running'}
        >
          {result.kind === 'running' ? 'Checking…' : 'Test connection'}
        </Button>
      </div>

      {result.kind !== 'idle' && result.kind !== 'running' ? (
        <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs">
          <p className="mb-1 font-mono text-[11px] break-all text-slate-400">{host}</p>
          {result.kind === 'reachable' ? (
            <p className="text-emerald-300">
              Reachable (HTTP {result.status}). The project is up and this device can talk to it, so
              a failure now is about the account, not the connection.
            </p>
          ) : null}
          {result.kind === 'rejected' ? (
            <p className="text-amber-300">
              Answered with HTTP {result.status}. The project is reachable but rejected the request -
              usually a wrong or disabled API key. {result.body}
            </p>
          ) : null}
          {result.kind === 'unreachable' ? (
            <p className="text-rose-300">
              No reply at all ({result.message}). The address could not be contacted: check the
              project is not paused, and try another network.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
