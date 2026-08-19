import { beforeEach, describe, expect, it } from 'vitest';
import { LocalAuthAdapter } from './localAuth';

describe('LocalAuthAdapter', () => {
  let auth: LocalAuthAdapter;

  beforeEach(() => {
    window.localStorage.clear();
    auth = new LocalAuthAdapter();
  });

  it('registers an account and starts a session', async () => {
    const result = await auth.signUp('Player@Example.com ', 'supersecret', 'Player One');
    expect(result.pendingConfirmation).toBe(false);
    expect(result.user?.email).toBe('player@example.com');
    expect(await auth.getUser()).not.toBeNull();
  });

  it('rejects weak passwords and malformed emails', async () => {
    await expect(auth.signUp('nope', 'supersecret', '')).rejects.toThrow(/valid email/);
    await expect(auth.signUp('a@b.com', 'short', '')).rejects.toThrow(/8 characters/);
  });

  it('refuses a duplicate registration', async () => {
    await auth.signUp('a@b.com', 'supersecret', 'A');
    await expect(auth.signUp('a@b.com', 'supersecret', 'A')).rejects.toThrow(/already exists/);
  });

  it('signs in, out, and back in with persistence', async () => {
    await auth.signUp('a@b.com', 'supersecret', 'A');
    await auth.signOut();
    expect(await auth.getUser()).toBeNull();

    const user = await auth.signIn('a@b.com', 'supersecret');
    expect(user.email).toBe('a@b.com');

    // A fresh adapter (page reload) still finds the session.
    expect(await new LocalAuthAdapter().getUser()).toMatchObject({ email: 'a@b.com' });
  });

  it('rejects a wrong password and an unknown account', async () => {
    await auth.signUp('a@b.com', 'supersecret', 'A');
    await expect(auth.signIn('a@b.com', 'wrongpassword')).rejects.toThrow(/Incorrect password/);
    await expect(auth.signIn('nobody@b.com', 'supersecret')).rejects.toThrow(/No account/);
  });

  it('never stores the password itself', async () => {
    await auth.signUp('a@b.com', 'supersecret', 'A');
    expect(window.localStorage.getItem('papfish:local:users')).not.toContain('supersecret');
  });

  it('notifies listeners about sign in and sign out', async () => {
    const seen: (string | null)[] = [];
    auth.onAuthStateChange((user) => seen.push(user?.email ?? null));
    await auth.signUp('a@b.com', 'supersecret', 'A');
    await auth.signOut();
    expect(seen).toEqual(['a@b.com', null]);
  });
});
