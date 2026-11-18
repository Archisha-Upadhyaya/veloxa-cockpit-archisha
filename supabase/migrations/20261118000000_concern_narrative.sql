-- Each concern carries three distinct parts so the CEO never reads the same
-- paragraph twice: what the records show, what we infer, and the next move.
alter table public.risk_items
  add column if not exists observed text,
  add column if not exists inference text,
  add column if not exists recommended_action text;
