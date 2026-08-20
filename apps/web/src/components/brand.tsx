import { classNames } from '@/lib/format';

/**
 * The Papfish mark: a cartoon fish crossing a ship's wheel.
 *
 * Deliberately few shapes - a ring, its spokes, one closed fish outline, a
 * belly highlight, one eye - because the same drawing has to hold up at 512px
 * on a home screen and at 16px in a browser tab. The fish is a single path so
 * body and tail can never show a seam, and below 48px the wheel drops its
 * grips and half its spokes rather than turning to mush.
 *
 * It is the same wheel as the navigation control, so the brand and the
 * interface are one object rather than two.
 */
export type MarkVariant = 'full' | 'compact' | 'auto';

export interface PapfishMarkProps {
  size?: number;
  variant?: MarkVariant;
  /** Turn the wheel continuously, for loading states. */
  spinning?: boolean;
  /** Plate behind the mark: a light disc lifts it off a dark interface. */
  plate?: 'none' | 'circle' | 'squircle';
  className?: string;
  /** Provide a label to expose the mark to assistive technology. */
  title?: string;
}

const INK = '#0b2b45';
const RIM = '#5b8fb9';
const RIM_DARK = '#3a6f99';
const BODY = '#38bdf8';
const BODY_DARK = '#0ea5e9';
const BELLY = '#eaf6ff';
const PLATE = '#f3f8fc';

/** Nose, back, tail and belly in one closed path. */
const FISH_PATH =
  'M53 40 C53 34 46 30 36 30 C28 30 22 33 19 37 L10 30 C8 35 8 46 10 51 L19 44 C22 48 28 51 36 51 C46 51 53 46 53 40 Z';
const BELLY_PATH = 'M21 45 C26 49 41 49 50 43';
const FIN_PATH = 'M27 32 L33 25 L38 30 Z';

const WHEEL_CENTER_Y = 25;
const WHEEL_RADIUS = 15;
const ANGLES = Array.from({ length: 8 }, (_, index) => index * 45);

export function PapfishMark({
  size = 48,
  variant = 'auto',
  spinning = false,
  plate = 'none',
  className,
  title,
}: PapfishMarkProps): React.JSX.Element {
  const detailed = variant === 'auto' ? size >= 48 : variant === 'full';
  const spokes = detailed ? ANGLES : ANGLES.filter((_, index) => index % 2 === 0);
  // Inside a plate the art is inset so the tail never touches the edge.
  const scale = plate === 'none' ? 1 : 0.84;

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {plate === 'circle' ? <circle cx="32" cy="32" r="31" fill={PLATE} /> : null}
      {plate === 'squircle' ? <rect width="64" height="64" rx="14" fill={PLATE} /> : null}

      <g transform={`translate(32 32) scale(${scale}) translate(-32 -32)`}>
        <g
          className={classNames(spinning && 'papfish-wheel-spin')}
          style={{ transformOrigin: `32px ${WHEEL_CENTER_Y}px` }}
        >
          {detailed
            ? ANGLES.map((angle) => (
                <rect
                  key={`grip-${angle}`}
                  x="30.5"
                  y="6"
                  width="3"
                  height="5"
                  rx="1.5"
                  fill={RIM_DARK}
                  transform={`rotate(${angle + 22.5} 32 ${WHEEL_CENTER_Y})`}
                />
              ))
            : null}

          <circle
            cx="32"
            cy={WHEEL_CENTER_Y}
            r={WHEEL_RADIUS}
            fill="none"
            stroke={RIM}
            strokeWidth={detailed ? 3.5 : 5}
          />

          {spokes.map((angle) => (
            <line
              key={`spoke-${angle}`}
              x1="32"
              y1={WHEEL_CENTER_Y - WHEEL_RADIUS + 1}
              x2="32"
              y2={WHEEL_CENTER_Y - 3}
              stroke={RIM}
              strokeWidth={detailed ? 3 : 4.5}
              strokeLinecap="round"
              transform={`rotate(${angle} 32 ${WHEEL_CENTER_Y})`}
            />
          ))}

          <circle cx="32" cy={WHEEL_CENTER_Y} r={detailed ? 4.5 : 5} fill={RIM_DARK} />
        </g>

        {/* The fish rides in front and never turns with the wheel. */}
        <g className={classNames(spinning && 'papfish-fish-bob')}>
          {detailed ? (
            <path d={FIN_PATH} fill={BODY_DARK} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
          ) : null}
          <path
            d={FISH_PATH}
            fill={BODY}
            stroke={INK}
            strokeWidth={detailed ? 2.5 : 3.2}
            strokeLinejoin="round"
          />
          <path
            d={BELLY_PATH}
            fill="none"
            stroke={BELLY}
            strokeWidth={detailed ? 3.5 : 3}
            strokeLinecap="round"
          />
          <circle
            cx="45"
            cy="38"
            r={detailed ? 3.2 : 3.6}
            fill="#ffffff"
            stroke={INK}
            strokeWidth="1.6"
          />
          <circle cx="45.8" cy="38" r="1.5" fill={INK} />
        </g>
      </g>
    </svg>
  );
}

/**
 * The loading screen.
 *
 * Opening Papfish shows the wheel turning rather than a blank pause. Reduced
 * motion stops the spin and leaves the mark still.
 */
export function PapfishLoader({
  label = 'Loading',
  full = true,
  className,
}: {
  label?: string;
  /** Fill the screen, or sit inside a panel. */
  full?: boolean;
  className?: string;
}): React.JSX.Element {
  return (
    <div
      className={classNames(
        'flex flex-col items-center justify-center gap-4',
        full ? 'min-h-full flex-1 bg-slate-950 p-10' : 'py-10',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <PapfishMark size={full ? 112 : 68} plate="circle" spinning />
      <p className="text-sm font-medium tracking-wide text-slate-400">{label}</p>
      {full ? (
        <div className="h-1 w-40 overflow-hidden rounded-full bg-slate-800">
          <div className="papfish-loader-bar h-full w-1/3 rounded-full bg-sky-500" />
        </div>
      ) : null}
    </div>
  );
}

/** Wordmark used in the sidebar, the mobile header and the sign-in screens. */
export function PapfishWordmark({
  compact = false,
  size = 40,
}: {
  compact?: boolean;
  size?: number;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2.5">
      <PapfishMark size={size} plate="circle" />
      <div>
        <p className="text-base leading-tight font-bold text-slate-100">Papfish</p>
        {!compact ? <p className="text-[11px] text-slate-500">Repertoire trainer</p> : null}
      </div>
    </div>
  );
}
