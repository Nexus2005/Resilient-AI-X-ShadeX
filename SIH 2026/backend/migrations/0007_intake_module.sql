-- Module 1: intelligent application intake gateway
-- Checklists, classification corrections, normalized derivatives and intake manifests.

create table if not exists public.intake_checklists (
  id               uuid primary key default gen_random_uuid(),
  code             text not null,
  name             text not null,
  category_code    text not null references public.application_categories(code),
  academic_year    text not null,
  version          integer not null default 1,
  is_provisional   boolean not null default true,
  source_reference text,
  effective_from   date not null default current_date,
  notes            text,
  created_at       timestamptz not null default now(),
  unique (code, version)
);
create index if not exists idx_intake_checklists_scope
  on public.intake_checklists(category_code, academic_year, version desc);

create table if not exists public.intake_checklist_items (
  id                     uuid primary key default gen_random_uuid(),
  checklist_id           uuid not null references public.intake_checklists(id) on delete cascade,
  document_category_code text not null references public.document_categories(code),
  label                  text not null,
  requirement            text not null check (requirement in ('required', 'optional')),
  expected_count         integer not null default 1,
  guidance               text,
  sort_order             integer not null default 100,
  unique (checklist_id, document_category_code)
);
create index if not exists idx_intake_checklist_items_checklist
  on public.intake_checklist_items(checklist_id, sort_order);

create table if not exists public.document_corrections (
  id                  uuid primary key default gen_random_uuid(),
  document_id         uuid not null references public.documents(id) on delete cascade,
  document_version_id uuid references public.document_versions(id) on delete set null,
  original_category   text,
  original_confidence numeric(5, 4),
  corrected_category  text not null references public.document_categories(code),
  reviewer_id         uuid references public.profiles(id) on delete set null,
  reason              text,
  created_at          timestamptz not null default now()
);
create index if not exists idx_document_corrections_document
  on public.document_corrections(document_id, created_at desc);

create table if not exists public.document_derivatives (
  id                  uuid primary key default gen_random_uuid(),
  document_version_id uuid not null references public.document_versions(id) on delete cascade,
  kind                text not null,
  storage_backend     text not null,
  storage_path        text not null,
  sha256              text not null,
  size_bytes          bigint not null,
  note                text,
  created_at          timestamptz not null default now()
);
create index if not exists idx_document_derivatives_version
  on public.document_derivatives(document_version_id);

create table if not exists public.intake_manifests (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  version        integer not null,
  payload        jsonb not null,
  sha256         text not null,
  generated_by   uuid references public.profiles(id) on delete set null,
  generated_at   timestamptz not null default now(),
  unique (application_id, version)
);
create index if not exists idx_intake_manifests_application
  on public.intake_manifests(application_id, version desc);

alter table public.document_versions
  add column if not exists ingest_meta jsonb not null default '{}'::jsonb;

alter table public.document_pages
  add column if not exists render_hint jsonb not null default '{}'::jsonb;
