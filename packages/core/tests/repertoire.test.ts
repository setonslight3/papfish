import { describe, expect, it } from 'vitest';
import {
  buildTree,
  childrenOf,
  findChildBySan,
  flatten,
  lines,
  pathToRoot,
  sanPathTo,
  summarize,
  trainableNodes,
} from '../src/repertoire.js';
import { buildTrainingQueue, candidateWeight, weakestPositions, type TrainingCandidate } from '../src/training.js';
import { replaySan, START_FEN, positionKey } from '../src/position.js';
import type { MasteryRecord, RepertoireNodeRecord } from '../src/types.js';

const now = '2026-01-01T00:00:00.000Z';

function makeNodes(lineSets: string[][], repertoireId = 'rep-1'): RepertoireNodeRecord[] {
  const nodes: RepertoireNodeRecord[] = [];
  const byPath = new Map<string, string>();

  for (const moves of lineSets) {
    const played = replaySan(moves);
    let parentId: string | null = null;
    played.forEach((move, index) => {
      const pathKey = moves.slice(0, index + 1).join(' ');
      const existing = byPath.get(pathKey);
      if (existing) {
        parentId = existing;
        return;
      }
      const id = `n${nodes.length + 1}`;
      nodes.push({
        id,
        repertoireId,
        parentNodeId: parentId,
        fen: move.after,
        positionKey: positionKey(move.after),
        moveSan: move.san,
        moveUci: move.uci,
        ply: move.ply,
        openingName: null,
        variationName: null,
        isUserMove: move.ply % 2 === 1,
        notes: null,
        createdAt: now,
        updatedAt: now,
      });
      byPath.set(pathKey, id);
      parentId = id;
    });
  }
  return nodes;
}

const nodes = makeNodes([
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3'],
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5'],
  ['e4', 'e5', 'Nf3', 'd6', 'd4'],
]);

describe('repertoire tree', () => {
  it('branches instead of storing a flat list', () => {
    const tree = buildTree(nodes);
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].moveSan).toBe('e4');

    const afterBc4 = findChildBySan(
      tree,
      findChildBySan(tree, findChildBySan(tree, findChildBySan(tree, null, 'e4')!.id, 'e5')!.id, 'Nf3')!.id,
      'Nc6',
    );
    expect(afterBc4).not.toBeNull();
    const bc4 = findChildBySan(tree, afterBc4!.id, 'Bc4')!;
    expect(childrenOf(tree, bc4.id).map((n) => n.moveSan).sort()).toEqual(['Bc5', 'Nf6']);
  });

  it('shares the trunk between lines', () => {
    const tree = buildTree(nodes);
    expect(flatten(tree)).toHaveLength(nodes.length);
    expect(lines(tree)).toHaveLength(3);
  });

  it('walks back to the root', () => {
    const tree = buildTree(nodes);
    const leaf = flatten(tree).find((node) => node.moveSan === 'Ng5')!;
    expect(sanPathTo(tree, leaf.id)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5']);
    expect(pathToRoot(tree, leaf.id)).toHaveLength(7);
  });

  it('keeps orphaned nodes visible when a parent is missing', () => {
    const orphaned = nodes.filter((node) => node.moveSan !== 'e5' || node.parentNodeId === null);
    const tree = buildTree(orphaned);
    expect(flatten(tree).length).toBe(orphaned.length);
  });

  it('lists only the owner’s decisions as trainable', () => {
    const tree = buildTree(nodes);
    const white = trainableNodes(tree, 'white');
    expect(white.every((node) => node.ply % 2 === 1)).toBe(true);
    expect(white.map((n) => n.moveSan)).toContain('Bc4');
    expect(white.map((n) => n.moveSan)).not.toContain('e5');
    expect(summarize(tree, 'white').trainableCount).toBe(white.length);
  });
});

describe('training queue', () => {
  const tree = buildTree(nodes);
  const candidates: TrainingCandidate[] = trainableNodes(tree, 'white').map((node) => ({
    node,
    repertoireId: 'rep-1',
    mastery: null,
    sanPath: sanPathTo(tree, node.id),
    fen: START_FEN,
  }));

  it('prefers untrained and weak positions', () => {
    const untrained = candidateWeight(candidates[0]);
    const mastered = candidateWeight({
      ...candidates[0],
      mastery: masteryFixture(95, 8, 8),
    });
    const weak = candidateWeight({ ...candidates[0], mastery: masteryFixture(10, 6, 0) });
    expect(untrained).toBeGreaterThan(mastered);
    expect(weak).toBeGreaterThan(mastered);
  });

  it('never returns more items than exist', () => {
    const queue = buildTrainingQueue(candidates, { size: 999, random: () => 0.5 });
    expect(queue).toHaveLength(candidates.length);
    expect(new Set(queue.map((c) => c.node.id)).size).toBe(candidates.length);
  });

  it('does not let one repertoire monopolise a mixed session', () => {
    const mixed: TrainingCandidate[] = [
      ...candidates.map((c) => ({ ...c, repertoireId: 'white-rep' })),
      ...candidates.map((c) => ({
        ...c,
        repertoireId: 'black-rep',
        node: { ...c.node, id: `${c.node.id}-b` },
      })),
    ];
    const queue = buildTrainingQueue(mixed, { size: 10, random: () => 0.01, maxSharePerRepertoire: 0.6 });
    const whiteCount = queue.filter((c) => c.repertoireId === 'white-rep').length;
    expect(whiteCount).toBeLessThanOrEqual(6);
    expect(whiteCount).toBeGreaterThan(0);
  });

  it('surfaces the weakest trained positions first', () => {
    const scored = candidates.map((candidate, index) => ({
      ...candidate,
      mastery: masteryFixture(index * 10, 3, 1),
    }));
    const weak = weakestPositions(scored, 2);
    expect(weak).toHaveLength(2);
    expect(weak[0].masteryScore).toBeLessThanOrEqual(weak[1].masteryScore);
  });
});

function masteryFixture(score: number, attempts: number, streak: number): MasteryRecord {
  return {
    userId: 'u1',
    positionKey: 'k',
    repertoireId: 'rep-1',
    color: 'white',
    attempts,
    correctAttempts: attempts,
    masteryScore: score,
    difficulty: 2.5,
    streak,
    averageResponseMs: 2000,
    intervalDays: 0,
    nextReviewAt: null,
    lastReviewedAt: now,
    updatedAt: now,
  };
}
