import { beforeEach, describe, expect, it } from 'vitest';
import { ITALIAN_GAME, KINGS_INDIAN_DEFENSE, positionKey } from '@papfish/core';
import type { MasteryRecord } from '@papfish/core';
import { LocalRepository } from '@/data/localRepository';
import { createRepertoireFromStarter } from './repertoireService';
import { allCandidates, buildRepertoireViews, summarizeMastery } from './selectors';

const USER = 'user-1';

async function seed() {
  const repository = new LocalRepository();
  const white = await createRepertoireFromStarter(repository, USER, ITALIAN_GAME, null);
  const black = await createRepertoireFromStarter(repository, USER, KINGS_INDIAN_DEFENSE, null);
  const nodes = await repository.listAllNodes(USER);
  const repertoires = await repository.listRepertoires(USER);
  return { repertoires, nodes, white, black };
}

function masteryFor(repertoireId: string, fen: string, score: number): MasteryRecord {
  return {
    userId: USER,
    repertoireId,
    positionKey: positionKey(fen),
    color: 'white',
    attempts: 4,
    correctAttempts: 4,
    masteryScore: score,
    difficulty: 2.5,
    streak: 4,
    averageResponseMs: 2000,
    intervalDays: 3,
    nextReviewAt: null,
    lastReviewedAt: null,
    updatedAt: new Date().toISOString(),
  };
}

describe('repertoire selectors', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('asks about the position before the owner’s move', async () => {
    const { repertoires, nodes } = await seed();
    const views = buildRepertoireViews(repertoires, nodes, []);
    const white = views.find((view) => view.repertoire.color === 'white')!;

    const first = white.candidates.find((candidate) => candidate.node.ply === 1)!;
    expect(first.fen).toContain('w KQkq');
    expect(first.sanPath).toEqual([]);
    expect(first.node.moveSan).toBe('e4');

    const third = white.candidates.find(
      (candidate) => candidate.node.moveSan === 'Bc4' && candidate.node.ply === 5,
    )!;
    expect(third.sanPath).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
    expect(third.fen.split(' ')[1]).toBe('w');
  });

  it('keeps White and Black mastery separate', async () => {
    const { repertoires, nodes, white } = await seed();

    const whiteCandidates = buildRepertoireViews(repertoires, nodes, []).find(
      (view) => view.repertoire.id === white.repertoire.id,
    )!.candidates;

    // Fully master every White position, leave Black untouched.
    const mastery = whiteCandidates.map((candidate) =>
      masteryFor(white.repertoire.id, candidate.fen, 100),
    );

    const views = buildRepertoireViews(repertoires, nodes, mastery);
    const summary = summarizeMastery(views);

    expect(summary.white).toBeGreaterThan(90);
    expect(summary.black).toBe(0);
    expect(summary.overall).toBeGreaterThan(0);
    expect(summary.overall).toBeLessThan(summary.white);
  });

  it('counts untrained positions as unmastered coverage', async () => {
    const { repertoires, nodes, white } = await seed();
    const views = buildRepertoireViews(repertoires, nodes, []);
    const whiteView = views.find((view) => view.repertoire.id === white.repertoire.id)!;

    expect(whiteView.masteryScore).toBe(0);
    expect(whiteView.trainedCount).toBe(0);
    expect(whiteView.trainableCount).toBeGreaterThan(10);
  });

  it('filters the candidate pool by colour', async () => {
    const { repertoires, nodes } = await seed();
    const views = buildRepertoireViews(repertoires, nodes, []);

    const whiteOnly = allCandidates(views, 'white');
    const blackOnly = allCandidates(views, 'black');
    const both = allCandidates(views);

    expect(whiteOnly.every((candidate) => candidate.node.ply % 2 === 1)).toBe(true);
    expect(blackOnly.every((candidate) => candidate.node.ply % 2 === 0)).toBe(true);
    expect(both).toHaveLength(whiteOnly.length + blackOnly.length);
  });
});
