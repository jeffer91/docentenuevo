-- SIACD · Rediseño Bloque 6
-- Indicadores institucionales, clasificación, evolución y preparación de cierre.

create or replace view private.expedient_indicator_snapshot as
with
op_counts as (
  select e.id as expedient_id,
    count(cd.id)::int as operational_total,
    count(cs.competency_id) filter (where cs.score is not null or coalesce(cs.not_applicable,false))::int as operational_resolved,
    count(cs.competency_id) filter (where cs.score >= 3 and not coalesce(cs.not_applicable,false))::int as passed,
    count(cs.competency_id) filter (where cs.score is not null and cs.score < 3 and not coalesce(cs.not_applicable,false))::int as failed,
    count(cs.competency_id) filter (where coalesce(cs.not_applicable,false))::int as not_applicable,
    count(cs.competency_id) filter (where cd.criticality = 'Crítica' and cs.score is not null and cs.score < 3 and not coalesce(cs.not_applicable,false))::int as critical_gaps
  from public.expedients e
  cross join public.competency_definitions cd
  left join public.competency_scores cs on cs.expedient_id = e.id and cs.competency_id = cd.id
  where cd.active and cd.hito_id in ('H1','H2','H3','H4','H5','H6')
  group by e.id
),
hito_scores as (
  select cs.expedient_id, hd.id as hito_id, hd.final_weight,
    sum(cs.score::numeric * cd.relative_weight) / nullif(sum(cd.relative_weight),0) as avg_score
  from public.competency_scores cs
  join public.competency_definitions cd on cd.id = cs.competency_id and cd.active
  join public.hito_definitions hd on hd.id = cd.hito_id
  where hd.id in ('H1','H2','H3','H4','H5','H6')
    and cs.score is not null and not coalesce(cs.not_applicable,false)
  group by cs.expedient_id, hd.id, hd.final_weight
),
op_scores as (
  select expedient_id,
    round((sum((avg_score / 4) * final_weight) / nullif(sum(final_weight),0) * 100)::numeric, 1) as operational_percent
  from hito_scores group by expedient_id
),
phase_stats as (
  select e.id as expedient_id,
    count(*) filter (where hs.hito_id in ('H1','H2') and hs.coordinator_validated)::int as before_validated,
    count(*) filter (where hs.hito_id in ('H3','H4','H5') and hs.coordinator_validated)::int as during_validated,
    count(*) filter (where hs.hito_id = 'H6' and hs.coordinator_validated)::int as after_validated
  from public.expedients e left join public.hito_schedules hs on hs.expedient_id = e.id
  group by e.id
),
comp_stats as (
  select e.id as expedient_id, count(cs.score)::int as complementary_evaluated,
    round((avg(cs.score)::numeric / 4 * 100),1) as complementary_percent
  from public.expedients e left join public.complementary_scores cs on cs.expedient_id = e.id and cs.score is not null
  group by e.id
),
quality_stats as (
  select e.id as expedient_id, count(qs.score)::int as quality_evaluated,
    round((sum((qs.score::numeric / 4) * qc.weight) * 100)::numeric,1) as quality_percent,
    count(qs.score) filter (where qc.criticality = 'Crítica' and qs.score < 3)::int as quality_critical_gaps
  from public.expedients e
  left join public.quality_scores qs on qs.expedient_id = e.id and qs.score is not null
  left join public.quality_criteria qc on qc.id = qs.criterion_id and qc.active
  group by e.id
),
followup_stats as (
  select e.id as expedient_id, count(f.id)::int as followups
  from public.expedients e left join public.followups f on f.expedient_id = e.id group by e.id
),
evidence_stats as (
  select e.id as expedient_id,
    count(distinct ev.hito_id) filter (where ev.hito_id in ('H1','H2','H3','H4','H5','H6'))::int as evidence_hitos
  from public.expedients e left join public.evidences ev on ev.expedient_id = e.id group by e.id
),
evidence_request_stats as (
  select e.id as expedient_id,
    count(er.id) filter (where er.status in ('pending','submitted','in_review'))::int as pending_evidence,
    count(er.id) filter (where er.status = 'correction_required')::int as correction_evidence
  from public.expedients e
  left join public.evidence_requests er on er.expedient_id = e.id and er.status <> 'cancelled'
  group by e.id
),
cycle_percent as (
  select rc.id, rc.expedient_id, rc.sequence, rc.status, rc.scheduled_on, rc.closed_at,
    case when count(rr.id) filter (where rr.score is not null and not rr.not_applicable) > 0
      then round((avg(rr.score) filter (where rr.score is not null and not rr.not_applicable) * 25)::numeric,1)
      else null end as percent
  from public.review_cycles rc left join public.review_results rr on rr.review_cycle_id = rc.id
  group by rc.id
),
review_stats as (
  select e.id as expedient_id,
    count(cp.id) filter (where cp.status = 'closed')::int as reviews_closed,
    count(cp.id) filter (where cp.status in ('planned','open'))::int as reviews_open,
    count(cp.id) filter (where cp.status in ('planned','open') and cp.scheduled_on < current_date)::int as reviews_overdue,
    min(cp.scheduled_on) filter (where cp.status in ('planned','open') and cp.scheduled_on >= current_date) as next_review,
    (select c1.percent from cycle_percent c1 where c1.expedient_id = e.id and c1.status = 'closed' and c1.percent is not null order by c1.sequence asc limit 1) as first_review_percent,
    (select c2.percent from cycle_percent c2 where c2.expedient_id = e.id and c2.status = 'closed' and c2.percent is not null order by c2.sequence desc limit 1) as last_review_percent
  from public.expedients e left join cycle_percent cp on cp.expedient_id = e.id group by e.id
)
select e.id as expedient_id, e.teacher_id, t.full_name as teacher_name,
  e.career_id, c.name as career, e.period_id, p.name as period, e.coordinator_staff_id,
  e.status::text as expedient_status,
  case when coalesce(ps.before_validated,0) < 2 then 'before'
       when coalesce(ps.during_validated,0) < 3 then 'during' else 'after' end as current_phase,
  coalesce(oc.operational_total,75) as operational_total,
  coalesce(oc.operational_resolved,0) as operational_resolved,
  coalesce(os.operational_percent,0) as operational_percent,
  coalesce(oc.passed,0) as passed, coalesce(oc.failed,0) as failed,
  coalesce(oc.not_applicable,0) as not_applicable, coalesce(oc.critical_gaps,0) as critical_gaps,
  coalesce(ers.pending_evidence,0) as pending_evidence,
  coalesce(ers.correction_evidence,0) as correction_evidence,
  coalesce(rs.reviews_closed,0) as reviews_closed, coalesce(rs.reviews_open,0) as reviews_open,
  coalesce(rs.reviews_overdue,0) as reviews_overdue, rs.next_review,
  rs.first_review_percent, rs.last_review_percent,
  case when rs.first_review_percent is not null and rs.last_review_percent is not null
    then round((rs.last_review_percent - rs.first_review_percent)::numeric,1) else null end as improvement_points,
  coalesce(cs.complementary_evaluated,0) as complementary_evaluated,
  coalesce(cs.complementary_percent,0) as complementary_percent,
  coalesce(qs.quality_evaluated,0) as quality_evaluated,
  coalesce(qs.quality_percent,0) as quality_percent,
  coalesce(qs.quality_critical_gaps,0) as quality_critical_gaps,
  coalesce(fs.followups,0) as followups, coalesce(es.evidence_hitos,0) as evidence_hitos,
  case when os.operational_percent is not null and cs.complementary_evaluated > 0 and qs.quality_evaluated > 0
    then round((os.operational_percent * 0.60 + cs.complementary_percent * 0.15 + qs.quality_percent * 0.25)::numeric,1)
    else null end as final_percent,
  (e.status in ('certified','archived')) as certified,
  (coalesce(oc.operational_resolved,0) = 75 and coalesce(os.operational_percent,0) >= 75
    and coalesce(oc.critical_gaps,0) = 0 and coalesce(cs.complementary_evaluated,0) = 17
    and coalesce(cs.complementary_percent,0) >= 75 and coalesce(qs.quality_evaluated,0) = 21
    and coalesce(qs.quality_percent,0) >= 75 and coalesce(qs.quality_critical_gaps,0) = 0
    and coalesce(fs.followups,0) >= 4 and coalesce(es.evidence_hitos,0) >= 4
    and (os.operational_percent * 0.60 + cs.complementary_percent * 0.15 + qs.quality_percent * 0.25) >= 75) as ready_to_certify
