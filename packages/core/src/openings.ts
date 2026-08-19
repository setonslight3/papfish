import { positionKey, replaySan } from './position.js';
import type { OpeningIdentification } from './types.js';

/** Serialized form of the opening book produced by the data pipeline. */
export interface OpeningBookData {
  version: number;
  source: string;
  /** position key -> [eco, name] */
  entries: Record<string, [string, string]>;
}

export interface OpeningBookEntry {
  eco: string;
  name: string;
}

/**
 * Opening/variation recognition.
 *
 * Names are looked up by position rather than by move number, so a transposition
 * into a known position is still recognised. Detection returns the *deepest*
 * classified position along the path, which is the standard way to name a line.
 */
export class OpeningBook {
  private readonly entries: Map<string, OpeningBookEntry>;

  constructor(data: OpeningBookData) {
    this.entries = new Map(
      Object.entries(data.entries).map(([key, [eco, name]]) => [key, { eco, name }]),
    );
  }

  static empty(): OpeningBook {
    return new OpeningBook({ version: 0, source: 'empty', entries: {} });
  }

  get size(): number {
    return this.entries.size;
  }

  lookupByPositionKey(key: string): OpeningBookEntry | null {
    return this.entries.get(key) ?? null;
  }

  lookupByFen(fen: string): OpeningBookEntry | null {
    return this.lookupByPositionKey(positionKey(fen));
  }

  /**
   * Identify the opening for a sequence of FENs (index 0 = position after ply 1).
   * The deepest match wins; nothing is returned before any classified position.
   */
  identifyFromFens(fens: string[]): OpeningIdentification | null {
    let best: OpeningIdentification | null = null;
    fens.forEach((fen, index) => {
      const entry = this.lookupByPositionKey(positionKey(fen));
      if (entry) {
        best = { ...splitName(entry.name), eco: entry.eco, name: entry.name, ply: index + 1 };
      }
    });
    return best;
  }

  /** Convenience wrapper that replays SAN moves before identifying. */
  identifyFromSan(moves: string[]): OpeningIdentification | null {
    const played = replaySan(moves);
    return this.identifyFromFens(played.map((move) => move.after));
  }
}

/** "Italian Game: Two Knights Defense, Fried Liver Attack" -> opening + variation. */
export function splitName(name: string): { opening: string; variation: string | null } {
  const index = name.indexOf(':');
  if (index === -1) return { opening: name.trim(), variation: null };
  return {
    opening: name.slice(0, index).trim(),
    variation: name.slice(index + 1).trim() || null,
  };
}

export function formatIdentification(id: OpeningIdentification | null): string {
  if (!id) return 'Starting position';
  return `${id.eco} ${id.name}`;
}
