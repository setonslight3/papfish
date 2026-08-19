/**
 * Crawl aggregated opening statistics into a compact, queryable dataset.
 *
 *   public Lichess data (via the opening explorer)
 *        -> position-by-position aggregation
 *        -> rating / time-control grouping
 *        -> sample-size filtering
 *        -> out/opening-stats.jsonl  (upload with `npm run pipeline:stats` then `upload`)
 *
 * The crawl starts from the repertoire lines the product ships with and expands
 * along the moves people actually play, so the runtime database holds a few
 * thousand compact rows instead of raw games.
 *
 * Usage:
 *   npm run pipeline:stats -- --depth 10 --buckets 1400-1599,1800-1999 --speeds all
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Chess } from 'chess.js';
import type { PositionStats, RatingBucket, TimeControl } from '@papfish/core';
import {
  DEFAULT_TIME_CONTROL,
  START_FEN,
  STARTER_REPERTOIRES,
  isRatingBucket,
  isTimeControl,
  positionKey,
  replaySan,
} from '@papfish/core';
import { LichessExplorerClient } from './lichess-explorer.js';
import { OUT_DIR, WEB_PUBLIC_DATA_DIR } from './paths.js';

interface Options {
  depth: number;
  buckets: RatingBucket[];
  speeds: TimeControl[];
  minGames: number;
  minPercentage: number;
  maxPositions: number;
  branching: number;
  snapshot: boolean;
}

function parseArgs(argv: string[]): Options {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const [name, inline] = arg.slice(2).split('=');
      flags.set(name, inline ?? argv[++i] ?? '');
    }
  }

  const buckets = (flags.get('buckets') ?? '1400-1599')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  for (const bucket of buckets) {
    if (!isRatingBucket(bucket)) throw new Error(`Unknown rating bucket: ${bucket}`);
  }

  const speeds = (flags.get('speeds') ?? DEFAULT_TIME_CONTROL)
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  for (const speed of speeds) {
    if (!isTimeControl(speed)) throw new Error(`Unknown time control: ${speed}`);
  }

  return {
    depth: Number(flags.get('depth') ?? 10),
    buckets: buckets as RatingBucket[],
    speeds: speeds as TimeControl[],
    minGames: Number(flags.get('min-games') ?? 50),
    minPercentage: Number(flags.get('min-percentage') ?? 2),
    maxPositions: Number(flags.get('max-positions') ?? 400),
    branching: Number(flags.get('branching') ?? 4),
    snapshot: flags.get('snapshot') !== 'false',
  };
}

/** Every position along the shipped repertoire lines, plus the initial position. */
function seedPositions(depth: number): string[] {
  const seen = new Set<string>([START_FEN]);
  const fens: string[] = [START_FEN];
  for (const repertoire of STARTER_REPERTOIRES) {
    for (const line of repertoire.lines) {
      for (const move of replaySan(line.moves.slice(0, depth))) {
        const key = positionKey(move.after);
        if (!seen.has(key)) {
          seen.add(key);
          fens.push(move.after);
        }
      }
    }
  }
  return fens;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const client = new LichessExplorerClient();
  const rows: PositionStats[] = [];
  const visited = new Set<string>();

  console.log(
    `Crawling depth ${options.depth}, buckets ${options.buckets.join(',')}, speeds ${options.speeds.join(',')}`,
  );

  for (const bucket of options.buckets) {
    for (const speed of options.speeds) {
      const queue: { fen: string; ply: number }[] = seedPositions(options.depth).map((fen) => ({
        fen,
        ply: new Chess(fen).history().length,
      }));
      let processed = 0;

      while (queue.length > 0 && processed < options.maxPositions) {
        const { fen, ply } = queue.shift()!;
        const dedupeKey = `${positionKey(fen)}|${bucket}|${speed}`;
        if (visited.has(dedupeKey)) continue;
        visited.add(dedupeKey);

        const stats = await client.fetchPosition({ fen, ratingBucket: bucket, timeControl: speed });
        processed += 1;

        if (stats.totalGames < options.minGames) continue;
        rows.push(stats);
        process.stdout.write(
          `\r${bucket}/${speed}: ${processed} positions, ${rows.length} rows kept   `,
        );

        if (ply >= options.depth) continue;
        const children = stats.moves
          .filter((move) => move.games >= options.minGames && move.percentage >= options.minPercentage)
          .slice(0, options.branching);
        for (const move of children) {
          const chess = new Chess(fen);
          try {
            chess.move(move.san);
          } catch {
            continue;
          }
          queue.push({ fen: chess.fen(), ply: ply + 1 });
        }
      }
      process.stdout.write('\n');
    }
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const jsonlPath = resolve(OUT_DIR, 'opening-stats.jsonl');
  writeFileSync(jsonlPath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
  console.log(`Wrote ${rows.length} rows to ${jsonlPath}`);

  if (options.snapshot) {
    mkdirSync(WEB_PUBLIC_DATA_DIR, { recursive: true });
    const snapshotPath = resolve(WEB_PUBLIC_DATA_DIR, 'opening-stats.local.json');
    const snapshot: Record<string, PositionStats> = {};
    for (const row of rows) {
      snapshot[`${row.positionKey}|${row.ratingBucket}|${row.timeControl}`] = row;
    }
    writeFileSync(snapshotPath, JSON.stringify({ version: 1, rows: snapshot }), 'utf8');
    console.log(`Wrote offline snapshot to ${snapshotPath}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