from public.expedients e
join public.teachers t on t.id = e.teacher_id
join public.careers c on c.id = e.career_id
join public.academic_periods p on p.id = e.period_id
left join op_counts oc on oc.expedient_id = e.id
left join op_scores os on os.expedient_id = e.id
left join phase_stats ps on ps.expedient_id = e.id
left join comp_stats cs on cs.expedient_id = e.id
left join quality_stats qs on qs.expedient_id = e.id
left join followup_stats fs on fs.expedient_id = e.id
left join evidence_stats es on es.expedient_id = e.id
left join evidence_request_stats ers on ers.expedient_id = e.id
left join review_stats rs on rs.expedient_id = e.id;

revoke all on private.expedient_indicator_snapshot from public, anon, authenticated;
grant select on private.expedient_indicator_snapshot to service_role;

create or replace function public.staff_indicator_dashboard(p_staff_id uuid default null)
returns jsonb language sql security definer set search_path = '' as $$
  with valid_staff as (
    select id, role from public.siacd_staff where id = p_staff_id and active
  ), scoped as (
    select s.* from private.expedient_indicator_snapshot s
    where p_staff_id is null or exists (
      select 1 from valid_staff v where v.role = 'admin' or s.coordinator_staff_id = v.id
    )
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'expedients', count(*), 'teachers', count(distinct teacher_id),
      'before', count(*) filter (where current_phase = 'before'),
      'during', count(*) filter (where current_phase = 'during'),
      'after', count(*) filter (where current_phase = 'after'),
      'passed', coalesce(sum(passed),0), 'failed', coalesce(sum(failed),0),
      'not_applicable', coalesce(sum(not_applicable),0), 'critical_gaps', coalesce(sum(critical_gaps),0),
      'pending_evidence', coalesce(sum(pending_evidence),0), 'corrections', coalesce(sum(correction_evidence),0),
      'reviews_overdue', coalesce(sum(reviews_overdue),0), 'reviews_closed', coalesce(sum(reviews_closed),0),
      'certified', count(*) filter (where certified),
      'ready_to_certify', count(*) filter (where ready_to_certify and not certified),
      'needs_attention', count(*) filter (where critical_gaps > 0 or correction_evidence > 0 or reviews_overdue > 0),
      'operational_average', coalesce(round(avg(operational_percent)::numeric,1),0),
      'improvement_average', coalesce(round(avg(improvement_points) filter (where improvement_points is not null)::numeric,1),0)
    ),
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'expedient_id', expedient_id, 'teacher_id', teacher_id, 'teacher_name', teacher_name,
      'career_id', career_id, 'career', career, 'period_id', period_id, 'period', period,
      'coordinator_staff_id', coordinator_staff_id, 'phase', current_phase,
      'operational_resolved', operational_resolved, 'operational_total', operational_total,
      'operational_percent', operational_percent, 'passed', passed, 'failed', failed,
      'not_applicable', not_applicable, 'critical_gaps', critical_gaps,
      'pending_evidence', pending_evidence, 'corrections', correction_evidence,
      'reviews_closed', reviews_closed, 'reviews_open', reviews_open, 'reviews_overdue', reviews_overdue,
      'next_review', next_review, 'first_review_percent', first_review_percent,
      'last_review_percent', last_review_percent, 'improvement_points', improvement_points,
      'complementary_percent', complementary_percent, 'complementary_evaluated', complementary_evaluated,
      'quality_percent', quality_percent, 'quality_evaluated', quality_evaluated,
      'followups', followups, 'evidence_hitos', evidence_hitos, 'final_percent', final_percent,
      'ready_to_certify', ready_to_certify, 'certified', certified,
      'classification', case when certified then 'Certificado'
        when ready_to_certify then 'Listo para certificar'
        when critical_gaps > 0 then 'Crítico'
        when failed > 0 or correction_evidence > 0 then 'En mejora'
        when operational_resolved = 0 then 'No iniciado'
        when operational_resolved = operational_total and operational_percent >= 75 then 'Cumple'
        else 'En proceso' end
    ) order by case when critical_gaps > 0 or correction_evidence > 0 or reviews_overdue > 0 then 0 else 1 end, teacher_name), '[]'::jsonb)
  ) from scoped;
