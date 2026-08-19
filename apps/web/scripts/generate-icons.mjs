/**
 * Generate the PWA icon set.
 *
 * Icons are drawn programmatically (flat brand mark: a sky rounded square with
 * a navy "P") and written as PNGs, so the repository carries no binary assets
 * that cannot be regenerated. Run with `node scripts/generate-icons.mjs`.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '..', 'public', 'icons');

const NAVY = [11, 17, 32, 255];
const SKY = [56, 189, 248, 255];

// 5x7 bitmap for the letter P.
const GLYPH = [
  '11110',
  '10001',
  '10001',
  '11110',
  '10000',
  '10000',
  '10000',
];

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size, pixels) {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0; // no filter
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = pixels(x, y);
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
    }
  }
  return Buffer.concat([
    header,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function drawIcon(size, { maskable }) {
  const pad = maskable ? Math.round(size * 0.18) : Math.round(size * 0.08);
  const inner = size - pad * 2;
  const radius = Math.round(inner * 0.22);

  const glyphHeight = Math.round(inner * 0.5);
  const cell = Math.max(1, Math.round(glyphHeight / GLYPH.length));
  const glyphW = cell * GLYPH[0].length;
  const glyphH = cell * GLYPH.length;
  const glyphX = Math.round((size - glyphW) / 2);
  const glyphY = Math.round((size - glyphH) / 2);

  return (x, y) => {
    const insideX = x - pad;
    const insideY = y - pad;
    const inBox =
      insideX >= 0 &&
      insideY >= 0 &&
      insideX < inner &&
      insideY < inner &&
      roundedCorner(insideX, insideY, inner, radius);

    if (!inBox) return NAVY;

    const gx = Math.floor((x - glyphX) / cell);
    const gy = Math.floor((y - glyphY) / cell);
    if (gy >= 0 && gy < GLYPH.length && gx >= 0 && gx < GLYPH[0].length && GLYPH[gy][gx] === '1') {
      return NAVY;
    }
    return SKY;
  };
}

function roundedCorner(x, y, size, radius) {
  const cx = x < radius ? radius : x > size - radius ? size - radius : x;
  const cy = y < radius ? radius : y > size - radius ? size - radius : y;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

mkdirSync(outDir, { recursive: true });
for (const [name, size, maskable] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
]) {
  writeFileSync(resolve(outDir, name), png(size, drawIcon(size, { maskable })));
  console.log(`[papfish] icon: ${name}`);
}
