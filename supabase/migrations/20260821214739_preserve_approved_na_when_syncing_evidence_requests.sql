-- Evita reabrir solicitudes de evidencia cuando un criterio ya fue aprobado como No aplica.

create or replace function private.sync_default_criterion_evidence_requests(p_expedient_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_expedient_id is null then return; end if;

  insert into public.evidence_requests(
    expedient_id,hito_id,criterion_id,title,instructions,required,status,origin,created_by_staff_id
  )
  select
    p_expedient_id,
    cd.hito_id,
    cd.id,
    cd.observable_competency,
    cd.expected_evidence,
    true,
    'pending',
    'criterion_default',
    null
  from public.competency_definitions cd
  where cd.active
    and cd.criterion_mode = 'evidence'
  on conflict (expedient_id, criterion_id)
    where origin = 'criterion_default' and criterion_id is not null
  do update set
    hito_id = excluded.hito_id,
    title = excluded.title,
    instructions = excluded.instructions,
    required = true,
    status = case
      when public.evidence_requests.status = 'cancelled'
        and not exists (
          select 1
          from public.criterion_na_requests nr
          where nr.expedient_id = p_expedient_id
            and nr.criterion_id = excluded.criterion_id
            and nr.status = 'approved'
        )
        and not exists (
          select 1
          from public.competency_scores cs
          where cs.expedient_id = p_expedient_id
            and cs.competency_id = excluded.criterion_id
            and coalesce(cs.not_applicable, false)
        )
      then 'pending'
      else public.evidence_requests.status
    end,
    updated_at = now();

  update public.evidence_requests er
  set status = 'cancelled', updated_at = now()
  where er.expedient_id = p_expedient_id
    and er.origin = 'criterion_default'
    and er.criterion_id is not null
    and er.status in ('pending','submitted','in_review','correction_required')
    and not exists (
      select 1
      from public.competency_definitions cd
      where cd.id = er.criterion_id
        and cd.active
        and cd.criterion_mode = 'evidence'
    );
end;
$$;

revoke all on function private.sync_default_criterion_evidence_requests(uuid) from public, anon, authenticated;
grant execute on function private.sync_default_criterion_evidence_requests(uuid) to service_role;
