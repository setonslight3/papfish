import { describe, expect, it } from 'vitest';
import { parseGame } from '../src/pgn.js';
import { buildTree } from '../src/repertoire.js';
import { positionKey, replaySan } from '../src/position.js';
import {
  recurringPositions,
  reviewGame,
  summarizeReviews,
  trainingRecommendations,
} from '../src/game-analysis.js';
import type { RepertoireNodeRecord } from '../src/types.js';

const now = '2026-01-01T00:00:00.000Z';

function nodesFor(lines: string[][], color: 'white' | 'black'): RepertoireNodeRecord[] {
  const nodes: RepertoireNodeRecord[] = [];
  const byPath = new Map<string, string>();

  for (const moves of lines) {
    let parentId: string | null = null;
    replaySan(moves).forEach((move, index) => {
      const path = moves.slice(0, index + 1).join(' ');
      const existing = byPath.get(path);
      if (existing) {
        parentId = existing;
        return;
      }
      const id = `n${nodes.length + 1}`;
      nodes.push({
        id,
        repertoireId: 'rep',
        parentNodeId: parentId,
        fen: move.after,
        positionKey: positionKey(move.after),
        moveSan: move.san,
        moveUci: move.uci,
        ply: move.ply,
        openingName: null,
        variationName: null,
        isUserMove: color === 'white' ? move.ply % 2 === 1 : move.ply % 2 === 0,
        notes: null,
        createdAt: now,
        updatedAt: now,
      });
      byPath.set(path, id);
      parentId = id;
    });
  }
  return nodes;
}

const tree = buildTree(
  nodesFor(
    [
      ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd3'],
      ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5'],
    ],
    'white',
  ),
);

function game(moves: string, white = 'setons'): ReturnType<typeof parseGame> {
  return parseGame(`[White "${white}"]\n[Black "rival"]\n[Result "*"]\n\n${moves} *`);
}

describe('reviewGame', () => {
  it('follows a game that stays inside the repertoire', () => {
    const review = reviewGame(game('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3'), 'white', tree);
    expect(review.deviations).toHaveLength(0);
    expect(review.inBookPlies).toBe(9);
    expect(review.firstUserDeviation).toBeNull();
  });

  it('reports where the user left their own preparation', () => {
    const review = reviewGame(game('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6'), 'white', tree);
    expect(review.firstUserDeviation).not.toBeNull();
    expect(review.firstUserDeviation!.ply).toBe(5);
    expect(review.firstUserDeviation!.playedSan).toBe('Bb5');
    expect(review.firstUserDeviation!.expectedSan).toBe('Bc4');
    expect(review.inBookPlies).toBe(4);
  });

  it('reports where the opponent left the repertoire', () => {
    const review = reviewGame(game('1. e4 e5 2. Nf3 d6 3. d4'), 'white', tree);
    expect(review.firstOpponentDeviation).not.toBeNull();
    expect(review.firstOpponentDeviation!.playedSan).toBe('d6');
    expect(review.firstOpponentDeviation!.expectedSan).toBeNull();
    expect(review.firstUserDeviation).toBeNull();
  });

  it('does not treat running past the end of the repertoire as a mistake', () => {
    const review = reviewGame(
      game('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3 d6 6. O-O O-O'),
      'white',
      tree,
    );
    expect(review.deviations).toHaveLength(0);
    expect(review.inBookPlies).toBe(9);
  });

  it('summarises a set of reviews', () => {
    const reviews = [
      reviewGame(game('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3'), 'white', tree),
      reviewGame(game('1. e4 e5 2. Nf3 Nc6 3. Bb5'), 'white', tree),
      reviewGame(game('1. e4 e5 2. Nf3 d6'), 'white', tree),
    ];
    const summary = summarizeReviews(reviews);
    expect(summary.games).toBe(3);
    expect(summary.userDeviations).toBe(1);
    expect(summary.opponentDeviations).toBe(1);
    expect(summary.averageInBookPlies).toBeGreaterThan(0);
    expect(summarizeReviews([]).games).toBe(0);
  });
});

describe('recurring positions and recommendations', () => {
  const inputs = [
    { gameId: 'g1', review: reviewGame(game('1. e4 e5 2. Nf3 Nc6 3. Bb5'), 'white', tree) },
    { gameId: 'g2', review: reviewGame(game('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6'), 'white', tree) },
    { gameId: 'g3', review: reviewGame(game('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3'), 'white', tree) },
  ];

  it('finds the positions reached in several games', () => {
    const recurring = recurringPositions(inputs, tree, { minGames: 2 });
    expect(recurring.length).toBeGreaterThan(0);
    expect(recurring.every((item) => item.games >= 2)).toBe(true);

    const afterNc6 = recurring.find((item) => item.sanPath.join(' ') === 'e4 e5 Nf3 Nc6');
    expect(afterNc6).toBeDefined();
    expect(afterNc6!.games).toBe(3);
    expect(afterNc6!.deviations).toBe(2);
    expect(afterNc6!.mostPlayedSan).toBe('Bb5');
  });

  it('ignores positions seen only once', () => {
    const single = recurringPositions([inputs[0]], tree, { minGames: 2 });
    expect(single).toHaveLength(0);
  });

  it('recommends the repeated mistake above everything else', () => {
    const recommendations = trainingRecommendations(inputs, tree);
    expect(recommendations.length).toBeGreaterThan(0);
    expect(recommendations[0].reason).toBe('deviation');
    expect(recommendations[0].detail).toContain('Bc4');
  });

  it('recommends positions the repertoire does not cover', () => {
    const unprepared = trainingRecommendations(
      [{ gameId: 'g4', review: reviewGame(game('1. e4 e5 2. Nf3 d6 3. d4'), 'white', tree) }],
      tree,
    );
    expect(unprepared.some((item) => item.reason === 'unprepared')).toBe(true);
    expect(unprepared.find((item) => item.reason === 'unprepared')!.detail).toContain('d6');
  });

  it('returns nothing to act on for a clean set of games', () => {
    const clean = trainingRecommendations(
      [{ gameId: 'g5', review: reviewGame(game('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3'), 'white', tree) }],
      tree,
    );
    expect(clean).toHaveLength(0);
  });
});
