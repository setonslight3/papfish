import { beforeEach, describe, expect, it } from 'vitest';
import { ITALIAN_GAME, KINGS_INDIAN_DEFENSE, buildTree } from '@papfish/core';
import { LocalRepository } from '@/data/localRepository';
import { createRepertoireFromStarter } from './repertoireService';
import { importGamesFromPgn, gameOpeningLabel } from './gameImport';

const USER = 'user-1';

function pgn(moves: string, options: Partial<Record<string, string>> = {}): string {
  const headers = {
    Event: 'Rated Blitz game',
    Site: 'https://lichess.org/AbCdEf12',
    Date: '2026.02.14',
    White: 'setons',
    Black: 'rival',
    Result: '1-0',
    ...options,
  };
  return `${Object.entries(headers)
    .map(([key, value]) => `[${key} "${value}"]`)
    .join('\n')}\n\n${moves} ${headers.Result}`;
}

async function setup() {
  const repository = new LocalRepository();
  const white = await createRepertoireFromStarter(repository, USER, ITALIAN_GAME, null);
  const black = await createRepertoireFromStarter(repository, USER, KINGS_INDIAN_DEFENSE, null);
  const repertoires = await repository.listRepertoires(USER);
  const nodes = await repository.listAllNodes(USER);

  const trees = new Map(
    repertoires.map((repertoire) => [
      repertoire.id,
      buildTree(nodes.filter((node) => node.repertoireId === repertoire.id)),
    ]),
  );

  return { repository, repertoires, trees, white, black, context: { repertoires, trees, book: null } };
}

describe('importGamesFromPgn', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('imports a game and records how far it followed the repertoire', async () => {
    const { repository, context } = await setup();

    const outcome = await importGamesFromPgn(
      repository,
      USER,
      pgn('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3'),
      ['setons'],
      context,
    );

    expect(outcome.imported).toHaveLength(1);
    const game = outcome.imported[0];
    expect(game.userColor).toBe('white');
    expect(game.inBookPlies).toBe(9);
    expect(game.externalGameId).toBe('AbCdEf12');

    const positions = await repository.listGamePositions(USER, game.id);
    expect(positions).toHaveLength(9);
    expect(positions.every((position) => position.repertoireMatch)).toBe(true);
    expect(positions.some((position) => position.trainingRecommended)).toBe(false);
  });

  it('flags where the user left their own repertoire', async () => {
    const { repository, context } = await setup();

    const outcome = await importGamesFromPgn(
      repository,
      USER,
      pgn('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4'),
      ['setons'],
      context,
    );

    const positions = await repository.listGamePositions(USER, outcome.imported[0].id);
    const flagged = positions.find((position) => position.trainingRecommended);
    expect(flagged).toBeDefined();
    expect(flagged!.movePlayed).toBe('Bb5');
    expect(flagged!.expectedMove).toBe('Bc4');
    expect(flagged!.note).toMatch(/Left your repertoire/);
    expect(outcome.imported[0].inBookPlies).toBe(4);
  });

  it('flags where the opponent left the repertoire', async () => {
    const { repository, context } = await setup();

    const outcome = await importGamesFromPgn(
      repository,
      USER,
      // Qe7 is not in the shipped repertoire; 2...d6 would be (Philidor).
      pgn('1. e4 e5 2. Nf3 Qe7 3. d4 d6'),
      ['setons'],
      context,
    );

    const positions = await repository.listGamePositions(USER, outcome.imported[0].id);
    const flagged = positions.find((position) => position.trainingRecommended);
    expect(flagged!.movePlayed).toBe('Qe7');
    expect(flagged!.note).toMatch(/does not cover/);
  });

  it('uses the Black repertoire when the user played Black', async () => {
    const { repository, context } = await setup();

    const outcome = await importGamesFromPgn(
      repository,
      USER,
      pgn('1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6', { White: 'rival', Black: 'setons', Result: '0-1' }),
      ['setons'],
      context,
    );

    expect(outcome.imported[0].userColor).toBe('black');
    expect(outcome.imported[0].inBookPlies).toBe(8);
  });

  it('skips games the user did not play in', async () => {
    const { repository, context } = await setup();

    await expect(
      importGamesFromPgn(repository, USER, pgn('1. e4 e5'), ['someone-else'], context),
    ).rejects.toThrow(/Neither player matched/);

    expect(await repository.listImportedGames(USER)).toHaveLength(0);
  });

  it('imports several games at once and reports the ones it skipped', async () => {
    const { repository, context } = await setup();

    const outcome = await importGamesFromPgn(
      repository,
      USER,
      `${pgn('1. e4 e5 2. Nf3 Nc6 3. Bc4')}\n\n${pgn('1. d4 d5', { White: 'other', Black: 'nobody' })}`,
      ['setons'],
      context,
    );

    expect(outcome.imported).toHaveLength(1);
    expect(outcome.skipped).toHaveLength(1);
    expect(outcome.skipped[0].reason).toMatch(/Neither player matched/);
  });

  it('does not duplicate a game that is imported twice', async () => {
    const { repository, context } = await setup();
    const text = pgn('1. e4 e5 2. Nf3 Nc6 3. Bc4');

    await importGamesFromPgn(repository, USER, text, ['setons'], context);
    await importGamesFromPgn(repository, USER, text, ['setons'], context);

    expect(await repository.listImportedGames(USER)).toHaveLength(1);
  });

  it('never changes the repertoire itself', async () => {
    const { repository, context } = await setup();
    const before = await repository.listAllNodes(USER);

    await importGamesFromPgn(
      repository,
      USER,
      pgn('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6'),
      ['setons'],
      context,
    );

    const after = await repository.listAllNodes(USER);
    expect(after).toHaveLength(before.length);
    expect(after.map((node) => node.moveSan)).not.toContain('Bb5');
  });

  it('keeps a partially readable game up to the broken move', async () => {
    const { repository, context } = await setup();

    const outcome = await importGamesFromPgn(
      repository,
      USER,
      pgn('1. e4 e5 2. Nf3 Nc6 3. Qz9 Bc5'),
      ['setons'],
      context,
    );

    expect(outcome.imported).toHaveLength(1);
    expect(outcome.warnings[0]).toMatch(/move 5/);
    expect(await repository.listGamePositions(USER, outcome.imported[0].id)).toHaveLength(4);
  });

  it('rejects text that is not a PGN at all', async () => {
    const { repository, context } = await setup();
    await expect(
      importGamesFromPgn(repository, USER, '   ', ['setons'], context),
    ).rejects.toThrow(/No games found/);
  });
});

describe('gameOpeningLabel', () => {
  it('reads the stored opening name', () => {
    expect(
      gameOpeningLabel({ openingName: 'Italian Game: Two Knights Defense' } as never),
    ).toBe('Italian Game: Two Knights Defense');
    expect(gameOpeningLabel({ openingName: null } as never)).toBe('Unclassified');
  });
});
