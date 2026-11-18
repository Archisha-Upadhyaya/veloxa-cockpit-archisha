-- The most recent company health checks, so the overview can show the last
-- result without re-running the (model-backed) check on every visit.
create table if not exists public.health_checks (
  id uuid primary key default gen_random_uuid(),
  checked_at timestamptz not null default now(),
  mode text not null,
  model text,
  areas jsonb not null default '[]'::jsonb
);

create index if not exists health_checks_checked_at_idx
  on public.health_checks (checked_at desc);

alter table public.health_checks enable row level security;
