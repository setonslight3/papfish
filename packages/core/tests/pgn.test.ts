import { describe, expect, it } from 'vitest';
import { detectUserColor, gamePositions, moveTextTokens, parseGame, parsePgn, splitGames } from '../src/pgn.js';

const GAME = `[Event "Rated Blitz game"]
[Site "https://lichess.org/abcd1234"]
[Date "2026.02.14"]
[White "setons"]
[Black "opponent99"]
[Result "1-0"]
[WhiteElo "1523"]
[BlackElo "1498"]
[ECO "C50"]
[Opening "Italian Game"]
[TimeControl "300+0"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3 d6 6. O-O O-O 1-0`;

const ANNOTATED = `[White "setons"]
[Black "other"]
[Result "0-1"]

1. d4 {best by test} Nf6 $1 2. c4 (2. Nf3 g6 3. g3) 2... g6 ; a comment
3. Nc3 Bg7 0-1`;

describe('splitting a PGN file', () => {
  it('reads a single game', () => {
    expect(splitGames(GAME)).toHaveLength(1);
  });

  it('separates several games', () => {
    const games = splitGames(`${GAME}\n\n${ANNOTATED}`);
    expect(games).toHaveLength(2);
    expect(games[1]).toContain('d4');
  });

  it('handles empty input and refuses absurd input', () => {
    expect(splitGames('   ')).toEqual([]);
    expect(() => splitGames('x'.repeat(4_000_001))).toThrow(/too large/);
  });
});

describe('move text', () => {
  it('strips comments, variations, annotations and results', () => {
    expect(moveTextTokens(ANNOTATED)).toEqual(['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7']);
  });

  it('drops move numbers glued to moves', () => {
    expect(moveTextTokens('[White "x"]\n\n1.e4 e5 2.Nf3')).toEqual(['e4', 'e5', 'Nf3']);
  });
});

describe('parseGame', () => {
  it('reads headers and replays the moves', () => {
    const game = parseGame(GAME);
    expect(game.white).toBe('setons');
    expect(game.black).toBe('opponent99');
    expect(game.result).toBe('1-0');
    expect(game.headers.eco).toBe('C50');
    expect(game.playedAt).toBe('2026-02-14T12:00:00.000Z');
    expect(game.moves).toHaveLength(12);
    expect(game.moves.at(-1)!.san).toBe('O-O');
    expect(game.error).toBeNull();
  });

  it('keeps the moves it could read when a game is corrupt', () => {
    const game = parseGame(`[White "a"]\n[Black "b"]\n\n1. e4 e5 2. Qz9 Nc6`);
    expect(game.moves).toHaveLength(2);
    expect(game.error).toMatch(/move 3/);
  });

  it('survives a game with no headers at all', () => {
    const game = parseGame('1. e4 e5 2. Nf3');
    expect(game.white).toBe('Unknown');
    expect(game.moves).toHaveLength(3);
    expect(game.playedAt).toBeNull();
  });

  it('parses a multi-game file', () => {
    const games = parsePgn(`${GAME}\n\n${ANNOTATED}`);
    expect(games).toHaveLength(2);
    expect(games[0].moves).toHaveLength(12);
    expect(games[1].moves).toHaveLength(6);
  });
});

describe('user identification', () => {
  it('finds which side the user played', () => {
    const game = parseGame(GAME);
    expect(detectUserColor(game, ['setons'])).toBe('white');
    expect(detectUserColor(game, ['opponent99'])).toBe('black');
    expect(detectUserColor(game, ['someone else'])).toBeNull();
    expect(detectUserColor(game, [])).toBeNull();
  });

  it('is case insensitive', () => {
    expect(detectUserColor(parseGame(GAME), ['SETONS'])).toBe('white');
  });
});

describe('gamePositions', () => {
  it('returns the position before each move and marks the user’s turns', () => {
    const positions = gamePositions(parseGame(GAME), 'white');
    expect(positions[0].movePlayed).toBe('e4');
    expect(positions[0].fen).toContain('w KQkq');
    expect(positions[0].isUserMove).toBe(true);
    expect(positions[1].isUserMove).toBe(false);
  });

  it('marks the even plies for a Black repertoire', () => {
    const positions = gamePositions(parseGame(GAME), 'black');
    expect(positions[0].isUserMove).toBe(false);
    expect(positions[1].isUserMove).toBe(true);
  });

  it('stops at the requested depth', () => {
    expect(gamePositions(parseGame(GAME), 'white', 6)).toHaveLength(6);
  });
});
