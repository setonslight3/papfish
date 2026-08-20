import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { CandidatePolicy, Color, OpponentMode, RatingBucket, TimeControl } from '@papfish/core';
import {
  DEFAULT_RATING_BUCKET,
  DEFAULT_TIME_CONTROL,
  isRatingBucket,
  isTimeControl,
} from '@papfish/core';

export interface Settings {
  ratingBucket: RatingBucket;
  timeControl: TimeControl;
  opponentMode: OpponentMode;
  candidatePolicy: CandidatePolicy;
  engineStrengthId: string;
  /** Analysis depth used in Explore. */
  analysisDepth: number;
  /** Show the engine panel in Explore and after training feedback. */
  engineEnabled: boolean;
  boardOrientation: Color | 'auto';
  showCoordinates: boolean;
  trainingSessionSize: number;
  /** Which way the wheel's navigation bar extends on phones. */
  navDirection: 'vertical' | 'horizontal';
}

const DEFAULTS: Settings = {
  ratingBucket: DEFAULT_RATING_BUCKET,
  timeControl: DEFAULT_TIME_CONTROL,
  opponentMode: 'human',
  candidatePolicy: 'top3',
  engineStrengthId: 'club',
  analysisDepth: 14,
  engineEnabled: true,
  boardOrientation: 'auto',
  showCoordinates: true,
  trainingSessionSize: 10,
  navDirection: 'vertical',
};

const STORAGE_KEY = 'papfish:settings';

function readSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      ...DEFAULTS,
      ...parsed,
      ratingBucket: isRatingBucket(parsed.ratingBucket) ? parsed.ratingBucket : DEFAULTS.ratingBucket,
      timeControl: isTimeControl(parsed.timeControl) ? parsed.timeControl : DEFAULTS.timeControl,
    };
  } catch {
    return DEFAULTS;
  }
}

interface SettingsContextValue {
  settings: Settings;
  update(patch: Partial<Settings>): void;
  reset(): void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

/**
 * User preferences that shape training and exploration.
 *
 * They live on the device because they are display/behaviour choices; the
 * rating and time-control preference are also mirrored to the user's profile
 * so a new device starts from the same place.
 */
export function SettingsProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [settings, setSettings] = useState<Settings>(() => readSettings());

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((previous) => ({ ...previous, ...patch }));
  }, []);

  const reset = useCallback(() => setSettings(DEFAULTS), []);

  const value = useMemo(() => ({ settings, update, reset }), [settings, update, reset]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used inside <SettingsProvider>');
  return context;
}

export const DEFAULT_SETTINGS = DEFAULTS;
