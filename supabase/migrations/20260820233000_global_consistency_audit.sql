-- SIACD · auditoría global de consistencia
-- Mantiene la seguridad existente. Corrige únicamente semántica de avance,
-- trazabilidad de correcciones e indicadores del modelo activo.

-- 1) Preservar la nota de cada entrega revisada. La nota vigente puede volver
-- a estado pendiente cuando el docente envía una corrección, pero la revisión
-- anterior debe permanecer en el histórico de la entrega.
alter table public.evidence_submissions
  add column if not exists review_score smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'evidence_submissions_review_score_check'
      and conrelid = 'public.evidence_submissions'::regclass
  ) then
    alter table public.evidence_submissions
      add constraint evidence_submissions_review_score_check
      check (review_score is null or review_score between 0 and 4);
  end if;
end $$;

create or replace function private.capture_submission_review_score()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reviewed_at is not null
     and old.reviewed_at is null
     and new.review_score is null then
    select cs.score
      into new.review_score
    from public.evidence_requests er
    join public.competency_scores cs
      on cs.expedient_id = er.expedient_id
     and cs.competency_id = er.criterion_id
    where er.id = new.request_id
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists evidence_submissions_capture_review_score on public.evidence_submissions;
create trigger evidence_submissions_capture_review_score
before update of reviewed_at, status on public.evidence_submissions
for each row
execute function private.capture_submission_review_score();

-- 2) Cuando el docente corrige y vuelve a enviar, la calificación vigente deja
-- de ser 0/1/2 y vuelve a "pendiente de revisión". La nota anterior queda en
-- evidence_submissions.review_score y en la bitácora.
create or replace function private.clear_current_score_on_correction_resubmission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'correction_required'
     and new.status in ('submitted', 'in_review')
     and new.origin = 'criterion_default'
     and new.criterion_id is not null then
    delete from public.competency_scores cs
    where cs.expedient_id = new.expedient_id
      and cs.competency_id = new.criterion_id
      and not coalesce(cs.not_applicable, false);
  end if;
  return new;
end;
$$;

drop trigger if exists evidence_requests_clear_score_on_resubmission on public.evidence_requests;
create trigger evidence_requests_clear_score_on_resubmission
after update of status on public.evidence_requests
for each row
when (old.status is distinct from new.status)
execute function private.clear_current_score_on_correction_resubmission();

