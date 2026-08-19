-- SIACD · Rediseño Bloque 1
-- Base para acceso docente por código de 4 dígitos, dispositivo recordado,
-- ciclos de revisión e historial sin sobrescribir evaluaciones anteriores.

create table if not exists public.teacher_access (
  teacher_id uuid primary key references public.teachers(id) on delete cascade,
  email text not null,
  active boolean not null default true,
  first_verified_at timestamptz,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (position('@' in email) > 1)
);

create unique index if not exists teacher_access_email_unique
  on public.teacher_access (lower(email));

create table if not exists public.teacher_login_codes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  email text not null,
  code_hash bytea not null,
  expires_at timestamptz not null,
  attempts smallint not null default 0 check (attempts between 0 and 10),
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists teacher_login_codes_lookup_idx
  on public.teacher_login_codes (lower(email), created_at desc);

create table if not exists public.teacher_device_sessions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  token_hash bytea not null unique,
  device_label text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists teacher_device_sessions_teacher_idx
  on public.teacher_device_sessions (teacher_id, expires_at desc);

create table if not exists public.review_cycles (
  id uuid primary key default gen_random_uuid(),
  expedient_id uuid not null references public.expedients(id) on delete cascade,
  hito_id text references public.hito_definitions(id),
  sequence integer not null check (sequence > 0),
  cycle_type text not null default 'institutional'
    check (cycle_type in ('institutional','corrective','extraordinary','quality')),
  title text not null,
  scheduled_on date,
  opened_at timestamptz,
  closed_at timestamptz,
  status text not null default 'planned'
    check (status in ('planned','open','closed','cancelled')),
  created_by_staff_id uuid references public.siacd_staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (expedient_id, sequence)
);

create index if not exists review_cycles_expedient_idx
  on public.review_cycles (expedient_id, sequence);
create index if not exists review_cycles_scheduled_idx
  on public.review_cycles (scheduled_on, status);

create table if not exists public.review_results (
  id uuid primary key default gen_random_uuid(),
  review_cycle_id uuid not null references public.review_cycles(id) on delete cascade,
  criterion_type text not null default 'operational'
    check (criterion_type in ('operational','complementary','quality')),
  criterion_id text not null,
  score smallint check (score between 0 and 4),
  not_applicable boolean not null default false,
  passed boolean generated always as (
    case
      when not_applicable or score is null then null
      else score >= 3
    end
  ) stored,
  observation text,
  evaluated_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (review_cycle_id, criterion_type, criterion_id),
  check (not (not_applicable and score is not null))
);

create index if not exists review_results_cycle_idx
  on public.review_results (review_cycle_id);
create index if not exists review_results_status_idx
  on public.review_results (passed, not_applicable);

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  expedient_id uuid not null references public.expedients(id) on delete cascade,
  review_cycle_id uuid references public.review_cycles(id) on delete set null,
  actor_type text not null check (actor_type in ('teacher','coordinator','admin','system')),
  actor_teacher_id uuid references public.teachers(id) on delete set null,
  actor_staff_id uuid references public.siacd_staff(id) on delete set null,
  event_type text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_log_expedient_idx
  on public.activity_log (expedient_id, created_at desc);

alter table public.teacher_access enable row level security;
alter table public.teacher_login_codes enable row level security;
alter table public.teacher_device_sessions enable row level security;
alter table public.review_cycles enable row level security;
alter table public.review_results enable row level security;
alter table public.activity_log enable row level security;

-- Estas tablas nuevas no heredan el acceso anónimo global del sistema legado.
revoke all on public.teacher_access from anon, authenticated;
revoke all on public.teacher_login_codes from anon, authenticated;
revoke all on public.teacher_device_sessions from anon, authenticated;
revoke all on public.review_cycles from anon, authenticated;
revoke all on public.review_results from anon, authenticated;
revoke all on public.activity_log from anon, authenticated;

grant all on public.teacher_access, public.teacher_login_codes, public.teacher_device_sessions,
  public.review_cycles, public.review_results, public.activity_log to service_role;

