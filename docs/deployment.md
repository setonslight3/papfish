# Deploying Papfish

Two services: **Supabase** (database + auth) and **Vercel** (the web app).
Do Supabase first - the app needs its URL and anon key at build time.

---

## 1. Supabase

1. Create a project at [supabase.com](https://supabase.com) and pick a strong
   database password. Region: whichever is closest to you.
2. Open **SQL Editor → New query**, paste the whole of
   [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql)
   and press **Run**. It is idempotent, so running it twice is harmless.
3. Check **Table Editor**: you should see `profiles`, `repertoires`,
   `repertoire_nodes`, `opening_stats`, `training_attempts` and `mastery`, each
   marked *RLS enabled*.
4. **Authentication → Providers → Email**: leave email/password enabled.
   - *Confirm email* **on** (default) is the safer choice: users must click a
     link before they can sign in.
   - Turn it **off** if you want to sign in immediately after registering,
     which is convenient while you are testing.
5. **Authentication → URL Configuration**: set *Site URL* to your Vercel domain
   once you have it (e.g. `https://papfish.vercel.app`) and add it to
   *Redirect URLs*. Without this, confirmation links point at localhost.
6. Copy from **Project Settings → API**:
   - *Project URL* → `VITE_SUPABASE_URL`
   - *anon / public* key → `VITE_SUPABASE_ANON_KEY`

The **service_role** key is never used by the web app. It belongs only to the
data pipeline, on your own machine or a private job runner.

### Proving user isolation

Once the project exists:

```bash
SUPABASE_URL=https://<project>.supabase.co \
SUPABASE_ANON_KEY=<anon key> \
npm run verify:rls
```

It signs in as two accounts with the public key and asserts that neither can
read, rename or delete the other's repertoires, moves, attempts or mastery.
With *Confirm email* on, create the two accounts first and pass them in via
`PAPFISH_TEST_A_EMAIL` / `PAPFISH_TEST_A_PASSWORD` and the `_B_` equivalents.

---

## 2. Vercel

The repository ships [`vercel.json`](../vercel.json), so the defaults are
already correct for this monorepo.

1. **Add New → Project**, import the GitHub repository.
2. **Root Directory**: leave it at the repository root (`./`). The build
   installs the npm workspaces and emits `apps/web/dist`, which `vercel.json`
   already declares:

   | Setting | Value |
   | --- | --- |
   | Install command | `npm install` |
   | Build command | `npm run build` |
   | Output directory | `apps/web/dist` |

3. **Environment Variables** - add both, for *Production*, *Preview* and
   *Development*:

   ```
   VITE_SUPABASE_URL=https://<project>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key>
   ```

   These are compiled into the bundle at build time, so **after adding or
   changing them you must redeploy** (Deployments → ⋯ → Redeploy). Both values
   are public by design; Row Level Security is what protects the data.

   Optional:

   ```
   VITE_ENABLE_LIVE_EXPLORER=true   # query Lichess for positions not yet aggregated
   ```

4. **Deploy.** The first build takes a couple of minutes, mostly copying the
   7 MB Stockfish binary.

### Checking the deployment

- The sign-in screen must **not** show a yellow `local mode` badge. If it does,
  the environment variables were missing at build time - add them and redeploy.
- Register an account, then open **Settings**: *Storage backend* should read
  `supabase`.
- Open **Explore**, play `1.e4` and wait a second: the engine panel should show
  a depth readout. That confirms the WebAssembly worker is being served.
- On Android Chrome, the browser menu should offer *Add to Home screen*.

### What `vercel.json` sets up

- SPA routing: deep links such as `/train` fall back to `index.html`, while
  `/engine`, `/data`, `/icons` and `/assets` keep serving real files.
- Long-lived immutable caching for hashed assets and the engine binary,
  `must-revalidate` for `sw.js` and the manifest so updates land immediately.
- `application/wasm` for the engine, plus `nosniff`, `SAMEORIGIN` and a
  restrictive `Permissions-Policy`.

No cross-origin isolation headers are needed: the engine is the
single-threaded build, so it runs without `SharedArrayBuffer`.

---

## 3. Opening statistics (optional but recommended)

Until the `opening_stats` table is populated, the app falls back to the public
Lichess explorer at runtime (or says it has no data, if you disabled that).
To pre-aggregate the positions your repertoires actually reach:

```bash
npm run pipeline:stats -- --depth 10 --buckets 1400-1599,1800-1999 --speeds all

SUPABASE_URL=https://<project>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service role key> \
npm run upload -w @papfish/pipeline
```

Run it from your own machine - the service-role key must never reach Vercel's
client build or a browser. Re-running it refreshes statistics without touching
any user data.

---

## Custom domain

Add it under **Vercel → Project → Domains**, then update Supabase's
*Site URL* and *Redirect URLs* to match, otherwise confirmation and password
reset links will point at the old address.
