-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query)

create table if not exists profile (
  id int primary key default 1,
  coach_notes text default '',
  updated_at timestamptz default now(),
  constraint single_row check (id = 1)
);

insert into profile (id) values (1) on conflict do nothing;

-- Performance and training goals. Each row is one editable goal.
create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  title text not null,             -- e.g. 'Ultramarathon in December'
  target text,                     -- measurable target, e.g. '50K finish'
  deadline date,
  status text not null default 'active',  -- active | achieved | dropped
  sort int default 0,
  created_at timestamptz default now()
);

-- Hard rules the coach must respect. Each row is one editable rule.
create table if not exists guardrails (
  id uuid primary key default gen_random_uuid(),
  rule text not null,
  category text default 'general', -- injury | programming | logging | nutrition | general
  active boolean not null default true,
  sort int default 0,
  created_at timestamptz default now()
);

create table if not exists workouts (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  type text not null,             -- run, ride, lift, swim, yoga, etc.
  name text,
  duration_min numeric,
  distance_km numeric,
  avg_hr numeric,
  effort int,                     -- RPE 1-10
  notes text,
  source text not null default 'manual',  -- manual | strava
  strava_id bigint unique,
  created_at timestamptz default now()
);

create index if not exists workouts_date_idx on workouts (date desc);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  role text not null,             -- user | assistant
  content text not null,
  created_at timestamptz default now()
);

create index if not exists messages_created_idx on messages (created_at);

create table if not exists strava_tokens (
  id int primary key default 1,
  access_token text,
  refresh_token text,
  expires_at bigint,
  athlete_id bigint,
  updated_at timestamptz default now(),
  constraint single_row check (id = 1)
);