$$;

grant execute on function public.staff_indicator_dashboard(uuid) to anon, authenticated;

create or replace function public.teacher_indicator_summary(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_teacher_id uuid; v_rows jsonb;
begin
  select s.teacher_id into v_teacher_id
  from public.teacher_device_sessions s join public.teacher_access a on a.teacher_id = s.teacher_id and a.active
  where s.token_hash = extensions.digest(p_token, 'sha256') and s.revoked_at is null and s.expires_at > now()
  limit 1;
  if not found then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'expedient_id', x.expedient_id, 'career', x.career, 'period', x.period, 'phase', x.current_phase,
    'operational_resolved', x.operational_resolved, 'operational_total', x.operational_total,
    'operational_percent', x.operational_percent, 'passed', x.passed, 'failed', x.failed,
    'not_applicable', x.not_applicable, 'critical_gaps', x.critical_gaps,
    'pending_evidence', x.pending_evidence, 'corrections', x.correction_evidence,
    'reviews_closed', x.reviews_closed, 'next_review', x.next_review,
    'improvement_points', x.improvement_points, 'final_percent', x.final_percent,
    'ready_to_certify', x.ready_to_certify, 'certified', x.certified,
    'classification', case when x.certified then 'Certificado'
      when x.ready_to_certify then 'Listo para certificar'
      when x.critical_gaps > 0 then 'Requiere atención'
      when x.failed > 0 or x.correction_evidence > 0 then 'En mejora'
      when x.operational_resolved = 0 then 'No iniciado'
      when x.operational_resolved = x.operational_total and x.operational_percent >= 75 then 'Cumple'
      else 'En proceso' end
  ) order by x.period desc, x.career), '[]'::jsonb) into v_rows
  from private.expedient_indicator_snapshot x where x.teacher_id = v_teacher_id;

  return jsonb_build_object('rows', v_rows);
end;
$$;

grant execute on function public.teacher_indicator_summary(text) to anon, authenticated;
comment on view private.expedient_indicator_snapshot is 'Indicadores calculados en vivo. N/A resuelve el criterio pero no entra al promedio.';
comment on function public.staff_indicator_dashboard(uuid) is 'Dashboard de indicadores para coordinación o vista institucional.';
comment on function public.teacher_indicator_summary(text) is 'Indicadores del docente autenticado por token de dispositivo.';
