import { describe, expect, it } from 'vitest';
import { describeBackendError } from './errors';

describe('describeBackendError', () => {
  it('explains an unreachable project', () => {
    expect(describeBackendError(new TypeError('Failed to fetch'), 'x')).toMatch(
      /Could not reach the database/,
    );
    expect(describeBackendError({ message: 'fetch failed' }, 'x')).toMatch(/VITE_SUPABASE_URL/);
  });

  it('explains a project where the migration has not been run', () => {
    expect(describeBackendError({ message: 'oops', code: '42P01' }, 'x')).toMatch(
      /0001_init\.sql/,
    );
    expect(
      describeBackendError(
        { message: "Could not find the table 'public.repertoires' in the schema cache" },
        'x',
      ),
    ).toMatch(/tables are missing/);
  });

  it('rewrites the common auth failures', () => {
    expect(describeBackendError({ message: 'Invalid login credentials' }, 'x')).toMatch(
      /do not match an account/,
    );
    expect(describeBackendError({ message: 'Email not confirmed' }, 'x')).toMatch(/Confirm your email/);
    expect(describeBackendError({ message: 'User already registered' }, 'x')).toMatch(
      /already exists/,
    );
  });

  it('passes anything else through', () => {
    expect(describeBackendError(new Error('duplicate key value'), 'fallback')).toBe(
      'duplicate key value',
    );
    expect(describeBackendError(null, 'fallback')).toBe('fallback');
  });
});
