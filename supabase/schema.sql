-- Viget Bingo — run this once in Supabase → SQL Editor → New query.
-- Safe to re-run: it never deletes data (it only recreates functions and policies).

-- Only people with this email domain can play.
create or replace function public.is_allowed_user()
returns boolean language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '') ilike '%@viget.com'
$$;

-- ---------- Tables ----------

create table if not exists public.people (
  id    serial primary key,
  name  text not null unique,
  sort  int  not null default 0
);

-- Task text lives in the app (src/game/tasks.ts); the database only needs the
-- kind (for scoring and security) and a label (for the Google Drive folder name).
create table if not exists public.tasks (
  id    text primary key,
  kind  text not null check (kind in ('person', 'photo')),
  label text not null
);

-- A signed-in Google account, linked to one name on the people list.
create table if not exists public.players (
  user_id    uuid primary key references auth.users on delete cascade,
  person_id  int  not null unique references public.people,
  email      text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.completions (
  user_id        uuid not null references public.players on delete cascade,
  task_id        text not null references public.tasks,
  -- blue squares
  person_id      int references public.people,
  -- orange squares
  album_name     text,
  storage_path   text,
  drive_file_id  text,
  drive_url      text,
  completed_at   timestamptz not null default now(),
  primary key (user_id, task_id)
);

-- Changing an answer counts as a new scoring time (used for tie-breaks).
create or replace function public.touch_completed_at()
returns trigger language plpgsql as $$
begin
  new.completed_at := now();
  return new;
end $$;

drop trigger if exists completions_touch on public.completions;
create trigger completions_touch before update on public.completions
  for each row execute function public.touch_completed_at();

-- ---------- Row level security ----------

alter table public.people      enable row level security;
alter table public.tasks       enable row level security;
alter table public.players     enable row level security;
alter table public.completions enable row level security;

drop policy if exists "people readable" on public.people;
create policy "people readable" on public.people
  for select to authenticated using (public.is_allowed_user());

drop policy if exists "tasks readable" on public.tasks;
create policy "tasks readable" on public.tasks
  for select to authenticated using (public.is_allowed_user());

drop policy if exists "players readable" on public.players;
create policy "players readable" on public.players
  for select to authenticated using (public.is_allowed_user());

drop policy if exists "claim own player" on public.players;
create policy "claim own player" on public.players
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_allowed_user());

-- Players only ever see their own answers and photos.
drop policy if exists "read own completions" on public.completions;
create policy "read own completions" on public.completions
  for select to authenticated using (user_id = auth.uid());

-- Players write blue answers directly. Orange (photo) completions are written
-- only by the server (api/submit-photo.ts) after the Drive upload succeeds.
drop policy if exists "write own person answers" on public.completions;
create policy "write own person answers" on public.completions
  for insert to authenticated
  with check (
    user_id = auth.uid() and public.is_allowed_user() and person_id is not null
    and exists (select 1 from public.tasks t where t.id = task_id and t.kind = 'person')
  );

drop policy if exists "update own person answers" on public.completions;
create policy "update own person answers" on public.completions
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid() and person_id is not null
    and exists (select 1 from public.tasks t where t.id = task_id and t.kind = 'person')
  );

-- ---------- Leaderboard ----------
-- Points: blue 50, orange 200, +400 for all 16 blue, +1600 for all 8 orange.
-- Ties: whoever reached their score first (earliest latest-scoring time).
-- Keep in sync with POINTS in src/game/tasks.ts.

create or replace function public.leaderboard()
returns table (
  user_id uuid, name text, person_done int, photo_done int,
  points int, last_scored_at timestamptz
)
language sql stable security definer set search_path = public as $$
  with totals as (
    select
      count(*) filter (where kind = 'person')::int as person_total,
      count(*) filter (where kind = 'photo')::int  as photo_total
    from tasks
  ),
  counts as (
    select
      p.user_id, pe.name,
      count(c.task_id) filter (where t.kind = 'person')::int as person_done,
      count(c.task_id) filter (where t.kind = 'photo')::int  as photo_done,
      max(c.completed_at) as last_scored_at
    from players p
    join people pe on pe.id = p.person_id
    left join completions c on c.user_id = p.user_id
    left join tasks t on t.id = c.task_id
    group by p.user_id, pe.name
  )
  select
    c.user_id, c.name, c.person_done, c.photo_done,
    c.person_done * 50 + c.photo_done * 200
      + case when c.person_done = totals.person_total then 400 else 0 end
      + case when c.photo_done = totals.photo_total then 1600 else 0 end,
    c.last_scored_at
  from counts c cross join totals
  where public.is_allowed_user()
  order by 5 desc, c.last_scored_at asc nulls last, c.name
$$;

revoke execute on function public.leaderboard() from public, anon;
grant execute on function public.leaderboard() to authenticated;

-- ---------- Photo storage (private; each player can only touch their own folder) ----------

insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

drop policy if exists "own photos insert" on storage.objects;
create policy "own photos insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own photos read" on storage.objects;
create policy "own photos read" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- Seed data ----------

insert into public.people (name, sort) values
  ('Abby', 1), ('Anabel', 2), ('Andrew', 3), ('Blair', 4), ('Jackie', 5),
  ('Jackson', 6), ('Jenna', 7), ('Katie', 8), ('KV', 9), ('Liv', 10), ('Owen', 11)
on conflict (name) do update set sort = excluded.sort;

insert into public.tasks (id, kind, label) values
  ('person-01', 'person', 'Night owl'),
  ('person-02', 'person', 'Morning person'),
  ('person-03', 'person', 'Makes their bed'),
  ('person-04', 'person', 'Rewatched a TV series'),
  ('person-05', 'person', 'Swum in two oceans'),
  ('person-06', 'person', 'Helicopter or hot air balloon'),
  ('person-07', 'person', 'Performed on stage'),
  ('person-08', 'person', '1,000-mile road trip'),
  ('person-09', 'person', 'Lived abroad'),
  ('person-10', 'person', 'Small school'),
  ('person-11', 'person', 'Met someone famous'),
  ('person-12', 'person', 'Bakes bread'),
  ('person-13', 'person', 'Juggling or magic'),
  ('person-14', 'person', 'Garden or houseplants'),
  ('person-15', 'person', 'Ran a race'),
  ('person-16', 'person', 'Skydiving, bungee or zipline'),
  ('photo-01', 'photo', '01 Album cover'),
  ('photo-02', 'photo', '02 Viget logo'),
  ('photo-03', 'photo', '03 Rock paper scissors'),
  ('photo-04', 'photo', '04 Beverage with a teammate'),
  ('photo-05', 'photo', '05 Walk or Uber'),
  ('photo-06', 'photo', '06 Someone from another office'),
  ('photo-07', 'photo', '07 Tourist destination'),
  ('photo-08', 'photo', '08 Museum recreation')
on conflict (id) do update set kind = excluded.kind, label = excluded.label;
