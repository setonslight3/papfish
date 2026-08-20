-- Papfish - Version 2 schema
--
-- Adds imported personal games, the positions extracted from them, and the
-- training mode recorded with each attempt. Spaced-repetition columns already
-- exist on `mastery` from the Version 1 migration, so no user data is touched
-- here - this migration only adds.
--
-- Safe to run on a database that already has the Version 1 schema, and safe to
-- run twice.

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'papfish_training_mode') then
    create type papfish_training_mode as enum ('train', 'review', 'drill', 'test');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Training attempts: which kind of session the attempt came from
-- ---------------------------------------------------------------------------
alter table public.training_attempts
  add column if not exists mode papfish_training_mode not null default 'train';

create index if not exists training_attempts_mode_idx
  on public.training_attempts (user_id, mode, created_at desc);

-- ---------------------------------------------------------------------------
-- Imported games
-- ---------------------------------------------------------------------------
create table if not exists public.imported_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null default 'pgn',
  external_game_id text,
  white_player text not null,
  black_player text not null,
  result text not null default '*',
  played_at timestamptz,
  pgn text not null,
  opening_code text,
  opening_name text,
  user_color papfish_color not null,
  -- How many plies followed the user's repertoire before the game left it.
  in_book_plies integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists imported_games_user_idx
  on public.imported_games (user_id, played_at desc nulls last);

-- The same game imported twice should update, not duplicate.
create unique index if not exists imported_games_unique_external
  on public.imported_games (user_id, external_game_id)
  where external_game_id is not null;

alter table public.imported_games enable row level security;

drop policy if exists "games are readable by their owner" on public.imported_games;
create policy "games are readable by their owner"
  on public.imported_games for select using (auth.uid() = user_id);

drop policy if exists "games are insertable by their owner" on public.imported_games;
create policy "games are insertable by their owner"
  on public.imported_games for insert with check (auth.uid() = user_id);

drop policy if exists "games are updatable by their owner" on public.imported_games;
create policy "games are updatable by their owner"
  on public.imported_games for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "games are deletable by their owner" on public.imported_games;
create policy "games are deletable by their owner"
  on public.imported_games for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Positions extracted from imported games
-- ---------------------------------------------------------------------------
create table if not exists public.personal_game_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  imported_game_id uuid not null references public.imported_games (id) on delete cascade,
  ply integer not null check (ply > 0),
  fen text not null,
  position_key text not null,
  move_played text not null,
  -- The repertoire move for this position, when the user had one.
  expected_move text,
  engine_evaluation integer,
  repertoire_match boolean not null default false,
  training_recommended boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  constraint personal_game_positions_unique_ply unique (imported_game_id, ply)
);

create index if not exists personal_game_positions_game_idx
  on public.personal_game_positions (imported_game_id);

-- Finding the positions a user keeps reaching is the point of this table.
create index if not exists personal_game_positions_recurring_idx
  on public.personal_game_positions (user_id, position_key);

create index if not exists personal_game_positions_recommended_idx
  on public.personal_game_positions (user_id, training_recommended)
  where training_recommended;

alter table public.personal_game_positions enable row level security;

drop policy if exists "game positions are readable by their owner" on public.personal_game_positions;
create policy "game positions are readable by their owner"
  on public.personal_game_positions for select using (auth.uid() = user_id);

drop policy if exists "game positions are insertable by their owner" on public.personal_game_positions;
create policy "game positions are insertable by their owner"
  on public.personal_game_positions for insert with check (auth.uid() = user_id);

drop policy if exists "game positions are updatable by their owner" on public.personal_game_positions;
create policy "game positions are updatable by their owner"
  on public.personal_game_positions for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "game positions are deletable by their owner" on public.personal_game_positions;
create policy "game positions are deletable by their owner"
  on public.personal_game_positions for delete using (auth.uid() = user_id);
