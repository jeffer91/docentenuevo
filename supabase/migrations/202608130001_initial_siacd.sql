-- SIACD · Esquema institucional inicial
-- Compatible con Supabase Auth, Data API y Storage.

create extension if not exists pgcrypto;

create type public.siacd_role as enum ('admin', 'coordinator', 'approver');
create type public.expedient_status as enum (
  'draft', 'in_progress', 'with_gaps', 'ready_for_review',
  'pending_approval', 'returned', 'approved', 'certified', 'archived'
);
create type public.approval_decision as enum ('approved', 'returned', 'rejected');
create type public.evidence_kind as enum ('file', 'screenshot', 'photo', 'link');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.siacd_role not null default 'coordinator',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function public.handle_new_siacd_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), new.email, 'Usuario SIACD'),
    case
      when new.raw_user_meta_data ->> 'siacd_role' in ('admin', 'coordinator', 'approver')
        then (new.raw_user_meta_data ->> 'siacd_role')::public.siacd_role
      else 'coordinator'::public.siacd_role
    end
  )
  on conflict (id) do update
    set full_name = excluded.full_name,
        updated_at = now();
  return new;
end;
$$;

create trigger on_auth_user_created_siacd
after insert on auth.users
for each row execute procedure public.handle_new_siacd_user();

create table public.campuses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.careers (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid references public.campuses(id),
  name text not null,
  modality text,
  active boolean not null default true,
  unique (name, campus_id)
);

create table public.academic_periods (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  starts_on date not null,
  ends_on date not null,
  active boolean not null default true,
  check (ends_on >= starts_on)
);

create table public.coordinator_careers (
  coordinator_id uuid not null references public.profiles(id) on delete cascade,
  career_id uuid not null references public.careers(id) on delete cascade,
  primary key (coordinator_id, career_id)
);

create table public.teachers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  institutional_email text,
  started_institution_on date,
  active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.expedients (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  career_id uuid not null references public.careers(id),
  period_id uuid not null references public.academic_periods(id),
  coordinator_id uuid not null references public.profiles(id),
  subject_names text not null,
  modality text not null,
  schedule_text text,
  activities_start_on date not null,
  planned_close_on date,
  teams_code text,
  telegram_url text,
  status public.expedient_status not null default 'draft',
  operational_score numeric(6,5),
  complementary_score numeric(6,5),
  quality_score numeric(6,5),
  final_score numeric(6,5),
  critical_gaps integer not null default 0,
  followups_count integer not null default 0,
  evidence_hitos_count integer not null default 0,
  submitted_at timestamptz,
  approved_at timestamptz,
  certified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (teacher_id, period_id, career_id),
  check (operational_score is null or operational_score between 0 and 1),
  check (complementary_score is null or complementary_score between 0 and 1),
  check (quality_score is null or quality_score between 0 and 1),
  check (final_score is null or final_score between 0 and 1)
);

create table public.hito_definitions (
  id text primary key,
  title text not null,
  sequence integer not null unique,
  moment text not null,
  purpose text not null,
  final_weight numeric(5,4) not null,
  active boolean not null default true
);

create table public.competency_definitions (
  id text primary key,
  hito_id text not null references public.hito_definitions(id),
  process text not null,
  observable_competency text not null,
  criticality text not null check (criticality in ('Crítica','Importante','Deseable')),
  expected_evidence text,
  relative_weight numeric(5,2) not null check (relative_weight > 0),
  active boolean not null default true
);

create table public.hito_schedules (
  id uuid primary key default gen_random_uuid(),
  expedient_id uuid not null references public.expedients(id) on delete cascade,
  hito_id text not null references public.hito_definitions(id),
  scheduled_on date,
  executed_on date,
  coordinator_validated boolean not null default false,
  unique (expedient_id, hito_id)
);

create table public.competency_scores (
  id uuid primary key default gen_random_uuid(),
  expedient_id uuid not null references public.expedients(id) on delete cascade,
  competency_id text not null references public.competency_definitions(id),
  score smallint check (score between 0 and 4),
  coordinator_observation text,
  evaluated_by uuid references public.profiles(id),
  evaluated_at timestamptz,
  unique (expedient_id, competency_id)
);

