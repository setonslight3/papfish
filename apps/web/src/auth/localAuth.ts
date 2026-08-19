import { createId } from '@/lib/id';
import type { AuthAdapter, AuthUser, SignUpResult } from './types';

const USERS_KEY = 'papfish:local:users';
const SESSION_KEY = 'papfish:local:session';

interface StoredUser {
  id: string;
  email: string;
  displayName: string | null;
  salt: string;
  passwordHash: string;
}

function readUsers(): StoredUser[] {
  try {
    return JSON.parse(window.localStorage.getItem(USERS_KEY) ?? '[]') as StoredUser[];
  } catch {
    return [];
  }
}

function writeUsers(users: StoredUser[]): void {
  window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function hash(password: string, salt: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  const data = new TextEncoder().encode(`${salt}:${password}`);
  if (!subtle) {
    // Test environments without WebCrypto: this backend is never the product default.
    let value = 0;
    for (const byte of data) value = (value * 31 + byte) % 2 ** 31;
    return `plain-${value.toString(16)}`;
  }
  return toHex(await subtle.digest('SHA-256', data));
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Offline account store used when no Supabase project is configured.
 *
 * This exists so the application can be run end to end during development and
 * evaluation. It is device-local and is NOT a security boundary - the Supabase
 * adapter is what the product ships with.
 */
export class LocalAuthAdapter implements AuthAdapter {
  readonly kind = 'local' as const;
  private listeners = new Set<(user: AuthUser | null) => void>();

  async getUser(): Promise<AuthUser | null> {
    const id = window.localStorage.getItem(SESSION_KEY);
    if (!id) return null;
    const user = readUsers().find((item) => item.id === id);
    return user ? { id: user.id, email: user.email, displayName: user.displayName } : null;
  }

  onAuthStateChange(listener: (user: AuthUser | null) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(user: AuthUser | null): void {
    for (const listener of this.listeners) listener(user);
  }

  async signUp(email: string, password: string, displayName: string): Promise<SignUpResult> {
    const normalized = normalizeEmail(email);
    if (!normalized.includes('@')) throw new Error('Enter a valid email address');
    if (password.length < 8) throw new Error('Password must be at least 8 characters');

    const users = readUsers();
    if (users.some((user) => user.email === normalized)) {
      throw new Error('An account with that email already exists');
    }

    const salt = createId();
    const stored: StoredUser = {
      id: createId(),
      email: normalized,
      displayName: displayName.trim() || normalized.split('@')[0],
      salt,
      passwordHash: await hash(password, salt),
    };
    users.push(stored);
    writeUsers(users);
    window.localStorage.setItem(SESSION_KEY, stored.id);

    const user: AuthUser = { id: stored.id, email: stored.email, displayName: stored.displayName };
    this.emit(user);
    return { user, pendingConfirmation: false };
  }

  async signIn(email: string, password: string): Promise<AuthUser> {
    const normalized = normalizeEmail(email);
    const stored = readUsers().find((user) => user.email === normalized);
    if (!stored) throw new Error('No account found for that email');
    if ((await hash(password, stored.salt)) !== stored.passwordHash) {
      throw new Error('Incorrect password');
    }
    window.localStorage.setItem(SESSION_KEY, stored.id);
    const user: AuthUser = { id: stored.id, email: stored.email, displayName: stored.displayName };
    this.emit(user);
    return user;
  }

  async signOut(): Promise<void> {
    window.localStorage.removeItem(SESSION_KEY);
    this.emit(null);
  }
}
