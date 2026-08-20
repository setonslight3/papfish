/**
 * The Papfish mark as a standalone SVG string.
 *
 * Kept alongside the React component and drawn from the same geometry, so the
 * favicon, the app icons and the pre-boot splash are the same artwork the app
 * renders once it has started.
 */
const INK = '#0b2b45';
const RIM = '#5b8fb9';
const RIM_DARK = '#3a6f99';
const BODY = '#38bdf8';
const BODY_DARK = '#0ea5e9';
const BELLY = '#eaf6ff';
const PLATE = '#f3f8fc';

const FISH_PATH =
  'M53 40 C53 34 46 30 36 30 C28 30 22 33 19 37 L10 30 C8 35 8 46 10 51 L19 44 C22 48 28 51 36 51 C46 51 53 46 53 40 Z';
const BELLY_PATH = 'M21 45 C26 49 41 49 50 43';
const FIN_PATH = 'M27 32 L33 25 L38 30 Z';

const CY = 25;
const R = 15;
const ANGLES = Array.from({ length: 8 }, (_, index) => index * 45);

/**
 * @param {{ detailed?: boolean, plate?: 'none' | 'circle' | 'squircle', spinning?: boolean, padding?: number }} options
 */
export function papfishSvg(options = {}) {
  const { detailed = true, plate = 'none', spinning = false, padding = 0 } = options;
  const spokes = detailed ? ANGLES : ANGLES.filter((_, index) => index % 2 === 0);
  const scale = (plate === 'none' ? 1 : 0.84) * (1 - padding);

  const grips = detailed
    ? ANGLES.map(
        (angle) =>
          `<rect x="30.5" y="6" width="3" height="5" rx="1.5" fill="${RIM_DARK}" transform="rotate(${angle + 22.5} 32 ${CY})"/>`,
      ).join('')
    : '';

  const spin = spinning
    ? `<animateTransform attributeName="transform" attributeType="XML" type="rotate" from="0 32 ${CY}" to="360 32 ${CY}" dur="2.4s" repeatCount="indefinite"/>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  ${plate === 'circle' ? `<circle cx="32" cy="32" r="31" fill="${PLATE}"/>` : ''}
  ${plate === 'squircle' ? `<rect width="64" height="64" rx="14" fill="${PLATE}"/>` : ''}
  <g transform="translate(32 32) scale(${scale.toFixed(3)}) translate(-32 -32)">
    <g>${spin}
      ${grips}
      <circle cx="32" cy="${CY}" r="${R}" fill="none" stroke="${RIM}" stroke-width="${detailed ? 3.5 : 5}"/>
      ${spokes
        .map(
          (angle) =>
            `<line x1="32" y1="${CY - R + 1}" x2="32" y2="${CY - 3}" stroke="${RIM}" stroke-width="${detailed ? 3 : 4.5}" stroke-linecap="round" transform="rotate(${angle} 32 ${CY})"/>`,
        )
        .join('')}
      <circle cx="32" cy="${CY}" r="${detailed ? 4.5 : 5}" fill="${RIM_DARK}"/>
    </g>
    <g>
      ${detailed ? `<path d="${FIN_PATH}" fill="${BODY_DARK}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` : ''}
      <path d="${FISH_PATH}" fill="${BODY}" stroke="${INK}" stroke-width="${detailed ? 2.5 : 3.2}" stroke-linejoin="round"/>
      <path d="${BELLY_PATH}" fill="none" stroke="${BELLY}" stroke-width="${detailed ? 3.5 : 3}" stroke-linecap="round"/>
      <circle cx="45" cy="38" r="${detailed ? 3.2 : 3.6}" fill="#ffffff" stroke="${INK}" stroke-width="1.6"/>
      <circle cx="45.8" cy="38" r="1.5" fill="${INK}"/>
    </g>
  </g>
</svg>`;
}
