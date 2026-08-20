# Papfish

A personal chess **opening-repertoire and memory trainer**. Not a generic chess
site: the whole application is built around one loop.

> **Explore → choose your repertoire → train → get feedback → repeat → measure mastery**

Papfish combines human opening popularity, rating-specific move tendencies,
Stockfish, a personal branching repertoire, and position-level mastery
tracking, in an installable responsive web app.

**Status: Version 3 complete.** See [Roadmap](#roadmap).

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
| Navigation | Sidebar on desktop; on phones a single wheel in the corner that turns open into a bar of destinations, so eight tabs no longer crowd the bottom of the screen |

## What Version 2 adds

| Area | What you get |
| --- | --- |
| Spaced repetition | An SM-2 scheduler decides when each position comes back; failures return inside the session, successes stretch out |
| Adaptive sessions | Every session mixes what is due, what you failed, what is weak, what recurs and something new - never one ranked list |
| Session types | Adaptive, due reviews, weak positions, new positions, and speed drills against a clock |
| Speed drills | 15/8/4-second recall with a live clock, per-answer scoring, and timeouts recorded as lapses |
| PGN import | Paste or upload games from Lichess/Chess.com; multi-game files, annotations and variations handled |
| Personal-game analysis | Where you left your own repertoire, where the opponent left it, and how deep each game stayed in book |
| Recommendations | Positions you keep reaching or keep getting wrong, ranked - imports never rewrite your repertoire |
| Statistics | Accuracy trend, review forecast, mastery distribution, verdict breakdown, colour split, study streak |

## What Version 3 adds

| Area | What you get |
| --- | --- |
| Endgame training | Eight theoretically decided positions - basic mates, Lucena, Philidor, opposition, wrong bishop, queen v pawn - played out against a full-strength engine, graded on the goal rather than a solution line |
| Tablebase verdicts | Syzygy lookups (via Lichess) judge endgame moves where they are authoritative: "that gives away the win" is a fact, not an opinion. Degrades silently when offline |
| Master comparison | Master practice against play at your rating in the same position, with the gaps called out - and the engine's pick kept visibly separate from popularity |
| Engine game review | Runs over your own moves in an imported game and ranks your worst decisions by winning chances given away, not raw centipawns |
| Opening reports | Per-opening: mastery, coverage, training accuracy, how deep your real games stayed in book, weakest lines, and a plain-English headline |
| Long-term analytics | Accuracy by week and book depth across your imported games, so improvement is visible over months rather than sessions |

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
2. Run `supabase/migrations/0001_init.sql` and then `0002_version2.sql` in the
   SQL editor. They create every table, index, trigger and **Row Level Security
   policy**.
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
npm test          # 245 tests: domain logic, storage, auth, engine, UI flows
npm run typecheck # strict TypeScript across all three workspaces
npm run lint      # ESLint incl. React hooks rules
npm run build     # type-check + production build + service worker
```

The endgame catalogue is verified against Stockfish itself - every position is
checked to be legal and to actually be won or drawn as claimed:

```bash
npm run verify:endgames
```

Against a real Supabase project you can additionally prove user isolation:

```bash
SUPABASE_URL=... SUPABASE_ANON_KEY=... npm run verify:rls -w @papfish/pipeline
```

It signs in as two users and asserts that neither can read, modify or delete
the other's repertoires, moves, attempts or mastery.

---

## Deployment

Full walkthrough: **[docs/deployment.md](./docs/deployment.md)**.

- **Frontend: Vercel.** `vercel.json` in the repository root sets the
  install/build commands, SPA routing and caching headers; the build emits to
  `dist/` at the repository root, which is where a host looking for the
  conventional output directory expects it. Import the repo and deploy -
  `apps/web/.env.production` already carries the Supabase URL and anon key, or
  set them in the dashboard instead. Either way they are inlined at build time,
  so redeploy after changing them. Any other static host works the same way.
- **Database/Auth: Supabase.** Run `supabase/migrations/0001_init.sql` in the
  SQL editor; it creates every table, index, trigger and RLS policy.
- **Pipeline:** run locally or as a scheduled job; it needs the service-role
  key, which never goes near the frontend.

The engine is served as a plain asset and runs single-threaded, so no
cross-origin isolation headers are required.

---

## Roadmap

- **Version 1 - Core opening trainer.** Complete.
- **Version 2 - Adaptive personal training.** Complete.
- **Version 3 - Advanced platform.** Complete.

Version boundaries were deliberate: each version was finished and tested
before the next began.

Deliberately **not** built, because nothing in the product justifies them yet:
a curated tactics database (the engine review over your own games covers the
same ground with material you actually played), opponent personalities beyond
the rating-band model, and cloud-side engine analysis - the local worker is
fast enough for everything here.

---

## Licences

Papfish bundles third-party components, including **Stockfish (GPL-3.0)**.
See [NOTICE.md](./NOTICE.md).
