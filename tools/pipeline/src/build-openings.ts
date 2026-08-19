/**
 * Build the opening-name book consumed by the web client.
 *
 * Input:  the ECO TSV files from lichess-org/chess-openings (eco, name, pgn).
 * Output: apps/web/public/data/openings.json - a map from position key to
 *         [eco, name], so the client can name a position by identity rather
 *         than by move order (transpositions are recognised for free).
 *
 * Rerun this whenever the upstream opening list changes. It touches no user
 * data and never runs inside a user request.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Chess } from 'chess.js';
import { positionKey } from '@papfish/core';
import { DATA_DIR, WEB_PUBLIC_DATA_DIR } from './paths.js';

interface Row {
  eco: string;
  name: string;
  pgn: string;
}

function readTsv(file: string): Row[] {
  const text = readFileSync(file, 'utf8');
  const [header, ...lines] = text.split(/\r?\n/);
  if (!header?.startsWith('eco')) {
    throw new Error(`Unexpected TSV header in ${file}: ${header}`);
  }
  return lines
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const [eco, name, pgn] = line.split('\t');
      if (!eco || !name || !pgn) {
        throw new Error(`Malformed row in ${file}: ${line}`);
      }
      return { eco: eco.trim(), name: name.trim(), pgn: pgn.trim() };
    });
}

/** Replay a PGN move-text fragment ("1. e4 e6 2. d4 d5") and return the final key. */
function keyForPgn(pgn: string): { key: string; ply: number } {
  const chess = new Chess();
  const tokens = pgn
    .replace(/\d+\.(\.\.)?/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0);
  for (const token of tokens) {
    chess.move(token);
  }
  return { key: positionKey(chess.fen()), ply: tokens.length };
}

function main(): void {
  const files = readdirSync(DATA_DIR)
    .filter((file) => /^[a-e]\.tsv$/.test(file))
    .sort()
    .map((file) => resolve(DATA_DIR, file));

  if (files.length === 0) {
    throw new Error(
      `No ECO TSV files in ${DATA_DIR}. Download a.tsv..e.tsv from lichess-org/chess-openings first.`,
    );
  }

  const entries: Record<string, [string, string]> = {};
  let rows = 0;
  let skipped = 0;

  for (const file of files) {
    for (const row of readTsv(file)) {
      rows += 1;
      try {
        const { key } = keyForPgn(row.pgn);
        const existing = entries[key];
        // Prefer the more specific (longer) name when two rows share a position.
        if (!existing || row.name.length > existing[1].length) {
          entries[key] = [row.eco, row.name];
        }
      } catch (error) {
        skipped += 1;
        console.warn(`Skipping ${row.eco} ${row.name}: ${(error as Error).message}`);
      }
    }
  }

  mkdirSync(WEB_PUBLIC_DATA_DIR, { recursive: true });
  const target = resolve(WEB_PUBLIC_DATA_DIR, 'openings.json');
  writeFileSync(
    target,
    `${JSON.stringify(
      {
        version: 1,
        source: 'lichess-org/chess-openings',
        generatedAt: new Date().toISOString(),
        entries,
      },
      null,
      0,
    )}\n`,
    'utf8',
  );

  console.log(`Read ${rows} rows from ${files.length} files (${skipped} skipped).`);
  console.log(`Wrote ${Object.keys(entries).length} positions to ${target}.`);
}

main();
