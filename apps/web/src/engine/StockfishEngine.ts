import type { EngineAnalysis, EngineLine, EngineScore, EngineState } from '@papfish/core';
import { env } from '@/lib/env';

export interface AnalyseOptions {
  /** Maximum search depth. */
  depth?: number;
  /** Maximum search time in milliseconds. */
  movetimeMs?: number;
  /** Number of principal variations to report. */
  multiPv?: number;
  /** Called on every depth update so the UI can show progress. */
  onUpdate?: (analysis: EngineAnalysis) => void;
  /** Limit playing strength (Stockfish accepts roughly 1320-3190). */
  elo?: number | null;
}

export type WorkerFactory = () => Worker;

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Stockfish, running as a WebAssembly Web Worker.
 *
 * All engine traffic is asynchronous and serialised through a queue, so the
 * main thread is never blocked and two analyses can never interleave. If the
 * worker cannot start (unsupported browser, blocked asset) the engine reports
 * an `error` state and the application degrades to working without it, rather
 * than breaking.
 */
export class StockfishEngine {
  private worker: Worker | null = null;
  private initPromise: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private lineListeners = new Set<(line: string) => void>();
  private stateListeners = new Set<(state: EngineState, error: string | null) => void>();
  private currentElo: number | null | undefined = undefined;
  private multiPv = 1;

  state: EngineState = 'idle';
  lastError: string | null = null;

  constructor(private readonly createWorker: WorkerFactory = defaultWorkerFactory) {}

  onStateChange(listener: (state: EngineState, error: string | null) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.state, this.lastError);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  private setState(state: EngineState, error: string | null = null): void {
    this.state = state;
    this.lastError = error;
    for (const listener of this.stateListeners) listener(state, error);
  }

  /** Boot the worker and complete the UCI handshake. Safe to call repeatedly. */
  init(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.setState('loading');
    this.initPromise = (async () => {
      try {
        const worker = this.createWorker();
        worker.onmessage = (event: MessageEvent) => {
          const line = typeof event.data === 'string' ? event.data : String(event.data ?? '');
          for (const listener of this.lineListeners) listener(line);
        };
        worker.onerror = (event: ErrorEvent) => {
          this.setState('error', event.message || 'Engine worker failed');
        };
        this.worker = worker;

        await this.exchange('uci', (line) => line.trim() === 'uciok', 20_000);
        await this.exchange('isready', (line) => line.trim() === 'readyok', 20_000);
        this.setState('ready');
      } catch (error) {
        this.worker?.terminate();
        this.worker = null;
        this.initPromise = null;
        this.setState('error', error instanceof Error ? error.message : 'Engine failed to start');
        throw error;
      }
    })();

    return this.initPromise;
  }

  private send(command: string): void {
    if (!this.worker) throw new Error('Engine is not running');
    this.worker.postMessage(command);
  }

