-- SIACD · Acceso de coordinadores mediante PIN personal.
-- El PIN nunca se almacena en texto plano ni se expone por PostgREST.

create table if not exists private.coordinator_pins (
  staff_id uuid primary key references public.siacd_staff(id) on delete cascade,
  pin_hash text not null,
  changed_at timestamptz not null default now()
);

revoke all on table private.coordinator_pins from public, anon, authenticated;

create or replace function public.coordinator_verify_pin(
  p_staff_id uuid,
  p_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active boolean;
  v_role text;
  v_hash text;
begin
  select s.active, s.role::text, cp.pin_hash
    into v_active, v_role, v_hash
  from public.siacd_staff s
  left join private.coordinator_pins cp on cp.staff_id = s.id
  where s.id = p_staff_id;

  if not found or v_role <> 'coordinator' or not coalesce(v_active, false) then
    return jsonb_build_object('ok', false, 'reason', 'coordinator_not_available');
  end if;

  if v_hash is null then
    return jsonb_build_object('ok', false, 'reason', 'pin_not_configured');
  end if;

  if coalesce(p_pin, '') !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_pin');
  end if;

  if extensions.crypt(p_pin, v_hash) = v_hash then
    return jsonb_build_object('ok', true, 'reason', 'verified');
  end if;

  return jsonb_build_object('ok', false, 'reason', 'invalid_pin');
end;
$$;

create or replace function public.staff_set_coordinator_pin(
  p_staff_id uuid,
  p_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.siacd_staff s
    where s.id = p_staff_id
      and s.role::text = 'coordinator'
  ) then
    raise exception 'coordinator_not_found';
  end if;

  if coalesce(p_pin, '') !~ '^[0-9]{4}$' then
    raise exception 'pin_must_have_4_digits';
  end if;

  insert into private.coordinator_pins (staff_id, pin_hash, changed_at)
  values (
    p_staff_id,
    extensions.crypt(p_pin, extensions.gen_salt('bf', 10)),
    now()
  )
  on conflict (staff_id) do update
    set pin_hash = excluded.pin_hash,
        changed_at = excluded.changed_at;

  return jsonb_build_object('ok', true, 'staff_id', p_staff_id);
end;
$$;

create or replace function public.coordinator_pin_overview()
returns table (
  staff_id uuid,
  full_name text,
  active boolean,
  pin_configured boolean,
  changed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    s.full_name,
    s.active,
    cp.staff_id is not null,
    cp.changed_at
  from public.siacd_staff s
  left join private.coordinator_pins cp on cp.staff_id = s.id
  where s.role::text = 'coordinator'
  order by s.full_name;
$$;

revoke all on function public.coordinator_verify_pin(uuid, text) from public;
revoke all on function public.staff_set_coordinator_pin(uuid, text) from public;
revoke all on function public.coordinator_pin_overview() from public;

grant execute on function public.coordinator_verify_pin(uuid, text) to anon, authenticated;
grant execute on function public.staff_set_coordinator_pin(uuid, text) to anon, authenticated;
grant execute on function public.coordinator_pin_overview() to anon, authenticated;
