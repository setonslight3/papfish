/**
 * Endgame training positions.
 *
 * A curated set of theoretically decisive endings, expressed as data: a FEN, a
 * goal, and the technique the position is meant to teach. They are played out
 * against the engine rather than being a fixed move sequence, so there is no
 * memorised solution to fall back on.
 */
import type { Color } from './types.js';

export type EndgameCategory = 'pawn' | 'rook' | 'queen' | 'minor' | 'checkmate';

export type EndgameGoal = 'win' | 'draw';

export interface EndgamePosition {
  id: string;
  name: string;
  category: EndgameCategory;
  fen: string;
  /** Side the user plays. */
  color: Color;
  goal: EndgameGoal;
  /** What the position teaches, shown before and after the attempt. */
  idea: string;
  /** Rough ordering within the category, easiest first. */
  difficulty: 1 | 2 | 3;
}

export const ENDGAME_POSITIONS: EndgamePosition[] = [
  {
    id: 'kq-mate',
    name: 'King and queen mate',
    category: 'checkmate',
    fen: '8/8/8/4k3/8/8/4K3/6Q1 w - - 0 1',
    color: 'white',
    goal: 'win',
    idea: 'Shrink the box with the queen a knight’s move from the king, then bring your own king up. Watch for stalemate.',
    difficulty: 1,
  },
  {
    id: 'kr-mate',
    name: 'King and rook mate',
    category: 'checkmate',
    fen: '8/8/8/4k3/8/8/4K3/6R1 w - - 0 1',
    color: 'white',
    goal: 'win',
    idea: 'Cut the king off along a rank or file, then use your king to squeeze it towards the edge.',
    difficulty: 1,
  },
  {
    id: 'king-on-the-sixth',
    name: 'King on the sixth',
    category: 'pawn',
    fen: '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1',
    color: 'white',
    goal: 'win',
    idea: 'A king on the sixth rank in front of its pawn wins whoever has the opposition. Step sideways first, push second.',
    difficulty: 2,
  },
  {
    id: 'rook-pawn-draw',
    name: 'Rook pawn and wrong bishop',
    category: 'minor',
    fen: '7k/8/5K2/7P/4B3/8/8/8 b - - 0 1',
    color: 'black',
    goal: 'draw',
    idea: 'The bishop does not control h8, so the rook pawn cannot queen. Reach the corner and stay there.',
    difficulty: 2,
  },
  {
    id: 'lucena',
    name: 'Lucena position',
    category: 'rook',
    fen: '1K6/1P6/3k4/8/8/8/r7/2R5 w - - 0 1',
    color: 'white',
    goal: 'win',
    idea: 'Build a bridge: rook to the fourth rank, king out, then interpose the rook against the checks.',
    difficulty: 3,
  },
  {
    id: 'philidor',
    name: 'Philidor defence',
    category: 'rook',
    fen: '8/4k3/r7/3KP3/8/8/8/7R b - - 0 1',
    color: 'black',
    goal: 'draw',
    idea: 'Hold the sixth rank so the enemy king cannot come forward; once the pawn advances, check from behind.',
    difficulty: 3,
  },
  {
    id: 'queen-vs-pawn',
    name: 'Queen against a pawn on the seventh',
    category: 'queen',
    fen: '8/8/5K2/8/8/3k4/3p4/3Q4 w - - 0 1',
    color: 'white',
    goal: 'win',
    idea: 'Force the king in front of its own pawn with checks, gaining a tempo each time to walk your king closer. This works against a centre pawn; rook and bishop pawns hold by stalemate, and knight pawns often do too.',
    difficulty: 3,
  },
  {
    id: 'two-bishops',
    name: 'Two bishops mate',
    category: 'checkmate',
    fen: '8/8/8/3k4/8/8/4BB2/4K3 w - - 0 1',
    color: 'white',
    goal: 'win',
    idea: 'Drive the king to a corner with the bishops side by side, king supporting. It takes patience, not tricks.',
    difficulty: 2,
  },
];

export function endgameById(id: string): EndgamePosition | null {
  return ENDGAME_POSITIONS.find((position) => position.id === id) ?? null;
}

export function endgamesByCategory(category: EndgameCategory): EndgamePosition[] {
  return ENDGAME_POSITIONS.filter((position) => position.category === category).sort(
    (a, b) => a.difficulty - b.difficulty,
  );
}

export const ENDGAME_CATEGORY_LABELS: Record<EndgameCategory, string> = {
  checkmate: 'Basic checkmates',
  pawn: 'Pawn endings',
  rook: 'Rook endings',
  queen: 'Queen endings',
  minor: 'Minor-piece endings',
};

/** Did the attempt achieve what the position asked for? */
export type EndgameOutcome = 'achieved' | 'failed' | 'ongoing';

export interface EndgameVerdict {
  outcome: EndgameOutcome;
  detail: string;
}

export interface EndgameStatus {
  goal: EndgameGoal;
  color: Color;
  isCheckmate: boolean;
  isDraw: boolean;
  /** Side to move when the game ended. */
  sideToMove: Color;
  /** Half-moves played so far, used for the "took too long" case. */
  ply: number;
  maxPly: number;
}

/**
 * Grade an endgame attempt against the goal it was set, not against a move
 * list: winning by any route counts, and holding a draw counts as success when
 * the draw was the point.
 */
export function judgeEndgame(status: EndgameStatus): EndgameVerdict {
  if (status.isCheckmate) {
    // The side to move is the one that has been mated.
    const userWasMated = status.sideToMove === status.color;
    if (status.goal === 'win') {
      return userWasMated
        ? { outcome: 'failed', detail: 'You were checkmated.' }
        : { outcome: 'achieved', detail: 'Checkmate - the win is in.' };
    }
    return userWasMated
      ? { outcome: 'failed', detail: 'You were checkmated; this position is a draw with correct play.' }
      : { outcome: 'achieved', detail: 'Checkmate. More than the draw you needed.' };
  }

  if (status.isDraw) {
    return status.goal === 'draw'
      ? { outcome: 'achieved', detail: 'Held the draw.' }
      : { outcome: 'failed', detail: 'Drawn - the win slipped away.' };
  }

  if (status.ply >= status.maxPly) {
    return status.goal === 'draw'
      ? { outcome: 'achieved', detail: 'You held on long enough. The defence works.' }
      : { outcome: 'failed', detail: 'Ran out of moves before converting.' };
  }

  return { outcome: 'ongoing', detail: '' };
}
