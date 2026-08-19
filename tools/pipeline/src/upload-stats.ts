/**
 * Upload crawled statistics into Supabase.
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. The service-role key is
 * only ever used here, in a background process - it must never reach the browser.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { PositionStats } from '@papfish/core';
import { OUT_DIR } from './paths.js';

const BATCH_SIZE = 200;

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before uploading.');
  }

  const file = process.argv[2] ?? resolve(OUT_DIR, 'opening-stats.jsonl');
  const rows: PositionStats[] = readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as PositionStats);

  if (rows.length === 0) {
    console.log('Nothing to upload.');
    return;
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE).map((row) => ({
      position_key: row.positionKey,
      rating_bucket: row.ratingBucket,
      time_control: row.timeControl,
      source: row.source,
      total_games: row.totalGames,
      moves: row.moves,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('opening_stats')
      .upsert(batch, { onConflict: 'position_key,rating_bucket,time_control,source' });

    if (error) throw new Error(`Upload failed at row ${i}: ${error.message}`);
    console.log(`Uploaded ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`);
  }

  console.log('Done. Opening statistics can be refreshed without touching user data.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
