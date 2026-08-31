-- SIACD · documentación institucional vigente
-- Dos informes por expediente y registro mensual de asistencia a inducción.

create table if not exists public.induction_attendance_registers (
  id uuid primary key default gen_random_uuid(),
  career_id uuid not null references public.careers(id) on delete restrict,
  year integer not null check (year between 2000 and 2100),
  month integer not null check (month between 1 and 12),
  topic text not null default 'Inducción de los procesos académicos a docentes nuevos',
  event_date date,
  trainer text,
  immediate_supervisor text,
  institutional_code text not null,
  verification_code text unique,
  version integer not null default 1 check (version > 0),
  storage_path text,
  generated_by_staff_id uuid references public.siacd_staff(id) on delete set null,
  generated_at timestamptz not null default now(),
  unique (career_id, year, month, version)
);

create index if not exists induction_attendance_month_idx
  on public.induction_attendance_registers(career_id, year desc, month desc, version desc);

create table if not exists public.induction_attendance_members (
  id uuid primary key default gen_random_uuid(),
  register_id uuid not null references public.induction_attendance_registers(id) on delete cascade,
  teacher_id uuid references public.teachers(id) on delete set null,
  position integer not null check (position > 0),
  national_id text,
  full_name text not null,
  unit_career text,
  attended boolean not null default true,
  unique (register_id, position)
);

create index if not exists induction_attendance_members_register_idx
  on public.induction_attendance_members(register_id, position);

alter table public.induction_attendance_registers enable row level security;
alter table public.induction_attendance_members enable row level security;

drop policy if exists public_direct_access on public.induction_attendance_registers;
drop policy if exists public_direct_access on public.induction_attendance_members;

create policy public_direct_access on public.induction_attendance_registers
  for all to anon, authenticated
  using (true)
  with check (true);

create policy public_direct_access on public.induction_attendance_members
  for all to anon, authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.induction_attendance_registers to anon, authenticated;
grant select, insert, update, delete on public.induction_attendance_members to anon, authenticated;

create or replace function public.public_verify_siacd_document(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'valid', gd.status <> 'void',
    'authenticity', case when gd.status = 'void' then 'Documento anulado' else 'Documento auténtico' end,
    'code', gd.verification_code,
    'document_type', gd.document_type,
    'report_name', case gd.document_type
      when 'informe_induccion' then 'Informe de Inducción de los Procesos Académicos a Docente: Nuevos'
      when 'informe_final' then 'Informe Final de Acompañamiento-Docente: Nuevos'
      when 'informe_areas' then 'Informe de Áreas'
      when 'informe_antes' then 'Informe Antes'
      when 'informe_durante' then 'Informe Durante'
      when 'informe_despues' then 'Informe Después'
      when 'informe_consolidado' then 'Informe Consolidado'
      else gd.document_type
    end,
    'report_status', case
      when coalesce(gd.observation, '') ilike 'OFICIAL%' then 'OFICIAL'
      else 'BORRADOR'
    end,
    'teacher', t.full_name,
    'career', c.name,
    'subject', e.subject_names,
    'period', ap.name,
    'modality', e.modality,
    'issued_on', coalesce(gd.issued_on, gd.generated_at::date),
    'generated_at', gd.generated_at,
    'version', coalesce((regexp_match(coalesce(gd.observation, ''), 'Versión[[:space:]]+([0-9]+)'))[1], '1'),
    'document_record_status', gd.status
  )
  into v_result
  from public.generated_documents gd
  join public.expedients e on e.id = gd.expedient_id
  left join public.teachers t on t.id = e.teacher_id
  left join public.careers c on c.id = e.career_id
  left join public.academic_periods ap on ap.id = e.period_id
  where gd.verification_code = nullif(trim(p_code), '')
  limit 1;

  if v_result is not null then
    return v_result;
  end if;

  select jsonb_build_object(
    'valid', true,
    'authenticity', 'Documento auténtico',
    'code', ar.verification_code,
    'document_type', 'registro_asistencia_induccion',
    'report_name', 'Registro de Asistencia a la Inducción',
    'report_status', 'REGISTRO',
    'teacher', null,
    'career', c.name,
    'subject', ar.topic,
    'period', to_char(make_date(ar.year, ar.month, 1), 'YYYY-MM'),
    'modality', null,
    'issued_on', coalesce(ar.event_date, ar.generated_at::date),
    'generated_at', ar.generated_at,
    'version', ar.version::text,
    'document_record_status', 'generated'
  )
  into v_result
  from public.induction_attendance_registers ar
  join public.careers c on c.id = ar.career_id
  where ar.verification_code = nullif(trim(p_code), '')
  limit 1;

  if v_result is not null then
    return v_result;
  end if;

  return jsonb_build_object(
    'valid', false,
    'authenticity', 'No se encontró un documento vigente con este código.'
  );
end;
$$;

revoke all on function public.public_verify_siacd_document(text) from public;
grant execute on function public.public_verify_siacd_document(text) to anon, authenticated;

comment on table public.induction_attendance_registers is
  'Registro institucional mensual de asistencia a la inducción, versionado por carrera, año y mes.';
comment on table public.induction_attendance_members is
  'Asistentes incluidos en cada versión del registro mensual de inducción.';
