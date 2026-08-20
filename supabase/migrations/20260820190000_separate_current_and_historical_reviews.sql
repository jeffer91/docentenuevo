-- SIACD · Separación entre el modelo vigente de 129 criterios y revisiones históricas.
-- Conserva el historial anterior, pero evita que sus resultados se mezclen con
-- los indicadores y el "último resultado" del modelo activo.

create or replace function private.review_cycle_weighted_percent(p_cycle_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when coalesce(sum(cd.relative_weight) filter (
      where rr.score is not null and not rr.not_applicable
    ), 0) > 0
    then round((
      sum(rr.score::numeric * cd.relative_weight) filter (
        where rr.score is not null and not rr.not_applicable
      )
      / nullif(sum(cd.relative_weight) filter (
        where rr.score is not null and not rr.not_applicable
      ), 0)
      / 4 * 100
    )::numeric, 1)
    else null
  end
  from public.review_results rr
  join public.competency_definitions cd
    on cd.id = rr.criterion_id
   and cd.active
  where rr.review_cycle_id = p_cycle_id
    and rr.criterion_type = 'operational';
$$;

create or replace function private.expedient_review_trend(p_expedient_id uuid)
returns table(
  first_review_percent numeric,
  last_review_percent numeric,
  improvement_points numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with closed as (
    select
      rc.sequence,
      private.review_cycle_weighted_percent(rc.id) as percent
    from public.review_cycles rc
    where rc.expedient_id = p_expedient_id
      and rc.status = 'closed'
  ), values_found as (
    select
      (select percent from closed where percent is not null order by sequence asc limit 1) as first_percent,
      (select percent from closed where percent is not null order by sequence desc limit 1) as last_percent
  )
  select
    first_percent,
    last_percent,
    case
      when first_percent is not null and last_percent is not null
        then round((last_percent - first_percent)::numeric, 1)
      else null
    end
  from values_found;
$$;

create or replace function public.teacher_portal_process_detail(
  p_token text,
  p_expedient_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base jsonb;
  v_phase_json jsonb;
  v_item record;
  v_total integer;
  v_resolved integer;
  v_hitos_executed integer;
  v_hitos_validated integer;
  v_progress integer;
  v_status text;
  v_current_phase text;
  v_reviews jsonb;
begin
  v_base := public.teacher_portal_process_detail_pre_areas(p_token, p_expedient_id);
  if v_base is null then return null; end if;

  for v_item in
    select * from (values
      ('areas'::text, 'Áreas'::text, 1::integer),
      ('before'::text, 'Antes'::text, 1::integer),
      ('during'::text, 'Durante'::text, 3::integer),
      ('after'::text, 'Después'::text, 1::integer)
    ) as phases(phase, label, hitos_total)
  loop
    select
      count(cd.id)::int,
      count(cs.competency_id) filter (
        where cs.score is not null or coalesce(cs.not_applicable, false)
      )::int
    into v_total, v_resolved
    from public.competency_definitions cd
    join public.hito_definitions hd on hd.id = cd.hito_id
    left join public.competency_scores cs
      on cs.expedient_id = p_expedient_id
      and cs.competency_id = cd.id
    where cd.active
      and hd.phase = v_item.phase;

    select
      count(*) filter (where hs.executed_on is not null)::int,
      count(*) filter (where hs.coordinator_validated)::int
    into v_hitos_executed, v_hitos_validated
    from public.hito_schedules hs
    join public.hito_definitions hd on hd.id = hs.hito_id
    where hs.expedient_id = p_expedient_id
      and hd.phase = v_item.phase;

    v_progress := case
      when v_total > 0 then round((v_resolved::numeric / v_total::numeric) * 100)::int
      else 0
    end;

    v_status := case
      when v_total > 0 and v_resolved >= v_total then 'Completado'
      when v_resolved > 0 or coalesce(v_hitos_executed, 0) > 0 then 'En proceso'
      else 'No iniciado'
    end;

    v_phase_json := jsonb_build_object(
      'label', v_item.label,
      'hitos_total', v_item.hitos_total,
      'hitos_executed', coalesce(v_hitos_executed, 0),
      'hitos_validated', coalesce(v_hitos_validated, 0),
      'criteria_total', v_total,
      'criteria_evaluated', v_resolved,
      'progress', v_progress,
      'status', v_status
    );

    v_base := jsonb_set(v_base, array['phases', v_item.phase], v_phase_json, true);
  end loop;

  v_current_phase := case
    when coalesce(v_base #>> '{phases,areas,status}', 'No iniciado') <> 'Completado' then 'areas'
    when coalesce(v_base #>> '{phases,before,status}', 'No iniciado') <> 'Completado' then 'before'
    when coalesce(v_base #>> '{phases,during,status}', 'No iniciado') <> 'Completado' then 'during'
    else 'after'
  end;

  select coalesce(jsonb_agg(
    item || jsonb_build_object(
      'model_scope', case when exists (
        select 1
        from public.review_results rr
        join public.competency_definitions cd
          on cd.id = rr.criterion_id
         and cd.active
        where rr.review_cycle_id = (item ->> 'id')::uuid
          and rr.criterion_type = 'operational'
      ) then 'current' else 'historical' end,
      'percent', private.review_cycle_weighted_percent((item ->> 'id')::uuid)
    ) order by ord
  ), '[]'::jsonb)
  into v_reviews
  from jsonb_array_elements(coalesce(v_base -> 'closed_reviews', '[]'::jsonb))
    with ordinality as x(item, ord);

  v_base := jsonb_set(v_base, '{closed_reviews}', v_reviews, true);
  v_base := jsonb_set(v_base, '{current_phase}', to_jsonb(v_current_phase), true);
  return v_base;
end;
$$;

comment on function private.review_cycle_weighted_percent(uuid) is
  'Calcula el porcentaje de una revisión usando únicamente criterios activos del modelo vigente.';

comment on function private.expedient_review_trend(uuid) is
  'Calcula tendencia únicamente con revisiones del modelo activo; el histórico anterior no altera indicadores vigentes.';
