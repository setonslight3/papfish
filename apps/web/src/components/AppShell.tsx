import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { classNames } from '@/lib/format';
import { useSettings } from '@/settings/SettingsProvider';
import { Badge, Button } from './ui';
import { InstallPrompt } from './InstallPrompt';
import { MahoragaWheel } from './MahoragaWheel';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: '◫' },
  { to: '/explore', label: 'Explore', icon: '◈' },
  { to: '/repertoires', label: 'Repertoires', icon: '⑂' },
  { to: '/train', label: 'Train', icon: '◎' },
  { to: '/games', label: 'Games', icon: '⧉' },
  { to: '/endgames', label: 'Endgames', icon: '♚' },
  { to: '/progress', label: 'Progress', icon: '◔' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
];

/**
 * Responsive frame: a sidebar on desktop, and on phones a single wheel instead
 * of a row of tabs - eight destinations no longer have to share the bottom of
 * a small screen.
 */
export function AppShell(): React.JSX.Element {
  const { user, signOut, backend } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-full flex-col bg-slate-950 lg:flex-row">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-900/50 p-4 lg:flex">
        <Brand />
        <nav className="mt-6 flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                classNames(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                  isActive ? 'bg-sky-500/15 text-sky-200' : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-200',
                )
              }
            >
              <span aria-hidden className="text-base">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-2 border-t border-slate-800 pt-4">
          <p className="truncate text-xs text-slate-500">{user?.email}</p>
          {backend === 'local' ? <Badge tone="warning">local data</Badge> : null}
          <Button variant="ghost" className="w-full justify-start px-3" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
      </aside>

      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/60 px-4 py-3 lg:hidden">
        <Brand compact />
        <div className="flex items-center gap-2">
          {backend === 'local' ? <Badge tone="warning">local</Badge> : null}
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="flex-1 pb-28 lg:pb-0">
        <div className="mx-auto w-full max-w-6xl p-4 lg:p-6">
          <InstallPrompt />
          <Outlet />
        </div>
      </main>

      <MahoragaWheel items={NAV_ITEMS} direction={settings.navDirection} />
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-sky-500 text-lg font-black text-slate-950">
        P
      </span>
      <div>
        <p className="text-base leading-tight font-bold text-slate-100">Papfish</p>
        {!compact ? <p className="text-[11px] text-slate-500">Repertoire trainer</p> : null}
      </div>
    </div>
  );
}