-- 3) El snapshot institucional usa "resuelto" como APROBADO, no como
-- simplemente evaluado. 3/4, 4/4 y N/A aprobado cierran el criterio.
create or replace view private.expedient_indicator_snapshot as
with op_counts as (
  select e.id as expedient_id,
    count(cd.id)::integer as operational_total,
    count(cs.competency_id) filter (
      where coalesce(cs.not_applicable, false)
         or (cs.score is not null and cs.score >= 3)
    )::integer as operational_resolved,
    count(cs.competency_id) filter (
      where cs.score >= 3 and not coalesce(cs.not_applicable, false)
    )::integer as passed,
    count(cs.competency_id) filter (
      where cs.score is not null and cs.score < 3 and not coalesce(cs.not_applicable, false)
    )::integer as failed,
    count(cs.competency_id) filter (where coalesce(cs.not_applicable, false))::integer as not_applicable,
    count(cs.competency_id) filter (
      where cd.criticality = 'Crítica'
        and cs.score is not null
        and cs.score < 3
        and not coalesce(cs.not_applicable, false)
    )::integer as critical_gaps,
    count(cd.id) filter (where cd.hito_id = 'H1')::integer as areas_total,
    count(cs.competency_id) filter (
      where cd.hito_id = 'H1'
        and (coalesce(cs.not_applicable, false) or (cs.score is not null and cs.score >= 3))
    )::integer as areas_resolved,
    count(cd.id) filter (where cd.hito_id = 'H2')::integer as before_total,
    count(cs.competency_id) filter (
      where cd.hito_id = 'H2'
        and (coalesce(cs.not_applicable, false) or (cs.score is not null and cs.score >= 3))
    )::integer as before_resolved,
    count(cd.id) filter (where cd.hito_id in ('H3','H4','H5'))::integer as during_total,
    count(cs.competency_id) filter (
      where cd.hito_id in ('H3','H4','H5')
        and (coalesce(cs.not_applicable, false) or (cs.score is not null and cs.score >= 3))
    )::integer as during_resolved,
    count(cd.id) filter (where cd.hito_id = 'H6')::integer as after_total,
    count(cs.competency_id) filter (
      where cd.hito_id = 'H6'
        and (coalesce(cs.not_applicable, false) or (cs.score is not null and cs.score >= 3))
    )::integer as after_resolved
  from public.expedients e
  cross join public.competency_definitions cd
  left join public.competency_scores cs
    on cs.expedient_id = e.id and cs.competency_id = cd.id
  where cd.active
  group by e.id
), op_scores as (
  select e.id as expedient_id,
    round(
      sum(cs.score::numeric * cd.relative_weight) filter (
        where cs.score is not null and not coalesce(cs.not_applicable, false)
      )
      / nullif(sum(cd.relative_weight) filter (
        where cs.score is not null and not coalesce(cs.not_applicable, false)
      ), 0)
      / 4::numeric * 100::numeric,
      1
    ) as operational_percent
  from public.expedients e
  cross join public.competency_definitions cd
  left join public.competency_scores cs
    on cs.expedient_id = e.id and cs.competency_id = cd.id
  where cd.active
  group by e.id
), followup_stats as (
  select e.id as expedient_id, count(f.id)::integer as followups
  from public.expedients e
  left join public.followups f on f.expedient_id = e.id
  group by e.id
), evidence_stats as (
  select e.id as expedient_id,
    count(distinct ev.hito_id) filter (where ev.hito_id in ('H1','H2','H3','H4','H5','H6'))::integer as evidence_hitos
  from public.expedients e
  left join public.evidences ev on ev.expedient_id = e.id
  group by e.id
), evidence_request_stats as (
  select e.id as expedient_id,
    count(er.id) filter (where er.status in ('pending','submitted','in_review'))::integer as pending_evidence,
    count(er.id) filter (where er.status = 'correction_required')::integer as correction_evidence
  from public.expedients e
  left join public.evidence_requests er
    on er.expedient_id = e.id and er.status <> 'cancelled'
  group by e.id
), cycle_percent as (
  select rc.id, rc.expedient_id, rc.sequence, rc.status, rc.scheduled_on, rc.closed_at,
    case
      when count(rr.id) filter (where rr.score is not null and not rr.not_applicable) > 0
        then round(avg(rr.score) filter (where rr.score is not null and not rr.not_applicable) * 25::numeric, 1)
      else null::numeric
    end as percent
  from public.review_cycles rc
  left join public.review_results rr on rr.review_cycle_id = rc.id
  group by rc.id
), review_stats as (
  select e.id as expedient_id,
    count(cp.id) filter (where cp.status = 'closed')::integer as reviews_closed,
    count(cp.id) filter (where cp.status in ('planned','open'))::integer as reviews_open,
    count(cp.id) filter (where cp.status in ('planned','open') and cp.scheduled_on < current_date)::integer as reviews_overdue,
    min(cp.scheduled_on) filter (where cp.status in ('planned','open') and cp.scheduled_on >= current_date) as next_review,
    (select c1.percent from cycle_percent c1 where c1.expedient_id=e.id and c1.status='closed' and c1.percent is not null order by c1.sequence limit 1) as first_review_percent,
    (select c2.percent from cycle_percent c2 where c2.expedient_id=e.id and c2.status='closed' and c2.percent is not null order by c2.sequence desc limit 1) as last_review_percent
  from public.expedients e
  left join cycle_percent cp on cp.expedient_id = e.id
  group by e.id
)
select
  e.id as expedient_id,
  e.teacher_id,
  t.full_name as teacher_name,
  e.career_id,
  c.name as career,
  e.period_id,
  p.name as period,
  e.coordinator_staff_id,
  e.status::text as expedient_status,
  case
    when oc.areas_total > 0 and oc.areas_resolved < oc.areas_total then 'areas'::text
    when oc.before_total > 0 and oc.before_resolved < oc.before_total then 'before'::text
    when oc.during_total > 0 and oc.during_resolved < oc.during_total then 'during'::text
    else 'after'::text
  end as current_phase,
  coalesce(oc.operational_total, 0) as operational_total,
  coalesce(oc.operational_resolved, 0) as operational_resolved,
  coalesce(os.operational_percent, 0::numeric) as operational_percent,
  coalesce(oc.passed, 0) as passed,
  coalesce(oc.failed, 0) as failed,
  coalesce(oc.not_applicable, 0) as not_applicable,
  coalesce(oc.critical_gaps, 0) as critical_gaps,
  coalesce(ers.pending_evidence, 0) as pending_evidence,
  coalesce(ers.correction_evidence, 0) as correction_evidence,
  coalesce(rs.reviews_closed, 0) as reviews_closed,
  coalesce(rs.reviews_open, 0) as reviews_open,
  coalesce(rs.reviews_overdue, 0) as reviews_overdue,
  rs.next_review,
  rs.first_review_percent,
  rs.last_review_percent,
  case
    when rs.first_review_percent is not null and rs.last_review_percent is not null
      then round(rs.last_review_percent - rs.first_review_percent, 1)
    else null::numeric
  end as improvement_points,
  0 as complementary_evaluated,
  0::numeric as complementary_percent,
  0 as quality_evaluated,
  0::numeric as quality_percent,
  0 as quality_critical_gaps,
  coalesce(fs.followups, 0) as followups,
  coalesce(es.evidence_hitos, 0) as evidence_hitos,
  null::numeric as final_percent,
  e.status in ('certified','archived') as certified,
  coalesce(oc.operational_total, 0) > 0
    and coalesce(oc.operational_resolved, 0) = coalesce(oc.operational_total, 0)
    and coalesce(oc.critical_gaps, 0) = 0
    and coalesce(ers.pending_evidence, 0) = 0
    and coalesce(ers.correction_evidence, 0) = 0 as ready_to_certify
