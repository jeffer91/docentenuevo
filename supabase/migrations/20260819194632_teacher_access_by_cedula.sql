-- SIACD · Acceso docente por cédula
-- El docente se identifica con su cédula y confirma el primer ingreso con un código de 4 dígitos.

create or replace function public.teacher_verify_access_by_cedula(
  p_national_id text,
  p_code text,
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
  v_code public.teacher_login_codes%rowtype;
  v_access public.teacher_access%rowtype;
  v_teacher public.teachers%rowtype;
  v_token text;
  v_expires timestamptz := now() + interval '90 days';
  v_national_id text;
begin
  v_national_id := regexp_replace(coalesce(p_national_id, ''), '[^0-9]', '', 'g');
  if length(v_national_id) = 9 then
    v_national_id := '0' || v_national_id;
  end if;

  if v_national_id !~ '^[0-9]{10}$' or p_code !~ '^[0-9]{4}$' then
    return;
  end if;

  select * into v_teacher
  from public.teachers
  where national_id = v_national_id and active
  limit 1;

  if not found then return; end if;

  select * into v_access
  from public.teacher_access
  where teacher_id = v_teacher.id and active
  limit 1;

  if not found then return; end if;

  select * into v_code
  from public.teacher_login_codes
  where teacher_id = v_teacher.id
    and consumed_at is null
    and expires_at > now()
    and attempts < 5
  order by created_at desc
  limit 1
  for update;

  if not found then return; end if;

  if v_code.code_hash <> extensions.digest(p_code, 'sha256') then
    update public.teacher_login_codes
      set attempts = least(attempts + 1, 10)
      where id = v_code.id;
    return;
  end if;

  update public.teacher_login_codes
    set consumed_at = now()
    where id = v_code.id;

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

grant execute on function public.teacher_verify_access_by_cedula(text, text, text) to anon, authenticated;

comment on function public.teacher_verify_access_by_cedula(text, text, text) is
  'Verifica el código de 4 dígitos usando la cédula como identificador de ingreso del docente.';
