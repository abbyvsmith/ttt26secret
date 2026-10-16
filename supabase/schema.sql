-- Viget Bingo — run this in Supabase → SQL Editor → New query.
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
-- kind, for scoring and security.
create table if not exists public.tasks (
  id    text primary key,
  kind  text not null check (kind in ('person', 'photo'))
);
alter table public.tasks drop column if exists label;

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
  -- orange squares: path in the "photos" storage bucket, e.g. <user>/photo-01-123.jpg
  -- (a small preview sits next to it as <user>/photo-01-123.thumb.jpg)
  album_name     text,
  storage_path   text,
  completed_at   timestamptz not null default now(),
  primary key (user_id, task_id)
);
alter table public.completions drop column if exists drive_file_id;
alter table public.completions drop column if exists drive_url;

-- People who can open the organizer page (see every photo).
create table if not exists public.organizers (
  email text primary key
);

create or replace function public.is_organizer()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organizers where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
$$;

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

-- A blue answer must name a person; an orange answer must point at the
-- player's own photo folder.
create or replace function public.valid_completion(p_task text, p_person int, p_path text)
returns boolean language sql stable as $$
  select case (select kind from public.tasks where id = p_task)
    when 'person' then p_person is not null and p_path is null
    when 'photo'  then p_person is null and p_path like auth.uid()::text || '/%'
    else false
  end
$$;

-- ---------- Row level security ----------

alter table public.people      enable row level security;
alter table public.tasks       enable row level security;
alter table public.players     enable row level security;
alter table public.completions enable row level security;
alter table public.organizers  enable row level security;

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

-- Players see only their own answers and photos; organizers see everyone's.
drop policy if exists "read own completions" on public.completions;
create policy "read own completions" on public.completions
  for select to authenticated using (user_id = auth.uid() or public.is_organizer());

drop policy if exists "write own person answers" on public.completions;
drop policy if exists "update own person answers" on public.completions;

drop policy if exists "insert own answers" on public.completions;
create policy "insert own answers" on public.completions
  for insert to authenticated
  with check (
    user_id = auth.uid() and public.is_allowed_user()
    and public.valid_completion(task_id, person_id, storage_path)
  );

drop policy if exists "update own answers" on public.completions;
create policy "update own answers" on public.completions
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid() and public.valid_completion(task_id, person_id, storage_path)
  );

-- ---------- Sign-up name list ----------
-- The sign-up form runs before anyone is signed in, so it can't read the
-- people table directly. This exposes only first names and whether each is taken.

create or replace function public.people_for_signup()
returns table (id int, name text, claimed boolean)
language sql stable security definer set search_path = public as $$
  select pe.id, pe.name, exists (select 1 from players p where p.person_id = pe.id)
  from people pe
  order by pe.sort
$$;

grant execute on function public.people_for_signup() to anon, authenticated;

-- ---------- Boards ----------
-- Each player's shuffled board (25 task ids in reading order, 'free' in the
-- middle) is saved so the leaderboard can count their bingos.

alter table public.players add column if not exists board text[];

