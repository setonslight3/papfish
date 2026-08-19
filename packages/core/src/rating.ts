import type { RatingBucket, RatingBucketDefinition, TimeControl } from './types.js';

/**
 * Rating populations offered to the user. The Lichess opening explorer exposes
 * rating groups in fixed steps; a bucket maps onto one or more of those groups.
 */
export const RATING_BUCKETS: RatingBucketDefinition[] = [
  {
    id: 'beginner',
    label: 'Beginner (under 1000)',
    shortLabel: '<1000',
    min: null,
    max: 999,
    source: 'lichess',
    lichessRatingGroups: [0],
  },
  {
    id: '1000-1199',
    label: '1000-1199',
    shortLabel: '1000+',
    min: 1000,
    max: 1199,
    source: 'lichess',
    lichessRatingGroups: [1000],
  },
  {
    id: '1200-1399',
    label: '1200-1399',
    shortLabel: '1200+',
    min: 1200,
    max: 1399,
    source: 'lichess',
    lichessRatingGroups: [1200],
  },
  {
    id: '1400-1599',
    label: '1400-1599',
    shortLabel: '1400+',
    min: 1400,
    max: 1599,
    source: 'lichess',
    lichessRatingGroups: [1400],
  },
  {
    id: '1600-1799',
    label: '1600-1799',
    shortLabel: '1600+',
    min: 1600,
    max: 1799,
    source: 'lichess',
    lichessRatingGroups: [1600],
  },
  {
    id: '1800-1999',
    label: '1800-1999',
    shortLabel: '1800+',
    min: 1800,
    max: 1999,
    source: 'lichess',
    lichessRatingGroups: [1800],
  },
  {
    id: '2000-2199',
    label: '2000-2199',
    shortLabel: '2000+',
    min: 2000,
    max: 2199,
    source: 'lichess',
    lichessRatingGroups: [2000],
  },
  {
    id: '2200+',
    label: '2200 and above',
    shortLabel: '2200+',
    min: 2200,
    max: null,
    source: 'lichess',
    lichessRatingGroups: [2200, 2500],
  },
  {
    id: 'masters',
    label: 'Masters (OTB)',
    shortLabel: 'Masters',
    min: null,
    max: null,
    source: 'masters',
    lichessRatingGroups: [],
  },
];

export const DEFAULT_RATING_BUCKET: RatingBucket = '1400-1599';

const BUCKET_INDEX = new Map<RatingBucket, RatingBucketDefinition>(
  RATING_BUCKETS.map((bucket) => [bucket.id, bucket]),
);

export function getRatingBucket(id: RatingBucket): RatingBucketDefinition {
  const bucket = BUCKET_INDEX.get(id);
  if (!bucket) {
    throw new Error(`Unknown rating bucket: ${id}`);
  }
  return bucket;
}

export function isRatingBucket(value: unknown): value is RatingBucket {
  return typeof value === 'string' && BUCKET_INDEX.has(value as RatingBucket);
}

/** Rating band a numeric rating falls into. Masters is never inferred from a number. */
export function bucketForRating(rating: number): RatingBucket {
  for (const bucket of RATING_BUCKETS) {
    if (bucket.source !== 'lichess') continue;
    const aboveMin = bucket.min === null || rating >= bucket.min;
    const belowMax = bucket.max === null || rating <= bucket.max;
    if (aboveMin && belowMax) return bucket.id;
  }
  return DEFAULT_RATING_BUCKET;
}

export const TIME_CONTROLS: { id: TimeControl; label: string; lichessSpeeds: string[] }[] = [
  { id: 'all', label: 'All time controls', lichessSpeeds: ['bullet', 'blitz', 'rapid', 'classical'] },
  { id: 'bullet', label: 'Bullet', lichessSpeeds: ['bullet'] },
  { id: 'blitz', label: 'Blitz', lichessSpeeds: ['blitz'] },
  { id: 'rapid', label: 'Rapid', lichessSpeeds: ['rapid'] },
  { id: 'classical', label: 'Classical', lichessSpeeds: ['classical'] },
];

export const DEFAULT_TIME_CONTROL: TimeControl = 'all';

export function isTimeControl(value: unknown): value is TimeControl {
  return typeof value === 'string' && TIME_CONTROLS.some((tc) => tc.id === value);
}
