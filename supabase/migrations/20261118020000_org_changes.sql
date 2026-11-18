-- Planned and confirmed reporting-line changes, applied to the directory on
-- their effective date. Keeping them as dated rows (instead of editing the HR
-- master) means a reorganisation never breaks the reporting tree, and a
-- tentative plan can be recorded before the people or dates are final.
create table if not exists public.org_changes (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('employee', 'department')),
  scope_key text not null,
  new_manager_key text,
  new_manager_title text,
  effective_from date,
  effective_note text,
  status text not null default 'tentative'
    check (status in ('tentative', 'confirmed', 'cancelled')),
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.org_changes enable row level security;
