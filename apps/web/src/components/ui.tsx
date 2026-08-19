import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { classNames } from '@/lib/format';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-sky-500 text-slate-950 hover:bg-sky-400 disabled:bg-sky-500/40',
  secondary:
    'bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-700 disabled:opacity-50',
  ghost: 'bg-transparent text-slate-300 hover:bg-slate-800/70 disabled:opacity-40',
  danger: 'bg-rose-600 text-white hover:bg-rose-500 disabled:opacity-50',
};

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }): React.JSX.Element {
  return (
    <button
      {...props}
      className={classNames(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:cursor-not-allowed',
        BUTTON_VARIANTS[variant],
        className,
      )}
    />
  );
}

export function Panel({
  title,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}): React.JSX.Element {
  return (
    <section
      className={classNames(
        'rounded-xl border border-slate-800 bg-slate-900/60 shadow-sm backdrop-blur',
        className,
      )}
    >
      {title ? (
        <header className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <h2 className="text-sm font-semibold tracking-wide text-slate-200 uppercase">{title}</h2>
          {actions}
        </header>
      ) : null}
      <div className={classNames('p-4', bodyClassName)}>{children}</div>
    </section>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}): React.JSX.Element {
  const tones = {
    neutral: 'bg-slate-800 text-slate-300 border-slate-700',
    success: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    warning: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    danger: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    info: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  } as const;

  return (
    <span
      className={classNames(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}): React.JSX.Element {
  // The hint sits outside the <label> so it does not become part of the
  // control's accessible name.
  return (
    <div className="space-y-1.5">
      <label className="block space-y-1.5">
        <span className="block text-sm font-medium text-slate-300">{label}</span>
        {children}
      </label>
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function TextInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return (
    <input
      {...props}
      className={classNames(
        'w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400',
        className,
      )}
    />
  );
}

export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>): React.JSX.Element {
  return (
    <select
      {...props}
      className={classNames(
        'w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400',
        className,
      )}
    />
  );
}

export function ProgressBar({
  value,
  tone = 'sky',
  label,
}: {
  value: number;
  tone?: 'sky' | 'emerald' | 'amber';
  label?: string;
}): React.JSX.Element {
  const clamped = Math.max(0, Math.min(100, value));
  const tones = { sky: 'bg-sky-500', emerald: 'bg-emerald-500', amber: 'bg-amber-500' } as const;
  return (
    <div className="space-y-1">
      {label ? (
        <div className="flex justify-between text-xs text-slate-400">
          <span>{label}</span>
          <span>{Math.round(clamped)}%</span>
        </div>
      ) : null}
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-slate-800"
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'progress'}
      >
        <div className={classNames('h-full rounded-full transition-all', tones[tone])} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

export function StatTile({
  label,
  value,
  sublabel,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  sublabel?: ReactNode;
  tone?: 'neutral' | 'white' | 'black';
}): React.JSX.Element {
  const accents = {
    neutral: 'border-slate-800',
    white: 'border-slate-300/40',
    black: 'border-slate-600',
  } as const;

  return (
    <div className={classNames('rounded-xl border bg-slate-900/60 p-4', accents[tone])}>
      <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-100 tabular-nums">{value}</p>
      {sublabel ? <p className="mt-1 text-xs text-slate-500">{sublabel}</p> : null}
    </div>
  );
}

export function Spinner({ className }: { className?: string }): React.JSX.Element {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={classNames(
        'inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-sky-400',
        className,
      )}
    />
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}): React.JSX.Element {
  return (
    <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center">
      <h3 className="text-base font-semibold text-slate-200">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">{description}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }): React.JSX.Element | null {
  if (!children) return null;
  return (
    <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
      {children}
    </p>
  );
}
