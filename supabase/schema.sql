-- Authority Funnel Map (DP-001 v0.6.0): run once in Supabase → SQL Editor → New query → Run.
-- Safe to run again: it only creates what is missing.

create extension if not exists pgcrypto;

create table if not exists public.buyers (
  id               uuid primary key default gen_random_uuid(),
  ghl_contact_id   text unique,
  email            text,
  first_name       text,
  link_version     integer not null default 1,   -- raise by 1 to turn off a buyer's old link
  share_version    integer not null default 1,   -- raise by 1 to turn off old shared-map links
  ai_calls         integer not null default 0,
  map_generations  integer not null default 0,
  created_at       timestamptz not null default now(),
  last_seen_at     timestamptz not null default now()
);
create index if not exists buyers_email_idx on public.buyers (lower(email));
create index if not exists buyers_last_seen_idx on public.buyers (last_seen_at);

create table if not exists public.maps (
  buyer_id    uuid primary key references public.buyers(id) on delete cascade,
  answers     jsonb not null default '{}'::jsonb,
  map         jsonb,
  progress    jsonb,
  shared_at   timestamptz,
  updated_at  timestamptz not null default now()
);

-- Lock the tables: row level security on, and no policies, so only the app's server
-- (using the secret key) can read or write. Nothing in a browser can reach this data.
alter table public.buyers enable row level security;
alter table public.maps enable row level security;
revoke all on public.buyers, public.maps from anon, authenticated;
grant select, insert, update, delete on public.buyers, public.maps to service_role;
