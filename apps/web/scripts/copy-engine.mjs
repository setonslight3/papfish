/**
 * Copy the Stockfish WebAssembly build into public/engine so it can be served
 * as a same-origin Web Worker. The binary is not committed - it comes from the
 * `stockfish` package and is refreshed on every install/build.
 *
 * Stockfish is GPLv3; see NOTICE.md.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const target = resolve(here, '..', 'public', 'engine');

const FILES = ['stockfish-18-lite-single.js', 'stockfish-18-lite-single.wasm'];

function main() {
  let binDir;
  try {
    binDir = resolve(dirname(require.resolve('stockfish/package.json')), 'bin');
  } catch {
    console.warn('[papfish] stockfish package not installed; skipping engine copy.');
    return;
  }

  mkdirSync(target, { recursive: true });
  for (const file of FILES) {
    const from = resolve(binDir, file);
    const to = resolve(target, file);
    if (!existsSync(from)) {
      console.warn(`[papfish] missing engine file ${from}; skipping.`);
      continue;
    }
    if (existsSync(to) && statSync(to).size === statSync(from).size) continue;
    copyFileSync(from, to);
    console.log(`[papfish] engine: ${file} (${(statSync(to).size / 1e6).toFixed(1)} MB)`);
  }
}

main();
