import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { classNames } from '@/lib/format';

export interface WheelNavItem {
  to: string;
  label: string;
  icon: string;
}

export type WheelDirection = 'vertical' | 'horizontal';

export interface MahoragaWheelProps {
  items: WheelNavItem[];
  direction: WheelDirection;
  className?: string;
}

/** Preferred spacing between menu buttons, and the smallest it may shrink to. */
const PITCH = { vertical: 54, horizontal: 46 } as const;
const MIN_PITCH = 32;
/**
 * The first button clears the wheel itself rather than hiding behind it:
 * the wheel's radius (32) plus half a button plus a small gap.
 */
const HUB_CLEARANCE = 52;
/** Room the wheel and the screen edges need, so the bar never runs off. */
const RESERVED = { vertical: 150, horizontal: 70 } as const;

/** How long the wheel takes to turn, and how long a selection is held before navigating. */
const SPIN_MS = 640;
const SELECT_MS = 420;

/** Track the viewport so the bar can be sized to the screen it is on. */
function useViewportSize(): { width: number; height: number } {
  const [size, setSize] = useState(() => ({
    width: typeof window === 'undefined' ? 360 : window.innerWidth,
    height: typeof window === 'undefined' ? 740 : window.innerHeight,
  }));

  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  return size;
}

/**
 * Wheel navigation.
 *
 * A single control replaces the row of tabs that used to crowd the bottom of
 * every phone screen: tap the wheel, it turns, and the destinations extend out
 * as a bar. Choosing one draws it into the hub, turns the wheel again, and
 * lands on that page.
 *
 * The bar runs upward by default because a phone has far more room vertically
 * than across; the horizontal setting is there for anyone who prefers it, and
 * shrinks its buttons to fit the width.
 */
