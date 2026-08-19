import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import type { AuthAdapter, AuthUser, SignUpResult } from './types';

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
      options: { data: { display_name: displayName } },
    });
    if (error) throw new Error(error.message);
    return {
      user: toUser(data.user),
      pendingConfirmation: !data.session,
    };
  }

  async signIn(email: string, password: string): Promise<AuthUser> {
    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    const user = toUser(data.user);
    if (!user) throw new Error('Sign in failed');
    return user;
  }

  async signOut(): Promise<void> {
    const { error } = await this.supabase.auth.signOut();
    if (error) throw new Error(error.message);
  }
}