create or replace function public.set_my_board(cells text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(array_length(cells, 1), 0) <> 25 or cells[13] <> 'free'
     or (select array_agg(x order by x) from unnest(cells) x where x <> 'free')
        is distinct from (select array_agg(id order by id) from tasks) then
    raise exception 'invalid board';
  end if;
  update players set board = cells where user_id = auth.uid() and board is null;
end $$;

revoke execute on function public.set_my_board(text[]) from public, anon;
grant execute on function public.set_my_board(text[]) to authenticated;

-- ---------- Leaderboard ----------
-- Points: blue 10, orange 50, 100 per bingo (row, column or diagonal; the
-- free space counts), +200 for all 16 blue, +500 for all 8 orange.
-- Ties: whoever reached their score first (earliest latest-scoring time).
-- Keep in sync with POINTS in src/game/tasks.ts.

drop function if exists public.leaderboard();
create function public.leaderboard()
returns table (
  user_id uuid, name text, person_done int, photo_done int, bingos int,
  points int, last_scored_at timestamptz
)
language sql stable security definer set search_path = public as $$
  with totals as (
    select
      count(*) filter (where kind = 'person')::int as person_total,
      count(*) filter (where kind = 'photo')::int  as photo_total
    from tasks
  ),
  lines (cells) as (
    values
      (array[1, 2, 3, 4, 5]), (array[6, 7, 8, 9, 10]), (array[11, 12, 13, 14, 15]),
      (array[16, 17, 18, 19, 20]), (array[21, 22, 23, 24, 25]),
      (array[1, 6, 11, 16, 21]), (array[2, 7, 12, 17, 22]), (array[3, 8, 13, 18, 23]),
      (array[4, 9, 14, 19, 24]), (array[5, 10, 15, 20, 25]),
      (array[1, 7, 13, 19, 25]), (array[5, 9, 13, 17, 21])
  ),
  counts as (
    select
      p.user_id, pe.name, p.board,
      count(c.task_id) filter (where t.kind = 'person')::int as person_done,
      count(c.task_id) filter (where t.kind = 'photo')::int  as photo_done,
      max(c.completed_at) as last_scored_at
    from players p
    join people pe on pe.id = p.person_id
    left join completions c on c.user_id = p.user_id
    left join tasks t on t.id = c.task_id
    group by p.user_id, pe.name, p.board
  ),
  with_bingos as (
    select
      c.*,
      (
        select count(*)::int from lines l
        where c.board is not null and not exists (
          select 1 from unnest(l.cells) i
          where c.board[i] <> 'free' and not exists (
            select 1 from completions d where d.user_id = c.user_id and d.task_id = c.board[i]
          )
        )
      ) as bingos
    from counts c
  )
  select
    b.user_id, b.name, b.person_done, b.photo_done, b.bingos,
    b.person_done * 10 + b.photo_done * 50 + b.bingos * 100
      + case when b.person_done = totals.person_total then 200 else 0 end
      + case when b.photo_done = totals.photo_total then 500 else 0 end,
    b.last_scored_at
  from with_bingos b cross join totals
  where public.is_allowed_user()
  order by 6 desc, b.last_scored_at asc nulls last, b.name
$$;

revoke execute on function public.leaderboard() from public, anon;
grant execute on function public.leaderboard() to authenticated;

-- ---------- Photo storage (private) ----------
-- Each player can add, view and replace files in their own folder only.
-- Organizers can view every file.

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
  using (
    bucket_id = 'photos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_organizer())
  );

drop policy if exists "own photos delete" on storage.objects;
create policy "own photos delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- Seed data ----------

insert into public.people (name, sort) values
  ('Abby', 1), ('Anabel', 2), ('Andrew', 3), ('Blair', 4), ('Jackie', 5),
  ('Jackson', 6), ('Jenna', 7), ('Katie', 8), ('KV', 9), ('Liv', 10), ('Owen', 11)
on conflict (name) do update set sort = excluded.sort;

insert into public.tasks (id, kind) values
  ('person-01', 'person'), ('person-02', 'person'), ('person-03', 'person'),
  ('person-04', 'person'), ('person-05', 'person'), ('person-06', 'person'),
  ('person-07', 'person'), ('person-08', 'person'), ('person-09', 'person'),
  ('person-10', 'person'), ('person-11', 'person'), ('person-12', 'person'),
  ('person-13', 'person'), ('person-14', 'person'), ('person-15', 'person'),
  ('person-16', 'person'),
  ('photo-01', 'photo'), ('photo-02', 'photo'), ('photo-03', 'photo'), ('photo-04', 'photo'),
  ('photo-05', 'photo'), ('photo-06', 'photo'), ('photo-07', 'photo'), ('photo-08', 'photo')
on conflict (id) do update set kind = excluded.kind;

-- Organizers: add anyone else who should see all photos.
insert into public.organizers (email) values
  ('abby.smith@viget.com')
on conflict (email) do nothing;
