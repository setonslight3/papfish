import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { EngineState } from '@papfish/core';
import { getEngine, type StockfishEngine } from './StockfishEngine';

interface EngineContextValue {
  engine: StockfishEngine;
  state: EngineState;
  error: string | null;
  /** Start the engine if it is not running yet. */
  ensureReady(): Promise<void>;
}

const EngineContext = createContext<EngineContextValue | null>(null);

export function EngineProvider({ children }: { children: ReactNode }): React.JSX.Element {
  // One engine per document; getEngine() returns the same instance every time.
  const engine = getEngine();
  const [state, setState] = useState<EngineState>(engine.state);
  const [error, setError] = useState<string | null>(engine.lastError);

  useEffect(() => {
    return engine.onStateChange((nextState, nextError) => {
      setState(nextState);
      setError(nextError);
    });
  }, [engine]);

  const value = useMemo<EngineContextValue>(
    () => ({
      engine,
      state,
      error,
      ensureReady: () => engine.init().catch(() => undefined),
    }),
    [engine, state, error],
  );

  return <EngineContext.Provider value={value}>{children}</EngineContext.Provider>;
}

export function useEngine(): EngineContextValue {
  const context = useContext(EngineContext);
  if (!context) throw new Error('useEngine must be used inside <EngineProvider>');
  return context;
}
