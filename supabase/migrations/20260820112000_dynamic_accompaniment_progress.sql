-- SIACD · Sincronización automática del avance con el nuevo catálogo.
-- Evita que el panel general siga dependiendo de fechas H1-H6 cargadas manualmente:
-- cada hito técnico se marca como ejecutado/validado cuando todos sus criterios
-- activos están resueltos (puntaje o No aplica).

create or replace function private.sync_accompaniment_progress(p_expedient_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hito text;
  v_total integer;
  v_resolved integer;
  v_weight numeric;
  v_weighted numeric;
  v_critical integer;
begin
  if p_expedient_id is null then return; end if;

  for v_hito in select unnest(array['H1','H2','H3','H4','H5','H6'])
  loop
    select
      count(cd.id)::int,
      count(cs.competency_id) filter (
        where cs.score is not null or coalesce(cs.not_applicable, false)
      )::int
    into v_total, v_resolved
    from public.competency_definitions cd
    left join public.competency_scores cs
      on cs.expedient_id = p_expedient_id
      and cs.competency_id = cd.id
    where cd.active
      and cd.hito_id = v_hito;

    insert into public.hito_schedules(expedient_id, hito_id)
    values (p_expedient_id, v_hito)
    on conflict (expedient_id, hito_id) do nothing;

    if v_total > 0 and v_resolved >= v_total then
      update public.hito_schedules
      set executed_on = coalesce(executed_on, current_date),
          coordinator_validated = true
      where expedient_id = p_expedient_id
        and hito_id = v_hito;
    else
      update public.hito_schedules hs
      set executed_on = null,
          coordinator_validated = false
      from public.expedients e
      where hs.expedient_id = p_expedient_id
        and hs.expedient_id = e.id
        and hs.hito_id = v_hito
        and e.status::text in ('draft','in_progress','with_gaps','ready_for_review','returned');
    end if;
  end loop;

  select
    coalesce(sum(cd.relative_weight) filter (
      where cs.score is not null and not coalesce(cs.not_applicable, false)
    ), 0),
    coalesce(sum(cs.score::numeric * cd.relative_weight) filter (
      where cs.score is not null and not coalesce(cs.not_applicable, false)
    ), 0),
    count(*) filter (
      where cd.criticality = 'Crítica'
        and cs.score is not null
        and not coalesce(cs.not_applicable, false)
        and cs.score < 3
    )::int
  into v_weight, v_weighted, v_critical
  from public.competency_definitions cd
  left join public.competency_scores cs
    on cs.expedient_id = p_expedient_id
    and cs.competency_id = cd.id
  where cd.active;

  update public.expedients
  set operational_score = case when v_weight > 0 then (v_weighted / v_weight / 4) else null end,
      critical_gaps = coalesce(v_critical, 0),
      updated_at = now()
  where id = p_expedient_id;
end;
$$;

revoke all on function private.sync_accompaniment_progress(uuid) from public, anon, authenticated;
grant execute on function private.sync_accompaniment_progress(uuid) to service_role;

create or replace function private.competency_scores_sync_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_accompaniment_progress(coalesce(new.expedient_id, old.expedient_id));
  return coalesce(new, old);
end;
$$;

revoke all on function private.competency_scores_sync_progress() from public, anon, authenticated;
grant execute on function private.competency_scores_sync_progress() to service_role;

drop trigger if exists competency_scores_sync_progress on public.competency_scores;
create trigger competency_scores_sync_progress
after insert or update or delete on public.competency_scores
for each row execute function private.competency_scores_sync_progress();

-- Los procesos todavía activos vuelven a calcular sus seis hitos con el catálogo nuevo.
-- Expedientes certificados/archivados y cierres ya consolidados no se alteran.
update public.hito_schedules hs
set executed_on = null,
    coordinator_validated = false
from public.expedients e
where hs.expedient_id = e.id
  and hs.hito_id in ('H1','H2','H3','H4','H5','H6')
  and e.status::text in ('draft','in_progress','with_gaps','ready_for_review','returned');

-- Recalcula métricas de todos los expedientes activos después de instalar el catálogo.
do $$
declare
  v_id uuid;
begin
  for v_id in
    select id from public.expedients
    where status::text in ('draft','in_progress','with_gaps','ready_for_review','returned')
  loop
    perform private.sync_accompaniment_progress(v_id);
  end loop;
end $$;
