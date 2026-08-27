-- SIACD · Escenario DEMO completo para revisión documental
-- Crea un coordinador de prueba con PIN 5626, una carrera/periodo aislados,
-- un docente DEMO con expediente completo y evidencias visuales ficticias.
-- Todo queda claramente identificado como DEMO para no confundirse con información institucional real.

alter table public.evidence_submission_items
  drop constraint if exists evidence_submission_items_payload_check;

alter table public.evidence_submission_items
  add constraint evidence_submission_items_payload_check check (
    (kind = 'link' and external_url is not null and storage_path is null)
    or
    (
      kind = 'image'
      and file_name is not null
      and (
        (storage_path is not null and external_url is null)
        or
        (storage_path is null and external_url is not null)
      )
    )
    or
    (kind = 'file' and storage_path is not null and external_url is null and file_name is not null)
  );

create or replace function public.staff_apply_demo_images(
  p_expedient_id uuid,
  p_staff_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_teacher_name text;
  v_count integer := 0;
begin
  if not private.staff_can_manage_expedient(p_expedient_id, p_staff_id) then
    raise exception 'not_allowed';
  end if;

  select t.full_name
  into v_teacher_name
  from public.expedients e
  join public.teachers t on t.id = e.teacher_id
  where e.id = p_expedient_id;

  if v_teacher_name is null or upper(v_teacher_name) not like '%DEMO%' then
    raise exception 'demo_teacher_required';
  end if;

  with demo_items as (
    select
      esi.id,
      row_number() over (
        order by er.hito_id, er.criterion_id, es.version, esi.position
      ) as rn
    from public.evidence_submission_items esi
    join public.evidence_submissions es on es.id = esi.submission_id
    join public.evidence_requests er on er.id = es.request_id
    where er.expedient_id = p_expedient_id
      and es.teacher_comment = '[DEMO SIACD]'
  )
  update public.evidence_submission_items esi
  set
    kind = 'image',
    file_name = format('evidencia-demo-%s.svg', ((di.rn - 1) % 3) + 1),
    mime_type = 'image/svg+xml',
    size_bytes = 24576,
    storage_path = null,
    external_url = format(
      'https://docentenuevo.pages.dev/demo/evidencia-%s.svg',
      ((di.rn - 1) % 3) + 1
    )
  from demo_items di
  where esi.id = di.id;

  get diagnostics v_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'images', v_count,
    'message', 'Evidencias visuales DEMO preparadas.'
  );
end;
$$;

revoke all on function public.staff_apply_demo_images(uuid, uuid) from public;
grant execute on function public.staff_apply_demo_images(uuid, uuid) to anon, authenticated;

do $$
declare
  v_staff_id uuid := '00000000-0000-4000-8000-000000005626'::uuid;
  v_career_id uuid := '00000000-0000-4000-8000-00000000d001'::uuid;
  v_period_id uuid := '00000000-0000-4000-8000-00000000d002'::uuid;
  v_teacher_id uuid := '00000000-0000-4000-8000-00000000d003'::uuid;
  v_expedient_id uuid := '00000000-0000-4000-8000-00000000d004'::uuid;
