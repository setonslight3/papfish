/**
 * Compare imported games against a repertoire.
 *
 * An imported game never rewrites the repertoire. It produces observations:
 * where the user left their own preparation, where the opponent left it, which
 * positions keep coming up, and which of those are worth training. What to do
 * about any of that stays the user's decision.
 */
import { isMoveOfColor, positionKey } from './position.js';
import type { ParsedGame } from './pgn.js';
import { gamePositions, type GamePosition } from './pgn.js';
import type { RepertoireTree } from './repertoire.js';
import { childrenOf, findChildBySan } from './repertoire.js';
import type { Color } from './types.js';

export type DeviationSide = 'user' | 'opponent';

export interface Deviation {
  ply: number;
  /** Position before the move. */
  fen: string;
  positionKey: string;
  sanPath: string[];
  playedSan: string;
  /** The repertoire move for this position, when there was one. */
  expectedSan: string | null;
  side: DeviationSide;
}

export interface GameReview {
  color: Color;
  /** How many plies followed the repertoire before anything left it. */
  inBookPlies: number;
  deviations: Deviation[];
  /** The first time the *user* left their own repertoire. */
  firstUserDeviation: Deviation | null;
  /** The first time the opponent played something the repertoire does not cover. */
  firstOpponentDeviation: Deviation | null;
  positions: GamePosition[];
}

/**
 * Walk a game through the repertoire tree.
 *
 * The walk stops following the tree once the line leaves it, because after that
 * point there is no preparation to compare against - which is itself the useful
 * observation.
 */
export function reviewGame(
  game: ParsedGame,
  color: Color,
  tree: RepertoireTree,
  maxPly = 40,
): GameReview {
  const positions = gamePositions(game, color, maxPly);
  const deviations: Deviation[] = [];

  let parentId: string | null = null;
  let inBookPlies = 0;

  for (const position of positions) {
    const sanPath = positions.slice(0, position.ply - 1).map((item) => item.movePlayed);
    const options = childrenOf(tree, parentId);
    const played = findChildBySan(tree, parentId, position.movePlayed);

    if (options.length === 0) {
      // The repertoire simply does not go this deep; that is not a mistake.
      break;
    }

    if (played) {
      parentId = played.id;
      inBookPlies += 1;
      continue;
    }

    const isUserMove = isMoveOfColor(position.ply, color);
    const expected = options.find((node) => node.isUserMove) ?? options[0];

    deviations.push({
      ply: position.ply,
      fen: position.fen,
      positionKey: position.positionKey,
      sanPath,
      playedSan: position.movePlayed,
      expectedSan: isUserMove ? (expected?.moveSan ?? null) : null,
      side: isUserMove ? 'user' : 'opponent',
    });
    break;
  }

  return {
    color,
    inBookPlies,
    deviations,
    firstUserDeviation: deviations.find((item) => item.side === 'user') ?? null,
    firstOpponentDeviation: deviations.find((item) => item.side === 'opponent') ?? null,
    positions,
  };
}

export interface RecurringPosition {
  positionKey: string;
  fen: string;
  sanPath: string[];
  /** How many imported games reached this position. */
  games: number;
  /** How often the user's move here left their repertoire. */
  deviations: number;
  color: Color;
  /** Move the user played most often here. */
  mostPlayedSan: string;
  inRepertoire: boolean;
}

export interface RecurringInput {
  review: GameReview;
  gameId: string;
}

/**
 * Positions the user actually keeps reaching, ranked by how much practice they
 * would repay: frequency first, then whether the user has ever gone wrong there.
 */
