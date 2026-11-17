alter table public.source_documents
  add column if not exists content_hash text,
  add column if not exists relative_path text,
  add column if not exists ingestion_status text not null default 'ready'
    check (ingestion_status in ('pending', 'ready', 'failed'));

create unique index if not exists source_documents_relative_path_uidx
  on public.source_documents (relative_path);

alter table public.risk_items
  add column if not exists fingerprint text,
  add column if not exists origin text not null default 'analysis'
    check (origin in ('bootstrap', 'analysis')),
  add column if not exists evidence_count integer not null default 0;

update public.risk_items
set origin = 'bootstrap'
where risk_key like 'day1:%';

create unique index if not exists risk_items_fingerprint_uidx
  on public.risk_items (fingerprint)
  where fingerprint is not null;

create table if not exists public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null check (status in ('running', 'completed', 'failed')),
  files_seen integer not null default 0,
  files_changed integer not null default 0,
  chunks_created integer not null default 0,
  embeddings_created integer not null default 0,
  error_message text
);

create table if not exists public.analysis_runs (
  id uuid primary key default gen_random_uuid(),
  ingestion_run_id uuid references public.ingestion_runs(id) on delete set null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null check (status in ('running', 'completed', 'failed')),
  evidence_considered integer not null default 0,
  risks_created integer not null default 0,
  model_version text,
  error_message text
);

alter table public.ingestion_runs enable row level security;
alter table public.analysis_runs enable row level security;

create or replace function public.match_evidence(
  query_embedding vector(1536),
  match_threshold real default 0.72,
  match_count integer default 8,
  as_of timestamptz default now()
)
returns table (
  evidence_id uuid,
  evidence_text text,
  similarity real,
  source_document_id uuid,
  source_title text,
  source_type text,
  locator text,
  quoted_text text,
  available_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    evidence.id,
    evidence.evidence_text,
    (1 - (evidence.embedding <=> query_embedding))::real,
    document.id,
    document.title,
    document.source_type,
    location.locator,
    location.quoted_text,
    evidence.available_at
  from public.evidence_items as evidence
  join public.source_locations as location on location.id = evidence.source_location_id
  join public.source_documents as document on document.id = location.source_document_id
  where evidence.embedding is not null
    and evidence.is_sensitive = false
    and evidence.available_at <= as_of
    and 1 - (evidence.embedding <=> query_embedding) >= match_threshold
  order by evidence.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 50);
$$;