export function MahoragaWheel({ items, direction, className }: MahoragaWheelProps): React.JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  // The menu remembers which page it was opened on, so arriving anywhere else -
  // including via the back button - closes it without an effect.
  const [menu, setMenu] = useState({ open: false, path: location.pathname });
  const open = menu.open && menu.path === location.pathname;
  const setOpen = useCallback(
    (next: boolean) => setMenu({ open: next, path: location.pathname }),
    [location.pathname],
  );
  const [rotation, setRotation] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, setOpen]);

  const toggle = () => {
    clearTimers();
    setSelected(null);
    // Each turn continues from where the last one stopped, so the wheel never
    // snaps backwards.
    setRotation((current) => current + (open ? -360 : 360));
    setOpen(!open);
  };

  const choose = (item: WheelNavItem) => {
    if (selected) return;
    setSelected(item.to);
    setRotation((current) => current + 720);

    timers.current.push(
      window.setTimeout(() => {
        setOpen(false);
        setSelected(null);
        if (item.to !== location.pathname) navigate(item.to);
      }, SELECT_MS),
    );
  };

  // Fit the bar to the screen rather than assuming there is room: eight
  // destinations do not fit across a narrow phone at full size, so the
  // sideways bar tightens up until they do.
  const viewport = useViewportSize();
  const available =
    (direction === 'vertical' ? viewport.height : viewport.width) -
    RESERVED[direction] -
    HUB_CLEARANCE;
  const gaps = Math.max(1, items.length - 1);
  const pitch = Math.max(
    MIN_PITCH,
    Math.min(PITCH[direction], Math.floor(available / gaps)),
  );
  const size = Math.round(Math.min(pitch, PITCH[direction]) * (direction === 'vertical' ? 0.85 : 0.8));

  return (
    <div className={classNames('pointer-events-none fixed inset-0 z-40 lg:hidden', className)}>
      {open ? (
        // Presentational: tapping outside closes, but the wheel and Escape
        // already offer that, so it is not a second control to tab through.
        <div
          aria-hidden
          onClick={() => setOpen(false)}
          className="pointer-events-auto absolute inset-0 bg-slate-950/60 backdrop-blur-[2px] transition-opacity"
        />
      ) : null}

      <div
        className="pointer-events-auto absolute right-4 bottom-4"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* Destinations extend from the wheel's centre. */}
        <ul
          className={classNames(
            'absolute',
            direction === 'vertical' ? 'right-2 bottom-2' : 'right-2 bottom-2',
          )}
          role="menu"
          aria-hidden={!open}
        >
          {items.map((item, index) => {
            const distance = HUB_CLEARANCE + index * pitch;
            const isSelected = selected === item.to;
            const isActive = location.pathname === item.to;

            // Closed, and the moment one is chosen, every button sits at the
            // hub - so opening throws them out and choosing pulls one back in.
            const offset = open && !selected ? distance : 0;
            const transform =
              direction === 'vertical'
                ? `translate3d(0, ${-offset}px, 0)`
                : `translate3d(${-offset}px, 0, 0)`;

            return (
              <li
                key={item.to}
                role="none"
                className="absolute right-0 bottom-0"
                style={{
                  transform,
                  opacity: open && (!selected || isSelected) ? 1 : 0,
                  transition: `transform ${SPIN_MS}ms cubic-bezier(0.22, 1, 0.36, 1) ${
                    open && !selected ? index * 35 : 0
                  }ms, opacity 260ms ease ${open && !selected ? index * 35 : 0}ms`,
                  pointerEvents: open && !selected ? 'auto' : 'none',
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={open ? 0 : -1}
                  onClick={() => choose(item)}
                  aria-current={isActive ? 'page' : undefined}
                  className={classNames(
                    'flex items-center justify-center rounded-full border shadow-lg transition-colors',
                    isActive
                      ? 'border-sky-400/60 bg-sky-500/25 text-sky-100'
                      : 'border-slate-700 bg-slate-900/95 text-slate-300',
                    isSelected ? 'scale-50' : '',
                  )}
                  style={{
                    width: size,
                    height: size,
                    transition: `transform ${SELECT_MS}ms ease, background-color 200ms ease`,
                  }}
                >
                  <span aria-hidden className="text-lg leading-none">
                    {item.icon}
                  </span>
                  <span className="sr-only">{item.label}</span>
                </button>

                {/* Labels only in the upward bar, where there is room for them. */}
                {direction === 'vertical' ? (
                  <span
                    aria-hidden
                    className={classNames(
                      'absolute top-1/2 right-full mr-2 -translate-y-1/2 rounded-full border border-slate-700 bg-slate-900/95 px-2.5 py-1 text-xs font-medium whitespace-nowrap',
                      isActive ? 'text-sky-200' : 'text-slate-300',
                    )}
                    style={{
                      opacity: open && !selected ? 1 : 0,
                      transition: `opacity 200ms ease ${index * 35 + 120}ms`,
                    }}
                  >
                    {item.label}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={open ? 'Close navigation' : 'Open navigation'}
          className={classNames(
            'relative grid h-16 w-16 place-items-center rounded-full border shadow-xl transition-colors',
            open
              ? 'border-sky-400/70 bg-slate-900 shadow-sky-500/20'
              : 'border-slate-700 bg-slate-900/95',
          )}
        >
          <WheelMark rotation={rotation} active={open} />
        </button>
      </div>
    </div>
  );
}

/**
 * The wheel itself: an eight-spoked ring that turns on every interaction.
 * Drawn rather than imported so it inherits the interface's colours and stays
 * crisp at any size.
 */
function WheelMark({ rotation, active }: { rotation: number; active: boolean }): React.JSX.Element {
  const spokes = Array.from({ length: 8 }, (_, index) => (index * 360) / 8);

  return (
    <svg
      viewBox="0 0 100 100"
      className="h-11 w-11"
      style={{
        transform: `rotate(${rotation}deg)`,
        transition: `transform ${SPIN_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
      }}
      aria-hidden
    >
      <circle
        cx="50"
        cy="50"
        r="44"
        fill="none"
        stroke={active ? '#38bdf8' : '#64748b'}
        strokeWidth="5"
      />
      <circle
        cx="50"
        cy="50"
        r="34"
        fill="none"
        stroke={active ? '#7dd3fc' : '#475569'}
        strokeWidth="2"
      />
      {spokes.map((angle) => (
        <g key={angle} transform={`rotate(${angle} 50 50)`}>
          <line
            x1="50"
            y1="16"
            x2="50"
            y2="42"
            stroke={active ? '#7dd3fc' : '#94a3b8'}
            strokeWidth="4"
            strokeLinecap="round"
          />
          {/* The notches that make the rim read as a wheel rather than a ring. */}
          <rect
            x="47"
            y="4"
            width="6"
            height="9"
            rx="2"
            fill={active ? '#38bdf8' : '#64748b'}
            transform="rotate(22.5 50 50)"
          />
        </g>
      ))}
      <circle cx="50" cy="50" r="9" fill={active ? '#38bdf8' : '#94a3b8'} />
      <circle cx="50" cy="50" r="4" fill="#0b1120" />
    </svg>
  );
}
