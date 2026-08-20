-- SIACD · Corrección de acceso docente por cédula + PIN
-- 1) Corrige la ambigüedad teacher_id que impedía crear sesiones.
-- 2) Añade almacenamiento cifrado recuperable para que el administrador pueda consultar el PIN.
-- 3) Mantiene BCrypt como mecanismo de validación del ingreso.

alter table public.teacher_access
  add column if not exists pin_admin_ciphertext text,
  add column if not exists pin_admin_iv text;

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

  select t.* into v_teacher
  from public.teachers t
  where t.national_id = v_national_id
    and t.active
  limit 1;

  if not found then return; end if;

  select a.* into v_access
  from public.teacher_access a
  where a.teacher_id = v_teacher.id
    and a.active
    and a.pin_hash is not null
  limit 1;

  if not found then return; end if;

  if extensions.crypt(p_pin, v_access.pin_hash) <> v_access.pin_hash then
    return;
  end if;

  update public.teacher_access a
    set first_verified_at = coalesce(a.first_verified_at, now()),
        last_verified_at = now(),
        updated_at = now()
    where a.teacher_id = v_teacher.id;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.teacher_device_sessions
    (teacher_id, token_hash, device_label, expires_at)
  values
    (v_teacher.id, extensions.digest(v_token, 'sha256'), nullif(trim(p_device_label), ''), v_expires);

  return query
  select v_token, v_teacher.id, v_teacher.full_name, v_access.email, v_expires;
end;
$$;

revoke all on function public.teacher_login_with_pin(text, text, text) from public, anon, authenticated;
grant execute on function public.teacher_login_with_pin(text, text, text) to service_role;

-- Compatibilidad con PIN creados antes de incorporar el cifrado recuperable.
-- Solo service_role puede invocarla. Se usa una sola vez para recuperar un PIN de 4 dígitos
-- desde el hash BCrypt y luego almacenarlo cifrado por la Edge Function.
create or replace function public.teacher_recover_pin_service(p_teacher_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_candidate text;
  v_number integer;
begin
  select a.pin_hash into v_hash
  from public.teacher_access a
  where a.teacher_id = p_teacher_id
    and a.active
    and a.pin_hash is not null
  limit 1;

  if v_hash is null then return null; end if;

  for v_number in 0..9999 loop
    v_candidate := lpad(v_number::text, 4, '0');
    if extensions.crypt(v_candidate, v_hash) = v_hash then
      return v_candidate;
    end if;
  end loop;

  return null;
end;
$$;

revoke all on function public.teacher_recover_pin_service(uuid) from public, anon, authenticated;
grant execute on function public.teacher_recover_pin_service(uuid) to service_role;

comment on function public.teacher_login_with_pin(text, text, text) is
  'Acceso docente recurrente mediante cédula y PIN de 4 dígitos. Corrige referencias ambiguas de teacher_id y crea sesión de dispositivo.';

comment on function public.teacher_recover_pin_service(uuid) is
  'Compatibilidad transitoria para PIN de 4 dígitos creados antes del cifrado recuperable; solo service_role.';
