import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import { describeBackendError } from '@/lib/errors';
import type { AuthAdapter, AuthUser, SignUpResult } from './types';

/**
 * Where a confirmation link should land.
 *
 * Without this, Supabase falls back to the project's Site URL, which starts
 * life as http://localhost:3000 - so a link mailed from production sends
 * people to a dead address on their own machine. Deriving it from the running
 * page means the same build works on localhost, on a preview deployment and on
 * the real domain, provided each origin is listed under Redirect URLs in the
 * Supabase dashboard.
 */
export function emailRedirectTo(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return `${window.location.origin}/auth/callback`;
}

function toUser(user: User | null | undefined): AuthUser | null {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email ?? '',
    displayName: (user.user_metadata?.display_name as string | undefined) ?? null,
  };
}

/** Supabase Auth: the product's real authentication, with server-side sessions. */
export class SupabaseAuthAdapter implements AuthAdapter {
  readonly kind = 'supabase' as const;

  constructor(private readonly supabase: SupabaseClient) {}

  async getUser(): Promise<AuthUser | null> {
    const { data } = await this.supabase.auth.getSession();
    return toUser(data.session?.user);
  }

  onAuthStateChange(listener: (user: AuthUser | null) => void): () => void {
    const { data } = this.supabase.auth.onAuthStateChange((_event, session: Session | null) => {
      listener(toUser(session?.user));
    });
    return () => data.subscription.unsubscribe();
  }

  async signUp(email: string, password: string, displayName: string): Promise<SignUpResult> {
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName }, emailRedirectTo: emailRedirectTo() },
    });
    if (error) throw new Error(describeBackendError(error, 'Could not create the account'));
    return {
      user: toUser(data.user),
      pendingConfirmation: !data.session,
    };
  }

  async signIn(email: string, password: string): Promise<AuthUser> {
    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(describeBackendError(error, 'Could not sign in'));
    const user = toUser(data.user);
    if (!user) throw new Error('Sign in failed');
    return user;
  }

  /** Send a fresh confirmation email, for links that expired before use. */
  async resendConfirmation(email: string): Promise<void> {
    const { error } = await this.supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: emailRedirectTo() },
    });
    if (error) throw new Error(describeBackendError(error, 'Could not send a new link'));
  }

  async signOut(): Promise<void> {
    const { error } = await this.supabase.auth.signOut();
    if (error) throw new Error(describeBackendError(error, 'Could not sign out'));
  }
}
