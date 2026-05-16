create extension if not exists pgcrypto;

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  browser_id text not null,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint participants_display_name_not_blank check (char_length(trim(display_name)) between 1 and 32),
  constraint participants_browser_name_unique unique (browser_id, display_name)
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
