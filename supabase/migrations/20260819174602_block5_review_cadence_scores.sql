-- SIACD · Rediseño Bloque 5
-- Revisiones repetibles, cadencia manual, 0-4, N/A y pasa/no pasa.

alter table public.competency_scores
  add column if not exists not_applicable boolean not null default false;

alter table public.competency_scores
  add column if not exists evaluated_by_staff_id uuid references public.siacd_staff(id) on delete set null;

alter table public.competency_scores
  drop constraint if exists competency_scores_not_applicable_score_check;

alter table public.competency_scores
  add constraint competency_scores_not_applicable_score_check
  check (not (not_applicable and score is not null));

create index if not exists competency_scores_staff_idx
  on public.competency_scores(evaluated_by_staff_id);

create or replace function public.staff_review_workspace(p_expedient_id uuid, p_staff_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_criteria jsonb;
  v_cycles jsonb;
begin
  if not private.staff_can_manage_expedient(p_expedient_id, p_staff_id) then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', cd.id,
    'hito_id', cd.hito_id,
    'process', cd.process,
    'label', cd.observable_competency,
    'criticality', cd.criticality,
    'expected_evidence', cd.expected_evidence,
    'relative_weight', cd.relative_weight,
    'current_score', cs.score,
    'current_not_applicable', coalesce(cs.not_applicable, false),
    'current_observation', cs.coordinator_observation
  ) order by hd.sequence, cd.id), '[]'::jsonb)
  into v_criteria
  from public.competency_definitions cd
  join public.hito_definitions hd on hd.id = cd.hito_id
  left join public.competency_scores cs
    on cs.expedient_id = p_expedient_id and cs.competency_id = cd.id
  where cd.active and cd.hito_id in ('H1','H2','H3','H4','H5','H6');

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', rc.id,
    'sequence', rc.sequence,
    'hito_id', rc.hito_id,
    'cycle_type', rc.cycle_type,
    'title', rc.title,
    'scheduled_on', rc.scheduled_on,
    'opened_at', rc.opened_at,
    'closed_at', rc.closed_at,
    'status', rc.status,
    'created_at', rc.created_at,
    'evaluated', (select count(*) from public.review_results rr where rr.review_cycle_id = rc.id and (rr.score is not null or rr.not_applicable)),
    'passed', (select count(*) from public.review_results rr where rr.review_cycle_id = rc.id and rr.passed is true),
    'failed', (select count(*) from public.review_results rr where rr.review_cycle_id = rc.id and rr.passed is false),
    'not_applicable', (select count(*) from public.review_results rr where rr.review_cycle_id = rc.id and rr.not_applicable),
    'percent', (
      select case when count(*) filter (where rr.score is not null and not rr.not_applicable) > 0
        then round(avg(rr.score) filter (where rr.score is not null and not rr.not_applicable) * 25)::int
        else null end
      from public.review_results rr where rr.review_cycle_id = rc.id
    ),
    'results', coalesce((
      select jsonb_agg(jsonb_build_object(
        'criterion_id', rr.criterion_id,
        'score', rr.score,
        'not_applicable', rr.not_applicable,
        'passed', rr.passed,
        'observation', rr.observation,
        'evaluated_at', rr.evaluated_at,
        'label', cd.observable_competency,
        'criticality', cd.criticality,
        'process', cd.process
      ) order by rr.criterion_id)
      from public.review_results rr
      left join public.competency_definitions cd on cd.id = rr.criterion_id
      where rr.review_cycle_id = rc.id and rr.criterion_type = 'operational'
    ), '[]'::jsonb)
  ) order by rc.sequence desc), '[]'::jsonb)
  into v_cycles
  from public.review_cycles rc
  where rc.expedient_id = p_expedient_id;

  return jsonb_build_object(
    'criteria', v_criteria,
    'cycles', v_cycles,
    'failed_current', (
      select count(*)
      from public.competency_scores cs
      where cs.expedient_id = p_expedient_id
        and not cs.not_applicable
        and cs.score is not null
        and cs.score < 3
    ),
    'not_applicable_current', (
      select count(*) from public.competency_scores cs
      where cs.expedient_id = p_expedient_id and cs.not_applicable
    ),
    'open_cycles', (
      select count(*) from public.review_cycles rc
      where rc.expedient_id = p_expedient_id and rc.status in ('planned','open')
    )
  );
end;
$$;

grant execute on function public.staff_review_workspace(uuid, uuid) to anon, authenticated;

