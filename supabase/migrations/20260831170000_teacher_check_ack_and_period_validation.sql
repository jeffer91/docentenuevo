-- SIACD · Confirmación docente de criterios CHECK + validación de fechas del proceso
-- La confirmación del docente NO aprueba ni altera el puntaje. Solo agrega trazabilidad.
-- La aprobación final de criterios CHECK sigue siendo exclusiva de coordinación/administración.

create table if not exists public.teacher_check_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  expedient_id uuid not null references public.expedients(id) on delete cascade,
  criterion_id text not null references public.competency_definitions(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (expedient_id, criterion_id)
);

create index if not exists teacher_check_ack_teacher_idx
  on public.teacher_check_acknowledgements(teacher_id, expedient_id);

alter table public.teacher_check_acknowledgements enable row level security;
revoke all on public.teacher_check_acknowledgements from anon, authenticated;

create or replace function public.teacher_acknowledge_check(
  p_token text,
  p_expedient_id uuid,
  p_criterion_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_teacher_id uuid;
  v_ack_at timestamptz;
begin
  select s.teacher_id
    into v_teacher_id
  from public.teacher_device_sessions s
  join public.teacher_access a
    on a.teacher_id = s.teacher_id
   and a.active
  join public.teachers t
    on t.id = s.teacher_id
   and t.active
  join public.expedients e
    on e.teacher_id = s.teacher_id
   and e.id = p_expedient_id
  where s.token_hash = extensions.digest(p_token, 'sha256')
    and s.revoked_at is null
    and s.expires_at > now()
  limit 1;

  if not found then
    raise exception 'invalid_session';
  end if;

  if not exists (
    select 1
    from public.competency_definitions cd
    where cd.id = p_criterion_id
      and cd.active
      and cd.criterion_mode = 'check'
  ) then
    raise exception 'invalid_check_criterion';
  end if;

  insert into public.teacher_check_acknowledgements(
    expedient_id,
    criterion_id,
    teacher_id,
    acknowledged_at,
    updated_at
  ) values (
    p_expedient_id,
    p_criterion_id,
    v_teacher_id,
    now(),
    now()
  )
  on conflict (expedient_id, criterion_id)
  do update set
    teacher_id = excluded.teacher_id,
    acknowledged_at = coalesce(public.teacher_check_acknowledgements.acknowledged_at, now()),
    updated_at = now()
  returning acknowledged_at into v_ack_at;

  if not exists (
    select 1
    from public.activity_log al
    where al.expedient_id = p_expedient_id
      and al.actor_teacher_id = v_teacher_id
      and al.event_type = 'criterion_check_teacher_acknowledged'
      and al.metadata ->> 'criterion_id' = p_criterion_id
  ) then
    insert into public.activity_log(
      expedient_id,
      actor_type,
      actor_teacher_id,
      event_type,
      message,
      metadata
    ) values (
      p_expedient_id,
      'teacher',
      v_teacher_id,
      'criterion_check_teacher_acknowledged',
      'El docente confirmó que conoce o cumple el criterio CHECK.',
      jsonb_build_object('criterion_id', p_criterion_id, 'mode', 'check')
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'criterion_id', p_criterion_id,
    'acknowledged_at', v_ack_at
  );
end;
$$;

revoke all on function public.teacher_acknowledge_check(text, uuid, text) from public;
grant execute on function public.teacher_acknowledge_check(text, uuid, text) to anon, authenticated;

create or replace function public.teacher_criterion_evidence_workspace(p_token text, p_expedient_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_teacher_id uuid;
  v_criteria jsonb;
begin
  select s.teacher_id into v_teacher_id
  from public.teacher_device_sessions s
  join public.teacher_access a on a.teacher_id = s.teacher_id and a.active
  join public.expedients e on e.teacher_id = s.teacher_id and e.id = p_expedient_id
  where s.token_hash = extensions.digest(p_token, 'sha256')
    and s.revoked_at is null
    and s.expires_at > now()
  limit 1;

  if not found then return null; end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', cd.id,
      'hito_id', cd.hito_id,
      'process', cd.process,
      'label', cd.observable_competency,
      'mode', cd.criterion_mode,
      'criticality', cd.criticality,
      'expected_evidence', cd.expected_evidence,
      'teacher_acknowledgement', case when tca.id is null then null else jsonb_build_object(
        'acknowledged_at', tca.acknowledged_at
      ) end,
      'score', case when cs.competency_id is null then null else jsonb_build_object(
        'score', cs.score,
        'not_applicable', cs.not_applicable,
        'observation', cs.coordinator_observation,
        'evaluated_at', cs.evaluated_at
      ) end,
      'na_request', (
        select jsonb_build_object(
          'id', nr.id,
          'justification', nr.justification,
          'status', nr.status,
          'requested_at', nr.requested_at,
          'review_comment', nr.review_comment,
          'reviewed_at', nr.reviewed_at
        )
        from public.criterion_na_requests nr
        where nr.expedient_id = p_expedient_id and nr.criterion_id = cd.id
        order by nr.requested_at desc
        limit 1
      ),
      'request', case when cd.criterion_mode = 'evidence' then (
        select jsonb_build_object(
          'id', er.id,
          'status', er.status,
          'title', er.title,
          'instructions', er.instructions,
          'origin', er.origin,
          'submissions', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', es.id,
              'version', es.version,
              'teacher_comment', es.teacher_comment,
              'status', es.status,
              'submitted_at', es.submitted_at,
              'reviewed_at', es.reviewed_at,
              'review_comment', es.review_comment,
              'items', coalesce((
                select jsonb_agg(jsonb_build_object(
                  'id', esi.id,
                  'position', esi.position,
                  'kind', esi.kind,
                  'file_name', esi.file_name,
                  'mime_type', esi.mime_type,
                  'size_bytes', esi.size_bytes,
                  'external_url', esi.external_url
                ) order by esi.position)
                from public.evidence_submission_items esi
                where esi.submission_id = es.id
              ), '[]'::jsonb)
            ) order by es.version desc)
            from public.evidence_submissions es
            where es.request_id = er.id and es.teacher_id = v_teacher_id
          ), '[]'::jsonb)
        )
        from public.evidence_requests er
        where er.expedient_id = p_expedient_id
          and er.criterion_id = cd.id
          and er.origin = 'criterion_default'
          and er.status <> 'cancelled'
        limit 1
      ) else null end
    ) order by cd.hito_id, cd.id
  ), '[]'::jsonb)
  into v_criteria
  from public.competency_definitions cd
  left join public.competency_scores cs
    on cs.expedient_id = p_expedient_id and cs.competency_id = cd.id
  left join public.teacher_check_acknowledgements tca
    on tca.expedient_id = p_expedient_id
   and tca.criterion_id = cd.id
   and tca.teacher_id = v_teacher_id
  where cd.active;

  return jsonb_build_object(
    'criteria', v_criteria,
    'total', (select count(*) from public.competency_definitions where active),
    'na_pending', (select count(*) from public.criterion_na_requests where expedient_id = p_expedient_id and status = 'pending')
  );