create or replace function public.teacher_verify_access(
  p_email text,
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
begin
  if p_email is null or p_code !~ '^[0-9]{4}$' then
    return;
  end if;

  select * into v_access
  from public.teacher_access
  where lower(email) = lower(trim(p_email)) and active
  limit 1;

  if not found then return; end if;

  select * into v_code
  from public.teacher_login_codes
  where teacher_id = v_access.teacher_id
    and lower(email) = lower(trim(p_email))
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
    where teacher_id = v_access.teacher_id;

  select * into v_teacher
  from public.teachers
  where id = v_access.teacher_id and active;

  if not found then return; end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.teacher_device_sessions
    (teacher_id, token_hash, device_label, expires_at)
  values
    (v_access.teacher_id, extensions.digest(v_token, 'sha256'), nullif(trim(p_device_label), ''), v_expires);

  return query
  select v_token, v_teacher.id, v_teacher.full_name, v_access.email, v_expires;
end;
$$;

create or replace function public.teacher_validate_device(p_token text)
returns table (
  teacher_id uuid,
  full_name text,
  email text,
  session_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
begin
  if p_token is null or length(p_token) < 40 then return; end if;

  select s.id into v_session_id
  from public.teacher_device_sessions s
  join public.teacher_access a on a.teacher_id = s.teacher_id and a.active
  where s.token_hash = extensions.digest(p_token, 'sha256')
    and s.revoked_at is null
    and s.expires_at > now()
  limit 1;

  if not found then return; end if;

  update public.teacher_device_sessions
    set last_seen_at = now()
    where id = v_session_id;

  return query
  select t.id, t.full_name, a.email, s.expires_at
  from public.teacher_device_sessions s
  join public.teacher_access a on a.teacher_id = s.teacher_id and a.active
  join public.teachers t on t.id = s.teacher_id and t.active
  where s.id = v_session_id;
end;
$$;

create or replace function public.teacher_revoke_device(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.teacher_device_sessions
    set revoked_at = now()
    where token_hash = extensions.digest(p_token, 'sha256')
      and revoked_at is null;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

create or replace function public.teacher_portal_summary(p_token text)
returns table (
  expedient_id uuid,
  career text,
  period text,
  subject text,
  status text,
  activities_start_on date,
  planned_close_on date,
  hitos_executed bigint
)
language sql
security definer
set search_path = ''
as $$
  with valid_teacher as (
    select s.teacher_id
    from public.teacher_device_sessions s
    join public.teacher_access a on a.teacher_id = s.teacher_id and a.active
    where s.token_hash = extensions.digest(p_token, 'sha256')
      and s.revoked_at is null
      and s.expires_at > now()
    limit 1
  )
  select
    e.id,
    c.name,
    p.name,
    e.subject_names,
    e.status::text,
    e.activities_start_on,
    e.planned_close_on,
    count(hs.id) filter (where hs.executed_on is not null)
  from public.expedients e
  join valid_teacher vt on vt.teacher_id = e.teacher_id
  join public.careers c on c.id = e.career_id
  join public.academic_periods p on p.id = e.period_id
  left join public.hito_schedules hs on hs.expedient_id = e.id
  group by e.id, c.name, p.name, e.subject_names, e.status, e.activities_start_on, e.planned_close_on
  order by e.created_at desc;
$$;

grant execute on function public.teacher_verify_access(text, text, text) to anon, authenticated;
grant execute on function public.teacher_validate_device(text) to anon, authenticated;
grant execute on function public.teacher_revoke_device(text) to anon, authenticated;
grant execute on function public.teacher_portal_summary(text) to anon, authenticated;

comment on table public.review_cycles is 'Ciclos de revisión repetibles. H1-H6 siguen siendo hitos institucionales; las correcciones no los sobrescriben.';
comment on table public.review_results is 'Historial de resultados por ciclo. Puntaje 3-4 pasa, 0-2 no pasa y N/A no computa.';
comment on table public.activity_log is 'Historial cronológico de acciones del docente, coordinador, administrador y sistema.';
