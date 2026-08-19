-- SIACD · Rediseño Bloque 3
-- Espacio docente: avance por fases, pendientes, próxima revisión, revisiones cerradas e historial.

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
  v_teacher_id uuid;
  v_teacher_name text;
  v_expedient jsonb;
  v_phases jsonb;
  v_hitos jsonb;
  v_next_review jsonb;
  v_pending_actions jsonb;
  v_reviews jsonb;
  v_activity jsonb;
  v_current_phase text;
begin
  if p_token is null or length(p_token) < 40 then
    return null;
  end if;

  select s.teacher_id, t.full_name
    into v_teacher_id, v_teacher_name
  from public.teacher_device_sessions s
  join public.teacher_access a on a.teacher_id = s.teacher_id and a.active
  join public.teachers t on t.id = s.teacher_id and t.active
  where s.token_hash = extensions.digest(p_token, 'sha256')
    and s.revoked_at is null
    and s.expires_at > now()
  limit 1;

  if not found then return null; end if;

  select jsonb_build_object(
      'id', e.id,
      'career', c.name,
      'period', p.name,
      'subject', e.subject_names,
      'status', e.status::text,
      'activities_start_on', e.activities_start_on,
      'planned_close_on', e.planned_close_on,
      'modality', e.modality
    )
    into v_expedient
  from public.expedients e
  join public.careers c on c.id = e.career_id
  join public.academic_periods p on p.id = e.period_id
  where e.id = p_expedient_id
    and e.teacher_id = v_teacher_id;

  if v_expedient is null then return null; end if;

  with phase_list(phase, label, hito_total) as (
    values
      ('before'::text, 'Antes'::text, 2::integer),
      ('during'::text, 'Durante'::text, 3::integer),
      ('after'::text, 'Después'::text, 1::integer)
  ), stats as (
    select
      pl.phase,
      pl.label,
      pl.hito_total,
      (select count(*)::int
       from public.hito_schedules hs
       join public.hito_definitions hd on hd.id = hs.hito_id
       where hs.expedient_id = p_expedient_id
         and hd.phase = pl.phase
         and hs.executed_on is not null) as hitos_executed,
      (select count(*)::int
       from public.hito_schedules hs
       join public.hito_definitions hd on hd.id = hs.hito_id
       where hs.expedient_id = p_expedient_id
         and hd.phase = pl.phase
         and hs.coordinator_validated) as hitos_validated,
      (select count(*)::int
       from public.competency_definitions cd
       join public.hito_definitions hd on hd.id = cd.hito_id
       where hd.phase = pl.phase and cd.active) as criteria_total,
      (select count(*)::int
       from public.competency_scores cs
       join public.competency_definitions cd on cd.id = cs.competency_id
       join public.hito_definitions hd on hd.id = cd.hito_id
       where cs.expedient_id = p_expedient_id
         and hd.phase = pl.phase
         and cs.score is not null) as criteria_evaluated
    from phase_list pl
  )
  select coalesce(jsonb_object_agg(
    phase,
    jsonb_build_object(
      'label', label,
      'hitos_total', hito_total,
      'hitos_executed', hitos_executed,
      'hitos_validated', hitos_validated,
      'criteria_total', criteria_total,
      'criteria_evaluated', criteria_evaluated,
      'progress', case when criteria_total > 0 then round((criteria_evaluated::numeric / criteria_total::numeric) * 100)::int else 0 end,
      'status', case
        when hitos_validated >= hito_total then 'Completado'
        when hitos_executed > 0 or criteria_evaluated > 0 then 'En proceso'
        else 'No iniciado'
      end
    )
  ), '{}'::jsonb)
  into v_phases
  from stats;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', hd.id,
      'title', hd.title,
      'phase', hd.phase,
      'moment', hd.moment,
      'purpose', hd.purpose,
      'scheduled_on', hs.scheduled_on,
      'executed_on', hs.executed_on,
      'validated', coalesce(hs.coordinator_validated, false)
    ) order by hd.sequence), '[]'::jsonb)
    into v_hitos
  from public.hito_definitions hd
  left join public.hito_schedules hs
    on hs.hito_id = hd.id and hs.expedient_id = p_expedient_id
  where hd.id in ('H1','H2','H3','H4','H5','H6');

  select case
    when coalesce((v_phases #>> '{before,hitos_validated}')::int, 0) < 2 then 'before'
    when coalesce((v_phases #>> '{during,hitos_validated}')::int, 0) < 3 then 'during'
    else 'after'
  end into v_current_phase;

  select to_jsonb(q)
    into v_next_review
  from (
    select
      rc.id,
      rc.title,
      rc.cycle_type,
      rc.hito_id,
      rc.scheduled_on,
      rc.status
    from public.review_cycles rc
    where rc.expedient_id = p_expedient_id
      and rc.status in ('planned','open')
    order by
      case when rc.scheduled_on is null then 1 else 0 end,
      rc.scheduled_on asc nulls last,
      rc.sequence asc
    limit 1
  ) q;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', ia.id,
      'criterion_id', ia.competency_id,
      'action', ia.action_text,
      'responsible', ia.responsible,
      'due_on', ia.due_on,
      'status', ia.status
    ) order by ia.due_on asc nulls last), '[]'::jsonb)
    into v_pending_actions
  from public.improvement_actions ia
  where ia.expedient_id = p_expedient_id
    and ia.status in ('pending','in_progress')
    and (
      lower(coalesce(ia.responsible,'')) like '%docente%'
      or lower(trim(coalesce(ia.responsible,''))) = lower(trim(v_teacher_name))
    );

  select coalesce(jsonb_agg(review_item order by closed_at desc), '[]'::jsonb)
    into v_reviews
  from (
    select
      rc.closed_at,
      jsonb_build_object(
        'id', rc.id,
        'sequence', rc.sequence,
        'title', rc.title,
        'cycle_type', rc.cycle_type,
        'hito_id', rc.hito_id,
        'phase', coalesce(hd.phase, case when rc.cycle_type = 'quality' then 'during' else null end),
        'scheduled_on', rc.scheduled_on,
        'closed_at', rc.closed_at,
        'evaluated', count(rr.id) filter (where rr.score is not null and not rr.not_applicable),
        'passed', count(rr.id) filter (where rr.passed is true),
        'failed', count(rr.id) filter (where rr.passed is false),
        'not_applicable', count(rr.id) filter (where rr.not_applicable),
        'percent', case
          when count(rr.id) filter (where rr.score is not null and not rr.not_applicable) > 0
            then round(avg(rr.score) filter (where rr.score is not null and not rr.not_applicable) * 25)::int
          else null
        end,
        'failed_items', coalesce(
          jsonb_agg(jsonb_build_object(
            'criterion_type', rr.criterion_type,
            'criterion_id', rr.criterion_id,
            'score', rr.score,
            'observation', rr.observation
          ) order by rr.criterion_type, rr.criterion_id)
          filter (where rr.passed is false),
          '[]'::jsonb
        )
      ) as review_item
    from public.review_cycles rc
    left join public.hito_definitions hd on hd.id = rc.hito_id
    left join public.review_results rr on rr.review_cycle_id = rc.id
    where rc.expedient_id = p_expedient_id
      and rc.status = 'closed'
      and rc.closed_at is not null
    group by rc.id, hd.phase
  ) closed_reviews;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', x.id,
      'actor_type', x.actor_type,
      'event_type', x.event_type,
      'message', x.message,
      'created_at', x.created_at
    ) order by x.created_at desc), '[]'::jsonb)
    into v_activity
  from (
    select al.id, al.actor_type, al.event_type, al.message, al.created_at
    from public.activity_log al
    where al.expedient_id = p_expedient_id
    order by al.created_at desc
    limit 30
  ) x;

  return jsonb_build_object(
    'expedient', v_expedient,
    'current_phase', v_current_phase,
    'phases', v_phases,
    'hitos', v_hitos,
    'next_review', v_next_review,
    'pending_actions', v_pending_actions,
    'closed_reviews', v_reviews,
    'activity', v_activity
  );
end;
$$;

grant execute on function public.teacher_portal_process_detail(text, uuid) to anon, authenticated;

comment on function public.teacher_portal_process_detail(text, uuid) is
  'Devuelve únicamente datos del expediente perteneciente al docente autenticado por token de dispositivo. Los puntajes se exponen solo en ciclos de revisión cerrados.';
