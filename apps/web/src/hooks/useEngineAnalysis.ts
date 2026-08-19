import { useEffect, useState } from 'react';
import type { EngineAnalysis } from '@papfish/core';
import { useEngine } from '@/engine/EngineProvider';

export interface UseEngineAnalysisOptions {
  enabled?: boolean;
  depth?: number;
  multiPv?: number;
  /** Wait this long after the position settles before starting a search. */
  debounceMs?: number;
}

export interface EngineAnalysisState {
  analysis: EngineAnalysis | null;
  analyzing: boolean;
  error: string | null;
}

interface Progress {
  fen: string;
  analysis: EngineAnalysis | null;
  analyzing: boolean;
  error: string | null;
}

/**
 * Analyse the given position in the background.
 *
 * Every update carries the position it belongs to, so results for a position
 * the user has already navigated away from are discarded. The search is
 * debounced, so clicking quickly through a line does not queue a dozen
 * searches, and the board never waits for the engine.
 */
export function useEngineAnalysis(
  fen: string | null,
  options: UseEngineAnalysisOptions = {},
): EngineAnalysisState {
  const { engine } = useEngine();
  const { enabled = true, depth = 14, multiPv = 3, debounceMs = 250 } = options;
  const [progress, setProgress] = useState<Progress | null>(null);

  useEffect(() => {
    if (!enabled || !fen) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      setProgress({ fen, analysis: null, analyzing: true, error: null });

      engine
        .analyse(fen, {
          depth,
          multiPv,
          onUpdate: (partial) => {
            if (!cancelled) setProgress({ fen, analysis: partial, analyzing: true, error: null });
          },
        })
        .then((result) => {
          if (!cancelled) setProgress({ fen, analysis: result, analyzing: false, error: null });
        })
        .catch((cause: unknown) => {
          if (!cancelled) {
            setProgress({
              fen,
              analysis: null,
              analyzing: false,
              error: cause instanceof Error ? cause.message : 'Engine error',
            });
          }
        });
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [engine, fen, enabled, depth, multiPv, debounceMs]);

  if (!enabled || !fen) return { analysis: null, analyzing: false, error: null };
  if (progress?.fen !== fen) return { analysis: null, analyzing: true, error: null };
  return { analysis: progress.analysis, analyzing: progress.analyzing, error: progress.error };
}
