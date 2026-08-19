-- SIACD · Bloque de revisión
-- Ajustes de consistencia tras los bloques 1–6.
-- 1) Los porcentajes de cada ciclo respetan el peso relativo de los criterios.
-- 2) N/A cuenta como criterio resuelto en el progreso del docente, pero no entra al promedio.
-- 3) Los indicadores de evolución usan el mismo cálculo ponderado.

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
  where rr.review_cycle_id = p_cycle_id
    and rr.criterion_type = 'operational';
$$;

revoke all on function private.review_cycle_weighted_percent(uuid) from public, anon, authenticated;
grant execute on function private.review_cycle_weighted_percent(uuid) to service_role;

create or replace function private.expedient_review_trend(p_expedient_id uuid)
returns table (
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

revoke all on function private.expedient_review_trend(uuid) from public, anon, authenticated;
grant execute on function private.expedient_review_trend(uuid) to service_role;

-- Conservamos las funciones previas solo como implementación interna.
alter function public.staff_review_workspace(uuid, uuid)
  rename to staff_review_workspace_pre_review;
alter function public.staff_close_review_cycle(uuid, uuid)
  rename to staff_close_review_cycle_pre_review;
alter function public.teacher_portal_process_detail(text, uuid)
  rename to teacher_portal_process_detail_pre_review;
alter function public.staff_indicator_dashboard(uuid)
  rename to staff_indicator_dashboard_pre_review;
alter function public.teacher_indicator_summary(text)
  rename to teacher_indicator_summary_pre_review;

revoke all on function public.staff_review_workspace_pre_review(uuid, uuid) from public, anon, authenticated;
revoke all on function public.staff_close_review_cycle_pre_review(uuid, uuid) from public, anon, authenticated;
revoke all on function public.teacher_portal_process_detail_pre_review(text, uuid) from public, anon, authenticated;
revoke all on function public.staff_indicator_dashboard_pre_review(uuid) from public, anon, authenticated;
revoke all on function public.teacher_indicator_summary_pre_review(text) from public, anon, authenticated;

grant execute on function public.staff_review_workspace_pre_review(uuid, uuid) to service_role;
grant execute on function public.staff_close_review_cycle_pre_review(uuid, uuid) to service_role;
grant execute on function public.teacher_portal_process_detail_pre_review(text, uuid) to service_role;
grant execute on function public.staff_indicator_dashboard_pre_review(uuid) to service_role;
grant execute on function public.teacher_indicator_summary_pre_review(text) to service_role;

create or replace function public.staff_review_workspace(p_expedient_id uuid, p_staff_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base jsonb;
  v_cycles jsonb;
begin
  v_base := public.staff_review_workspace_pre_review(p_expedient_id, p_staff_id);
  if v_base is null then return null; end if;

  select coalesce(jsonb_agg(
    item || jsonb_build_object(
      'percent', private.review_cycle_weighted_percent((item ->> 'id')::uuid)
    ) order by ord
  ), '[]'::jsonb)
  into v_cycles
  from jsonb_array_elements(coalesce(v_base -> 'cycles', '[]'::jsonb))
    with ordinality as x(item, ord);

  return jsonb_set(v_base, '{cycles}', v_cycles, true);
end;
$$;

grant execute on function public.staff_review_workspace(uuid, uuid) to anon, authenticated;

create or replace function public.staff_close_review_cycle(p_cycle_id uuid, p_staff_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_percent numeric;
begin
  v_result := public.staff_close_review_cycle_pre_review(p_cycle_id, p_staff_id);
  v_percent := private.review_cycle_weighted_percent(p_cycle_id);
  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object('percent', v_percent);
end;
$$;

grant execute on function public.staff_close_review_cycle(uuid, uuid) to anon, authenticated;

create or replace function public.teacher_portal_process_detail(p_token text, p_expedient_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base jsonb;
  v_phase text;
  v_total integer;
  v_resolved integer;
  v_phase_json jsonb;
  v_reviews jsonb;
  v_progress integer;
  v_status text;
  v_hitos_total integer;
  v_hitos_executed integer;
  v_hitos_validated integer;
begin
  v_base := public.teacher_portal_process_detail_pre_review(p_token, p_expedient_id);
  if v_base is null then return null; end if;

  foreach v_phase in array array['before','during','after']
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
    where cd.active and hd.phase = v_phase;

    v_phase_json := coalesce(v_base #> array['phases', v_phase], '{}'::jsonb);
    v_hitos_total := coalesce((v_phase_json ->> 'hitos_total')::int, 0);
    v_hitos_executed := coalesce((v_phase_json ->> 'hitos_executed')::int, 0);
    v_hitos_validated := coalesce((v_phase_json ->> 'hitos_validated')::int, 0);
    v_progress := case when v_total > 0 then round((v_resolved::numeric / v_total::numeric) * 100)::int else 0 end;
    v_status := case
      when v_hitos_total > 0 and v_hitos_validated >= v_hitos_total then 'Completado'
      when v_hitos_executed > 0 or v_resolved > 0 then 'En proceso'
      else 'No iniciado'
    end;

    v_phase_json := v_phase_json || jsonb_build_object(
      'criteria_total', v_total,
      'criteria_evaluated', v_resolved,
      'progress', v_progress,
      'status', v_status
    );
    v_base := jsonb_set(v_base, array['phases', v_phase], v_phase_json, true);
  end loop;

  select coalesce(jsonb_agg(
    item || jsonb_build_object(
      'percent', private.review_cycle_weighted_percent((item ->> 'id')::uuid)
    ) order by ord
  ), '[]'::jsonb)
  into v_reviews
  from jsonb_array_elements(coalesce(v_base -> 'closed_reviews', '[]'::jsonb))
    with ordinality as x(item, ord);

  return jsonb_set(v_base, '{closed_reviews}', v_reviews, true);
end;
$$;

grant execute on function public.teacher_portal_process_detail(text, uuid) to anon, authenticated;

create or replace function public.staff_indicator_dashboard(p_staff_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base jsonb;
  v_rows jsonb;
  v_summary jsonb;
  v_avg numeric;
begin
  v_base := public.staff_indicator_dashboard_pre_review(p_staff_id);
  if v_base is null then return null; end if;

  select coalesce(jsonb_agg(
    item || jsonb_build_object(
      'first_review_percent', trend.first_review_percent,
      'last_review_percent', trend.last_review_percent,
      'improvement_points', trend.improvement_points
    ) order by ord
  ), '[]'::jsonb)
  into v_rows
  from jsonb_array_elements(coalesce(v_base -> 'rows', '[]'::jsonb))
    with ordinality as x(item, ord)
  left join lateral private.expedient_review_trend((item ->> 'expedient_id')::uuid) trend on true;

  select coalesce(round(avg((item ->> 'improvement_points')::numeric), 1), 0)
  into v_avg
  from jsonb_array_elements(v_rows) item
  where item ->> 'improvement_points' is not null;

  v_summary := coalesce(v_base -> 'summary', '{}'::jsonb)
    || jsonb_build_object('improvement_average', coalesce(v_avg, 0));
  v_base := jsonb_set(v_base, '{rows}', v_rows, true);
  return jsonb_set(v_base, '{summary}', v_summary, true);
end;
$$;

grant execute on function public.staff_indicator_dashboard(uuid) to anon, authenticated;

create or replace function public.teacher_indicator_summary(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base jsonb;
  v_rows jsonb;
begin
  v_base := public.teacher_indicator_summary_pre_review(p_token);
  if v_base is null then return null; end if;

  select coalesce(jsonb_agg(
    item || jsonb_build_object(
      'improvement_points', trend.improvement_points
    ) order by ord
  ), '[]'::jsonb)
  into v_rows
  from jsonb_array_elements(coalesce(v_base -> 'rows', '[]'::jsonb))
    with ordinality as x(item, ord)
  left join lateral private.expedient_review_trend((item ->> 'expedient_id')::uuid) trend on true;

  return jsonb_set(v_base, '{rows}', v_rows, true);
end;
$$;

grant execute on function public.teacher_indicator_summary(text) to anon, authenticated;

comment on function private.review_cycle_weighted_percent(uuid) is
  'Porcentaje ponderado del ciclo usando relative_weight; N/A no entra al promedio.';
comment on function public.teacher_portal_process_detail(text, uuid) is
  'Versión revisada: N/A cuenta como resuelto y los porcentajes de revisión son ponderados.';
