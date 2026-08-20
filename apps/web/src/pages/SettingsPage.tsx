import { useEffect, useState } from 'react';
import { ENGINE_STRENGTH_PROFILES, RATING_BUCKETS, TIME_CONTROLS } from '@papfish/core';
import { Badge, Button, ErrorNote, Field, Panel, Select, TextInput } from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';
import { useEngine } from '@/engine/EngineProvider';
import { EngineStatusBadge } from '@/components/EnginePanel';
import { useSettings } from '@/settings/SettingsProvider';
import { getRepository } from '@/data';
import { env } from '@/lib/env';

export function SettingsPage(): React.JSX.Element {
  const { settings, update, reset } = useSettings();
  const { user, backend } = useAuth();
  const { state: engineState, ensureReady } = useEngine();
  const repository = getRepository();

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Mirror the rating/time-control preference to the profile so a new device
  // starts where the last one left off.
  useEffect(() => {
    if (!user) return;
    repository
      .updateProfile(user.id, {
        ratingBucket: settings.ratingBucket,
        timeControl: settings.timeControl,
      })
      .catch(() => undefined);
  }, [repository, settings.ratingBucket, settings.timeControl, user]);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      await repository.updateProfile(user.id, { displayName });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-slate-100">Settings</h1>
        <p className="text-sm text-slate-400">Tune the opponent, the engine and the board.</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Profile">
          <div className="space-y-4">
            <Field label="Display name">
              <TextInput value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            </Field>
            <p className="text-xs text-slate-500">Signed in as {user?.email}</p>
            <ErrorNote>{error}</ErrorNote>
            <div className="flex items-center gap-3">
              <Button onClick={handleSaveProfile} disabled={saving}>
                {saving ? 'Saving…' : 'Save profile'}
              </Button>
              {saved ? <span className="text-sm text-emerald-300">Saved</span> : null}
            </div>
          </div>
        </Panel>

        <Panel title="Opponent">
          <div className="space-y-4">
            <Field label="Rating population" hint="Which players' choices the opponent imitates.">
              <Select
                value={settings.ratingBucket}
                onChange={(event) => update({ ratingBucket: event.target.value as never })}
              >
                {RATING_BUCKETS.map((bucket) => (
                  <option key={bucket.id} value={bucket.id}>
                    {bucket.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Time control">
              <Select
                value={settings.timeControl}
                onChange={(event) => update({ timeControl: event.target.value as never })}
              >
                {TIME_CONTROLS.map((control) => (
                  <option key={control.id} value={control.id}>
                    {control.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Opponent type" hint="Human patterns and the engine are separate modes.">
              <Select
                value={settings.opponentMode}
                onChange={(event) => update({ opponentMode: event.target.value as never })}
              >
                <option value="human">Human patterns (popularity)</option>
                <option value="engine">Stockfish</option>
              </Select>
            </Field>

            <Field label="Candidate replies">
              <Select
                value={settings.candidatePolicy}
                onChange={(event) => update({ candidatePolicy: event.target.value as never })}
                disabled={settings.opponentMode !== 'human'}
              >
                <option value="top1">Most popular only</option>
                <option value="top3">Top 3</option>
                <option value="top5">Top 5</option>
                <option value="weighted">Weighted by popularity</option>
              </Select>
            </Field>

            <Field label="Engine strength" hint="Used when the opponent is Stockfish.">
              <Select
                value={settings.engineStrengthId}
                onChange={(event) => update({ engineStrengthId: event.target.value })}
                disabled={settings.opponentMode !== 'engine'}
              >
                {ENGINE_STRENGTH_PROFILES.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Panel>

        <Panel title="Engine">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <EngineStatusBadge state={engineState} />
              <Button variant="secondary" onClick={() => void ensureReady()}>
                Start engine
              </Button>
            </div>

            <Field label="Analysis depth">
              <Select
                value={settings.analysisDepth}
                onChange={(event) => update({ analysisDepth: Number(event.target.value) })}
              >
                {[10, 12, 14, 16, 18, 20].map((depth) => (
                  <option key={depth} value={depth}>
                    depth {depth}
                  </option>
                ))}
              </Select>
            </Field>

            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={settings.engineEnabled}
                onChange={(event) => update({ engineEnabled: event.target.checked })}
                className="h-4 w-4 rounded border-slate-600 bg-slate-900"
              />
              Show engine analysis while exploring
            </label>

            <p className="text-xs text-slate-500">
              Stockfish runs locally in a Web Worker. Analysis never blocks the board.
            </p>
          </div>
        </Panel>

        <Panel title="Board & data">
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={settings.showCoordinates}
                onChange={(event) => update({ showCoordinates: event.target.checked })}
                className="h-4 w-4 rounded border-slate-600 bg-slate-900"
              />
              Show board coordinates
            </label>

            <Field
              label="Wheel menu direction"
              hint="On phones, which way the navigation bar extends from the wheel. Upward has room for labels; sideways keeps it in the thumb's reach."
            >
              <Select
                value={settings.navDirection}
                onChange={(event) =>
                  update({ navDirection: event.target.value as 'vertical' | 'horizontal' })
                }
              >
                <option value="vertical">Upward</option>
                <option value="horizontal">Sideways</option>
              </Select>
            </Field>

            <div className="space-y-1 text-xs text-slate-500">
              <p>
                Storage backend: <Badge tone={backend === 'supabase' ? 'success' : 'warning'}>{backend}</Badge>
              </p>
              <p>
                Live statistics lookups: {env.liveExplorerEnabled ? 'enabled' : 'disabled'}
              </p>
            </div>

            <Button variant="ghost" onClick={reset}>
              Reset preferences
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