end;
$$;

create or replace function public.staff_criterion_evidence_workspace(p_expedient_id uuid, p_staff_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_criteria jsonb;
begin
  if not private.staff_can_manage_expedient(p_expedient_id, p_staff_id) then
    return null;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', cd.id,
      'hito_id', cd.hito_id,
      'process', cd.process,
      'label', cd.observable_competency,
      'mode', cd.criterion_mode,
      'criticality', cd.criticality,
      'expected_evidence', cd.expected_evidence,
      'teacher_acknowledgement', case when tca.id is null then null else jsonb_build_object(
        'acknowledged_at', tca.acknowledged_at
      ) end,
      'score', case when cs.competency_id is null then null else jsonb_build_object(
        'score', cs.score,
        'not_applicable', cs.not_applicable,
        'observation', cs.coordinator_observation,
        'evaluated_at', cs.evaluated_at
      ) end,
      'na_request', (
        select jsonb_build_object(
          'id', nr.id,
          'justification', nr.justification,
          'status', nr.status,
          'requested_at', nr.requested_at,
          'review_comment', nr.review_comment,
          'reviewed_at', nr.reviewed_at
        )
        from public.criterion_na_requests nr
        where nr.expedient_id = p_expedient_id and nr.criterion_id = cd.id
        order by nr.requested_at desc
        limit 1
      ),
      'request', case when cd.criterion_mode = 'evidence' then (
        select jsonb_build_object(
          'id', er.id,
          'status', er.status,
          'title', er.title,
          'instructions', er.instructions,
          'origin', er.origin,
          'submissions', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', es.id,
              'version', es.version,
              'teacher_comment', es.teacher_comment,
              'status', es.status,
              'submitted_at', es.submitted_at,
              'reviewed_at', es.reviewed_at,
              'review_comment', es.review_comment,
              'items', coalesce((
                select jsonb_agg(jsonb_build_object(
                  'id', esi.id,
                  'position', esi.position,
                  'kind', esi.kind,
                  'file_name', esi.file_name,
                  'mime_type', esi.mime_type,
                  'size_bytes', esi.size_bytes,
                  'external_url', esi.external_url
                ) order by esi.position)
                from public.evidence_submission_items esi
                where esi.submission_id = es.id
              ), '[]'::jsonb)
            ) order by es.version desc)
            from public.evidence_submissions es
            where es.request_id = er.id
          ), '[]'::jsonb)
        )
        from public.evidence_requests er
        where er.expedient_id = p_expedient_id
          and er.criterion_id = cd.id
          and er.origin = 'criterion_default'
          and er.status <> 'cancelled'
        limit 1
      ) else null end
    ) order by cd.hito_id, cd.id
  ), '[]'::jsonb)
  into v_criteria
  from public.competency_definitions cd
  left join public.competency_scores cs
    on cs.expedient_id = p_expedient_id and cs.competency_id = cd.id
  left join public.teacher_check_acknowledgements tca
    on tca.expedient_id = p_expedient_id
   and tca.criterion_id = cd.id
  where cd.active;

  return jsonb_build_object(
    'criteria', v_criteria,
    'total', (select count(*) from public.competency_definitions where active),
    'na_pending', (select count(*) from public.criterion_na_requests where expedient_id = p_expedient_id and status = 'pending')
  );
