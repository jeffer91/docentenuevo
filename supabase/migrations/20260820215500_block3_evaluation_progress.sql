-- SIACD · Bloque 3
-- Une la calificación del coordinador con la entrega de evidencia y corrige el avance:
-- un criterio solo queda aprobado con 3/4, 4/4 o No aplica aprobado.
-- No modifica RLS ni el modelo de autenticación existente.

create or replace function private.sync_accompaniment_progress(p_expedient_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hito text;
  v_total integer;
  v_approved integer;
  v_weight numeric;
  v_weighted numeric;
  v_critical integer;
begin
  if p_expedient_id is null then return; end if;

  for v_hito in select unnest(array['H1','H2','H3','H4','H5','H6'])
  loop
    select
      count(cd.id)::int,
      count(cs.competency_id) filter (
        where coalesce(cs.not_applicable, false)
           or (cs.score is not null and cs.score >= 3)
      )::int
    into v_total, v_approved
    from public.competency_definitions cd
    left join public.competency_scores cs
      on cs.expedient_id = p_expedient_id
      and cs.competency_id = cd.id
    where cd.active
      and cd.hito_id = v_hito;

    insert into public.hito_schedules(expedient_id, hito_id)
    values (p_expedient_id, v_hito)
    on conflict (expedient_id, hito_id) do nothing;

    if v_total > 0 and v_approved >= v_total then
      update public.hito_schedules
      set executed_on = coalesce(executed_on, current_date),
          coordinator_validated = true
      where expedient_id = p_expedient_id
        and hito_id = v_hito;
    else
      update public.hito_schedules hs
      set executed_on = null,
          coordinator_validated = false
      from public.expedients e
      where hs.expedient_id = p_expedient_id
        and hs.expedient_id = e.id
        and hs.hito_id = v_hito
        and e.status::text in ('draft','in_progress','with_gaps','ready_for_review','returned');
    end if;
  end loop;

  select
    coalesce(sum(cd.relative_weight) filter (
      where cs.score is not null and not coalesce(cs.not_applicable, false)
    ), 0),
    coalesce(sum(cs.score::numeric * cd.relative_weight) filter (
      where cs.score is not null and not coalesce(cs.not_applicable, false)
    ), 0),
    count(*) filter (
      where cd.criticality = 'Crítica'
        and cs.score is not null
        and not coalesce(cs.not_applicable, false)
        and cs.score < 3
    )::int
  into v_weight, v_weighted, v_critical
  from public.competency_definitions cd
  left join public.competency_scores cs
    on cs.expedient_id = p_expedient_id
    and cs.competency_id = cd.id
  where cd.active;

  update public.expedients
  set operational_score = case when v_weight > 0 then (v_weighted / v_weight / 4) else null end,
      critical_gaps = coalesce(v_critical, 0),
      updated_at = now()
  where id = p_expedient_id;
end;
$$;

revoke all on function private.sync_accompaniment_progress(uuid) from public, anon, authenticated;
grant execute on function private.sync_accompaniment_progress(uuid) to service_role;

-- La evaluación de un criterio se hace sobre la entrega vigente del docente.
-- 3/4 o 4/4 aprueba; 0/1/2 solicita automáticamente una nueva corrección.
create or replace function public.staff_evaluate_criterion_submission(
  p_expedient_id uuid,
  p_criterion_id text,
  p_staff_id uuid,
  p_score smallint,
  p_observation text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.evidence_requests%rowtype;
  v_submission public.evidence_submissions%rowtype;
  v_status text;
  v_actor text;
  v_observation text;
begin
  if p_score is null or p_score < 0 or p_score > 4 then
    raise exception 'invalid_score';
  end if;

  v_observation := nullif(trim(coalesce(p_observation, '')), '');
  if p_score < 3 and v_observation is null then
    raise exception 'comment_required';
  end if;

  if not private.staff_can_manage_expedient(p_expedient_id, p_staff_id) then
    raise exception 'not_allowed';
  end if;

  if not exists (
    select 1
    from public.competency_definitions cd
    where cd.id = p_criterion_id and cd.active
  ) then
    raise exception 'invalid_criterion';
  end if;

  if exists (
    select 1
    from public.criterion_na_requests nr
    where nr.expedient_id = p_expedient_id
      and nr.criterion_id = p_criterion_id
      and nr.status = 'approved'
  ) then
    raise exception 'criterion_not_applicable';
  end if;

  select er.* into v_request
  from public.evidence_requests er
  where er.expedient_id = p_expedient_id
    and er.criterion_id = p_criterion_id
    and er.origin = 'criterion_default'
  limit 1
  for update;

  if not found then raise exception 'evidence_request_not_found'; end if;

  select es.* into v_submission
  from public.evidence_submissions es
  where es.request_id = v_request.id
  order by es.version desc
  limit 1
  for update;

  if not found then raise exception 'evidence_required'; end if;
  if v_submission.status <> 'submitted' or v_submission.reviewed_at is not null then
    raise exception 'submission_not_pending';
  end if;
  if v_request.status not in ('submitted','in_review') then
    raise exception 'request_not_in_review';
  end if;

  v_status := case when p_score >= 3 then 'approved' else 'correction_required' end;

  insert into public.competency_scores(
    expedient_id,
    competency_id,
    score,
    not_applicable,
    coordinator_observation,
    evaluated_by,
    evaluated_by_staff_id,
    evaluated_at
  ) values (
    p_expedient_id,
    p_criterion_id,
    p_score,
    false,
    v_observation,
    null,
    p_staff_id,
    now()
  )
  on conflict (expedient_id, competency_id)
  do update set
    score = excluded.score,
    not_applicable = false,
    coordinator_observation = excluded.coordinator_observation,
    evaluated_by = null,
    evaluated_by_staff_id = p_staff_id,
    evaluated_at = now();

  update public.evidence_submissions
  set status = v_status,
      reviewed_by_staff_id = p_staff_id,
      reviewed_at = now(),
      review_comment = v_observation
  where id = v_submission.id;

  update public.evidence_requests
  set status = v_status,
      updated_at = now()
  where id = v_request.id;

  select case when s.role = 'admin' then 'admin' else 'coordinator' end
  into v_actor
  from public.siacd_staff s
  where s.id = p_staff_id;

  insert into public.activity_log(
    expedient_id,
    actor_type,
    actor_staff_id,
    event_type,
    message,
    metadata
  ) values (
    p_expedient_id,
    coalesce(v_actor, 'coordinator'),
    p_staff_id,
    case when p_score >= 3 then 'criterion_evidence_approved' else 'criterion_correction_required' end,
    case when p_score >= 3
      then 'La evidencia del criterio fue evaluada y aprobada.'
      else 'La evidencia del criterio fue evaluada y requiere corrección.' end,
    jsonb_build_object(
      'criterion_id', p_criterion_id,
      'request_id', v_request.id,
      'submission_id', v_submission.id,
      'submission_version', v_submission.version,
      'score', p_score,
      'status', v_status,
      'observation', v_observation
    )
  );

  return jsonb_build_object(
    'ok', true,
    'criterion_id', p_criterion_id,
    'submission_id', v_submission.id,
    'version', v_submission.version,
    'score', p_score,
    'status', v_status
  );
end;
$$;

grant execute on function public.staff_evaluate_criterion_submission(uuid, text, uuid, smallint, text) to anon, authenticated;

-- Recalcula los procesos activos con la nueva regla de aprobación.
do $$
declare
  v_id uuid;
begin
  for v_id in
    select e.id
    from public.expedients e
    where e.status::text in ('draft','in_progress','with_gaps','ready_for_review','returned')
  loop
    perform private.sync_accompaniment_progress(v_id);
  end loop;
end $$;
