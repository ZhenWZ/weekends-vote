create extension if not exists pgcrypto;

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  browser_id text,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint participants_display_name_not_blank check (char_length(trim(display_name)) between 1 and 32),
  constraint participants_display_name_unique unique (display_name)
);

create table if not exists public.ideas (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  author_id uuid not null references public.participants(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ideas_title_not_blank check (char_length(trim(title)) between 1 and 80),
  constraint ideas_description_length check (description is null or char_length(description) <= 420)
);

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.ideas(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint votes_one_per_participant unique (idea_id, participant_id)
);

-- Migration for older installs that used browser_id + display_name as identity.
-- Identity is now username-first: one display_name maps to one participant.
update public.participants
set display_name = trim(display_name)
where display_name <> trim(display_name);

with canonical as (
  select
    display_name,
    (array_agg(id order by created_at, id))[1] as canonical_id
  from public.participants
  group by display_name
),
participant_map as (
  select p.id as participant_id, c.canonical_id
  from public.participants p
  join canonical c on c.display_name = p.display_name
),
ranked_votes as (
  select
    v.id,
    row_number() over (
      partition by v.idea_id, pm.canonical_id
      order by v.created_at, v.id
    ) as vote_rank
  from public.votes v
  join participant_map pm on pm.participant_id = v.participant_id
)
delete from public.votes v
using ranked_votes rv
where v.id = rv.id
  and rv.vote_rank > 1;

with canonical as (
  select
    display_name,
    (array_agg(id order by created_at, id))[1] as canonical_id
  from public.participants
  group by display_name
),
participant_map as (
  select p.id as participant_id, c.canonical_id
  from public.participants p
  join canonical c on c.display_name = p.display_name
)
update public.votes v
set participant_id = pm.canonical_id
from participant_map pm
where v.participant_id = pm.participant_id
  and pm.participant_id <> pm.canonical_id;

with canonical as (
  select
    display_name,
    (array_agg(id order by created_at, id))[1] as canonical_id
  from public.participants
  group by display_name
),
participant_map as (
  select p.id as participant_id, c.canonical_id
  from public.participants p
  join canonical c on c.display_name = p.display_name
)
update public.ideas i
set author_id = pm.canonical_id
from participant_map pm
where i.author_id = pm.participant_id
  and pm.participant_id <> pm.canonical_id;

with canonical as (
  select
    display_name,
    (array_agg(id order by created_at, id))[1] as canonical_id
  from public.participants
  group by display_name
),
participant_map as (
  select p.id as participant_id, c.canonical_id
  from public.participants p
  join canonical c on c.display_name = p.display_name
)
delete from public.participants p
using participant_map pm
where p.id = pm.participant_id
  and pm.participant_id <> pm.canonical_id;

alter table if exists public.participants
  drop constraint if exists participants_browser_name_unique;

alter table if exists public.participants
  alter column browser_id drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.participants'::regclass
      and conname = 'participants_display_name_unique'
  ) then
    alter table public.participants
      add constraint participants_display_name_unique unique (display_name);
  end if;
end;
$$;

create index if not exists ideas_created_at_idx on public.ideas(created_at desc);
create index if not exists votes_idea_id_idx on public.votes(idea_id);
create index if not exists votes_participant_id_idx on public.votes(participant_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists participants_set_updated_at on public.participants;
create trigger participants_set_updated_at
before update on public.participants
for each row execute function public.set_updated_at();

drop trigger if exists ideas_set_updated_at on public.ideas;
create trigger ideas_set_updated_at
before update on public.ideas
for each row execute function public.set_updated_at();

alter table public.participants enable row level security;
alter table public.ideas enable row level security;
alter table public.votes enable row level security;

drop policy if exists "Anyone can read participants" on public.participants;
create policy "Anyone can read participants"
on public.participants for select
using (true);

drop policy if exists "Anyone can create participants" on public.participants;
create policy "Anyone can create participants"
on public.participants for insert
with check (true);

drop policy if exists "Anyone can refresh participants" on public.participants;
create policy "Anyone can refresh participants"
on public.participants for update
using (true)
with check (true);

drop policy if exists "Anyone can read ideas" on public.ideas;
create policy "Anyone can read ideas"
on public.ideas for select
using (true);

drop policy if exists "Anyone can create ideas" on public.ideas;
create policy "Anyone can create ideas"
on public.ideas for insert
with check (true);

drop policy if exists "Anyone can update ideas" on public.ideas;
create policy "Anyone can update ideas"
on public.ideas for update
using (true)
with check (true);

drop policy if exists "Anyone can read votes" on public.votes;
create policy "Anyone can read votes"
on public.votes for select
using (true);

drop policy if exists "Anyone can create votes" on public.votes;
create policy "Anyone can create votes"
on public.votes for insert
with check (true);

drop policy if exists "Anyone can delete votes" on public.votes;
create policy "Anyone can delete votes"
on public.votes for delete
using (true);
