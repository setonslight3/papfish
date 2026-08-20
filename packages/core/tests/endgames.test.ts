import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import {
  ENDGAME_CATEGORY_LABELS,
  ENDGAME_POSITIONS,
  endgameById,
  endgamesByCategory,
  judgeEndgame,
  type EndgameStatus,
} from '../src/endgames.js';

/**
 * The engine-backed check that each position really is won or drawn lives in
 * the pipeline (`npm run verify:endgames`). These tests cover what must hold
 * without an engine.
 */
describe('endgame catalogue', () => {
  it('ships legal positions with moves available', () => {
    for (const position of ENDGAME_POSITIONS) {
      const chess = new Chess(position.fen);
      expect(chess.moves().length, position.id).toBeGreaterThan(0);
      expect(chess.isGameOver(), position.id).toBe(false);
    }
  });

  it('starts each position with the user to move', () => {
    for (const position of ENDGAME_POSITIONS) {
      const turn = new Chess(position.fen).turn() === 'w' ? 'white' : 'black';
      expect(turn, position.id).toBe(position.color);
    }
  });

  it('uses unique ids and labelled categories', () => {
    const ids = ENDGAME_POSITIONS.map((position) => position.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const position of ENDGAME_POSITIONS) {
      expect(ENDGAME_CATEGORY_LABELS[position.category], position.id).toBeTruthy();
    }
  });

  it('covers both goals, so defence is trained as well as conversion', () => {
    const goals = new Set(ENDGAME_POSITIONS.map((position) => position.goal));
    expect(goals.has('win')).toBe(true);
    expect(goals.has('draw')).toBe(true);
  });

  it('looks positions up by id and by category', () => {
    expect(endgameById('lucena')?.category).toBe('rook');
    expect(endgameById('nope')).toBeNull();
    const rooks = endgamesByCategory('rook');
    expect(rooks.length).toBeGreaterThan(0);
    expect(rooks.every((position) => position.category === 'rook')).toBe(true);
  });
});

describe('judgeEndgame', () => {
  const base: EndgameStatus = {
    goal: 'win',
    color: 'white',
    isCheckmate: false,
    isDraw: false,
    sideToMove: 'black',
    ply: 10,
    maxPly: 80,
  };

  it('grades a delivered checkmate as success when the goal was a win', () => {
    expect(judgeEndgame({ ...base, isCheckmate: true }).outcome).toBe('achieved');
  });

  it('grades being checkmated as a failure', () => {
    expect(judgeEndgame({ ...base, isCheckmate: true, sideToMove: 'white' }).outcome).toBe('failed');
  });

  it('treats a draw as success only when the draw was the point', () => {
    expect(judgeEndgame({ ...base, isDraw: true }).outcome).toBe('failed');
    expect(judgeEndgame({ ...base, goal: 'draw', isDraw: true }).outcome).toBe('achieved');
  });

  it('counts surviving the move limit as holding a draw', () => {
    expect(judgeEndgame({ ...base, goal: 'draw', ply: 80 }).outcome).toBe('achieved');
    expect(judgeEndgame({ ...base, goal: 'win', ply: 80 }).outcome).toBe('failed');
  });

  it('reports an unfinished game as ongoing', () => {
    expect(judgeEndgame(base).outcome).toBe('ongoing');
  });

  it('counts winning when only a draw was needed as success', () => {
    const result = judgeEndgame({ ...base, goal: 'draw', isCheckmate: true });
    expect(result.outcome).toBe('achieved');
    expect(result.detail).toMatch(/More than the draw/);
  });
});
