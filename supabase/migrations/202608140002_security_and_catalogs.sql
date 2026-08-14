-- Endurecimiento de seguridad, índices operativos y catálogos iniciales ITSQMET.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

alter function public.current_siacd_role() set schema private;
alter function public.can_access_expedient(uuid) set schema private;
alter function public.handle_new_siacd_user() set schema private;

create or replace function private.can_access_expedient(target_id uuid)
returns boolean
language sql stable security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.expedients e
    where e.id = target_id
      and (
        e.coordinator_id = (select auth.uid())
        or private.current_siacd_role() in ('admin','approver')
      )
  )
$$;

revoke execute on function private.current_siacd_role() from public, anon;
revoke execute on function private.can_access_expedient(uuid) from public, anon;
revoke execute on function private.handle_new_siacd_user() from public, anon, authenticated;
grant execute on function private.current_siacd_role() to authenticated;
grant execute on function private.can_access_expedient(uuid) to authenticated;

create index if not exists approvals_expedient_idx on public.approvals(expedient_id);
create index if not exists approvals_reviewer_idx on public.approvals(reviewer_id);
create index if not exists careers_campus_idx on public.careers(campus_id);
create index if not exists competency_definitions_hito_idx on public.competency_definitions(hito_id);
create index if not exists competency_scores_competency_idx on public.competency_scores(competency_id);
create index if not exists competency_scores_evaluator_idx on public.competency_scores(evaluated_by);
create index if not exists coordinator_careers_career_idx on public.coordinator_careers(career_id);
create index if not exists evidences_hito_idx on public.evidences(hito_id);
create index if not exists evidences_uploader_idx on public.evidences(uploaded_by);
create index if not exists expedients_career_idx on public.expedients(career_id);
create index if not exists expedients_period_idx on public.expedients(period_id);
create index if not exists followups_creator_idx on public.followups(created_by);
create index if not exists followups_hito_idx on public.followups(hito_id);
create index if not exists generated_documents_expedient_idx on public.generated_documents(expedient_id);
create index if not exists generated_documents_generator_idx on public.generated_documents(generated_by);
create index if not exists hito_schedules_hito_idx on public.hito_schedules(hito_id);
create index if not exists improvement_actions_competency_idx on public.improvement_actions(competency_id);
create index if not exists improvement_actions_expedient_idx on public.improvement_actions(expedient_id);
create index if not exists improvement_actions_verifier_idx on public.improvement_actions(verified_by);
create index if not exists teachers_creator_idx on public.teachers(created_by);

insert into public.campuses(name)
values ('Matriz')
on conflict (name) do update set active = true;

with campus as (
  select id from public.campuses where name = 'Matriz'
)
insert into public.careers(campus_id, name, modality)
select campus.id, item.name, item.modality
from campus
cross join (values
  ('Enfermería', 'Presencial'),
  ('Tecnología Superior en Desarrollo de Software', 'Híbrida'),
  ('Tecnología Superior en Marketing Digital y Comercio Electrónico', 'Híbrida'),
  ('Tecnología Superior en Mecánica Automotriz', 'Presencial')
) as item(name, modality)
on conflict (name, campus_id) do update
set modality = excluded.modality,
    active = true;

insert into public.academic_periods(name, starts_on, ends_on)
values
  ('Febrero – Agosto 2026', '2026-02-01', '2026-08-31'),
  ('Mayo – Noviembre 2026', '2026-05-01', '2026-11-30')
on conflict (name) do update
set starts_on = excluded.starts_on,
    ends_on = excluded.ends_on,
    active = true;
