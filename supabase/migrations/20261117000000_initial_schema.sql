create extension if not exists pgcrypto;
create extension if not exists vector;

create table if not exists public.source_documents (
  id uuid primary key default gen_random_uuid(),
  external_key text not null unique,
  title text not null,
  source_type text not null check (source_type in ('transcript', 'spreadsheet', 'pdf', 'email', 'template')),
  release_day date,
  available_at timestamptz not null default now(),
  checksum text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.source_locations (
  id uuid primary key default gen_random_uuid(),
  source_document_id uuid not null references public.source_documents(id) on delete cascade,
  locator text not null,
  quoted_text text not null,
  unique (source_document_id, locator)
);

create table if not exists public.entities (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  canonical_name text not null,
  metadata jsonb not null default '{}'::jsonb,
  unique (entity_type, canonical_name)
);

create table if not exists public.evidence_items (
  id uuid primary key default gen_random_uuid(),
  source_location_id uuid not null references public.source_locations(id) on delete cascade,
  entity_id uuid references public.entities(id) on delete set null,
  evidence_text text not null,
  valid_from date,
  valid_to date,
  available_at timestamptz not null,
  is_sensitive boolean not null default false,
  embedding vector(1536),
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_from is null or valid_to >= valid_from)
);

create index if not exists evidence_items_available_at_idx on public.evidence_items (available_at);
create index if not exists evidence_items_entity_id_idx on public.evidence_items (entity_id);

create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid references public.entities(id) on delete set null,
  claim_text text not null,
  status text not null default 'observed'
    check (status in ('observed', 'inferred', 'assumption', 'superseded')),
  valid_from date,
  valid_to date,
  created_at timestamptz not null default now()
);

create table if not exists public.claim_evidence (
  claim_id uuid not null references public.claims(id) on delete cascade,
  evidence_item_id uuid not null references public.evidence_items(id) on delete cascade,
  relationship text not null check (relationship in ('supports', 'contradicts', 'context')),
  primary key (claim_id, evidence_item_id)
);

create table if not exists public.conflicts (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  description text not null,
  resolution_status text not null default 'open'
    check (resolution_status in ('open', 'resolved', 'accepted_uncertainty')),
  created_at timestamptz not null default now()
);

create table if not exists public.assumptions (
  id uuid primary key default gen_random_uuid(),
  assumption_ref text not null unique,
  statement text not null,
  basis text not null,
  confidence text not null,
  created_on date not null default current_date,
  status text not null default 'active'
    check (status in ('active', 'confirmed', 'revised', 'rejected')),
  what_would_change_mind text,
  supersedes_assumption_id uuid references public.assumptions(id) on delete set null
);

create table if not exists public.employee_profiles (
  id uuid primary key default gen_random_uuid(),
  employee_key text not null unique,
  display_name text not null,
  role_title text not null,
  department text,
  is_active boolean not null default true,
  profile jsonb not null default '{}'::jsonb
);

create table if not exists public.agent_personas (
  id uuid primary key default gen_random_uuid(),
  employee_profile_id uuid not null unique references public.employee_profiles(id) on delete cascade,
  voice_profile jsonb not null default '{}'::jsonb,
  known_topics jsonb not null default '[]'::jsonb,
  known_unknowns jsonb not null default '[]'::jsonb,
  perspective_rules jsonb not null default '[]'::jsonb,
  persona_version text not null
);

create table if not exists public.risk_items (
  id uuid primary key default gen_random_uuid(),
  risk_key text not null unique,
  title text not null,
  description text not null,
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  likelihood text not null default 'unknown'
    check (likelihood in ('high', 'medium', 'low', 'unknown')),
  status text not null default 'open'
    check (status in ('open', 'watch', 'mitigated', 'closed')),
  confidence text,
  first_observed_at timestamptz,
  last_reviewed_at timestamptz,
  owner_entity_id uuid references public.entities(id) on delete set null
);

create table if not exists public.risk_evidence (
  risk_id uuid not null references public.risk_items(id) on delete cascade,
  evidence_item_id uuid not null references public.evidence_items(id) on delete cascade,
  primary key (risk_id, evidence_item_id)
);

create table if not exists public.answer_runs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  as_of_date date,
  answer_text text,
  model_version text,
  policy_outcome text,
  confidence text,
  created_at timestamptz not null default now()
);

create table if not exists public.answer_claims (
  answer_run_id uuid not null references public.answer_runs(id) on delete cascade,
  claim_id uuid not null references public.claims(id) on delete restrict,
  position integer not null check (position >= 0),
  primary key (answer_run_id, claim_id)
);

alter table public.source_documents enable row level security;
alter table public.source_locations enable row level security;
alter table public.entities enable row level security;
alter table public.evidence_items enable row level security;
alter table public.claims enable row level security;
alter table public.claim_evidence enable row level security;
alter table public.conflicts enable row level security;
alter table public.assumptions enable row level security;
alter table public.employee_profiles enable row level security;
alter table public.agent_personas enable row level security;
alter table public.risk_items enable row level security;
alter table public.risk_evidence enable row level security;
alter table public.answer_runs enable row level security;
alter table public.answer_claims enable row level security;
