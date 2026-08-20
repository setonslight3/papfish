/**
 * PGN parsing for imported personal games.
 *
 * Input is untrusted text pasted or uploaded by the user, so everything here
 * validates rather than assumes: unparseable games are reported, not skipped
 * silently, and a game that fails mid-way keeps the moves it managed to read.
 */
import { Chess } from 'chess.js';
import { positionKey, toUci, type PlayedMove } from './position.js';
import type { Color } from './types.js';

export interface ParsedGameHeaders {
  event?: string;
  site?: string;
  date?: string;
  white?: string;
  black?: string;
  result?: string;
  whiteElo?: string;
  blackElo?: string;
  eco?: string;
  opening?: string;
  timeControl?: string;
  link?: string;
  /** Lichess and Chess.com write the real date here when Date is a placeholder. */
  utcDate?: string;
}

export interface ParsedGame {
  headers: ParsedGameHeaders;
  moves: PlayedMove[];
  /** Raw PGN text of this game, kept so the import can be re-analysed later. */
  pgn: string;
  white: string;
  black: string;
  result: string;
  playedAt: string | null;
  /** Set when a move could not be replayed; the moves before it are still usable. */
  error: string | null;
}

const MAX_GAMES = 200;
const MAX_INPUT_LENGTH = 4_000_000;

/** Split a multi-game PGN file into individual game texts. */
export function splitGames(text: string): string[] {
  if (text.length > MAX_INPUT_LENGTH) {
    throw new Error('That PGN is too large to import in one go (limit 4 MB).');
  }

  const normalized = text.replace(/\r\n?/g, '\n').trim();
  if (normalized.length === 0) return [];

  const games: string[] = [];
  let current: string[] = [];
  let inMoves = false;

  for (const line of normalized.split('\n')) {
    const isHeader = line.startsWith('[');
    // A header line after move text means the next game has started.
    if (isHeader && inMoves) {
      games.push(current.join('\n').trim());
      current = [];
      inMoves = false;
    }
    if (!isHeader && line.trim().length > 0) inMoves = true;
    current.push(line);
  }

  if (current.join('').trim().length > 0) games.push(current.join('\n').trim());
  return games.filter((game) => game.length > 0).slice(0, MAX_GAMES);
}

function readHeaders(pgn: string): ParsedGameHeaders {
  const headers: Record<string, string> = {};
  const pattern = /^\[(\w+)\s+"([^"]*)"\]/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(pgn)) !== null) {
    headers[match[1].toLowerCase()] = match[2];
  }
  return {
    event: headers.event,
    site: headers.site,
    date: headers.date,
    white: headers.white,
    black: headers.black,
    result: headers.result,
    whiteElo: headers.whiteelo,
    blackElo: headers.blackelo,
    eco: headers.eco,
    opening: headers.opening,
    timeControl: headers.timecontrol,
    link: headers.link ?? headers.gamelink,
    utcDate: headers.utcdate,
  };
}

/** "2026.03.14" or "2026.03.14 18:22" -> ISO date, or null when unusable. */
function parseDate(date: string | undefined, time: string | undefined): string | null {
  if (!date) return null;
  const cleaned = date.replace(/\?\?/g, '01').replace(/\./g, '-');
  const candidate = time ? `${cleaned}T${time}Z` : `${cleaned}T12:00:00Z`;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Strip comments, variations, annotations and clock tags from move text. */
export function moveTextTokens(pgn: string): string[] {
  const withoutHeaders = pgn.replace(/^\[[^\]]*\]\s*$/gm, ' ');
  const withoutComments = withoutHeaders
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/;[^\n]*/g, ' ')
    .replace(/\$\d+/g, ' ');

  // Variations can nest, so they are removed by scanning rather than by regex.
  let depth = 0;
  let cleaned = '';
  for (const character of withoutComments) {
    if (character === '(') depth += 1;
    else if (character === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0) cleaned += character;
  }

  return cleaned
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length > 0 &&
        !/^\d+\.+$/.test(token) &&
        !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(token) &&
        !/^\$/.test(token),
    )
    .map((token) => token.replace(/^\d+\.+/, ''))
    .filter((token) => token.length > 0);
}

export function parseGame(pgn: string): ParsedGame {
  const headers = readHeaders(pgn);
  const chess = new Chess();
  const moves: PlayedMove[] = [];
  let error: string | null = null;

  for (const [index, token] of moveTextTokens(pgn).entries()) {
    const before = chess.fen();
    try {
      const move = chess.move(token);
      if (!move) throw new Error('rejected');
      moves.push({
        san: move.san,
        uci: toUci(move.from, move.to, move.promotion),
        before,
        after: chess.fen(),
        ply: index + 1,
      });
    } catch {
      error = `Could not read move ${index + 1} ("${token}"); the game was imported up to that point.`;
      break;
    }
  }

  const timeMatch = /\[(?:UTCTime|Time)\s+"([^"]+)"\]/.exec(pgn);

  return {
    headers,
    moves,
    pgn: pgn.trim(),
    white: headers.white?.trim() || 'Unknown',
    black: headers.black?.trim() || 'Unknown',
    result: headers.result?.trim() || '*',
    playedAt: parseDate(headers.utcDate ?? headers.date, timeMatch?.[1]),
    error,
  };
}

export function parsePgn(text: string): ParsedGame[] {
  return splitGames(text).map(parseGame);
}

/**
 * Work out which side the importing user played.
 * Matching is by name, falling back to null so the caller can ask.
 */
export function detectUserColor(game: ParsedGame, aliases: string[]): Color | null {
  const normalized = aliases
    .map((alias) => alias.trim().toLowerCase())
    .filter((alias) => alias.length > 0);
  if (normalized.length === 0) return null;

  const white = game.white.toLowerCase();
  const black = game.black.toLowerCase();

  if (normalized.some((alias) => white === alias || white.startsWith(alias))) return 'white';
  if (normalized.some((alias) => black === alias || black.startsWith(alias))) return 'black';
  return null;
}

export interface GamePosition {
  ply: number;
  fen: string;
  positionKey: string;
  movePlayed: string;
  /** True when the move was made by the importing user. */
  isUserMove: boolean;
}

/** The positions of a game, from the point of view of one player. */
export function gamePositions(game: ParsedGame, color: Color, maxPly = 40): GamePosition[] {
  return game.moves.slice(0, maxPly).map((move) => ({
    ply: move.ply,
    fen: move.before,
    positionKey: positionKey(move.before),
    movePlayed: move.san,
    isUserMove: color === 'white' ? move.ply % 2 === 1 : move.ply % 2 === 0,
  }));
}
