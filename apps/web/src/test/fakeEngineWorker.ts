import { Chess } from 'chess.js';

/**
 * A stand-in for the Stockfish worker used in tests.
 *
 * It speaks just enough UCI to be indistinguishable from the real engine at
 * the protocol level, and answers with a legal move for whatever position it
 * was given, so the training loop can be exercised without WebAssembly.
 */
export class FakeEngineWorker implements Partial<Worker> {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  posted: string[] = [];
  private fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  postMessage(command: string): void {
    this.posted.push(command);
    queueMicrotask(() => this.respond(command));
  }

  terminate(): void {
    this.onmessage = null;
  }

  private emit(line: string): void {
    this.onmessage?.({ data: line } as MessageEvent);
  }

  private respond(command: string): void {
    if (command === 'uci') {
      this.emit('uciok');
      return;
    }
    if (command === 'isready') {
      this.emit('readyok');
      return;
    }
    if (command.startsWith('position fen ')) {
      this.fen = command.slice('position fen '.length).trim();
      return;
    }
    if (command.startsWith('go')) {
      const chess = new Chess(this.fen);
      const moves = chess.moves({ verbose: true });
      if (moves.length === 0) {
        this.emit('bestmove (none)');
        return;
      }
      const best = moves[0];
      const uci = `${best.from}${best.to}${best.promotion ?? ''}`;
      this.emit(`info depth 12 multipv 1 score cp 25 nodes 1000 pv ${uci}`);
      this.emit(`bestmove ${uci}`);
    }
  }
}

export function fakeWorkerFactory(): Worker {
  return new FakeEngineWorker() as unknown as Worker;
}
