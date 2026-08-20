import { beforeEach, describe, expect, it } from 'vitest';
import { positionKey, replaySan } from '@papfish/core';
import { LocalRepository } from './localRepository';

const USER_A = 'user-a';
const USER_B = 'user-b';

function nodeInput(repertoireId: string, sanPath: string[], parentNodeId: string | null) {
  const played = replaySan(sanPath);
  const move = played.at(-1)!;
  return {
    repertoireId,
    parentNodeId,
    fen: move.after,
    positionKey: positionKey(move.after),
    moveSan: move.san,
    moveUci: move.uci,
    ply: move.ply,
    isUserMove: move.ply % 2 === 1,
  };
}

describe('LocalRepository', () => {
  let repository: LocalRepository;

  beforeEach(() => {
    window.localStorage.clear();
    repository = new LocalRepository();
  });

  it('creates and lists repertoires', async () => {
    const created = await repository.createRepertoire(USER_A, {
      name: 'Italian Game',
      color: 'white',
      openingCode: 'C50',
    });
    expect(created.userId).toBe(USER_A);

    const list = await repository.listRepertoires(USER_A);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Italian Game');
  });

  it('keeps one user’s data invisible to another', async () => {
    await repository.createRepertoire(USER_A, { name: 'Italian Game', color: 'white' });
    await repository.recordAttempt(USER_A, {
      repertoireId: null,
      repertoireNodeId: null,
      positionKey: 'k',
      color: 'white',
      attemptedMove: 'e4',
      expectedMove: 'e4',
      engineEvaluation: null,
      result: 'repertoire',
      responseTimeMs: 1200,
      mode: 'train',
    });

    expect(await repository.listRepertoires(USER_B)).toHaveLength(0);
    expect(await repository.listRecentAttempts(USER_B)).toHaveLength(0);
    expect(await repository.listMastery(USER_B)).toHaveLength(0);
  });

  it('stores a branching node tree and reloads it', async () => {
    const repertoire = await repository.createRepertoire(USER_A, {
      name: 'Italian Game',
      color: 'white',
    });

    const e4 = await repository.createNode(USER_A, nodeInput(repertoire.id, ['e4'], null));
    const e5 = await repository.createNode(USER_A, nodeInput(repertoire.id, ['e4', 'e5'], e4.id));
    await repository.createNode(USER_A, nodeInput(repertoire.id, ['e4', 'e5', 'Nf3'], e5.id));
    await repository.createNode(USER_A, nodeInput(repertoire.id, ['e4', 'e5', 'Bc4'], e5.id));

    const reloaded = await new LocalRepository().listNodes(USER_A, repertoire.id);
    expect(reloaded).toHaveLength(4);
    expect(reloaded.filter((node) => node.parentNodeId === e5.id)).toHaveLength(2);
  });

  it('does not duplicate an identical move under the same parent', async () => {
    const repertoire = await repository.createRepertoire(USER_A, { name: 'R', color: 'white' });
    const first = await repository.createNode(USER_A, nodeInput(repertoire.id, ['e4'], null));
    const again = await repository.createNode(USER_A, nodeInput(repertoire.id, ['e4'], null));
    expect(again.id).toBe(first.id);
    expect(await repository.listNodes(USER_A, repertoire.id)).toHaveLength(1);
  });

  it('removes descendants when a node is deleted', async () => {
    const repertoire = await repository.createRepertoire(USER_A, { name: 'R', color: 'white' });
    const e4 = await repository.createNode(USER_A, nodeInput(repertoire.id, ['e4'], null));
    const e5 = await repository.createNode(USER_A, nodeInput(repertoire.id, ['e4', 'e5'], e4.id));
    await repository.createNode(USER_A, nodeInput(repertoire.id, ['e4', 'e5', 'Nf3'], e5.id));

    await repository.deleteNode(USER_A, e5.id);
    const remaining = await repository.listNodes(USER_A, repertoire.id);
    expect(remaining.map((node) => node.moveSan)).toEqual(['e4']);
  });

  it('upserts mastery per repertoire and position', async () => {
    const repertoire = await repository.createRepertoire(USER_A, { name: 'R', color: 'white' });
    const input = {
      repertoireId: repertoire.id,
      positionKey: 'key-1',
      color: 'white' as const,
      attempts: 1,
      correctAttempts: 1,
      masteryScore: 25,
      difficulty: 2.4,
      streak: 1,
      averageResponseMs: 1800,
      intervalDays: 1,
      nextReviewAt: '2026-03-02T00:00:00.000Z',
    };

    await repository.upsertMastery(USER_A, input);
    await repository.upsertMastery(USER_A, { ...input, attempts: 2, masteryScore: 40 });

    const mastery = await repository.listMastery(USER_A);
    expect(mastery).toHaveLength(1);
    expect(mastery[0].masteryScore).toBe(40);
  });

  it('persists a profile across instances', async () => {
    await repository.updateProfile(USER_A, { displayName: 'Ada', ratingBucket: '1800-1999' });
    const profile = await new LocalRepository().getProfile(USER_A);
    expect(profile?.displayName).toBe('Ada');
    expect(profile?.ratingBucket).toBe('1800-1999');
  });
});
