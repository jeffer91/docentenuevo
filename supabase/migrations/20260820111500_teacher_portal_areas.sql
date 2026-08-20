-- SIACD · Portal docente compatible con Áreas / Antes / Durante / Después.
-- Envuelve la función vigente para conservar autenticación, revisiones e historial,
-- y recalcula las cuatro etapas con el catálogo activo y soporte de No aplica.

alter function public.teacher_portal_process_detail(text, uuid)
  rename to teacher_portal_process_detail_pre_areas;

revoke all on function public.teacher_portal_process_detail_pre_areas(text, uuid)
  from public, anon, authenticated;
grant execute on function public.teacher_portal_process_detail_pre_areas(text, uuid)
  to service_role;

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

  v_base := jsonb_set(v_base, '{current_phase}', to_jsonb(v_current_phase), true);
  return v_base;
end;
$$;

grant execute on function public.teacher_portal_process_detail(text, uuid)
  to anon, authenticated;

comment on function public.teacher_portal_process_detail(text, uuid) is
  'Portal docente con las cuatro etapas funcionales: Áreas, Antes, Durante y Después; N/A cuenta como resuelto sin alterar el puntaje.';
