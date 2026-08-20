/**
 * Generate the favicon and the PWA icon set from the Papfish mark.
 *
 * The SVG favicon is written directly. The PNGs need a rasteriser: Playwright
 * is used when it is installed (`npm i -D playwright`), because it is already
 * the project's browser tool. Without it the committed PNGs are left alone -
 * they are checked in precisely so a normal install never needs a browser.
 *
 *   node scripts/generate-icons.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { papfishSvg } from './brand-svg.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(here, '..', 'public');
const iconDir = resolve(publicDir, 'icons');

const PNG_ICONS = [
  // Maskable icons are padded so Android can crop them to any shape.
  { file: 'icon-192.png', size: 192, plate: 'squircle', padding: 0 },
  { file: 'icon-512.png', size: 512, plate: 'squircle', padding: 0 },
  { file: 'icon-maskable-512.png', size: 512, plate: 'squircle', padding: 0.2 },
];

mkdirSync(iconDir, { recursive: true });

// The tab icon: the compact drawing, on a plate so it reads on any tab colour.
writeFileSync(resolve(publicDir, 'favicon.svg'), `${papfishSvg({ detailed: false, plate: 'squircle' })}\n`);
console.log('[papfish] favicon.svg');

// Keep the boot screen's artwork in step with everything else.
const indexPath = resolve(here, '..', 'index.html');
const splash = papfishSvg({ detailed: true, plate: 'circle', spinning: true }).replace(
  'width="64" height="64"',
  'width="112" height="112"',
);
const html = readFileSync(indexPath, 'utf8').replace(
  /<!-- papfish:splash -->[\s\S]*?<!-- \/papfish:splash -->/,
  `<!-- papfish:splash -->\n        ${splash}\n        <!-- /papfish:splash -->`,
);
writeFileSync(indexPath, html);
console.log('[papfish] boot screen in index.html');

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.warn('[papfish] playwright not installed - keeping the committed PNG icons.');
  process.exit(0);
}

// The environment may pin a browser outside Playwright's own download cache.
const executablePath = process.env.PAPFISH_CHROMIUM ?? '/opt/pw-browsers/chromium';
const browser = await chromium
  .launch({ executablePath })
  .catch(() => chromium.launch());
const page = await browser.newPage();

for (const icon of PNG_ICONS) {
  const svg = papfishSvg({ detailed: true, plate: icon.plate, padding: icon.padding });
  await page.setViewportSize({ width: icon.size, height: icon.size });
  await page.setContent(
    `<body style="margin:0"><div style="width:${icon.size}px;height:${icon.size}px">${svg.replace(
      'width="64" height="64"',
      'width="100%" height="100%"',
    )}</div></body>`,
  );
  const buffer = await page.screenshot({ omitBackground: true });
  writeFileSync(resolve(iconDir, icon.file), buffer);
  console.log(`[papfish] ${icon.file} (${icon.size}px)`);
}

await browser.close();
