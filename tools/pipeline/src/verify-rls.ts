/**
 * Verify that Row Level Security really isolates users.
 *
 * Run against a real Supabase project with the *anon* key only - the point is
 * to prove that a normal client cannot reach another user's rows:
 *
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... npm run verify:rls -w @papfish/pipeline
 *
 * Two accounts are used. Set PAPFISH_TEST_A_EMAIL / PAPFISH_TEST_A_PASSWORD and
 * the matching _B_ variables to reuse existing accounts; otherwise throwaway
 * accounts are created (which requires email confirmation to be disabled).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

interface Account {
  client: SupabaseClient;
  userId: string;
  email: string;
}

const results: { name: string; passed: boolean; detail: string }[] = [];

function check(name: string, passed: boolean, detail = ''): void {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
}

async function signIn(url: string, key: string, label: 'A' | 'B'): Promise<Account> {
  const client = createClient(url, key, { auth: { persistSession: false } });
  const email =
    process.env[`PAPFISH_TEST_${label}_EMAIL`] ??
    `papfish-rls-${label.toLowerCase()}-${Date.now()}@example.com`;
  const password = process.env[`PAPFISH_TEST_${label}_PASSWORD`] ?? `papfish-${label}-secret-1234`;

  const signInResult = await client.auth.signInWithPassword({ email, password });
  if (signInResult.data.user) {
    return { client, userId: signInResult.data.user.id, email };
  }

  const signUpResult = await client.auth.signUp({ email, password });
  if (signUpResult.error) throw new Error(`Could not create user ${label}: ${signUpResult.error.message}`);
  if (!signUpResult.data.session) {
    throw new Error(
      `User ${label} needs email confirmation. Disable confirmations or supply PAPFISH_TEST_${label}_EMAIL/PASSWORD.`,
    );
  }
  return { client, userId: signUpResult.data.user!.id, email };
}

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('Set SUPABASE_URL and SUPABASE_ANON_KEY.');
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('Ignoring SUPABASE_SERVICE_ROLE_KEY: this check must run as a normal user.');
  }

  const a = await signIn(url, anonKey, 'A');
  const b = await signIn(url, anonKey, 'B');
  console.log(`User A: ${a.email}\nUser B: ${b.email}\n`);

  const created = await a.client
    .from('repertoires')
    .insert({ user_id: a.userId, name: 'RLS probe', color: 'white' })
    .select()
    .single();
  if (created.error) throw new Error(`User A could not create their own repertoire: ${created.error.message}`);
  const repertoireId = created.data.id as string;
  check('User A can create their own repertoire', true);

  const node = await a.client
    .from('repertoire_nodes')
    .insert({
      repertoire_id: repertoireId,
      parent_node_id: null,
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      position_key: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -',
      move_san: 'e4',
      move_uci: 'e2e4',
      ply: 1,
      is_user_move: true,
    })
    .select()
    .single();
  check('User A can add a move to their repertoire', !node.error, node.error?.message ?? '');

  const readAsB = await b.client.from('repertoires').select('*').eq('id', repertoireId);
  check("User B cannot read User A's repertoire", (readAsB.data?.length ?? 0) === 0);

  const nodesAsB = await b.client.from('repertoire_nodes').select('*').eq('repertoire_id', repertoireId);
  check("User B cannot read User A's moves", (nodesAsB.data?.length ?? 0) === 0);

  const updateAsB = await b.client
    .from('repertoires')
    .update({ name: 'hijacked' })
    .eq('id', repertoireId)
    .select();
  check("User B cannot rename User A's repertoire", (updateAsB.data?.length ?? 0) === 0);

  const deleteAsB = await b.client.from('repertoires').delete().eq('id', repertoireId).select();
  check("User B cannot delete User A's repertoire", (deleteAsB.data?.length ?? 0) === 0);

  const forgedAttempt = await b.client.from('training_attempts').insert({
    user_id: a.userId,
    position_key: 'k',
    color: 'white',
    attempted_move: 'e4',
    result: 'repertoire',
    response_time_ms: 1000,
  });
  check('User B cannot write training history as User A', Boolean(forgedAttempt.error));

  const forgedMastery = await b.client.from('mastery').insert({
    user_id: a.userId,
    repertoire_id: repertoireId,
    position_key: 'k',
    color: 'white',
  });
  check('User B cannot write mastery as User A', Boolean(forgedMastery.error));

  const stats = await b.client.from('opening_stats').select('position_key').limit(1);
  check('Opening statistics stay readable by any signed-in user', !stats.error, stats.error?.message ?? '');

  const statsWrite = await b.client
    .from('opening_stats')
    .insert({ position_key: 'x', rating_bucket: '1400-1599', time_control: 'all', source: 'lichess', total_games: 1 });
  check('Opening statistics are not writable from the client', Boolean(statsWrite.error));

  const stillThere = await a.client.from('repertoires').select('name').eq('id', repertoireId).single();
  check("User A's repertoire survived every attempt", stillThere.data?.name === 'RLS probe');

  await a.client.from('repertoires').delete().eq('id', repertoireId);

  const failed = results.filter((result) => !result.passed);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
