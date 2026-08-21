export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
}

export interface SignUpResult {
  user: AuthUser | null;
  /** Set when the account was created but a confirmation step is still required. */
  pendingConfirmation: boolean;
}

export interface AuthAdapter {
  readonly kind: 'supabase' | 'local';
  getUser(): Promise<AuthUser | null>;
  onAuthStateChange(listener: (user: AuthUser | null) => void): () => void;
  signUp(email: string, password: string, displayName: string): Promise<SignUpResult>;
  signIn(email: string, password: string): Promise<AuthUser>;
  signOut(): Promise<void>;
  /** Only meaningful where accounts are confirmed by email. */
  resendConfirmation?(email: string): Promise<void>;
}
