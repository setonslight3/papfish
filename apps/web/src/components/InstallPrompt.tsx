import { useEffect, useState } from 'react';
import { Button } from './ui';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'papfish:install-dismissed';

/**
 * Offer home-screen installation when the browser says it is possible.
 * Installation is optional - the app is a normal website without it.
 */
export function InstallPrompt(): React.JSX.Element | null {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(() => window.localStorage.getItem(DISMISSED_KEY) === 'true');

  useEffect(() => {
    const handler = (nativeEvent: Event) => {
      nativeEvent.preventDefault();
      setEvent(nativeEvent as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!event || hidden) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3">
      <p className="text-sm text-sky-100">Install Papfish for full-screen training on this device.</p>
      <div className="flex gap-2">
        <Button
          onClick={async () => {
            await event.prompt();
            await event.userChoice;
            setEvent(null);
          }}
        >
          Install
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            window.localStorage.setItem(DISMISSED_KEY, 'true');
            setHidden(true);
          }}
        >
          Not now
        </Button>
      </div>
    </div>
  );
}