  /** Send a command and collect output until `isDone` matches. */
  private exchange(
    command: string,
    isDone: (line: string) => boolean,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    onLine?: (line: string) => void,
  ): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
      const lines: string[] = [];
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Engine timed out after ${timeoutMs}ms waiting for "${command}"`));
      }, timeoutMs);

      const listener = (line: string) => {
        lines.push(line);
        onLine?.(line);
        if (isDone(line)) {
          cleanup();
          resolve(lines);
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.lineListeners.delete(listener);
      };

      this.lineListeners.add(listener);
      try {
        this.send(command);
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  }

  /** Run `task` after any in-flight engine work, keeping commands ordered. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async applyOptions(options: AnalyseOptions): Promise<void> {
    const multiPv = Math.max(1, options.multiPv ?? 1);
    if (multiPv !== this.multiPv) {
      this.multiPv = multiPv;
      this.send(`setoption name MultiPV value ${multiPv}`);
    }

    const elo = options.elo ?? null;
    if (elo !== this.currentElo) {
      this.currentElo = elo;
      if (elo === null) {
        this.send('setoption name UCI_LimitStrength value false');
      } else {
        this.send('setoption name UCI_LimitStrength value true');
        this.send(`setoption name UCI_Elo value ${Math.round(elo)}`);
      }
    }
  }

  /**
   * Analyse a position. Resolves with the final analysis; `onUpdate` receives
   * intermediate depths so the interface can stay live during the search.
   */
  analyse(fen: string, options: AnalyseOptions = {}): Promise<EngineAnalysis> {
    return this.enqueue(async () => {
      await this.init();
      this.setState('analyzing');

      try {
        await this.applyOptions(options);
        const lines = new Map<number, EngineLine>();
        const depth = options.depth ?? 14;
        const movetime = options.movetimeMs;
        const go = movetime ? `go movetime ${movetime}` : `go depth ${depth}`;

        this.send(`position fen ${fen}`);
        const output = await this.exchange(
          go,
          (line) => line.startsWith('bestmove'),
          Math.max(DEFAULT_TIMEOUT_MS, (movetime ?? 0) + 15_000),
          (line) => {
            const parsed = parseInfoLine(line);
            if (parsed) {
              lines.set(parsed.multipv, parsed);
              options.onUpdate?.(buildAnalysis(fen, lines, null));
            }
          },
        );

        const bestMoveLine = output.find((line) => line.startsWith('bestmove'));
        const bestMove = bestMoveLine?.split(/\s+/)[1] ?? null;
        this.setState('ready');
        return buildAnalysis(fen, lines, bestMove === '(none)' ? null : (bestMove ?? null));
      } catch (error) {
        this.setState('error', error instanceof Error ? error.message : 'Engine error');
        throw error;
      }
    });
  }

  /** Ask the engine for a move to play, optionally at reduced strength. */
  async bestMove(
    fen: string,
    options: { depth?: number; movetimeMs?: number; elo?: number | null } = {},
  ): Promise<{ uci: string | null; score: EngineScore | null }> {
    const analysis = await this.analyse(fen, {
      depth: options.depth ?? 10,
      movetimeMs: options.movetimeMs,
      elo: options.elo ?? null,
      multiPv: 1,
    });
    return { uci: analysis.bestMove, score: analysis.lines[0]?.score ?? null };
  }

  /** Ask the current search to stop early. */
  stop(): void {
    try {
      this.send('stop');
    } catch {
      // Engine is not running; nothing to stop.
    }
  }

  dispose(): void {
    this.stop();
    this.worker?.terminate();
    this.worker = null;
    this.initPromise = null;
    this.lineListeners.clear();
    this.setState('idle');
  }
}

function buildAnalysis(
  fen: string,
  lines: Map<number, EngineLine>,
  bestMove: string | null,
): EngineAnalysis {
  const ordered = Array.from(lines.values()).sort((a, b) => a.multipv - b.multipv);
  return {
    fen,
    depth: ordered.reduce((max, line) => Math.max(max, line.depth), 0),
    lines: ordered,
    bestMove: bestMove ?? ordered[0]?.pv[0] ?? null,
  };
}

/** Parse a UCI `info` line into a principal variation, or null when irrelevant. */
export function parseInfoLine(line: string): EngineLine | null {
  if (!line.startsWith('info ') || !line.includes(' pv ') || !line.includes(' score ')) return null;

  const tokens = line.split(/\s+/);
  let depth = 0;
  let multipv = 1;
  let score: EngineScore | null = null;
  let pv: string[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    switch (tokens[i]) {
      case 'depth':
        depth = Number(tokens[i + 1]) || 0;
        break;
      case 'multipv':
        multipv = Number(tokens[i + 1]) || 1;
        break;
      case 'score': {
        const type = tokens[i + 1];
        const value = Number(tokens[i + 2]);
        if ((type === 'cp' || type === 'mate') && Number.isFinite(value)) {
          score = { type, value };
        }
        break;
      }
      case 'pv':
        pv = tokens.slice(i + 1).filter((token) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(token));
        i = tokens.length;
        break;
      default:
        break;
    }
  }

  if (!score || pv.length === 0) return null;
  return { multipv, depth, score, pv };
}

function defaultWorkerFactory(): Worker {
  return new Worker(env.enginePath);
}

let sharedEngine: StockfishEngine | null = null;

/** One engine instance per document: starting several would waste memory. */
export function getEngine(): StockfishEngine {
  if (!sharedEngine) sharedEngine = new StockfishEngine();
  return sharedEngine;
}

export function __setEngineForTests(engine: StockfishEngine | null): void {
  sharedEngine = engine;
}
