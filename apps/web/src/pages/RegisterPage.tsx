import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { Button, ErrorNote, Field, TextInput } from '@/components/ui';
import { AuthLayout } from './AuthLayout';

export function RegisterPage(): React.JSX.Element {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setBusy(true);
    try {
      const result = await signUp(email, password, displayName);
      if (result.pendingConfirmation) {
        setNotice('Account created. Check your email to confirm it, then sign in.');
      } else {
        navigate('/dashboard', { replace: true });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the account');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="One account, every device - your repertoire follows you."
      footer={
        <>
          Already registered?{' '}
          <Link to="/login" className="font-semibold text-sky-400 hover:text-sky-300">
            Sign in
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <Field label="Display name">
          <TextInput
            name="displayName"
            autoComplete="nickname"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="How should we greet you?"
          />
        </Field>
        <Field label="Email">
          <TextInput
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <TextInput
            type="password"
            name="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
          />
        </Field>
        <ErrorNote>{error}</ErrorNote>
        {notice ? (
          <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            {notice}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthLayout>
  );
}
