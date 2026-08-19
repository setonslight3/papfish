import { useEffect, useState } from 'react';
import type { PositionStats, RatingBucket, TimeControl } from '@papfish/core';
import { fetchPositionStats, type StatsResult } from '@/stats/statsService';

export interface PositionStatsState {
  stats: PositionStats | null;
  origin: StatsResult['origin'];
  loading: boolean;
}

interface Loaded extends StatsResult {
  key: string;
}

/**
 * Load aggregated human statistics for a position.
 *
 * The result is tagged with the request it belongs to, so a slow answer for a
 * position the user has already left is simply ignored instead of flashing on
 * screen.
 */
export function usePositionStats(
  fen: string | null,
  ratingBucket: RatingBucket,
  timeControl: TimeControl,
  enabled = true,
): PositionStatsState {
  const key = fen && enabled ? `${fen}|${ratingBucket}|${timeControl}` : null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!fen || !key) return;

    let cancelled = false;
    fetchPositionStats({ fen, ratingBucket, timeControl })
      .then((result) => {
        if (!cancelled) setLoaded({ ...result, key });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ stats: null, origin: 'none', key });
      });

    return () => {
      cancelled = true;
    };
  }, [fen, key, ratingBucket, timeControl]);

  if (!key) return { stats: null, origin: 'none', loading: false };
  if (loaded?.key !== key) return { stats: null, origin: 'none', loading: true };
  return { stats: loaded.stats, origin: loaded.origin, loading: false };
}