create table public.followups (
  id uuid primary key default gen_random_uuid(),
  expedient_id uuid not null references public.expedients(id) on delete cascade,
  happened_on date not null,
  hito_id text references public.hito_definitions(id),
  followup_type text not null,
  process text,
  finding text not null,
  agreed_action text,
  commitment_due_on date,
  responsible text,
  teacher_conformity boolean,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.improvement_actions (
  id uuid primary key default gen_random_uuid(),
  expedient_id uuid not null references public.expedients(id) on delete cascade,
  competency_id text references public.competency_definitions(id),
  action_text text not null,
  responsible text not null,
  due_on date,
  status text not null default 'pending' check (status in ('pending','in_progress','completed','verified')),
  verified_by uuid references public.profiles(id),
  verified_at timestamptz
);

create table public.evidences (
  id uuid primary key default gen_random_uuid(),
  expedient_id uuid not null references public.expedients(id) on delete cascade,
  hito_id text references public.hito_definitions(id),
  kind public.evidence_kind not null,
  title text not null,
  description text,
  external_url text,
  storage_path text,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  happened_on date,
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (external_url is not null or storage_path is not null)
);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  expedient_id uuid not null references public.expedients(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id),
  decision public.approval_decision not null,
  observations text,
  created_at timestamptz not null default now()
);

create table public.generated_documents (
  id uuid primary key default gen_random_uuid(),
  expedient_id uuid not null references public.expedients(id) on delete cascade,
  document_type text not null,
  status text not null default 'generated' check (status in ('generated','signed','archived','void')),
  storage_path text,
  verification_code text unique,
  generated_by uuid not null references public.profiles(id),
  generated_at timestamptz not null default now()
);

create index expedients_coordinator_idx on public.expedients(coordinator_id);
create index expedients_status_idx on public.expedients(status);
create index scores_expedient_idx on public.competency_scores(expedient_id);
create index evidences_expedient_idx on public.evidences(expedient_id);
create index followups_expedient_idx on public.followups(expedient_id);

create function public.current_siacd_role()
returns public.siacd_role
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    (select p.role from public.profiles p where p.id = (select auth.uid()) and p.active),
    'coordinator'::public.siacd_role
  )
$$;

create function public.can_access_expedient(target_id uuid)
returns boolean
language sql stable security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.expedients e
    where e.id = target_id
      and (
        e.coordinator_id = (select auth.uid())
        or public.current_siacd_role() in ('admin','approver')
      )
  )
$$;

alter table public.profiles enable row level security;
alter table public.campuses enable row level security;
alter table public.careers enable row level security;
alter table public.academic_periods enable row level security;
alter table public.coordinator_careers enable row level security;
alter table public.teachers enable row level security;
alter table public.expedients enable row level security;
alter table public.hito_definitions enable row level security;
alter table public.competency_definitions enable row level security;
alter table public.hito_schedules enable row level security;
alter table public.competency_scores enable row level security;
alter table public.followups enable row level security;
alter table public.improvement_actions enable row level security;
alter table public.evidences enable row level security;
alter table public.approvals enable row level security;
alter table public.generated_documents enable row level security;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;

create policy profiles_self_read on public.profiles for select to authenticated using (id = (select auth.uid()) or public.current_siacd_role() = 'admin');
create policy profiles_admin_write on public.profiles for all to authenticated using (public.current_siacd_role() = 'admin') with check (public.current_siacd_role() = 'admin');
create policy catalogs_read on public.campuses for select to authenticated using (true);
create policy careers_read on public.careers for select to authenticated using (true);
create policy periods_read on public.academic_periods for select to authenticated using (true);
create policy hitos_read on public.hito_definitions for select to authenticated using (true);
create policy competencies_read on public.competency_definitions for select to authenticated using (true);
create policy admin_campuses on public.campuses for all to authenticated using (public.current_siacd_role()='admin') with check (public.current_siacd_role()='admin');
create policy admin_careers on public.careers for all to authenticated using (public.current_siacd_role()='admin') with check (public.current_siacd_role()='admin');
create policy admin_periods on public.academic_periods for all to authenticated using (public.current_siacd_role()='admin') with check (public.current_siacd_role()='admin');
create policy admin_hitos on public.hito_definitions for all to authenticated using (public.current_siacd_role()='admin') with check (public.current_siacd_role()='admin');
create policy admin_competencies on public.competency_definitions for all to authenticated using (public.current_siacd_role()='admin') with check (public.current_siacd_role()='admin');
create policy assignments_read on public.coordinator_careers for select to authenticated using (coordinator_id=(select auth.uid()) or public.current_siacd_role()='admin');
create policy assignments_admin on public.coordinator_careers for all to authenticated using (public.current_siacd_role()='admin') with check (public.current_siacd_role()='admin');
create policy teachers_read on public.teachers for select to authenticated using (created_by=(select auth.uid()) or public.current_siacd_role() in ('admin','approver'));
create policy teachers_insert on public.teachers for insert to authenticated with check (created_by=(select auth.uid()) and public.current_siacd_role() in ('coordinator','admin'));
create policy teachers_update on public.teachers for update to authenticated using (created_by=(select auth.uid()) or public.current_siacd_role()='admin') with check (created_by=(select auth.uid()) or public.current_siacd_role()='admin');
create policy expedients_read on public.expedients for select to authenticated using (coordinator_id=(select auth.uid()) or public.current_siacd_role() in ('admin','approver'));
create policy expedients_insert on public.expedients for insert to authenticated with check (coordinator_id=(select auth.uid()) and public.current_siacd_role() in ('coordinator','admin'));
create policy expedients_update on public.expedients for update to authenticated using (coordinator_id=(select auth.uid()) or public.current_siacd_role() in ('admin','approver')) with check (coordinator_id=(select auth.uid()) or public.current_siacd_role() in ('admin','approver'));