create or replace function public.staff_create_review_cycle(
  p_expedient_id uuid,
  p_staff_id uuid,
  p_hito_id text,
  p_scheduled_on date,
  p_cycle_type text,
  p_title text default null,
  p_criterion_ids text[] default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_sequence integer;
  v_hito_title text;
  v_ids text[];
  v_actor text;
begin
  if not private.staff_can_manage_expedient(p_expedient_id, p_staff_id) then
    raise exception 'not_allowed';
  end if;
  if p_hito_id not in ('H1','H2','H3','H4','H5','H6') then
    raise exception 'invalid_hito';
  end if;
  if p_scheduled_on is null then
    raise exception 'date_required';
  end if;
  if p_cycle_type not in ('institutional','corrective','extraordinary') then
    raise exception 'invalid_cycle_type';
  end if;

  select title into v_hito_title from public.hito_definitions where id = p_hito_id;
  if not found then raise exception 'invalid_hito'; end if;

  if coalesce(array_length(p_criterion_ids, 1), 0) > 0 then
    select array_agg(cd.id order by cd.id) into v_ids
    from public.competency_definitions cd
    where cd.active
      and cd.hito_id = p_hito_id
      and cd.id = any(p_criterion_ids);
  elsif p_cycle_type = 'corrective' then
    select array_agg(cd.id order by cd.id) into v_ids
    from public.competency_definitions cd
    join public.competency_scores cs
      on cs.expedient_id = p_expedient_id and cs.competency_id = cd.id
    where cd.active
      and cd.hito_id = p_hito_id
      and not cs.not_applicable
      and cs.score is not null
      and cs.score < 3;
  else
    select array_agg(cd.id order by cd.id) into v_ids
    from public.competency_definitions cd
    where cd.active and cd.hito_id = p_hito_id;
  end if;

  if coalesce(array_length(v_ids, 1), 0) = 0 then
    raise exception 'criteria_required';
  end if;

  select coalesce(max(sequence), 0) + 1 into v_sequence
  from public.review_cycles where expedient_id = p_expedient_id;

  insert into public.review_cycles(
    expedient_id, hito_id, sequence, cycle_type, title, scheduled_on,
    status, created_by_staff_id
  ) values (
    p_expedient_id,
    p_hito_id,
    v_sequence,
    p_cycle_type,
    coalesce(nullif(trim(p_title), ''),
      case
        when p_cycle_type = 'corrective' then format('Corrección %s · %s', v_sequence, p_hito_id)
        when p_cycle_type = 'extraordinary' then format('Revisión extraordinaria %s · %s', v_sequence, p_hito_id)
        else format('Revisión %s · %s · %s', v_sequence, p_hito_id, v_hito_title)
      end
    ),
    p_scheduled_on,
    'planned',
    p_staff_id
  ) returning id into v_id;

  insert into public.review_results(review_cycle_id, criterion_type, criterion_id)
  select v_id, 'operational', unnest(v_ids);

  select case when role = 'admin' then 'admin' else 'coordinator' end into v_actor
  from public.siacd_staff where id = p_staff_id;

  insert into public.activity_log(expedient_id, review_cycle_id, actor_type, actor_staff_id, event_type, message, metadata)
  values (
    p_expedient_id, v_id, coalesce(v_actor, 'coordinator'), p_staff_id,
    'review_scheduled', 'Se programó una nueva revisión del acompañamiento.',
    jsonb_build_object('hito_id', p_hito_id, 'scheduled_on', p_scheduled_on, 'cycle_type', p_cycle_type, 'criteria_count', array_length(v_ids,1))
  );

  return v_id;
end;
$$;

grant execute on function public.staff_create_review_cycle(uuid, uuid, text, date, text, text, text[]) to anon, authenticated;

create or replace function public.staff_update_review_cycle_date(
  p_cycle_id uuid,
  p_staff_id uuid,
  p_scheduled_on date
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expedient_id uuid;
begin
  select expedient_id into v_expedient_id
  from public.review_cycles where id = p_cycle_id;
  if not found then return false; end if;
  if not private.staff_can_manage_expedient(v_expedient_id, p_staff_id) then
    raise exception 'not_allowed';
  end if;
  if p_scheduled_on is null then raise exception 'date_required'; end if;

  update public.review_cycles
  set scheduled_on = p_scheduled_on, updated_at = now()
  where id = p_cycle_id and status in ('planned','open');
  return found;
end;
$$;

grant execute on function public.staff_update_review_cycle_date(uuid, uuid, date) to anon, authenticated;

create or replace function public.staff_open_review_cycle(p_cycle_id uuid, p_staff_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expedient_id uuid;
  v_actor text;
begin
  select expedient_id into v_expedient_id from public.review_cycles where id = p_cycle_id;
  if not found then return false; end if;
  if not private.staff_can_manage_expedient(v_expedient_id, p_staff_id) then
    raise exception 'not_allowed';
  end if;

  update public.review_cycles
  set status = 'open', opened_at = coalesce(opened_at, now()), updated_at = now()
  where id = p_cycle_id and status = 'planned';
  if not found then return false; end if;

  select case when role = 'admin' then 'admin' else 'coordinator' end into v_actor
  from public.siacd_staff where id = p_staff_id;
  insert into public.activity_log(expedient_id, review_cycle_id, actor_type, actor_staff_id, event_type, message)
  values (v_expedient_id, p_cycle_id, coalesce(v_actor,'coordinator'), p_staff_id, 'review_opened', 'La revisión fue abierta por coordinación.');
  return true;
end;
$$;

grant execute on function public.staff_open_review_cycle(uuid, uuid) to anon, authenticated;

create or replace function public.staff_save_review_results(
  p_cycle_id uuid,
  p_staff_id uuid,
  p_results jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cycle public.review_cycles%rowtype;
  v_item jsonb;
  v_id text;
  v_score smallint;
  v_na boolean;
  v_observation text;
  v_count integer := 0;
begin
  select * into v_cycle from public.review_cycles where id = p_cycle_id for update;
  if not found then raise exception 'cycle_not_found'; end if;
  if not private.staff_can_manage_expedient(v_cycle.expedient_id, p_staff_id) then
    raise exception 'not_allowed';
  end if;
  if v_cycle.status <> 'open' then raise exception 'cycle_not_open'; end if;
  if jsonb_typeof(coalesce(p_results, '[]'::jsonb)) <> 'array' then raise exception 'invalid_results'; end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_results, '[]'::jsonb))
  loop
    v_id := nullif(trim(v_item ->> 'criterion_id'), '');
    v_na := coalesce((v_item ->> 'not_applicable')::boolean, false);
    v_observation := nullif(trim(v_item ->> 'observation'), '');

    if v_id is null then continue; end if;
    if v_na then
      v_score := null;
    else
      if nullif(v_item ->> 'score', '') is null then
        raise exception 'score_required:%', v_id;
      end if;
      v_score := (v_item ->> 'score')::smallint;
      if v_score < 0 or v_score > 4 then raise exception 'invalid_score:%', v_id; end if;
    end if;

    update public.review_results
    set score = v_score,
        not_applicable = v_na,
        observation = v_observation,
        evaluated_at = now(),
        updated_at = now()
    where review_cycle_id = p_cycle_id
      and criterion_type = 'operational'
      and criterion_id = v_id;

    if not found then raise exception 'criterion_not_in_cycle:%', v_id; end if;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.staff_save_review_results(uuid, uuid, jsonb) to anon, authenticated;

create or replace function public.staff_close_review_cycle(p_cycle_id uuid, p_staff_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cycle public.review_cycles%rowtype;
  v_failed integer;
  v_passed integer;
  v_na integer;
  v_evaluated integer;
  v_percent integer;
  v_critical integer;
  v_operational numeric;
  v_actor text;
begin
  select * into v_cycle from public.review_cycles where id = p_cycle_id for update;
  if not found then raise exception 'cycle_not_found'; end if;
  if not private.staff_can_manage_expedient(v_cycle.expedient_id, p_staff_id) then
    raise exception 'not_allowed';
  end if;
  if v_cycle.status <> 'open' then raise exception 'cycle_not_open'; end if;

  if exists (
    select 1 from public.review_results rr
    where rr.review_cycle_id = p_cycle_id
      and rr.score is null and not rr.not_applicable
  ) then
    raise exception 'incomplete_results';
  end if;

  insert into public.competency_scores(
    expedient_id, competency_id, score, coordinator_observation,
    evaluated_by, evaluated_at, not_applicable, evaluated_by_staff_id
  )
  select
    v_cycle.expedient_id,
    rr.criterion_id,
    rr.score,
    rr.observation,
    null,
    now(),
    rr.not_applicable,
    p_staff_id
  from public.review_results rr
  where rr.review_cycle_id = p_cycle_id and rr.criterion_type = 'operational'
  on conflict (expedient_id, competency_id) do update
  set score = excluded.score,
      coordinator_observation = excluded.coordinator_observation,
      evaluated_by = null,
      evaluated_at = excluded.evaluated_at,
      not_applicable = excluded.not_applicable,
      evaluated_by_staff_id = excluded.evaluated_by_staff_id;

  select
    count(*) filter (where rr.passed is false)::int,
    count(*) filter (where rr.passed is true)::int,
    count(*) filter (where rr.not_applicable)::int,
    count(*) filter (where rr.score is not null and not rr.not_applicable)::int,
    case when count(*) filter (where rr.score is not null and not rr.not_applicable) > 0
      then round(avg(rr.score) filter (where rr.score is not null and not rr.not_applicable) * 25)::int
      else null end
  into v_failed, v_passed, v_na, v_evaluated, v_percent
  from public.review_results rr where rr.review_cycle_id = p_cycle_id;

  select count(*)::int into v_critical
  from public.competency_scores cs
  join public.competency_definitions cd on cd.id = cs.competency_id
  where cs.expedient_id = v_cycle.expedient_id
    and cd.criticality = 'Crítica'
    and not cs.not_applicable
    and cs.score is not null
    and cs.score < 3;

  with per_hito as (
    select
      hd.id,
      hd.final_weight,
      sum(cs.score::numeric * cd.relative_weight) / nullif(sum(cd.relative_weight), 0) as avg_score
    from public.competency_definitions cd
    join public.hito_definitions hd on hd.id = cd.hito_id
    join public.competency_scores cs
      on cs.expedient_id = v_cycle.expedient_id and cs.competency_id = cd.id
    where cd.active
      and not cs.not_applicable
      and cs.score is not null
      and hd.id in ('H1','H2','H3','H4','H5','H6')
    group by hd.id, hd.final_weight
  )
  select sum((avg_score / 4) * final_weight) / nullif(sum(final_weight), 0)
  into v_operational
  from per_hito;

  update public.review_cycles
  set status = 'closed', closed_at = now(), updated_at = now()
  where id = p_cycle_id;

  update public.expedients
  set operational_score = v_operational,
      critical_gaps = coalesce(v_critical, 0),
      status = case
        when status in ('certified','archived') then status
        when status = 'approved' then status
        when coalesce(v_critical,0) > 0 then 'with_gaps'::public.expedient_status
        else 'in_progress'::public.expedient_status
      end,
      updated_at = now()
  where id = v_cycle.expedient_id;

  select case when role = 'admin' then 'admin' else 'coordinator' end into v_actor
  from public.siacd_staff where id = p_staff_id;

  insert into public.activity_log(expedient_id, review_cycle_id, actor_type, actor_staff_id, event_type, message, metadata)
  values (
    v_cycle.expedient_id, p_cycle_id, coalesce(v_actor,'coordinator'), p_staff_id,
    'review_closed', 'La revisión fue cerrada y sus resultados fueron publicados al docente.',
    jsonb_build_object('passed', v_passed, 'failed', v_failed, 'not_applicable', v_na, 'evaluated', v_evaluated, 'percent', v_percent)
  );

  return jsonb_build_object(
    'passed', v_passed,
    'failed', v_failed,
    'not_applicable', v_na,
    'evaluated', v_evaluated,
    'percent', v_percent
  );
end;
$$;

grant execute on function public.staff_close_review_cycle(uuid, uuid) to anon, authenticated;

create or replace function public.staff_cancel_review_cycle(p_cycle_id uuid, p_staff_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expedient_id uuid;
  v_actor text;
begin
  select expedient_id into v_expedient_id from public.review_cycles where id = p_cycle_id;
  if not found then return false; end if;
  if not private.staff_can_manage_expedient(v_expedient_id, p_staff_id) then
    raise exception 'not_allowed';
  end if;

  update public.review_cycles
  set status = 'cancelled', updated_at = now()
  where id = p_cycle_id and status in ('planned','open');
  if not found then return false; end if;

  select case when role = 'admin' then 'admin' else 'coordinator' end into v_actor
  from public.siacd_staff where id = p_staff_id;
  insert into public.activity_log(expedient_id, review_cycle_id, actor_type, actor_staff_id, event_type, message)
  values (v_expedient_id, p_cycle_id, coalesce(v_actor,'coordinator'), p_staff_id, 'review_cancelled', 'La revisión fue cancelada.');
  return true;
end;
$$;

grant execute on function public.staff_cancel_review_cycle(uuid, uuid) to anon, authenticated;

comment on column public.competency_scores.not_applicable is 'N/A: el criterio no computa en el resultado vigente.';
comment on function public.staff_close_review_cycle(uuid, uuid) is 'Cierra una revisión, publica resultados al docente y sincroniza el estado vigente del expediente.';
