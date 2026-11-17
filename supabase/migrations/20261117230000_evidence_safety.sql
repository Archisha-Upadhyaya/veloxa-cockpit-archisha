-- Individual payroll data must never be embedded, retrieved, or shown to the
-- CEO. This migration repairs databases that were ingested before the
-- sensitivity classifier existed.

update public.evidence_items as evidence
set is_sensitive = true,
    embedding = null
from public.source_locations as location
join public.source_documents as document
  on document.id = location.source_document_id
where evidence.source_location_id = location.id
  and (
    document.title ~* 'payroll[[:space:]_-]*register'
    or document.title ~* 'payslip'
  );

update public.evidence_items
set is_sensitive = true,
    embedding = null
where evidence_text ~* 'payroll[[:space:]_-]*register'
  or evidence_text ~* 'VX[0-9]{3}[[:space:]]*,[^,\n]+,[[:space:]]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[[:space:]-]?20[0-9]{2}'
  or (
    evidence_text ~* '(gross[[:space:]]*\(rs|net[[:space:]]*\(rs|days[[:space:]]+payable|processed[[:space:]]+by)'
    and evidence_text ~* 'VX[0-9]{3}'
  );

-- A sensitive row is never a retrieval candidate.
update public.evidence_items
set embedding = null
where is_sensitive = true
  and embedding is not null;

comment on column public.evidence_items.is_sensitive is
  'Sensitive evidence (individual pay, payroll registers, payslips) is never embedded, retrieved, prompted, or shown to the CEO.';