export function recurringPositions(
  inputs: RecurringInput[],
  tree: RepertoireTree,
  options: { minGames?: number; limit?: number } = {},
): RecurringPosition[] {
  const minGames = options.minGames ?? 2;
  const limit = options.limit ?? 20;

  interface Bucket {
    positionKey: string;
    fen: string;
    sanPath: string[];
    color: Color;
    games: Set<string>;
    deviations: number;
    moves: Map<string, number>;
  }

  const buckets = new Map<string, Bucket>();

  for (const { review, gameId } of inputs) {
    const deviationPlies = new Set(
      review.deviations.filter((item) => item.side === 'user').map((item) => item.ply),
    );

    for (const position of review.positions) {
      if (!position.isUserMove) continue;

      const bucket = buckets.get(position.positionKey) ?? {
        positionKey: position.positionKey,
        fen: position.fen,
        sanPath: review.positions
          .slice(0, position.ply - 1)
          .map((item) => item.movePlayed),
        color: review.color,
        games: new Set<string>(),
        deviations: 0,
        moves: new Map<string, number>(),
      };

      bucket.games.add(gameId);
      if (deviationPlies.has(position.ply)) bucket.deviations += 1;
      bucket.moves.set(position.movePlayed, (bucket.moves.get(position.movePlayed) ?? 0) + 1);
      buckets.set(position.positionKey, bucket);
    }
  }

  const inRepertoire = new Set(
    Array.from(tree.byId.values()).map((node) => node.positionKey),
  );

  return Array.from(buckets.values())
    .filter((bucket) => bucket.games.size >= minGames)
    .map((bucket) => {
      const mostPlayed = Array.from(bucket.moves.entries()).sort((a, b) => b[1] - a[1])[0];
      return {
        positionKey: bucket.positionKey,
        fen: bucket.fen,
        sanPath: bucket.sanPath,
        games: bucket.games.size,
        deviations: bucket.deviations,
        color: bucket.color,
        mostPlayedSan: mostPlayed?.[0] ?? '',
        inRepertoire: inRepertoire.has(positionKey(bucket.fen)),
      };
    })
    .sort((a, b) => b.deviations - a.deviations || b.games - a.games)
    .slice(0, limit);
}

export interface TrainingRecommendation {
  positionKey: string;
  fen: string;
  sanPath: string[];
  color: Color;
  reason: 'deviation' | 'recurring' | 'unprepared';
  detail: string;
  /** Higher is more worth training. */
  priority: number;
}

/**
 * Turn observations into suggestions. These are recommendations only - acting
 * on one is an explicit choice made in the interface, never automatic.
 */
export function trainingRecommendations(
  inputs: RecurringInput[],
  tree: RepertoireTree,
  limit = 10,
): TrainingRecommendation[] {
  const recommendations: TrainingRecommendation[] = [];

  for (const { review } of inputs) {
    for (const deviation of review.deviations) {
      if (deviation.side === 'user' && deviation.expectedSan) {
        recommendations.push({
          positionKey: deviation.positionKey,
          fen: deviation.fen,
          sanPath: deviation.sanPath,
          color: review.color,
          reason: 'deviation',
          detail: `You played ${deviation.playedSan}; your repertoire plays ${deviation.expectedSan}.`,
          priority: 3,
        });
      } else if (deviation.side === 'opponent') {
        recommendations.push({
          positionKey: deviation.positionKey,
          fen: deviation.fen,
          sanPath: deviation.sanPath,
          color: review.color,
          reason: 'unprepared',
          detail: `Your opponent played ${deviation.playedSan}, which your repertoire does not cover.`,
          priority: 2,
        });
      }
    }
  }

  for (const position of recurringPositions(inputs, tree)) {
    if (position.inRepertoire && position.deviations === 0) continue;
    recommendations.push({
      positionKey: position.positionKey,
      fen: position.fen,
      sanPath: position.sanPath,
      color: position.color,
      reason: 'recurring',
      detail: `Reached in ${position.games} of your games${
        position.inRepertoire ? '' : ' and not in your repertoire'
      }.`,
      priority: 1 + Math.min(2, position.games / 3) + (position.deviations > 0 ? 1 : 0),
    });
  }

  // Collapse duplicates, keeping the strongest reason for each position.
  const best = new Map<string, TrainingRecommendation>();
  for (const recommendation of recommendations) {
    const existing = best.get(recommendation.positionKey);
    if (!existing || recommendation.priority > existing.priority) {
      best.set(recommendation.positionKey, recommendation);
    }
  }

  return Array.from(best.values())
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit);
}

export interface GameAccuracySummary {
  games: number;
  averageInBookPlies: number;
  userDeviations: number;
  opponentDeviations: number;
}

export function summarizeReviews(reviews: GameReview[]): GameAccuracySummary {
  if (reviews.length === 0) {
    return { games: 0, averageInBookPlies: 0, userDeviations: 0, opponentDeviations: 0 };
  }
  const totalPlies = reviews.reduce((sum, review) => sum + review.inBookPlies, 0);
  return {
    games: reviews.length,
    averageInBookPlies: Math.round((totalPlies / reviews.length) * 10) / 10,
    userDeviations: reviews.filter((review) => review.firstUserDeviation).length,
    opponentDeviations: reviews.filter((review) => review.firstOpponentDeviation).length,
  };
}
