-- Corrige el fixture DEMO para criterios de verificación directa sin solicitud de evidencia.

create or replace function public.staff_prepare_demo_report_fixture(
  p_expedient_id uuid,
  p_staff_id uuid,
  p_mode text default 'mixed'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_teacher_id uuid;
  v_teacher_name text;
  v_criterion record;
  v_request_id uuid;
  v_submission_id uuid;
  v_status text;
  v_score integer;
  v_na boolean;
  v_position integer := 0;
  v_cycle_id uuid;
  v_cycle_sequence integer;
  v_cycle_index integer;
begin
  if p_mode not in ('mixed','approved') then
    raise exception 'invalid_demo_mode';
  end if;
  if not private.staff_can_manage_expedient(p_expedient_id, p_staff_id) then
    raise exception 'not_allowed';
  end if;

  select e.teacher_id, t.full_name
  into v_teacher_id, v_teacher_name
  from public.expedients e
  join public.teachers t on t.id = e.teacher_id
  where e.id = p_expedient_id;

  if v_teacher_id is null or upper(coalesce(v_teacher_name, '')) not like '%DEMO%' then
    raise exception 'demo_teacher_required';
  end if;

  perform private.sync_default_criterion_evidence_requests(p_expedient_id);

  delete from public.evidence_submissions es
  using public.evidence_requests er
  where es.request_id = er.id
    and er.expedient_id = p_expedient_id
    and es.teacher_comment = '[DEMO SIACD]';

  update public.evidence_requests er
  set status = 'pending', updated_at = now()
  where er.expedient_id = p_expedient_id
    and er.origin = 'criterion_default'
    and not exists (
      select 1 from public.evidence_submissions es
      where es.request_id = er.id
    );

  delete from public.criterion_na_requests nr
  where nr.expedient_id = p_expedient_id
    and nr.justification = '[DEMO SIACD] Criterio marcado como No aplica para validar el informe.';

  delete from public.competency_scores cs
  where cs.expedient_id = p_expedient_id
    and coalesce(cs.coordinator_observation, '') like '[DEMO]%';

  delete from public.review_cycles rc
  where rc.expedient_id = p_expedient_id
    and rc.title like '[DEMO]%';

  for v_criterion in
    select cd.id, row_number() over (order by cd.hito_id, cd.id) as rn
    from public.competency_definitions cd
    where cd.active
    order by cd.hito_id, cd.id
  loop
    v_position := v_position + 1;

    select er.id into v_request_id
    from public.evidence_requests er
    where er.expedient_id = p_expedient_id
      and er.criterion_id = v_criterion.id
      and er.origin = 'criterion_default'
    limit 1;

    -- Los criterios de verificación directa no generan solicitud de evidencia.
    -- En DEMO se califican igualmente para que el expediente pueda quedar completo.
    if v_request_id is null then
      insert into public.competency_scores(
        expedient_id, competency_id, score, not_applicable,
        coordinator_observation, evaluated_by, evaluated_by_staff_id, evaluated_at
      ) values (
        p_expedient_id, v_criterion.id, 4, false,
        '[DEMO] Criterio de verificación directa completado para validar el informe.',
        null, p_staff_id, now() - interval '2 days'
      )
      on conflict (expedient_id, competency_id) do update set
        score = 4,
        not_applicable = false,
        coordinator_observation = excluded.coordinator_observation,
        evaluated_by = null,
        evaluated_by_staff_id = excluded.evaluated_by_staff_id,
        evaluated_at = excluded.evaluated_at;
      continue;
    end if;

    if p_mode = 'mixed' and (
      exists (
        select 1 from public.evidence_submissions es
        where es.request_id = v_request_id
          and es.teacher_comment is distinct from '[DEMO SIACD]'
      )
      or exists (
        select 1 from public.competency_scores cs
        where cs.expedient_id = p_expedient_id
          and cs.competency_id = v_criterion.id
          and coalesce(cs.coordinator_observation, '') not like '[DEMO]%'
      )
      or exists (
        select 1 from public.criterion_na_requests nr
        where nr.expedient_id = p_expedient_id
          and nr.criterion_id = v_criterion.id
          and nr.status in ('pending','approved')
          and nr.justification <> '[DEMO SIACD] Criterio marcado como No aplica para validar el informe.'
      )
    ) then
      continue;
    end if;

    if p_mode = 'approved' and exists (
      select 1 from public.evidence_submissions es
      where es.request_id = v_request_id
        and es.teacher_comment is distinct from '[DEMO SIACD]'
    ) then
      update public.evidence_submissions
      set status = 'approved',
          reviewed_by_staff_id = p_staff_id,
          reviewed_at = now(),
          review_comment = 'Aprobado en escenario DEMO.'
      where id = (
        select es.id from public.evidence_submissions es
        where es.request_id = v_request_id
        order by es.version desc limit 1
      );
      update public.evidence_requests set status = 'approved', updated_at = now() where id = v_request_id;
      insert into public.competency_scores(
        expedient_id, competency_id, score, not_applicable, coordinator_observation, evaluated_by, evaluated_by_staff_id, evaluated_at
      ) values (
        p_expedient_id, v_criterion.id, 4, false, '[DEMO] Evidencia real aprobada para validar el informe oficial.', null, p_staff_id, now()
      )
      on conflict (expedient_id, competency_id) do update set
        score = 4, not_applicable = false, coordinator_observation = excluded.coordinator_observation,
        evaluated_by = null, evaluated_by_staff_id = excluded.evaluated_by_staff_id, evaluated_at = excluded.evaluated_at;
      continue;
    end if;

    v_status := 'approved';
    v_score := case when mod(v_position, 2) = 0 then 4 else 3 end;
    v_na := false;

    if p_mode = 'mixed' then
      case mod(v_position, 10)
        when 0 then v_status := 'pending'; v_score := null;
        when 1 then v_status := 'submitted'; v_score := null;
        when 2 then v_status := 'correction_required'; v_score := 2;
        when 3 then v_status := 'approved'; v_score := null; v_na := true;
        when 4 then v_status := 'submitted'; v_score := 1;
        else v_status := 'approved';
      end case;
    end if;

    if v_na then
      insert into public.criterion_na_requests(
        expedient_id, criterion_id, teacher_id, justification, status,
        requested_at, reviewed_by_staff_id, reviewed_at, review_comment, updated_at
      ) values (
        p_expedient_id, v_criterion.id, v_teacher_id,
        '[DEMO SIACD] Criterio marcado como No aplica para validar el informe.',
        'approved', now() - interval '3 days', p_staff_id, now() - interval '2 days',
        'Aprobado en escenario de prueba.', now()
      );

      insert into public.competency_scores(
        expedient_id, competency_id, score, not_applicable,
        coordinator_observation, evaluated_by, evaluated_by_staff_id, evaluated_at
      ) values (
        p_expedient_id, v_criterion.id, null, true,
        '[DEMO] No aplica aprobado para probar trazabilidad.', null, p_staff_id, now() - interval '2 days'
      )
      on conflict (expedient_id, competency_id) do update set
        score = null,
        not_applicable = true,
        coordinator_observation = excluded.coordinator_observation,
        evaluated_by = null,
        evaluated_by_staff_id = excluded.evaluated_by_staff_id,
        evaluated_at = excluded.evaluated_at;

      update public.evidence_requests set status = 'cancelled', updated_at = now() where id = v_request_id;
      continue;
    end if;

    if v_score is not null then
      insert into public.competency_scores(
        expedient_id, competency_id, score, not_applicable,
        coordinator_observation, evaluated_by, evaluated_by_staff_id, evaluated_at
      ) values (
        p_expedient_id, v_criterion.id, v_score, false,
        case when v_score < 3 then '[DEMO] Ajustar la evidencia según la observación de coordinación.' else '[DEMO] Evidencia verificada correctamente.' end,
        null, p_staff_id,
        case when v_status = 'submitted' then now() - interval '5 days' else now() - interval '2 days' end
      )
      on conflict (expedient_id, competency_id) do update set
        score = excluded.score,
        not_applicable = false,
        coordinator_observation = excluded.coordinator_observation,
        evaluated_by = null,
        evaluated_by_staff_id = excluded.evaluated_by_staff_id,
        evaluated_at = excluded.evaluated_at;
    end if;

    if v_status <> 'pending' then
      insert into public.evidence_submissions(
        request_id, teacher_id, version, file_name, mime_type, size_bytes, storage_path,
        teacher_comment, status, submitted_at, reviewed_by_staff_id, reviewed_at, review_comment
      ) values (
        v_request_id, v_teacher_id,
        coalesce((select max(es.version) + 1 from public.evidence_submissions es where es.request_id = v_request_id), 1),
        null, null, null, null,
        '[DEMO SIACD]',
        case when v_status = 'correction_required' then 'correction_required' when v_status = 'approved' then 'approved' else 'submitted' end,
        case when v_status = 'submitted' and v_score is not null then now() - interval '1 day' else now() - interval '4 days' end,
        case when v_status in ('approved','correction_required') then p_staff_id else null end,
        case when v_status in ('approved','correction_required') then now() - interval '2 days' else null end,
        case when v_status = 'correction_required' then 'Corregir y reenviar la evidencia.' when v_status = 'approved' then 'Evidencia aprobada.' else null end
      ) returning id into v_submission_id;

      insert into public.evidence_submission_items(
        submission_id, position, kind, file_name, mime_type, size_bytes, storage_path, external_url
      ) values (
        v_submission_id, 1, 'link', null, null, null, null,
        'https://docentenuevo.pages.dev/?demo=' || v_criterion.id
      );
    end if;

    update public.evidence_requests
    set status = v_status, updated_at = now()
    where id = v_request_id;
  end loop;

  for v_cycle_index in 1..3 loop
    select coalesce(max(sequence), 0) + 1 into v_cycle_sequence
    from public.review_cycles
    where expedient_id = p_expedient_id;

    insert into public.review_cycles(
      expedient_id, hito_id, sequence, cycle_type, title,
      scheduled_on, opened_at, closed_at, status, created_by_staff_id
    ) values (
      p_expedient_id, null, v_cycle_sequence, 'institutional',
      '[DEMO] Revisión ' || v_cycle_index,
      current_date - (20 - v_cycle_index * 5),
      now() - ((20 - v_cycle_index * 5) || ' days')::interval,
      now() - ((19 - v_cycle_index * 5) || ' days')::interval,
      'closed', p_staff_id
    ) returning id into v_cycle_id;

    insert into public.review_results(
      review_cycle_id, criterion_type, criterion_id, score, not_applicable, observation, evaluated_at
    )
    select
      v_cycle_id,
      'operational',
      cd.id,
      least(4, case v_cycle_index when 1 then 1 + mod((row_number() over (order by cd.id))::int, 3)
                                      when 2 then 2 + mod((row_number() over (order by cd.id))::int, 3)
                                      else 3 + mod((row_number() over (order by cd.id))::int, 2) end),
      false,
      '[DEMO] Resultado histórico para validar evolución.',
      now() - ((19 - v_cycle_index * 5) || ' days')::interval
    from public.competency_definitions cd
    where cd.active;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'mode', p_mode,
    'teacher', v_teacher_name,
    'message', case when p_mode = 'approved'
      then 'Escenario DEMO completado: criterios disponibles configurados como aprobados.'
      else 'Escenario DEMO mixto preparado con aprobados, revisión, corrección, pendientes, No aplica y evolución histórica.' end
  );
end;
$$;


revoke all on function public.staff_prepare_demo_report_fixture(uuid, uuid, text) from public;
grant execute on function public.staff_prepare_demo_report_fixture(uuid, uuid, text) to anon, authenticated;
