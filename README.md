# Papfish

A personal chess **opening-repertoire and memory trainer**. Not a generic chess
site: the whole application is built around one loop.

> **Explore → choose your repertoire → train → get feedback → repeat → measure mastery**

Papfish combines human opening popularity, rating-specific move tendencies,
Stockfish, a personal branching repertoire, and position-level mastery
tracking, in an installable responsive web app.

**Status: Version 1 complete.** Version 2 (spaced repetition, PGN import,
personal-game analysis) has not been started - see [Roadmap](#roadmap).

---

## What Version 1 does

| Area | What you get |
| --- | --- |
| Accounts | Register, sign in, sign out, cloud-backed data, strict per-user isolation |
| Board | Legal moves via chess.js, drag or tap to move, promotion picker, move list, rewind, branch navigation |
| Openings | Automatic opening/variation detection from the position (3,810 ECO positions) |
| Popularity | Aggregated Lichess statistics per position, filtered by rating band and time control |
| Engine | Stockfish 18 (WASM) in a Web Worker - evaluation, best move, multi-PV, never blocking the UI |
| Repertoires | Italian Game (White) and King's Indian Defence (Black) starters, stored as a real branching tree |
| Explore | Navigate, compare human popularity with the engine, add any move to a repertoire |
| Training | Answer first, then feedback: correct / strong alternative / inaccuracy / mistake / blunder, with a "Why?" panel |
| Opponents | Human-pattern opponent (popularity, top-1/3/5/weighted) **or** Stockfish - never blended |
| Progress | Overall, White and Black mastery, per-opening mastery, weakest branches, training history |
| PWA | Manifest, icons, service worker, installable, offline caching of static assets |

---

## Quick start

```bash
npm install          # installs workspaces and copies the Stockfish build
npm run dev          # http://localhost:5173
```

Without Supabase credentials the app runs in **local mode**: accounts and
progress are stored in the browser so you can try the whole loop immediately.
Local mode is a development convenience, not the product - it is device-local
and is not a security boundary.

### Connecting Supabase (the real backend)

1. Create a project at [supabase.com](https://supabase.com).
2. Run `supabase/migrations/0001_init.sql` in the SQL editor. It creates every
   table, index, trigger and **Row Level Security policy**.
3. Copy `.env.example` to `.env` and fill in:

   ```bash
   VITE_SUPABASE_URL=https://<project>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key>
   ```

4. Restart `npm run dev`. The app switches to Supabase automatically; the
   Settings page shows which backend is active.

Only the **anon** key ever reaches the browser. The service-role key is used
solely by the data pipeline.

---

## Repository layout

```
packages/core/      Pure domain logic: positions, popularity, classification,
                    mastery, repertoire trees, opponent selection, opening book.
                    No React, no Supabase - fully unit tested.
apps/web/           React + TypeScript + Vite + Tailwind PWA.
tools/pipeline/     Offline data pipeline (opening names, opening statistics,
                    Supabase upload, Row Level Security verification).
supabase/           SQL migration with the schema and RLS policies.
```

The web app never talks to a database client directly: storage sits behind the
`PapfishRepository` interface (`apps/web/src/data/`), with a Supabase
implementation and a local-storage implementation.

---

## Data pipeline

Opening data is prepared **outside** the request cycle; the runtime only ever
reads compact aggregated rows.

```
public Lichess data → explorer aggregation → rating / time-control grouping
→ sample-size filtering → opening_stats table → application
```

```bash
# Opening names → apps/web/public/data/openings.json (already generated)
npm run pipeline:openings

# Crawl aggregated statistics (respects the explorer's rate limits, caches on disk)
npm run pipeline:stats -- --depth 10 --buckets 1400-1599,1800-1999 --speeds all

# Upload them to Supabase (needs SUPABASE_SERVICE_ROLE_KEY)
npm run upload -w @papfish/pipeline
```

Statistics can be refreshed at any time without touching user data. When a
position has not been aggregated yet, the client can query the public Lichess
explorer directly (`VITE_ENABLE_LIVE_EXPLORER`) and caches the answer for the
session. If neither source has data, Papfish says so - it never invents
popularity, and never presents an engine evaluation as popularity.

---

## Testing

```bash
npm test          # 127 tests: domain logic, storage, auth, engine, UI flows
npm run typecheck # strict TypeScript across all three workspaces
npm run lint      # ESLint incl. React hooks rules
npm run build     # type-check + production build + service worker
```

Against a real Supabase project you can additionally prove user isolation:

```bash
SUPABASE_URL=... SUPABASE_ANON_KEY=... npm run verify:rls -w @papfish/pipeline
```

It signs in as two users and asserts that neither can read, modify or delete
the other's repertoires, moves, attempts or mastery.

---

## Deployment

- **Frontend**: any static host (Vercel, Netlify, Cloudflare Pages).
  Build command `npm run build`, output `apps/web/dist`, SPA fallback to
  `index.html`.
- **Database/Auth**: Supabase.
- **Pipeline**: run locally or as a scheduled job; it needs the service-role key.

The engine is served as a plain asset and runs single-threaded, so no
cross-origin isolation headers are required.

---

## Roadmap

- **Version 1 - Core opening trainer.** Complete.
- **Version 2 - Adaptive personal training.** Spaced repetition (the schema
  already carries `interval_days` / `next_review_at`), weak-position detection,
  PGN import, personal-game analysis, speed drills.
- **Version 3 - Advanced platform.** Master-game comparison, middlegame and
  endgame training, deeper analytics.

Version boundaries are deliberate: Version 2 work does not start until
Version 1 is stable and tested.

---

## Licences

Papfish bundles third-party components, including **Stockfish (GPL-3.0)**.
See [NOTICE.md](./NOTICE.md).
