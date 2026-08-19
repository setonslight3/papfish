import { beforeEach, describe, expect, it } from 'vitest';
import {
  ITALIAN_GAME,
  KINGS_INDIAN_DEFENSE,
  buildTree,
  childrenOf,
  flatten,
  trainableNodes,
} from '@papfish/core';
import { LocalRepository } from '@/data/localRepository';
import {
  addMoveToRepertoire,
  createRepertoireFromStarter,
  repertoireMoveFor,
} from './repertoireService';

const USER = 'user-1';

describe('createRepertoireFromStarter', () => {
  let repository: LocalRepository;

  beforeEach(() => {
    window.localStorage.clear();
    repository = new LocalRepository();
  });

  it('merges shared openings into one trunk with branches', async () => {
    const { repertoire, nodes } = await createRepertoireFromStarter(
      repository,
      USER,
      ITALIAN_GAME,
      null,
    );

    expect(repertoire.color).toBe('white');
    const tree = buildTree(nodes);

    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].moveSan).toBe('e4');

    const bc4 = flatten(tree).find((node) => node.moveSan === 'Bc4' && node.ply === 5);
    expect(bc4).toBeDefined();
    expect(childrenOf(tree, bc4!.id).length).toBeGreaterThanOrEqual(3);
  });

  it('marks only the owner’s moves as trainable', async () => {
    const { nodes } = await createRepertoireFromStarter(repository, USER, ITALIAN_GAME, null);
    const tree = buildTree(nodes);
    const trainable = trainableNodes(tree, 'white');

    expect(trainable.length).toBeGreaterThan(10);
    expect(trainable.every((node) => node.ply % 2 === 1)).toBe(true);
  });

  it('creates a Black repertoire whose decisions are the even plies', async () => {
    const { repertoire, nodes } = await createRepertoireFromStarter(
      repository,
      USER,
      KINGS_INDIAN_DEFENSE,
      null,
    );
    expect(repertoire.color).toBe('black');

    const tree = buildTree(nodes);
    const trainable = trainableNodes(tree, 'black');
    expect(trainable.length).toBeGreaterThan(10);
    expect(trainable.every((node) => node.ply % 2 === 0)).toBe(true);
  });

  it('survives a reload', async () => {
    const { repertoire, nodes } = await createRepertoireFromStarter(
      repository,
      USER,
      ITALIAN_GAME,
      null,
    );
    const reloaded = await new LocalRepository().listNodes(USER, repertoire.id);
    expect(reloaded).toHaveLength(nodes.length);
  });
});

describe('addMoveToRepertoire', () => {
  let repository: LocalRepository;

  beforeEach(() => {
    window.localStorage.clear();
    repository = new LocalRepository();
  });

  it('creates the ancestors a deep move needs', async () => {
    const repertoire = await repository.createRepertoire(USER, {
      name: 'Custom',
      color: 'white',
    });

    const { created, node } = await addMoveToRepertoire(
      repository,
      USER,
      repertoire,
      [],
      ['e4', 'e5', 'Nf3', 'Nc6'],
      'Bb5',
      null,
    );

    expect(created).toHaveLength(5);
    expect(node.moveSan).toBe('Bb5');
    expect(node.ply).toBe(5);
    expect(node.isUserMove).toBe(true);
  });

  it('reuses the existing trunk when adding a sibling branch', async () => {
    const repertoire = await repository.createRepertoire(USER, { name: 'Custom', color: 'white' });

    const first = await addMoveToRepertoire(
      repository,
      USER,
      repertoire,
      [],
      ['e4', 'e5', 'Nf3', 'Nc6'],
      'Bc4',
      null,
    );

    const nodes = await repository.listNodes(USER, repertoire.id);
    const second = await addMoveToRepertoire(
      repository,
      USER,
      repertoire,
      nodes,
      ['e4', 'e5', 'Nf3', 'Nc6'],
      'Bb5',
      null,
    );

    expect(second.created).toHaveLength(1);
    expect(second.node.parentNodeId).toBe(first.node.parentNodeId);

    const tree = buildTree(await repository.listNodes(USER, repertoire.id));
    const nc6 = flatten(tree).find((item) => item.moveSan === 'Nc6')!;
    expect(childrenOf(tree, nc6.id).map((item) => item.moveSan).sort()).toEqual(['Bb5', 'Bc4']);
  });

  it('rejects an illegal move instead of storing nonsense', async () => {
    const repertoire = await repository.createRepertoire(USER, { name: 'Custom', color: 'white' });
    await expect(
      addMoveToRepertoire(repository, USER, repertoire, [], ['e4'], 'Qh9', null),
    ).rejects.toThrow();
  });
});

describe('repertoireMoveFor', () => {
  let repository: LocalRepository;

  beforeEach(() => {
    window.localStorage.clear();
    repository = new LocalRepository();
  });

  it('finds the stored answer for a position path', async () => {
    const { nodes } = await createRepertoireFromStarter(repository, USER, ITALIAN_GAME, null);
    const answer = repertoireMoveFor(nodes, ['e4', 'e5', 'Nf3', 'Nc6']);
    expect(answer?.moveSan).toBe('Bc4');
  });

  it('returns null for a position outside the repertoire', async () => {
    const { nodes } = await createRepertoireFromStarter(repository, USER, ITALIAN_GAME, null);
    expect(repertoireMoveFor(nodes, ['d4', 'd5'])).toBeNull();
  });
});
