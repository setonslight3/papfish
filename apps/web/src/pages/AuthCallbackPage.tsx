import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getSupabase } from '@/lib/supabase';
import { getAuthAdapter } from '@/auth/AuthProvider';
import { PapfishLoader } from '@/components/brand';
import { Button, ErrorNote, Field, TextInput } from '@/components/ui';
import { describeBackendError } from '@/lib/errors';
import { AuthLayout } from './AuthLayout';

type Phase =
  | { kind: 'working' }
  | { kind: 'done' }
  | { kind: 'failed'; message: string; expired: boolean; email: string | null };

/** How long to wait for the client to pick the session out of the URL. */
const SESSION_TIMEOUT_MS = 10_000;

/**
 * Where a confirmation link lands.
 *
 * Supabase returns either a `code` to exchange, or tokens in the URL fragment
 * that the client picks up on its own. Both end the same way: a session, then
 * the dashboard. An expired link is the common failure, so it gets a way out
 * rather than a dead end.
 */
export function AuthCallbackPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ kind: 'working' });
  const [resendEmail, setResendEmail] = useState('');
  const [resent, setResent] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabase();

    const finish = (next: Phase) => {
      if (cancelled) return;
      setPhase(next);
      if (next.kind === 'done') navigate('/dashboard', { replace: true });
    };

    const run = async () => {
      // Without a project there is nothing to confirm.
      if (!supabase) {
        finish({ kind: 'done' });
        return;
      }

      const url = new URL(window.location.href);
      // Supabase reports failures in the query string or the fragment.
      const fragment = new URLSearchParams(url.hash.replace(/^#/, ''));
      const errorCode = url.searchParams.get('error_code') ?? fragment.get('error_code');
      const errorDescription =
        url.searchParams.get('error_description') ?? fragment.get('error_description');

      if (errorCode || errorDescription) {
        finish({
          kind: 'failed',
          message: (errorDescription ?? errorCode ?? 'That link did not work.').replace(/\+/g, ' '),
          expired: /expired|invalid/i.test(`${errorCode} ${errorDescription}`),
          email: url.searchParams.get('email'),
        });
        return;
      }

      const code = url.searchParams.get('code');
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          finish({
            kind: 'failed',
            message: describeBackendError(error, 'That link could not be used.'),
            expired: /expired|invalid/i.test(error.message),
            email: null,
          });
          return;
        }
      }

      // Token-in-fragment links are handled by the client itself, so wait for
      // the session to appear rather than assuming it already has.
      const deadline = Date.now() + SESSION_TIMEOUT_MS;
      while (!cancelled && Date.now() < deadline) {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          finish({ kind: 'done' });
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      finish({
        kind: 'failed',
        message:
          'This link did not sign you in. It may already have been used, or it was issued for a different address.',
        expired: true,
        email: null,
      });
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const handleResend = useCallback(async () => {
    setResendError(null);
    const adapter = getAuthAdapter();
    if (!adapter.resendConfirmation) {
      setResendError('This backend does not send confirmation emails.');
      return;
    }
    try {
      await adapter.resendConfirmation(resendEmail.trim());
      setResent(true);
    } catch (cause) {
      setResendError(cause instanceof Error ? cause.message : 'Could not send a new link');
    }
  }, [resendEmail]);

  if (phase.kind !== 'failed') {
    return <PapfishLoader label="Confirming your account…" />;
  }

  return (
    <AuthLayout
      title="That link has expired"
      subtitle="Confirmation links are single use and time limited."
      footer={
        <>
          Already confirmed?{' '}
          <Link to="/login" className="font-semibold text-sky-400 hover:text-sky-300">
            Sign in
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        <ErrorNote>{phase.message}</ErrorNote>

        {phase.expired ? (
          <>
            <Field label="Email" hint="We will send a fresh confirmation link.">
              <TextInput
                type="email"
                autoComplete="email"
                value={resendEmail}
                onChange={(event) => setResendEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </Field>
            <ErrorNote>{resendError}</ErrorNote>
            {resent ? (
              <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                Sent. Check your inbox for the new link.
              </p>
            ) : (
              <Button className="w-full" onClick={handleResend} disabled={resendEmail.length < 3}>
                Send a new link
              </Button>
            )}
          </>
        ) : null}
      </div>
    </AuthLayout>
  );
}
