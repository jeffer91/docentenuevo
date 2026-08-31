-- SIACD · Corrección de creación de proceso docente
-- Evita la ambigüedad entre el parámetro de salida expedient_id y la columna homónima
-- de hito_schedules dentro de ON CONFLICT.

create or replace function public.teacher_create_process_from_onboarding(
  p_token text,
  p_period_id uuid,
  p_subject_names text,
  p_modality text,
  p_activities_start_on date
)
returns table (
  expedient_id uuid,
  process_created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_teacher_id uuid;
  v_assignment public.teacher_onboarding_assignments%rowtype;
  v_coordinator_id uuid;
  v_expedient_id uuid;
  v_created boolean := false;
begin
  if p_token is null
     or length(p_token) < 40
     or p_period_id is null
     or p_activities_start_on is null then
    raise exception 'invalid_request';
  end if;

  if length(trim(coalesce(p_subject_names, ''))) < 2
     or length(trim(coalesce(p_subject_names, ''))) > 500 then
    raise exception 'invalid_subject';
  end if;

  if p_modality not in ('Presencial', 'Híbrida', 'Online', 'Intensiva') then
    raise exception 'invalid_modality';
  end if;

  select s.teacher_id
    into v_teacher_id
  from public.teacher_device_sessions s
  join public.teacher_access a
    on a.teacher_id = s.teacher_id
   and a.active
  join public.teachers t
    on t.id = s.teacher_id
   and t.active
  where s.token_hash = extensions.digest(p_token, 'sha256')
    and s.revoked_at is null
    and s.expires_at > now()
  limit 1;

  if not found then
    raise exception 'invalid_session';
  end if;

  if not exists (
    select 1
    from public.academic_periods p
    where p.id = p_period_id
      and p.active
  ) then
    raise exception 'period_not_available';
  end if;

  select toa.*
    into v_assignment
  from public.teacher_onboarding_assignments toa
  where toa.teacher_id = v_teacher_id
    and toa.status = 'pending'
  order by toa.created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'onboarding_not_found';
  end if;

  select sc.staff_id
    into v_coordinator_id
  from public.siacd_staff_careers sc
  join public.siacd_staff s
    on s.id = sc.staff_id
   and s.active
   and s.role = 'coordinator'
  where sc.career_id = v_assignment.career_id
  limit 1;

  if not found then
    raise exception 'career_without_coordinator';
  end if;

  if v_assignment.coordinator_staff_id is distinct from v_coordinator_id then
    update public.teacher_onboarding_assignments
      set coordinator_staff_id = v_coordinator_id,
          updated_at = now()
    where id = v_assignment.id;
  end if;

  select e.id
    into v_expedient_id
  from public.expedients e
  where e.teacher_id = v_teacher_id
    and e.career_id = v_assignment.career_id
    and e.period_id = p_period_id
  limit 1;

  if not found then
    insert into public.expedients (
      teacher_id,
      career_id,
      period_id,
      coordinator_id,
      coordinator_staff_id,
      subject_names,
      modality,
      activities_start_on,
      status
    ) values (
      v_teacher_id,
      v_assignment.career_id,
      p_period_id,
      null,
      v_coordinator_id,
      trim(p_subject_names),
      p_modality,
      p_activities_start_on,
      'in_progress'
    )
    returning id into v_expedient_id;

    v_created := true;
  end if;

  insert into public.hito_schedules (
    expedient_id,
    hito_id
  )
  select
    v_expedient_id,
    hd.id
  from public.hito_definitions hd
  where hd.active
  on conflict on constraint hito_schedules_expedient_id_hito_id_key
  do nothing;

  update public.teacher_onboarding_assignments
    set status = 'completed',
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
  where id = v_assignment.id;

  return query
  select v_expedient_id, v_created;
end;
$$;

revoke all on function public.teacher_create_process_from_onboarding(text, uuid, text, text, date) from public;
grant execute on function public.teacher_create_process_from_onboarding(text, uuid, text, text, date) to anon, authenticated;

comment on function public.teacher_create_process_from_onboarding(text, uuid, text, text, date) is
  'Crea o reutiliza el expediente del docente autenticado desde su preasignación; genera H1-H6 sin ambigüedad de columnas.';
