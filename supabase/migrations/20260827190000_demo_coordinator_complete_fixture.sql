-- SIACD · Escenario DEMO completo para revisión documental
-- Crea un coordinador de prueba con PIN 5626 y lo vincula al docente DEMO.
-- Si el docente DEMO no existe en una instalación nueva, crea un fallback aislado.
-- Todo queda identificado como DEMO para no confundirse con información institucional real.

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
  v_staff_id uuid;
  v_teacher_id uuid;
  v_expedient_id uuid;
  v_career_id uuid;
  v_period_id uuid;
begin
  select s.id
  into v_staff_id
  from public.siacd_staff s
  where upper(trim(s.full_name)) = 'COORDINADOR DEMO SIACD'
    and s.role::text = 'coordinator'
  order by s.created_at
  limit 1;

  if v_staff_id is null then
    insert into public.siacd_staff(full_name, role, active, created_at, updated_at)
    values ('COORDINADOR DEMO SIACD', 'coordinator', true, now(), now())
    returning id into v_staff_id;
  else
    update public.siacd_staff
    set active = true,
        updated_at = now()
    where id = v_staff_id;
  end if;

  insert into private.coordinator_pins(staff_id, pin_hash, changed_at)
  values (
    v_staff_id,
    extensions.crypt('5626', extensions.gen_salt('bf', 10)),
    now()
  )
  on conflict (staff_id) do update
  set pin_hash = excluded.pin_hash,
      changed_at = excluded.changed_at;

  select t.id
  into v_teacher_id
  from public.teachers t
  where t.national_id = '9999999999'
     or upper(t.full_name) like '%DEMO%'
  order by
    case when t.national_id = '9999999999' then 0 else 1 end,
    t.created_at
  limit 1;

  if v_teacher_id is null then
    insert into public.teachers(
      full_name,
      institutional_email,
      started_institution_on,
      active,
      created_by,
      national_id,
      created_at,
      updated_at
    )
    values (
      'DOCENTE DEMO SIACD',
      'docente.demo@demo.siacd.local',
      date '2026-01-05',
      true,
      null,
      '9999999999',
      now(),
      now()
    )
    returning id into v_teacher_id;
  end if;

  update public.teachers
  set active = true,
      updated_at = now()
  where id = v_teacher_id;

  insert into public.teacher_access(
    teacher_id,
    email,
    active,
    created_at,
    updated_at
  )
  select
    v_teacher_id,
    coalesce(nullif(lower(trim(t.institutional_email)), ''), 'docente.demo@demo.siacd.local'),
    true,
    now(),
    now()
  from public.teachers t
  where t.id = v_teacher_id
  on conflict (teacher_id) do update
  set active = true,
      updated_at = now();

  select e.id
  into v_expedient_id
  from public.expedients e
  where e.teacher_id = v_teacher_id
  order by e.created_at desc
  limit 1;

  if v_expedient_id is null then
    select c.id into v_career_id
    from public.careers c
    where c.active
    order by c.name
    limit 1;

    select ap.id into v_period_id
    from public.academic_periods ap
    where ap.active
    order by ap.starts_on desc
    limit 1;

    if v_career_id is null or v_period_id is null then
      raise exception 'demo_catalog_required';
    end if;

    insert into public.expedients(
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
    returning id into v_expedient_id;
  else
    update public.expedients
    set coordinator_staff_id = v_staff_id,
        status = 'approved',
        operational_score = 1,
        complementary_score = 1,
        quality_score = 1,
        final_score = 1,
        submitted_at = coalesce(submitted_at, now() - interval '10 days'),
        approved_at = coalesce(approved_at, now() - interval '2 days'),
        updated_at = now()
    where id = v_expedient_id;
  end if;

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
  set coordinator_staff_id = v_staff_id,
      status = 'approved',
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
