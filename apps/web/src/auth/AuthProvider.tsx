import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { getSupabase } from '@/lib/supabase';
import { LocalAuthAdapter } from './localAuth';
import { SupabaseAuthAdapter } from './supabaseAuth';
import type { AuthAdapter, AuthUser } from './types';

let adapter: AuthAdapter | null = null;

export function getAuthAdapter(): AuthAdapter {
  if (!adapter) {
    const supabase = getSupabase();
    adapter = supabase ? new SupabaseAuthAdapter(supabase) : new LocalAuthAdapter();
  }
  return adapter;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  backend: AuthAdapter['kind'];
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, displayName: string): Promise<{ pendingConfirmation: boolean }>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  // The adapter is a module-level singleton, so it is stable across renders.
  const auth = getAuthAdapter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    auth
      .getUser()
      .then((current) => {
        if (active) setUser(current);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const unsubscribe = auth.onAuthStateChange((next) => {
      if (active) setUser(next);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [auth]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const next = await auth.signIn(email, password);
      setUser(next);
    },
    [auth],
  );

  const signUp = useCallback(
    async (email: string, password: string, displayName: string) => {
      const result = await auth.signUp(email, password, displayName);
      if (result.user && !result.pendingConfirmation) setUser(result.user);
      return { pendingConfirmation: result.pendingConfirmation };
    },
    [auth],
  );

  const signOut = useCallback(async () => {
    await auth.signOut();
    setUser(null);
  }, [auth]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, backend: auth.kind, signIn, signUp, signOut }),
    [auth, user, loading, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

/** The signed-in user, for screens that are behind the auth guard. */
export function useCurrentUser(): AuthUser {
  const { user } = useAuth();
  if (!user) throw new Error('No authenticated user');
  return user;
}
