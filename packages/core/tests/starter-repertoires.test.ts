import { describe, expect, it } from 'vitest';
import { STARTER_REPERTOIRES, starterRepertoireByKey } from '../src/starter-repertoires.js';
import { replaySan } from '../src/position.js';
import { RATING_BUCKETS, bucketForRating, getRatingBucket, isRatingBucket } from '../src/rating.js';

describe('starter repertoires', () => {
  it('ships an Italian Game repertoire for White and a King’s Indian for Black', () => {
    expect(STARTER_REPERTOIRES.map((r) => r.color)).toEqual(['white', 'black']);
    expect(starterRepertoireByKey('italian-game')!.openingName).toBe('Italian Game');
    expect(starterRepertoireByKey('kings-indian-defense')!.color).toBe('black');
    expect(starterRepertoireByKey('nope')).toBeNull();
  });

  it('contains only legal move sequences', () => {
    for (const repertoire of STARTER_REPERTOIRES) {
      for (const line of repertoire.lines) {
        expect(() => replaySan(line.moves), `${repertoire.name} / ${line.name}`).not.toThrow();
      }
    }
  });

  it('gives each repertoire several branches from a shared trunk', () => {
    for (const repertoire of STARTER_REPERTOIRES) {
      expect(repertoire.lines.length).toBeGreaterThanOrEqual(5);
      const firstMoves = new Set(repertoire.lines.map((line) => line.moves[0]));
      expect(firstMoves.size).toBe(1);
    }
  });
});

describe('rating buckets', () => {
  it('covers the documented ranges plus a master population', () => {
    expect(RATING_BUCKETS).toHaveLength(9);
    expect(RATING_BUCKETS.at(-1)!.source).toBe('masters');
  });

  it('maps a numeric rating onto a band', () => {
    expect(bucketForRating(800)).toBe('beginner');
    expect(bucketForRating(1450)).toBe('1400-1599');
    expect(bucketForRating(2600)).toBe('2200+');
  });

  it('validates bucket ids', () => {
    expect(isRatingBucket('1600-1799')).toBe(true);
    expect(isRatingBucket('1600')).toBe(false);
    expect(() => getRatingBucket('nonsense' as never)).toThrow();
  });
});
