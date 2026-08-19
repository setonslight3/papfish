-- Papfish - Version 1 schema
--
-- Every table that holds user data is protected by Row Level Security, and the
-- policies are written so a user can only ever see rows that belong to them.
-- Opening statistics are shared, read-only reference data: the pipeline writes
-- them with the service-role key, which bypasses RLS and never reaches a browser.

-- gen_random_uuid() is built into PostgreSQL 13+, which every current Supabase
-- project runs, so no extension is required.

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'papfish_color') then
    create type papfish_color as enum ('white', 'black');
  end if;

  if not exists (select 1 from pg_type where typname = 'papfish_rating_bucket') then
    create type papfish_rating_bucket as enum (
      'beginner', '1000-1199', '1200-1399', '1400-1599', '1600-1799',
      '1800-1999', '2000-2199', '2200+', 'masters'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'papfish_time_control') then
    create type papfish_time_control as enum ('bullet', 'blitz', 'rapid', 'classical', 'all');
  end if;

  if not exists (select 1 from pg_type where typname = 'papfish_verdict') then
    create type papfish_verdict as enum (
      'repertoire', 'strong-alternative', 'inaccuracy', 'mistake', 'blunder', 'illegal'
    );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  rating_bucket papfish_rating_bucket not null default '1400-1599',
  time_control papfish_time_control not null default 'all',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles are readable by their owner" on public.profiles;
create policy "profiles are readable by their owner"
  on public.profiles for select
  using (auth.uid() = user_id);

drop policy if exists "profiles are insertable by their owner" on public.profiles;
create policy "profiles are insertable by their owner"
  on public.profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "profiles are updatable by their owner" on public.profiles;
create policy "profiles are updatable by their owner"
  on public.profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create the profile row automatically when an account is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Repertoires
-- ---------------------------------------------------------------------------
create table if not exists public.repertoires (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  color papfish_color not null,
  opening_code text,
  opening_name text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists repertoires_user_idx on public.repertoires (user_id, color);

alter table public.repertoires enable row level security;

drop policy if exists "repertoires are readable by their owner" on public.repertoires;
create policy "repertoires are readable by their owner"
  on public.repertoires for select using (auth.uid() = user_id);

drop policy if exists "repertoires are insertable by their owner" on public.repertoires;
create policy "repertoires are insertable by their owner"
  on public.repertoires for insert with check (auth.uid() = user_id);

drop policy if exists "repertoires are updatable by their owner" on public.repertoires;
create policy "repertoires are updatable by their owner"
  on public.repertoires for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "repertoires are deletable by their owner" on public.repertoires;
create policy "repertoires are deletable by their owner"
  on public.repertoires for delete using (auth.uid() = user_id);

drop trigger if exists repertoires_set_updated_at on public.repertoires;
create trigger repertoires_set_updated_at
  before update on public.repertoires
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Repertoire nodes (branching move tree)
-- ---------------------------------------------------------------------------
create table if not exists public.repertoire_nodes (
  id uuid primary key default gen_random_uuid(),
  repertoire_id uuid not null references public.repertoires (id) on delete cascade,
  parent_node_id uuid references public.repertoire_nodes (id) on delete cascade,
  fen text not null,
  position_key text not null,
  move_san text not null,
  move_uci text not null,
  ply integer not null,
  opening_name text,
  variation_name text,
  is_user_move boolean not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One move can only appear once under a given parent (see the two unique
  -- indexes below, which also cover the root moves where parent_node_id is null).
  constraint repertoire_nodes_ply_positive check (ply > 0)
);

create unique index if not exists repertoire_nodes_unique_child
  on public.repertoire_nodes (repertoire_id, parent_node_id, move_san)
  where parent_node_id is not null;

create unique index if not exists repertoire_nodes_unique_root
  on public.repertoire_nodes (repertoire_id, move_san)
  where parent_node_id is null;

create index if not exists repertoire_nodes_repertoire_idx on public.repertoire_nodes (repertoire_id);
create index if not exists repertoire_nodes_parent_idx on public.repertoire_nodes (parent_node_id);
create index if not exists repertoire_nodes_position_idx on public.repertoire_nodes (position_key);

alter table public.repertoire_nodes enable row level security;

-- Node access is derived from the owning repertoire, so a user can never read
-- or write a node that hangs off somebody else's repertoire.
drop policy if exists "nodes are readable by the repertoire owner" on public.repertoire_nodes;
create policy "nodes are readable by the repertoire owner"
  on public.repertoire_nodes for select
  using (exists (
    select 1 from public.repertoires r
    where r.id = repertoire_nodes.repertoire_id and r.user_id = auth.uid()
  ));

drop policy if exists "nodes are insertable by the repertoire owner" on public.repertoire_nodes;
create policy "nodes are insertable by the repertoire owner"
  on public.repertoire_nodes for insert
  with check (exists (
    select 1 from public.repertoires r
    where r.id = repertoire_nodes.repertoire_id and r.user_id = auth.uid()
  ));

drop policy if exists "nodes are updatable by the repertoire owner" on public.repertoire_nodes;
create policy "nodes are updatable by the repertoire owner"
  on public.repertoire_nodes for update
  using (exists (
    select 1 from public.repertoires r
    where r.id = repertoire_nodes.repertoire_id and r.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.repertoires r
    where r.id = repertoire_nodes.repertoire_id and r.user_id = auth.uid()
  ));

drop policy if exists "nodes are deletable by the repertoire owner" on public.repertoire_nodes;
create policy "nodes are deletable by the repertoire owner"
  on public.repertoire_nodes for delete
  using (exists (
    select 1 from public.repertoires r
    where r.id = repertoire_nodes.repertoire_id and r.user_id = auth.uid()
  ));

drop trigger if exists repertoire_nodes_set_updated_at on public.repertoire_nodes;
create trigger repertoire_nodes_set_updated_at
  before update on public.repertoire_nodes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Opening statistics (shared reference data, written by the pipeline only)
-- ---------------------------------------------------------------------------
create table if not exists public.opening_stats (
  position_key text not null,
  rating_bucket papfish_rating_bucket not null,
  time_control papfish_time_control not null,
  source text not null,
  total_games integer not null check (total_games >= 0),
  moves jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (position_key, rating_bucket, time_control, source)
);

create index if not exists opening_stats_position_idx on public.opening_stats (position_key);

alter table public.opening_stats enable row level security;

drop policy if exists "opening statistics are readable by everyone" on public.opening_stats;
create policy "opening statistics are readable by everyone"
  on public.opening_stats for select
  to anon, authenticated
  using (true);
-- No insert/update/delete policy: writes require the service-role key, which
-- lives in the pipeline environment and never in client code.

-- ---------------------------------------------------------------------------
-- Training attempts
-- ---------------------------------------------------------------------------
create table if not exists public.training_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  repertoire_id uuid references public.repertoires (id) on delete set null,
  repertoire_node_id uuid references public.repertoire_nodes (id) on delete set null,
  position_key text not null,
  color papfish_color not null,
  attempted_move text not null,
  expected_move text,
  engine_evaluation integer,
  result papfish_verdict not null,
  response_time_ms integer not null check (response_time_ms >= 0),
  created_at timestamptz not null default now()
);

