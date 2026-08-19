import { describe, expect, it, vi } from 'vitest';
import { StockfishEngine, parseInfoLine } from './StockfishEngine';

/** A scripted stand-in for the Stockfish worker, so tests need no WASM. */
class FakeWorker implements Partial<Worker> {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  posted: string[] = [];
  terminated = false;

  postMessage(command: string): void {
    this.posted.push(command);
    queueMicrotask(() => this.respond(command));
  }

  terminate(): void {
    this.terminated = true;
  }

  private emit(line: string): void {
    this.onmessage?.({ data: line } as MessageEvent);
  }

  private respond(command: string): void {
    if (command === 'uci') {
      this.emit('id name Stockfish 18');
      this.emit('uciok');
      return;
    }
    if (command === 'isready') {
      this.emit('readyok');
      return;
    }
    if (command.startsWith('go')) {
      this.emit('info depth 1 multipv 1 score cp 20 nodes 20 pv e2e4');
      this.emit('info depth 12 multipv 1 score cp 34 nodes 900 pv e2e4 e7e5 g1f3');
      this.emit('info depth 12 multipv 2 score cp 18 nodes 900 pv d2d4 d7d5');
      this.emit('info string this line has no score and must be ignored');
      this.emit('bestmove e2e4 ponder e7e5');
    }
  }
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('UCI info parsing', () => {
  it('extracts depth, multipv, score and the principal variation', () => {
    const line = parseInfoLine('info depth 14 seldepth 20 multipv 2 score cp -45 nodes 1 pv e2e4 e7e5');
    expect(line).toEqual({
      depth: 14,
      multipv: 2,
      score: { type: 'cp', value: -45 },
      pv: ['e2e4', 'e7e5'],
    });
  });

  it('handles mate scores', () => {
    expect(parseInfoLine('info depth 5 multipv 1 score mate -3 pv h5f7')?.score).toEqual({
      type: 'mate',
      value: -3,
    });
  });

  it('ignores lines that carry no evaluation', () => {
    expect(parseInfoLine('info string NNUE evaluation using nn-abc.nnue')).toBeNull();
    expect(parseInfoLine('bestmove e2e4')).toBeNull();
    expect(parseInfoLine('info depth 3 score cp 10 nodes 4')).toBeNull();
  });
});

describe('StockfishEngine', () => {
  it('completes the UCI handshake and reports readiness', async () => {
    const worker = new FakeWorker();
    const engine = new StockfishEngine(() => worker as unknown as Worker);
    const states: string[] = [];
    engine.onStateChange((state) => states.push(state));

    await engine.init();

    expect(worker.posted).toContain('uci');
    expect(worker.posted).toContain('isready');
    expect(engine.state).toBe('ready');
    expect(states).toContain('loading');
  });

  it('returns the best move and multiple lines without blocking', async () => {
    const engine = new StockfishEngine(() => new FakeWorker() as unknown as Worker);
    const updates: number[] = [];

    const analysis = await engine.analyse(START, {
      depth: 12,
      multiPv: 2,
      onUpdate: (partial) => updates.push(partial.depth),
    });

    expect(analysis.bestMove).toBe('e2e4');
    expect(analysis.lines).toHaveLength(2);
    expect(analysis.lines[0].score).toEqual({ type: 'cp', value: 34 });
    expect(analysis.depth).toBe(12);
    expect(updates.length).toBeGreaterThan(1);
  });

  it('serialises overlapping requests', async () => {
    const worker = new FakeWorker();
    const engine = new StockfishEngine(() => worker as unknown as Worker);

    const [first, second] = await Promise.all([
      engine.analyse(START, { depth: 12 }),
      engine.analyse(START, { depth: 12 }),
    ]);

    expect(first.bestMove).toBe('e2e4');
    expect(second.bestMove).toBe('e2e4');
    const goCommands = worker.posted.filter((command) => command.startsWith('go'));
    expect(goCommands).toHaveLength(2);
  });

  it('limits strength for the engine opponent', async () => {
    const worker = new FakeWorker();
    const engine = new StockfishEngine(() => worker as unknown as Worker);

    await engine.bestMove(START, { depth: 8, elo: 1600 });

    expect(worker.posted).toContain('setoption name UCI_LimitStrength value true');
    expect(worker.posted).toContain('setoption name UCI_Elo value 1600');
  });

  it('reports an error state when the worker cannot start', async () => {
    const engine = new StockfishEngine(() => {
      throw new Error('worker blocked');
    });

    await expect(engine.init()).rejects.toThrow('worker blocked');
    expect(engine.state).toBe('error');
  });

  it('stops cleanly when disposed', async () => {
    const worker = new FakeWorker();
    const engine = new StockfishEngine(() => worker as unknown as Worker);
    await engine.init();
    engine.dispose();
    expect(worker.terminated).toBe(true);
    expect(engine.state).toBe('idle');
  });

  it('times out instead of hanging forever', async () => {
    vi.useFakeTimers();
    const silent = {
      postMessage: () => undefined,
      terminate: () => undefined,
      onmessage: null,
      onerror: null,
    } as unknown as Worker;
    const engine = new StockfishEngine(() => silent);

    const pending = engine.init();
    const assertion = expect(pending).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(21_000);
    await assertion;
    vi.useRealTimers();
  });
});
