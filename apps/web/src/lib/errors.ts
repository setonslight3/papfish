/**
 * Turn backend failures into something a person can act on.
 *
 * The two failures that actually happen when connecting a fresh Supabase
 * project are a network error (wrong URL, offline, blocked host) and a missing
 * schema (the migration has not been run yet). Both arrive as opaque strings,
 * so they are translated here rather than shown raw.
 */
const MISSING_SCHEMA_HINT =
  'The Papfish tables are missing from this Supabase project. Run supabase/migrations/0001_init.sql in the SQL editor, then reload.';

const UNREACHABLE_HINT =
  'Could not reach the database. Check your connection and that VITE_SUPABASE_URL points at your Supabase project.';

export function describeBackendError(error: unknown, fallback: string): string {
  // Supabase and PostgREST report failures as plain objects, not Error
  // instances, so the message has to be read structurally.
  const source = (error ?? {}) as { message?: unknown; code?: unknown };
  const message =
    typeof source.message === 'string'
      ? source.message
      : error instanceof Error
        ? error.message
        : '';
  const code = typeof source.code === 'string' ? source.code : '';

  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(message)) {
    return UNREACHABLE_HINT;
  }
  // 42P01 = undefined_table; PostgREST reports an unknown table as a schema-cache miss.
  if (code === '42P01' || /does not exist|schema cache|relation .* does not exist/i.test(message)) {
    return MISSING_SCHEMA_HINT;
  }
  if (/invalid login credentials/i.test(message)) {
    return 'That email and password do not match an account.';
  }
  if (/email not confirmed/i.test(message)) {
    return 'Confirm your email address first - check your inbox for the link.';
  }
  if (/user already registered/i.test(message)) {
    return 'An account with that email already exists. Sign in instead.';
  }
  return message || fallback;
}
