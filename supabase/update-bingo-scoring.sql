-- One-time update for a project that already ran schema.sql before bingo
-- scoring was added. Paste into Supabase → SQL Editor → New query and run.
-- (schema.sql contains the same thing, so new projects don't need this file.)

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

notify pgrst, 'reload schema';
