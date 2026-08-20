/**
 * Verify every curated endgame with Stockfish itself: is the position legal,
 * and does the engine agree with the goal the user is set?
 *
 * Run with `npm run verify:endgames`. It is deliberately outside the unit test
 * suite - it starts a real engine per position and takes a minute.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { Chess } from 'chess.js';
import { ENDGAME_POSITIONS } from '@papfish/core';

const require = createRequire(import.meta.url);
const ENGINE = resolve(
  dirname(require.resolve('stockfish/package.json')),
  'bin',
  'stockfish-18-lite-single.js',
);

function analyse(fen: string, movetime = 3000): Promise<{ type: string; value: number } | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ENGINE]);
    let best: { type: string; value: number } | null = null;
    let out = '';
    child.stdout.on('data', (chunk) => {
      out += chunk.toString();
      for (const line of out.split('\n')) {
        if (line.startsWith('info ') && line.includes(' score ')) {
          const match = /score (cp|mate) (-?\d+)/.exec(line);
          if (match) best = { type: match[1], value: Number(match[2]) };
        }
        if (line.startsWith('bestmove')) {
          child.kill();
          resolve(best);
        }
      }
      out = out.slice(out.lastIndexOf('\n') + 1);
    });
    child.on('error', reject);
    child.stdin.write(`uci\nisready\nposition fen ${fen}\ngo movetime ${movetime}\n`);
    setTimeout(() => { child.kill(); resolve(best); }, movetime + 8000);
  });
}

let failures = 0;
for (const position of ENDGAME_POSITIONS) {
  let legal: boolean;
  let sideToMove: 'white' | 'black' = 'white';
  try {
    const chess = new Chess(position.fen);
    sideToMove = chess.turn() === 'w' ? 'white' : 'black';
    legal = chess.moves().length > 0;
  } catch {
    legal = false;
  }

  const score = await analyse(position.fen);
  // Engine scores are side-to-move relative; convert to the user's point of view.
  const userToMove = sideToMove === position.color;
  const value = score ? (userToMove ? score.value : -score.value) : null;
  const type = score?.type ?? 'none';

  let verdict: string;
  if (value === null) {
    verdict = 'WRONG';
  } else if (position.goal === 'win') {
    verdict = type === 'mate' ? (value > 0 ? 'OK' : 'WRONG') : value > 300 ? 'OK' : 'WRONG';
  } else {
    verdict = type === 'mate' ? 'WRONG' : Math.abs(value) < 150 ? 'OK' : 'WRONG';
  }

  if (!legal || verdict === 'WRONG') failures += 1;
  console.log(
    `${verdict.padEnd(5)} ${position.id.padEnd(20)} legal=${legal} turn=${sideToMove} goal=${position.goal} eval=${type} ${value}`,
  );
}

console.log(failures === 0 ? '\nAll endgames verified.' : `\n${failures} endgame(s) need attention.`);