from public.expedients e
join public.teachers t on t.id = e.teacher_id
join public.careers c on c.id = e.career_id
join public.academic_periods p on p.id = e.period_id
left join op_counts oc on oc.expedient_id = e.id
left join op_scores os on os.expedient_id = e.id
left join followup_stats fs on fs.expedient_id = e.id
left join evidence_stats es on es.expedient_id = e.id
left join evidence_request_stats ers on ers.expedient_id = e.id
left join review_stats rs on rs.expedient_id = e.id;

-- 4) Los indicadores del docente toman la fase directamente del modelo activo,
-- no de fechas/validaciones históricas de H1-H6.
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
    'phase', x.current_phase,
    'progress', case when x.operational_total > 0 then round(x.operational_resolved::numeric / x.operational_total * 100) else 0 end,
    'operational_resolved', x.operational_resolved,
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
    'ready_to_certify', x.ready_to_certify,
    'certified', x.certified,
    'classification', case
      when x.certified then 'Certificado'
      when x.ready_to_certify then 'Listo para cierre'
      when x.critical_gaps > 0 then 'Requiere atención'
      when x.failed > 0 or x.correction_evidence > 0 then 'En mejora'
      when x.operational_resolved = 0 then 'No iniciado'
      when x.operational_resolved = x.operational_total then 'Cumple'
      else 'En proceso'
    end
  ) order by x.period desc, x.career), '[]'::jsonb)
  into v_rows
  from private.expedient_indicator_snapshot x
  where x.teacher_id = v_teacher_id;

  return jsonb_build_object('rows', v_rows);
end;
$$;

-- 5) El panel institucional comparte exactamente la misma semántica.
create or replace function public.staff_indicator_dashboard_pre_review(p_staff_id uuid default null)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with valid_staff as (
    select id, role
    from public.siacd_staff
    where id = p_staff_id and active
  ), scoped as (
    select s.*
    from private.expedient_indicator_snapshot s
    where p_staff_id is null
       or exists (
         select 1 from valid_staff v
         where v.role = 'admin' or s.coordinator_staff_id = v.id
       )
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'expedients', count(*),
      'teachers', count(distinct teacher_id),
      'criteria_total', coalesce(max(operational_total), 0),
      'areas', count(*) filter (where current_phase = 'areas'),
      'before', count(*) filter (where current_phase = 'before'),
      'during', count(*) filter (where current_phase = 'during'),
      'after', count(*) filter (where current_phase = 'after'),
      'passed', coalesce(sum(passed), 0),
      'failed', coalesce(sum(failed), 0),
      'not_applicable', coalesce(sum(not_applicable), 0),
      'critical_gaps', coalesce(sum(critical_gaps), 0),
      'pending_evidence', coalesce(sum(pending_evidence), 0),
      'corrections', coalesce(sum(correction_evidence), 0),
      'reviews_overdue', coalesce(sum(reviews_overdue), 0),
      'reviews_closed', coalesce(sum(reviews_closed), 0),
      'certified', count(*) filter (where certified),
      'ready_to_certify', count(*) filter (where ready_to_certify and not certified),
      'needs_attention', count(*) filter (
        where failed > 0 or critical_gaps > 0 or correction_evidence > 0 or reviews_overdue > 0
      ),
      'operational_average', coalesce(round(avg(operational_percent) filter (where passed + failed > 0)::numeric, 1), 0),
      'improvement_average', coalesce(round(avg(improvement_points) filter (where improvement_points is not null)::numeric, 1), 0)
    ),
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'expedient_id', expedient_id,
      'teacher_id', teacher_id,
      'teacher_name', teacher_name,
      'career_id', career_id,
      'career', career,
      'period_id', period_id,
      'period', period,
      'coordinator_staff_id', coordinator_staff_id,
      'phase', current_phase,
      'progress', case when operational_total > 0 then round(operational_resolved::numeric / operational_total * 100) else 0 end,
      'operational_resolved', operational_resolved,
      'operational_total', operational_total,
      'operational_percent', operational_percent,
      'passed', passed,
      'failed', failed,
      'not_applicable', not_applicable,
      'critical_gaps', critical_gaps,
      'pending_evidence', pending_evidence,
      'corrections', correction_evidence,
      'reviews_closed', reviews_closed,
      'reviews_open', reviews_open,
      'reviews_overdue', reviews_overdue,
      'next_review', next_review,
      'first_review_percent', first_review_percent,
      'last_review_percent', last_review_percent,
      'improvement_points', improvement_points,
      'ready_to_certify', ready_to_certify,
      'certified', certified,
      'classification', case
        when certified then 'Certificado'
        when ready_to_certify then 'Listo para cierre'
        when critical_gaps > 0 then 'Crítico'
        when failed > 0 or correction_evidence > 0 then 'En mejora'
        when operational_resolved = 0 then 'No iniciado'
        when operational_resolved = operational_total then 'Cumple'
        else 'En proceso'
      end
    ) order by
      case when failed > 0 or critical_gaps > 0 or correction_evidence > 0 or reviews_overdue > 0 then 0 else 1 end,
      teacher_name), '[]'::jsonb)
  )
  from scoped;
$$;
