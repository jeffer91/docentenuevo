-- SIACD · Primer acceso de coordinadores
-- Permite que un coordinador activo cree su PIN solo cuando todavía no existe.
-- Una vez configurado, el PIN no puede sobrescribirse mediante esta función.

create or replace function public.coordinator_register_pin(
  p_staff_id uuid,
  p_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted uuid;
begin
  if not exists (
    select 1
    from public.siacd_staff s
    where s.id = p_staff_id
      and s.role::text = 'coordinator'
      and s.active
  ) then
    return jsonb_build_object('ok', false, 'reason', 'coordinator_not_available');
  end if;

  if coalesce(p_pin, '') !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_pin');
  end if;

  insert into private.coordinator_pins (staff_id, pin_hash, changed_at)
  values (
    p_staff_id,
    extensions.crypt(p_pin, extensions.gen_salt('bf', 10)),
    now()
  )
  on conflict (staff_id) do nothing
  returning staff_id into v_inserted;

  if v_inserted is null then
    return jsonb_build_object('ok', false, 'reason', 'pin_already_configured');
  end if;

  return jsonb_build_object('ok', true, 'reason', 'registered');
end;
$$;

revoke all on function public.coordinator_register_pin(uuid, text) from public;
grant execute on function public.coordinator_register_pin(uuid, text) to anon, authenticated;

comment on function public.coordinator_register_pin(uuid, text) is
  'Primer acceso del coordinador: crea un PIN de 4 dígitos únicamente si todavía no existe uno configurado.';
