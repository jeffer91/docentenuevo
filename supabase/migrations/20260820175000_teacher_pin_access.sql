-- SIACD · Acceso docente por cédula + PIN
-- Primer ingreso: completa datos y crea PIN.
-- Ingresos posteriores: cédula + PIN. Mantiene compatibilidad con sesiones existentes.

alter table public.teacher_access
  add column if not exists pin_hash text,
  add column if not exists pin_created_at timestamptz;

create or replace function public.teacher_register_pin(
  p_teacher_id uuid,
  p_email text,
  p_pin text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  if p_teacher_id is null or p_pin !~ '^[0-9]{4}$' then
    return false;
  end if;

  if not exists (
    select 1 from public.teachers t where t.id = p_teacher_id and t.active
  ) then
    return false;
  end if;

  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' or position('@' in v_email) <= 1 then
    return false;
  end if;

  insert into public.teacher_access (
    teacher_id,
    email,
    active,
    pin_hash,
    pin_created_at,
    first_verified_at,
    last_verified_at,
    updated_at
  ) values (
    p_teacher_id,
    v_email,
    true,
    extensions.crypt(p_pin, extensions.gen_salt('bf', 8)),
    now(),
    now(),
    now(),
    now()
  )
  on conflict (teacher_id) do update
    set email = excluded.email,
        active = true,
        pin_hash = excluded.pin_hash,
        pin_created_at = now(),
        first_verified_at = coalesce(public.teacher_access.first_verified_at, now()),
        last_verified_at = now(),
        updated_at = now();

  return true;
exception
  when unique_violation then
    return false;
end;
$$;

create or replace function public.teacher_login_with_pin(
  p_national_id text,
  p_pin text,
  p_device_label text default null
)
returns table (
  device_token text,
  teacher_id uuid,
  full_name text,
  email text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_teacher public.teachers%rowtype;
  v_access public.teacher_access%rowtype;
  v_token text;
  v_expires timestamptz := now() + interval '90 days';
  v_national_id text;
begin
  v_national_id := regexp_replace(coalesce(p_national_id, ''), '[^0-9]', '', 'g');
  if length(v_national_id) = 9 then
    v_national_id := '0' || v_national_id;
  end if;

  if v_national_id !~ '^[0-9]{10}$' or p_pin !~ '^[0-9]{4}$' then
    return;
  end if;

  select * into v_teacher
  from public.teachers
  where national_id = v_national_id and active
  limit 1;

  if not found then return; end if;

  select * into v_access
  from public.teacher_access
  where teacher_id = v_teacher.id
    and active
    and pin_hash is not null
  limit 1;

  if not found then return; end if;

  if extensions.crypt(p_pin, v_access.pin_hash) <> v_access.pin_hash then
    return;
  end if;

  update public.teacher_access
    set first_verified_at = coalesce(first_verified_at, now()),
        last_verified_at = now(),
        updated_at = now()
    where teacher_id = v_teacher.id;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.teacher_device_sessions
    (teacher_id, token_hash, device_label, expires_at)
  values
    (v_teacher.id, extensions.digest(v_token, 'sha256'), nullif(trim(p_device_label), ''), v_expires);

  return query
  select v_token, v_teacher.id, v_teacher.full_name, v_access.email, v_expires;
end;
$$;

revoke all on function public.teacher_register_pin(uuid, text, text) from public, anon, authenticated;
revoke all on function public.teacher_login_with_pin(text, text, text) from public, anon, authenticated;
grant execute on function public.teacher_register_pin(uuid, text, text) to service_role;
grant execute on function public.teacher_login_with_pin(text, text, text) to service_role;

comment on function public.teacher_login_with_pin(text, text, text) is
  'Acceso docente recurrente mediante cédula y PIN de 4 dígitos. Solo invocable por service_role desde la función teacher-access.';
