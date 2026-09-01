-- SIACD · Gestión centralizada de períodos académicos
-- Protege nuevas altas/cambios de expediente frente a períodos inactivos o fechas fuera de rango.
-- Los expedientes históricos siguen pudiendo actualizar otros campos aunque su período luego se desactive.

create or replace function private.validate_expedient_academic_period()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_starts_on date;
  v_ends_on date;
  v_active boolean;
begin
  if tg_op = 'UPDATE'
     and new.period_id is not distinct from old.period_id
     and new.activities_start_on is not distinct from old.activities_start_on then
    return new;
  end if;

  select p.starts_on, p.ends_on, p.active
    into v_starts_on, v_ends_on, v_active
  from public.academic_periods p
  where p.id = new.period_id
  limit 1;

  if not found or not coalesce(v_active, false) then
    raise exception 'period_not_available';
  end if;

  if new.activities_start_on < v_starts_on
     or new.activities_start_on > v_ends_on then
    raise exception 'activity_date_outside_period';
  end if;

  return new;
end;
$$;

drop trigger if exists expedients_validate_academic_period on public.expedients;

create trigger expedients_validate_academic_period
before insert or update of period_id, activities_start_on
on public.expedients
for each row
execute function private.validate_expedient_academic_period();

comment on function private.validate_expedient_academic_period() is
  'Impide crear o cambiar un expediente hacia un período inactivo o con fecha de inicio fuera del rango institucional.';
