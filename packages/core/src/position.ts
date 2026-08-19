import { Chess } from 'chess.js';
import type { Color, SideToMove } from './types.js';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/**
 * Stable identity for a position: the first four FEN fields
 * (placement, side to move, castling rights, en passant square).
 *
 * Half-move clock and full-move number are excluded so the same position
 * reached by different move orders shares one key, which is what statistics
 * and mastery need. Path-sensitive information is kept separately as the move
 * sequence, never folded into this key.
 */
export function positionKey(fen: string): string {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4) {
    throw new Error(`Invalid FEN: ${fen}`);
  }
  return parts.slice(0, 4).join(' ');
}

export const START_POSITION_KEY = positionKey(START_FEN);

export function sideToMove(fen: string): SideToMove {
  const parts = fen.trim().split(/\s+/);
  return parts[1] === 'b' ? 'b' : 'w';
}

export function colorToSide(color: Color): SideToMove {
  return color === 'white' ? 'w' : 'b';
}

export function sideToColor(side: SideToMove): Color {
  return side === 'w' ? 'white' : 'black';
}

/** True when it is `color`'s turn in `fen`. */
export function isTurnOf(fen: string, color: Color): boolean {
  return sideToMove(fen) === colorToSide(color);
}

export interface PlayedMove {
  san: string;
  uci: string;
  /** FEN before the move. */
  before: string;
  /** FEN after the move. */
  after: string;
  /** 1-based half-move number. */
  ply: number;
}

/**
 * Replay a list of SAN moves from `startFen`.
 * Throws on the first illegal move, identifying the offending ply.
 */
export function replaySan(moves: string[], startFen: string = START_FEN): PlayedMove[] {
  const chess = new Chess(startFen);
  const played: PlayedMove[] = [];
  moves.forEach((san, index) => {
    const before = chess.fen();
    let move;
    try {
      move = chess.move(san);
    } catch {
      throw new Error(`Illegal move "${san}" at ply ${index + 1} (position ${before})`);
    }
    if (!move) {
      throw new Error(`Illegal move "${san}" at ply ${index + 1} (position ${before})`);
    }
    played.push({
      san: move.san,
      uci: toUci(move.from, move.to, move.promotion),
      before,
      after: chess.fen(),
      ply: index + 1,
    });
  });
  return played;
}

export function toUci(from: string, to: string, promotion?: string): string {
  return `${from}${to}${promotion ?? ''}`;
}

/** Convert a UCI move to SAN in the given position, or null when illegal. */
export function uciToSan(fen: string, uci: string): string | null {
  const chess = new Chess(fen);
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length > 4 ? uci[4] : undefined;
  try {
    const move = chess.move({ from, to, promotion });
    return move ? move.san : null;
  } catch {
    return null;
  }
}

/** Convert a SAN move to UCI in the given position, or null when illegal. */
export function sanToUci(fen: string, san: string): string | null {
  const chess = new Chess(fen);
  try {
    const move = chess.move(san);
    return move ? toUci(move.from, move.to, move.promotion) : null;
  } catch {
    return null;
  }
}

/** FEN after playing `san`, or null when the move is illegal. */
export function fenAfterSan(fen: string, san: string): string | null {
  const chess = new Chess(fen);
  try {
    const move = chess.move(san);
    return move ? chess.fen() : null;
  } catch {
    void 0;
  }
  return null;
}

export function isLegalSan(fen: string, san: string): boolean {
  return fenAfterSan(fen, san) !== null;
}

export function legalSanMoves(fen: string): string[] {
  return new Chess(fen).moves();
}

/** Ply count implied by a FEN (0 for the initial position). */
export function plyFromFen(fen: string): number {
  const parts = fen.trim().split(/\s+/);
  const fullMove = Number.parseInt(parts[5] ?? '1', 10) || 1;
  const side = parts[1] === 'b' ? 1 : 0;
  return (fullMove - 1) * 2 + side;
}

/**
 * True when the move at `ply` (1-based) is made by `color`.
 * White moves on odd plies, Black on even plies.
 */
export function isMoveOfColor(ply: number, color: Color): boolean {
  return color === 'white' ? ply % 2 === 1 : ply % 2 === 0;
}

export function formatMoveNumber(ply: number): string {
  const moveNumber = Math.ceil(ply / 2);
  return ply % 2 === 1 ? `${moveNumber}.` : `${moveNumber}...`;
}

/** Render a SAN list as a numbered move string: "1. e4 e5 2. Nf3". */
export function formatSanLine(moves: string[], startPly = 1): string {
  const parts: string[] = [];
  moves.forEach((san, index) => {
    const ply = startPly + index;
    if (ply % 2 === 1) {
      parts.push(`${Math.ceil(ply / 2)}.`);
    } else if (index === 0) {
      parts.push(`${Math.ceil(ply / 2)}...`);
    }
    parts.push(san);
  });
  return parts.join(' ');
}