create policy hito_schedule_access on public.hito_schedules for all to authenticated using (public.can_access_expedient(expedient_id)) with check (public.can_access_expedient(expedient_id));
create policy score_access on public.competency_scores for all to authenticated using (public.can_access_expedient(expedient_id)) with check (public.can_access_expedient(expedient_id));
create policy followup_access on public.followups for all to authenticated using (public.can_access_expedient(expedient_id)) with check (public.can_access_expedient(expedient_id));
create policy improvement_access on public.improvement_actions for all to authenticated using (public.can_access_expedient(expedient_id)) with check (public.can_access_expedient(expedient_id));
create policy evidence_access on public.evidences for all to authenticated using (public.can_access_expedient(expedient_id)) with check (public.can_access_expedient(expedient_id));
create policy documents_access on public.generated_documents for select to authenticated using (public.can_access_expedient(expedient_id));
create policy documents_generate on public.generated_documents for insert to authenticated with check (public.can_access_expedient(expedient_id));
create policy approvals_read on public.approvals for select to authenticated using (public.can_access_expedient(expedient_id));
create policy approvals_write on public.approvals for insert to authenticated with check (reviewer_id=(select auth.uid()) and public.current_siacd_role() in ('approver','admin'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('siacd-evidence','siacd-evidence',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

create policy evidence_storage_read on storage.objects for select to authenticated
using (bucket_id='siacd-evidence' and public.can_access_expedient(((storage.foldername(name))[1])::uuid));
create policy evidence_storage_insert on storage.objects for insert to authenticated
with check (bucket_id='siacd-evidence' and public.can_access_expedient(((storage.foldername(name))[1])::uuid));
create policy evidence_storage_update on storage.objects for update to authenticated
using (bucket_id='siacd-evidence' and public.can_access_expedient(((storage.foldername(name))[1])::uuid))
with check (bucket_id='siacd-evidence' and public.can_access_expedient(((storage.foldername(name))[1])::uuid));
create policy evidence_storage_delete on storage.objects for delete to authenticated
using (bucket_id='siacd-evidence' and public.can_access_expedient(((storage.foldername(name))[1])::uuid));

insert into public.hito_definitions(id,title,sequence,moment,purpose,final_weight) values
('H1','Inducción',1,'Ingreso / Semana 0','Conocimientos institucionales, accesos y condiciones mínimas',0.10),
('H2','Preparación',2,'Una semana antes','Configuración inicial de SISACAD, EVA, Teams y Telegram',0.20),
('H3','Inicio docencia',3,'Semana 1–2','Verificar implementación inicial y acompañamiento temprano',0.20),
('H4','Seguimiento 1',4,'Primer tercio','Revisar evaluación, calificación, grabaciones y tutorías',0.20),
('H5','Seguimiento 2',5,'Segundo tercio','Verificar autonomía y corrección de brechas',0.20),
('H6','Cierre',6,'Una semana después','Cierre documental, informes y certificación',0.10)
on conflict (id) do nothing;

-- Supabase 2026: las tablas nuevas pueden no exponerse automáticamente.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
