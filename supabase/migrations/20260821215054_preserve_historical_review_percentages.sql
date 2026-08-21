-- Los resultados de una revisión cerrada son una fotografía histórica.
-- Su porcentaje no debe cambiar cuando un criterio se desactiva en el catálogo vigente.

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
