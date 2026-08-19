import type { ReactNode } from 'react';
import { Badge } from '@/components/ui';
import { ConnectionCheck } from '@/components/ConnectionCheck';
import { useAuth } from '@/auth/AuthProvider';

/** Shared frame for the sign-in and registration screens. */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}): React.JSX.Element {
  const { backend } = useAuth();

  return (
    <div className="grid min-h-full place-items-center bg-slate-950 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-sky-500 text-2xl font-black text-slate-950">
            P
          </span>
          <h1 className="mt-4 text-2xl font-bold text-slate-100">Papfish</h1>
          <p className="mt-1 text-sm text-slate-400">
            Explore openings, build a repertoire, train it against realistic opponents.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl">
          <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
          <p className="mt-1 mb-5 text-sm text-slate-400">{subtitle}</p>
          {children}
          <div className="mt-5 border-t border-slate-800 pt-4 text-center text-sm text-slate-400">
            {footer}
          </div>
          <ConnectionCheck />
        </div>

        {backend === 'local' ? (
          <p className="mt-4 text-center text-xs text-slate-500">
            <Badge tone="warning">local mode</Badge>{' '}
            No Supabase project is configured, so accounts and progress stay in this browser.
          </p>
        ) : null}
      </div>
    </div>
  );
}
