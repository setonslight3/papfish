import type { Color } from './types.js';

/**
 * Starter repertoire content for Version 1.
 *
 * This is opening *theory*, expressed as data: move sequences that are replayed
 * and turned into a branching node tree at creation time. Nothing here is a
 * hardcoded UI tree, and no popularity figures are baked in - those always come
 * from the statistics pipeline.
 */
export interface StarterLine {
  name: string;
  moves: string[];
}

export interface StarterRepertoire {
  key: string;
  name: string;
  color: Color;
  openingCode: string;
  openingName: string;
  description: string;
  lines: StarterLine[];
}

export const ITALIAN_GAME: StarterRepertoire = {
  key: 'italian-game',
  name: 'Italian Game',
  color: 'white',
  openingCode: 'C50',
  openingName: 'Italian Game',
  description:
    'A White repertoire built on 1.e4 e5 2.Nf3 Nc6 3.Bc4, covering the Giuoco Piano, the Two Knights Defence and the main Black deviations after 1...e5.',
  lines: [
    {
      name: 'Giuoco Pianissimo',
      moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd3', 'd6', 'O-O', 'O-O', 'Re1', 'a6', 'Nbd2'],
    },
    {
      name: 'Giuoco Piano, main line with d4',
      moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd4', 'exd4', 'cxd4', 'Bb4+', 'Bd2', 'Bxd2+', 'Nbxd2', 'd5', 'exd5', 'Nxd5'],
    },
    {
      name: 'Two Knights Defence, main line',
      moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5', 'Na5', 'Bb5+', 'c6', 'dxc6', 'bxc6', 'Be2', 'h6', 'Nf3', 'e4', 'Ne5', 'Bd6'],
    },
    {
      name: 'Two Knights, Fried Liver Attack',
      moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5', 'Nxd5', 'Nxf7', 'Kxf7', 'Qf3+', 'Ke6', 'Nc3'],
    },
    {
      name: 'Two Knights, Traxler Counterattack',
      moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'Bc5', 'Bxf7+', 'Ke7', 'Bd5', 'Rf8', 'O-O'],
    },
    {
      name: 'Hungarian Defence',
      moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Be7', 'd4', 'exd4', 'Nxd4', 'Nf6', 'Nc3'],
    },
    {
      name: 'Semi-Italian (3...d6)',
      moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'd6', 'd4', 'exd4', 'Nxd4', 'Nf6', 'Nc3'],
    },
    {
      name: 'Philidor Defence',
      moves: ['e4', 'e5', 'Nf3', 'd6', 'd4', 'exd4', 'Nxd4', 'Nf6', 'Nc3', 'Be7', 'Bc4'],
    },
    {
      name: 'Petrov Defence',
      moves: ['e4', 'e5', 'Nf3', 'Nf6', 'Nxe5', 'd6', 'Nf3', 'Nxe4', 'd4', 'd5', 'Bd3', 'Nc6', 'O-O'],
    },
  ],
};

export const KINGS_INDIAN_DEFENSE: StarterRepertoire = {
  key: 'kings-indian-defense',
  name: "King's Indian Defence",
  color: 'black',
  openingCode: 'E60',
  openingName: "King's Indian Defence",
  description:
    "A Black repertoire against 1.d4, meeting the main White set-ups - Classical, Sämisch, Four Pawns, Averbakh and Fianchetto - with the King's Indian structure.",
  lines: [
    {
      name: 'Classical Variation',
      moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'Nf3', 'O-O', 'Be2', 'e5', 'O-O', 'Nc6', 'd5', 'Ne7', 'Ne1', 'Nd7', 'Nd3', 'f5'],
    },
    {
      name: 'Petrosian System',
      moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'Nf3', 'O-O', 'Be2', 'e5', 'd5', 'a5', 'Bg5', 'h6', 'Bh4', 'Na6'],
    },
    {
      name: 'Sämisch Variation',
      moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'f3', 'O-O', 'Be3', 'e5', 'd5', 'Nh5', 'Qd2', 'f5'],
    },
    {
      name: 'Four Pawns Attack',
      moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'f4', 'O-O', 'Nf3', 'c5', 'd5', 'e6', 'Be2', 'exd5'],
    },
    {
      name: 'Averbakh Variation',
      moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'Be2', 'O-O', 'Bg5', 'c5', 'd5', 'e6', 'Qd2', 'exd5'],
    },
    {
      name: 'Makogonov Variation',
      moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'h3', 'O-O', 'Be3', 'e5', 'd5', 'Nh5'],
    },
    {
      name: 'Fianchetto Variation',
      moves: ['d4', 'Nf6', 'c4', 'g6', 'Nf3', 'Bg7', 'g3', 'O-O', 'Bg2', 'd6', 'O-O', 'Nbd7', 'Nc3', 'e5', 'e4', 'c6'],
    },
    {
      name: 'Anti-King’s Indian with Bf4',
      moves: ['d4', 'Nf6', 'Nf3', 'g6', 'Bf4', 'Bg7', 'e3', 'O-O', 'Be2', 'd6', 'h3', 'Nbd7', 'O-O', 'Qe8'],
    },
    {
      name: 'London-style set-up',
      moves: ['d4', 'Nf6', 'Bf4', 'g6', 'Nf3', 'Bg7', 'e3', 'O-O', 'Be2', 'd6', 'h3', 'c5', 'c3', 'Nc6'],
    },
  ],
};

export const STARTER_REPERTOIRES: StarterRepertoire[] = [ITALIAN_GAME, KINGS_INDIAN_DEFENSE];

export function starterRepertoireByKey(key: string): StarterRepertoire | null {
  return STARTER_REPERTOIRES.find((repertoire) => repertoire.key === key) ?? null;
}