begin
  insert into public.siacd_staff(id, full_name, role, active, created_at, updated_at)
  values (
    v_staff_id,
    'COORDINADOR DEMO SIACD',
    'coordinator',
    true,
    now(),
    now()
  )
  on conflict (id) do update
  set full_name = excluded.full_name,
      role = 'coordinator',
      active = true,
      updated_at = now();

  insert into private.coordinator_pins(staff_id, pin_hash, changed_at)
  values (
    v_staff_id,
    extensions.crypt('5626', extensions.gen_salt('bf', 10)),
    now()
  )
  on conflict (staff_id) do update
  set pin_hash = excluded.pin_hash,
      changed_at = excluded.changed_at;

  insert into public.careers(id, campus_id, name, modality, active)
  values (
    v_career_id,
    null,
    'DEMO · REVISIÓN DOCUMENTAL SIACD',
    'Presencial',
    true
  )
  on conflict (id) do update
  set name = excluded.name,
      modality = excluded.modality,
      active = true;

  delete from public.siacd_staff_careers
  where career_id = v_career_id
    and staff_id <> v_staff_id;

  insert into public.siacd_staff_careers(staff_id, career_id)
  values (v_staff_id, v_career_id)
  on conflict (staff_id, career_id) do nothing;

  insert into public.academic_periods(id, name, starts_on, ends_on, active)
  values (
    v_period_id,
    'DEMO SIACD 2026',
    date '2026-01-01',
    date '2026-12-31',
    true
  )
  on conflict (id) do update
  set name = excluded.name,
      starts_on = excluded.starts_on,
      ends_on = excluded.ends_on,
      active = true;

  insert into public.teachers(
    id,
    full_name,
    institutional_email,
    started_institution_on,
    active,
    created_by,
    created_at,
    updated_at,
    national_id
  )
  values (
    v_teacher_id,
    'DOCENTE DEMO SIACD',
    'docente.demo@demo.siacd.local',
    date '2026-01-05',
    true,
    null,
    now(),
    now(),
    '0000000000'
  )
  on conflict (id) do update
  set full_name = excluded.full_name,
      institutional_email = excluded.institutional_email,
      started_institution_on = excluded.started_institution_on,
      active = true,
      national_id = excluded.national_id,
      updated_at = now();

  insert into public.teacher_access(
    teacher_id,
    email,
    active,
    created_at,
    updated_at
  )
  values (
    v_teacher_id,
    'docente.demo@demo.siacd.local',
    true,
    now(),
    now()
  )
  on conflict (teacher_id) do update
  set email = excluded.email,
      active = true,
      updated_at = now();

  delete from public.expedients
  where teacher_id = v_teacher_id
    and id <> v_expedient_id;

  insert into public.expedients(
    id,
    teacher_id,
    career_id,
    period_id,
    coordinator_id,
    coordinator_staff_id,
    subject_names,
    modality,
    schedule_text,
    activities_start_on,
    planned_close_on,
    teams_code,
    telegram_url,
    status,
    operational_score,
    complementary_score,
    quality_score,
    final_score,
    submitted_at,
    approved_at,
    created_at,
    updated_at
  )
  values (
    v_expedient_id,
    v_teacher_id,
    v_career_id,
    v_period_id,
    null,
    v_staff_id,
    'ASIGNATURA DEMO · REVISIÓN DOCUMENTAL',
    'Presencial',
    'Lunes a viernes · 18:00 a 20:00 · Horario ficticio',
    date '2026-01-05',
    date '2026-12-15',
    'DEMO-SIACD',
    'https://t.me/demo_siacd_no_real',
    'approved',
    1,
    1,
    1,
    1,
    now() - interval '10 days',
    now() - interval '2 days',
    now(),
    now()
  )
  on conflict (id) do update
  set teacher_id = excluded.teacher_id,
      career_id = excluded.career_id,
      period_id = excluded.period_id,
      coordinator_id = null,
      coordinator_staff_id = excluded.coordinator_staff_id,
      subject_names = excluded.subject_names,
      modality = excluded.modality,
      schedule_text = excluded.schedule_text,
      activities_start_on = excluded.activities_start_on,
      planned_close_on = excluded.planned_close_on,
      teams_code = excluded.teams_code,
      telegram_url = excluded.telegram_url,
      status = 'approved',
      operational_score = 1,
      complementary_score = 1,
      quality_score = 1,
      final_score = 1,
      submitted_at = excluded.submitted_at,
      approved_at = excluded.approved_at,
      updated_at = now();

  insert into public.hito_schedules(
    expedient_id,
    hito_id,
    scheduled_on,
    executed_on,
    coordinator_validated
  )
  select
    v_expedient_id,
    hd.id,
    current_date - (8 - hd.sequence),
    current_date - (7 - hd.sequence),
    true
  from public.hito_definitions hd
  where hd.active
  on conflict (expedient_id, hito_id) do update
  set scheduled_on = excluded.scheduled_on,
      executed_on = excluded.executed_on,
      coordinator_validated = true;

  perform public.staff_prepare_demo_report_fixture(
    v_expedient_id,
    v_staff_id,
    'approved'
  );

  perform public.staff_apply_demo_images(
    v_expedient_id,
    v_staff_id
  );

  update public.expedients
  set status = 'approved',
      operational_score = 1,
      complementary_score = 1,
      quality_score = 1,
      final_score = 1,
      submitted_at = coalesce(submitted_at, now() - interval '10 days'),
      approved_at = coalesce(approved_at, now() - interval '2 days'),
      updated_at = now()
  where id = v_expedient_id;
end $$;

comment on function public.staff_apply_demo_images(uuid, uuid) is
  'Convierte las evidencias del fixture DEMO en imágenes SVG ficticias alojadas como recursos públicos de la app.';
