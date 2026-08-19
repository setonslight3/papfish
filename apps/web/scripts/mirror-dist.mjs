/**
 * Mirror the build output to the repository root.
 *
 * Static hosts resolve their output directory differently in a workspace repo:
 * some look for `dist` beside the app's package.json, others for `dist` at the
 * repository root. Publishing to both removes the guesswork - and the need for
 * anyone to configure it in a dashboard.
 */
import { cpSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, '..', 'dist');
const target = resolve(here, '..', '..', '..', 'dist');

function directorySize(path) {
  const stats = statSync(path);
  if (!stats.isDirectory()) return stats.size;
  return readdirSync(path).reduce((total, entry) => total + directorySize(resolve(path, entry)), 0);
}

if (!existsSync(source)) {
  console.warn(`[papfish] no build output at ${source} - nothing to mirror.`);
} else if (source === target) {
  console.log('[papfish] build output is already at the repository root.');
} else {
  rmSync(target, { recursive: true, force: true });
  cpSync(source, target, { recursive: true });
  // Both absolute paths are logged so a failing host build shows exactly where
  // the site was written.
  console.log(`[papfish] build output: ${source}`);
  console.log(
    `[papfish] build output: ${target} (mirrored, ${(directorySize(target) / 1e6).toFixed(1)} MB)`,
  );
}
