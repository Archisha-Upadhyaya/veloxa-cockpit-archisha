-- Why each record supports the concern it is linked to, written by the
-- analysis at link time so the CEO can judge the evidence, not just see it.
alter table public.risk_evidence
  add column if not exists rationale text;

-- Analysis also reports what is going well. Both live in risk_items so they
-- share evidence links, review dates and the as-of filter.
alter table public.risk_items
  add column if not exists polarity text not null default 'concern',
  -- Department the finding belongs to, and the employee best placed to
  -- discuss it; both chosen by the analysis from the stored directory.
  add column if not exists area text,
  add column if not exists owner_employee_key text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'risk_items_polarity_check'
  ) then
    alter table public.risk_items
      add constraint risk_items_polarity_check
      check (polarity in ('concern', 'positive'));
  end if;
end $$;
