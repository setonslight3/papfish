import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const PIPELINE_ROOT = resolve(here, '..');
export const REPO_ROOT = resolve(PIPELINE_ROOT, '..', '..');
export const DATA_DIR = resolve(PIPELINE_ROOT, 'data');
export const OUT_DIR = resolve(PIPELINE_ROOT, 'out');
export const WEB_PUBLIC_DATA_DIR = resolve(REPO_ROOT, 'apps', 'web', 'public', 'data');