end;
$$;

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
  v_period_start date;
  v_period_end date;
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

  select p.starts_on, p.ends_on
    into v_period_start, v_period_end
  from public.academic_periods p
  where p.id = p_period_id
    and p.active
  limit 1;

  if not found then
    raise exception 'period_not_available';
  end if;

  if p_activities_start_on < v_period_start
     or (v_period_end is not null and p_activities_start_on > v_period_end) then
    raise exception 'activity_date_outside_period';
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

revoke all on function public.teacher_criterion_evidence_workspace(text, uuid) from public;
revoke all on function public.staff_criterion_evidence_workspace(uuid, uuid) from public;
revoke all on function public.teacher_create_process_from_onboarding(text, uuid, text, text, date) from public;

grant execute on function public.teacher_criterion_evidence_workspace(text, uuid) to anon, authenticated;
grant execute on function public.staff_criterion_evidence_workspace(uuid, uuid) to anon, authenticated;
grant execute on function public.teacher_create_process_from_onboarding(text, uuid, text, text, date) to anon, authenticated;

comment on table public.teacher_check_acknowledgements is
  'Confirmación informativa del docente para criterios CHECK. No modifica el puntaje ni reemplaza la verificación de coordinación.';
comment on function public.teacher_acknowledge_check(text, uuid, text) is
  'Registra que el docente confirmó conocer/cumplir un criterio CHECK. No autoaprueba el criterio.';
