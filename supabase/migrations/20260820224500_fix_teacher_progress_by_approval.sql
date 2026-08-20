-- SIACD · segunda revisión del portal docente
-- El avance del docente debe significar APROBADO, no simplemente evaluado.
-- Un criterio se aprueba únicamente con 3/4, 4/4 o No aplica aprobado.
-- No modifica autenticación, RLS ni permisos.

create or replace function public.teacher_portal_process_detail(p_token text, p_expedient_id uuid)
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
  v_evaluated integer;
  v_approved integer;
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
      )::int,
      count(cs.competency_id) filter (
        where coalesce(cs.not_applicable, false)
           or (cs.score is not null and cs.score >= 3)
      )::int
    into v_total, v_evaluated, v_approved
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
      when v_total > 0 then round((v_approved::numeric / v_total::numeric) * 100)::int
      else 0
    end;

    v_status := case
      when v_total > 0 and v_approved >= v_total then 'Completado'
      when v_evaluated > 0 or coalesce(v_hitos_executed, 0) > 0 then 'En proceso'
      else 'No iniciado'
    end;

    v_phase_json := jsonb_build_object(
      'label', v_item.label,
      'hitos_total', v_item.hitos_total,
      'hitos_executed', coalesce(v_hitos_executed, 0),
      'hitos_validated', coalesce(v_hitos_validated, 0),
      'criteria_total', v_total,
      'criteria_evaluated', v_evaluated,
      'criteria_approved', v_approved,
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

-- Los indicadores del docente también usan aprobación real como avance.
create or replace function public.teacher_indicator_summary_pre_review(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_teacher_id uuid;
  v_rows jsonb;
begin
  select s.teacher_id into v_teacher_id
  from public.teacher_device_sessions s
  join public.teacher_access a on a.teacher_id = s.teacher_id and a.active
  where s.token_hash = extensions.digest(p_token, 'sha256')
    and s.revoked_at is null
    and s.expires_at > now()
  limit 1;

  if not found then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'expedient_id', x.expedient_id,
    'career', x.career,
    'period', x.period,
    'phase', case
      when coalesce((select hs.coordinator_validated from public.hito_schedules hs where hs.expedient_id=x.expedient_id and hs.hito_id='H1'), false) = false then 'areas'
      when coalesce((select hs.coordinator_validated from public.hito_schedules hs where hs.expedient_id=x.expedient_id and hs.hito_id='H2'), false) = false then 'before'
      when (select count(*) from public.hito_schedules hs where hs.expedient_id=x.expedient_id and hs.hito_id in ('H3','H4','H5') and hs.coordinator_validated) < 3 then 'during'
      else 'after'
    end,
    'progress', case when x.operational_total > 0 then round(((x.passed + x.not_applicable)::numeric / x.operational_total) * 100) else 0 end,
    'operational_resolved', x.passed + x.not_applicable,
    'operational_total', x.operational_total,
    'operational_percent', x.operational_percent,
    'passed', x.passed,
    'failed', x.failed,
    'not_applicable', x.not_applicable,
    'critical_gaps', x.critical_gaps,
    'pending_evidence', x.pending_evidence,
    'corrections', x.correction_evidence,
    'reviews_closed', x.reviews_closed,
    'next_review', x.next_review,
    'improvement_points', x.improvement_points,
    'ready_to_certify', x.operational_total > 0
      and (x.passed + x.not_applicable) = x.operational_total
      and x.critical_gaps = 0
      and x.pending_evidence = 0
      and x.correction_evidence = 0,
    'certified', x.certified,
    'classification', case
      when x.certified then 'Certificado'
      when x.operational_total > 0
        and (x.passed + x.not_applicable) = x.operational_total
        and x.critical_gaps = 0
        and x.pending_evidence = 0
        and x.correction_evidence = 0 then 'Listo para cierre'
      when x.critical_gaps > 0 then 'Requiere atención'
      when x.failed > 0 or x.correction_evidence > 0 then 'En mejora'
      when (x.passed + x.not_applicable) = 0 then 'No iniciado'
      when (x.passed + x.not_applicable) = x.operational_total then 'Cumple'
      else 'En proceso'
    end
  ) order by x.period desc, x.career), '[]'::jsonb)
  into v_rows
  from private.expedient_indicator_snapshot x
  where x.teacher_id = v_teacher_id;

  return jsonb_build_object('rows', v_rows);
end;
$$;