create index if not exists training_attempts_user_idx on public.training_attempts (user_id, created_at desc);
create index if not exists training_attempts_position_idx on public.training_attempts (user_id, position_key);

alter table public.training_attempts enable row level security;

drop policy if exists "attempts are readable by their owner" on public.training_attempts;
create policy "attempts are readable by their owner"
  on public.training_attempts for select using (auth.uid() = user_id);

drop policy if exists "attempts are insertable by their owner" on public.training_attempts;
create policy "attempts are insertable by their owner"
  on public.training_attempts for insert with check (auth.uid() = user_id);

drop policy if exists "attempts are deletable by their owner" on public.training_attempts;
create policy "attempts are deletable by their owner"
  on public.training_attempts for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Mastery
-- ---------------------------------------------------------------------------
create table if not exists public.mastery (
  user_id uuid not null references auth.users (id) on delete cascade,
  repertoire_id uuid not null references public.repertoires (id) on delete cascade,
  position_key text not null,
  color papfish_color not null,
  attempts integer not null default 0 check (attempts >= 0),
  correct_attempts integer not null default 0 check (correct_attempts >= 0),
  mastery_score integer not null default 0 check (mastery_score between 0 and 100),
  difficulty real not null default 2.5,
  streak integer not null default 0,
  average_response_ms integer not null default 0,
  -- Spaced repetition columns are created now so Version 2 can schedule reviews
  -- without a migration that touches existing rows.
  interval_days integer not null default 0,
  next_review_at timestamptz,
  last_reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, repertoire_id, position_key)
);

create index if not exists mastery_user_idx on public.mastery (user_id, color);
create index if not exists mastery_weak_idx on public.mastery (user_id, mastery_score);

alter table public.mastery enable row level security;

drop policy if exists "mastery is readable by its owner" on public.mastery;
create policy "mastery is readable by its owner"
  on public.mastery for select using (auth.uid() = user_id);

drop policy if exists "mastery is insertable by its owner" on public.mastery;
create policy "mastery is insertable by its owner"
  on public.mastery for insert with check (auth.uid() = user_id);

drop policy if exists "mastery is updatable by its owner" on public.mastery;
create policy "mastery is updatable by its owner"
  on public.mastery for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "mastery is deletable by its owner" on public.mastery;
create policy "mastery is deletable by its owner"
  on public.mastery for delete using (auth.uid() = user_id);

drop trigger if exists mastery_set_updated_at on public.mastery;
create trigger mastery_set_updated_at
  before update on public.mastery
  for each row execute function public.set_updated_at();
