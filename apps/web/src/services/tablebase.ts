/**
 * Syzygy tablebase lookups, via the public Lichess tablebase API.
 *
 * Used only where it is actually authoritative: endgames with at most seven
 * pieces, where "won", "drawn" or "lost" is a fact rather than an evaluation.
 * Every call degrades to null, because the trainer must keep working without
 * network access - the engine's opinion is then the fallback, labelled as an
 * opinion.
 */
export type TablebaseCategory =
  | 'win'
  | 'cursed-win'
  | 'draw'
  | 'blessed-loss'
  | 'loss'
  | 'unknown';

export interface TablebaseResult {
  /** Outcome for the side to move. */
  category: TablebaseCategory;
  /** Distance to mate, when the tablebase reports one. */
  dtm: number | null;
  /** Moves that preserve the best available outcome, in UCI. */
  bestMoves: string[];
}

interface TablebaseResponse {
  category?: string;
  dtm?: number | null;
  moves?: { uci: string; category?: string; dtm?: number | null }[];
}

const ENDPOINT = 'https://tablebase.lichess.ovh/standard';
const MAX_PIECES = 7;
const cache = new Map<string, TablebaseResult | null>();

export function pieceCount(fen: string): number {
  const placement = fen.split(/\s+/)[0] ?? '';
  return placement.replace(/[^a-zA-Z]/g, '').length;
}

export function isTablebaseEligible(fen: string): boolean {
  return pieceCount(fen) <= MAX_PIECES;
}

/**
 * The outcome from the point of view of the side to move, or null when the
 * position is out of range or the service cannot be reached.
 */
export async function probeTablebase(fen: string): Promise<TablebaseResult | null> {
  if (!isTablebaseEligible(fen)) return null;

  const cached = cache.get(fen);
  if (cached !== undefined) return cached;

  let result: TablebaseResult | null = null;
  try {
    const response = await fetch(`${ENDPOINT}?fen=${encodeURIComponent(fen)}`, {
      headers: { Accept: 'application/json' },
    });
    if (response.ok) {
      const body = (await response.json()) as TablebaseResponse;
      const category = (body.category ?? 'unknown') as TablebaseCategory;
      // The API reports each move from the opponent's point of view after it
      // is played, so the moves worth keeping are the ones that lose for them.
      const best = (body.moves ?? []).filter((move) =>
        category === 'win'
          ? move.category === 'loss' || move.category === 'blessed-loss'
          : category === 'draw'
            ? move.category === 'draw' || move.category === 'cursed-win'
            : false,
      );
      result = {
        category,
        dtm: body.dtm ?? null,
        bestMoves: best.map((move) => move.uci),
      };
    }
  } catch {
    result = null;
  }

  cache.set(fen, result);
  return result;
}

export function describeTablebase(result: TablebaseResult, playerToMove: boolean): string {
  const subject = playerToMove ? 'You are' : 'Your opponent is';
  switch (result.category) {
    case 'win':
      return `${subject} theoretically winning${result.dtm ? ` (mate in ${Math.abs(result.dtm)})` : ''}.`;
    case 'cursed-win':
      return `${subject} winning, but the fifty-move rule saves the defence.`;
    case 'draw':
      return 'This position is a theoretical draw.';
    case 'blessed-loss':
      return `${subject} lost, but the fifty-move rule holds it.`;
    case 'loss':
      return `${subject} theoretically lost${result.dtm ? ` (mate in ${Math.abs(result.dtm)})` : ''}.`;
    default:
      return 'The tablebase has no verdict for this position.';
  }
}

export function clearTablebaseCache(): void {
  cache.clear();
}
