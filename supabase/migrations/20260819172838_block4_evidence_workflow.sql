-- SIACD · Rediseño Bloque 4
-- Flujo de evidencias: solicitud, envío docente versionado, revisión y corrección.

create table if not exists public.evidence_requests (
  id uuid primary key default gen_random_uuid(),
  expedient_id uuid not null references public.expedients(id) on delete cascade,
  hito_id text references public.hito_definitions(id),
  criterion_id text,
  title text not null,
  instructions text,
  due_on date,
  required boolean not null default true,
  status text not null default 'pending'
    check (status in ('pending','submitted','in_review','correction_required','approved','cancelled')),
  created_by_staff_id uuid references public.siacd_staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists evidence_requests_expedient_idx
  on public.evidence_requests(expedient_id, status, due_on);
create index if not exists evidence_requests_hito_idx
  on public.evidence_requests(hito_id);
create index if not exists evidence_requests_staff_idx
  on public.evidence_requests(created_by_staff_id);

create table if not exists public.evidence_submissions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.evidence_requests(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  version integer not null check (version > 0),
  file_name text not null,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  storage_path text not null,
  teacher_comment text,
  status text not null default 'submitted'
    check (status in ('submitted','correction_required','approved','superseded')),
  submitted_at timestamptz not null default now(),
  reviewed_by_staff_id uuid references public.siacd_staff(id) on delete set null,
  reviewed_at timestamptz,
  review_comment text,
  legacy_evidence_id uuid references public.evidences(id) on delete set null,
  unique (request_id, version)
);

create index if not exists evidence_submissions_request_idx
  on public.evidence_submissions(request_id, version desc);
create index if not exists evidence_submissions_teacher_idx
  on public.evidence_submissions(teacher_id, submitted_at desc);
create index if not exists evidence_submissions_reviewer_idx
  on public.evidence_submissions(reviewed_by_staff_id);

alter table public.evidence_requests enable row level security;
alter table public.evidence_submissions enable row level security;
revoke all on public.evidence_requests from anon, authenticated;
revoke all on public.evidence_submissions from anon, authenticated;
grant all on public.evidence_requests, public.evidence_submissions to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'siacd-teacher-evidence',
  'siacd-teacher-evidence',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','application/pdf']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.staff_can_manage_expedient(p_expedient_id uuid, p_staff_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.expedients e
    join public.siacd_staff s on s.id = p_staff_id and s.active
    where e.id = p_expedient_id
      and (s.role = 'admin' or e.coordinator_staff_id = p_staff_id)
  );
$$;
revoke all on function private.staff_can_manage_expedient(uuid, uuid) from public, anon, authenticated;
grant execute on function private.staff_can_manage_expedient(uuid, uuid) to service_role;

create or replace function public.teacher_evidence_workspace(p_token text, p_expedient_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_teacher_id uuid;
  v_requests jsonb;
begin
  select s.teacher_id into v_teacher_id
  from public.teacher_device_sessions s
  join public.teacher_access a on a.teacher_id = s.teacher_id and a.active
  join public.expedients e on e.teacher_id = s.teacher_id and e.id = p_expedient_id
  where s.token_hash = extensions.digest(p_token, 'sha256')
    and s.revoked_at is null
    and s.expires_at > now()
  limit 1;

  if not found then return null; end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', er.id,
      'hito_id', er.hito_id,
      'criterion_id', er.criterion_id,
      'title', er.title,
      'instructions', er.instructions,
      'due_on', er.due_on,
      'required', er.required,
      'status', er.status,
      'created_at', er.created_at,
      'submissions', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', es.id,
          'version', es.version,
          'file_name', es.file_name,
          'mime_type', es.mime_type,
          'size_bytes', es.size_bytes,
          'teacher_comment', es.teacher_comment,
          'status', es.status,
          'submitted_at', es.submitted_at,
          'reviewed_at', es.reviewed_at,
          'review_comment', es.review_comment
        ) order by es.version desc)
        from public.evidence_submissions es
        where es.request_id = er.id and es.teacher_id = v_teacher_id
      ), '[]'::jsonb)
    ) order by
      case er.status when 'correction_required' then 0 when 'pending' then 1 when 'submitted' then 2 when 'in_review' then 3 when 'approved' then 4 else 5 end,
      er.due_on asc nulls last,
      er.created_at desc
  ), '[]'::jsonb)
  into v_requests
  from public.evidence_requests er
  where er.expedient_id = p_expedient_id
    and er.status <> 'cancelled';

  return jsonb_build_object(
    'requests', v_requests,
    'pending', (select count(*) from public.evidence_requests where expedient_id = p_expedient_id and status = 'pending'),
    'corrections', (select count(*) from public.evidence_requests where expedient_id = p_expedient_id and status = 'correction_required'),
    'waiting_review', (select count(*) from public.evidence_requests where expedient_id = p_expedient_id and status in ('submitted','in_review')),
    'approved', (select count(*) from public.evidence_requests where expedient_id = p_expedient_id and status = 'approved')
  );
end;
$$;

grant execute on function public.teacher_evidence_workspace(text, uuid) to anon, authenticated;

create or replace function public.staff_evidence_workspace(p_expedient_id uuid, p_staff_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requests jsonb;
  v_criteria jsonb;
begin
  if not private.staff_can_manage_expedient(p_expedient_id, p_staff_id) then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', cd.id,
    'hito_id', cd.hito_id,
    'label', cd.observable_competency,
    'criticality', cd.criticality,
    'expected_evidence', cd.expected_evidence
  ) order by cd.hito_id, cd.id), '[]'::jsonb)
  into v_criteria
  from public.competency_definitions cd
  where cd.active;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', er.id,
      'hito_id', er.hito_id,
      'criterion_id', er.criterion_id,
      'title', er.title,
      'instructions', er.instructions,
      'due_on', er.due_on,
      'required', er.required,
      'status', er.status,
      'created_at', er.created_at,
      'submissions', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', es.id,
          'version', es.version,
          'file_name', es.file_name,
          'mime_type', es.mime_type,
          'size_bytes', es.size_bytes,
          'teacher_comment', es.teacher_comment,
          'status', es.status,
          'submitted_at', es.submitted_at,
          'reviewed_at', es.reviewed_at,
          'review_comment', es.review_comment
        ) order by es.version desc)
        from public.evidence_submissions es
        where es.request_id = er.id
      ), '[]'::jsonb)
    ) order by
      case er.status when 'submitted' then 0 when 'in_review' then 1 when 'correction_required' then 2 when 'pending' then 3 when 'approved' then 4 else 5 end,
      er.due_on asc nulls last,
      er.created_at desc
  ), '[]'::jsonb)
  into v_requests
  from public.evidence_requests er
  where er.expedient_id = p_expedient_id
    and er.status <> 'cancelled';

  return jsonb_build_object(
    'criteria', v_criteria,
    'requests', v_requests,
    'pending_review', (select count(*) from public.evidence_requests where expedient_id = p_expedient_id and status in ('submitted','in_review')),
    'corrections', (select count(*) from public.evidence_requests where expedient_id = p_expedient_id and status = 'correction_required'),
    'approved', (select count(*) from public.evidence_requests where expedient_id = p_expedient_id and status = 'approved')
  );
end;
$$;

grant execute on function public.staff_evidence_workspace(uuid, uuid) to anon, authenticated;

create or replace function public.staff_create_evidence_request(
  p_expedient_id uuid,
  p_staff_id uuid,
  p_hito_id text,
  p_criterion_id text,
  p_title text,
  p_instructions text,
  p_due_on date,
  p_required boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_actor text;
begin
  if not private.staff_can_manage_expedient(p_expedient_id, p_staff_id) then
    raise exception 'not_allowed';
  end if;
  if nullif(trim(p_title), '') is null then
    raise exception 'title_required';
  end if;
  if p_hito_id is not null and not exists(select 1 from public.hito_definitions where id = p_hito_id) then
    raise exception 'invalid_hito';
  end if;
  if p_criterion_id is not null and not exists(select 1 from public.competency_definitions where id = p_criterion_id) then
    raise exception 'invalid_criterion';
  end if;

  insert into public.evidence_requests(
    expedient_id, hito_id, criterion_id, title, instructions, due_on, required, created_by_staff_id
  ) values (
    p_expedient_id, p_hito_id, nullif(trim(p_criterion_id), ''), trim(p_title), nullif(trim(p_instructions), ''), p_due_on, coalesce(p_required, true), p_staff_id
  ) returning id into v_id;

  select case when role = 'admin' then 'admin' else 'coordinator' end into v_actor
  from public.siacd_staff where id = p_staff_id;

  insert into public.activity_log(expedient_id, actor_type, actor_staff_id, event_type, message, metadata)
  values (
    p_expedient_id,
    coalesce(v_actor, 'coordinator'),
    p_staff_id,
    'evidence_requested',
    'Se solicitó una nueva evidencia al docente.',
    jsonb_build_object('request_id', v_id, 'hito_id', p_hito_id, 'criterion_id', p_criterion_id, 'title', trim(p_title))
  );

  return v_id;
end;
$$;

grant execute on function public.staff_create_evidence_request(uuid, uuid, text, text, text, text, date, boolean) to anon, authenticated;

create or replace function public.staff_review_evidence_submission(
  p_submission_id uuid,
  p_staff_id uuid,
  p_decision text,
  p_comment text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_submission public.evidence_submissions%rowtype;
  v_request public.evidence_requests%rowtype;
  v_evidence_id uuid;
  v_kind public.evidence_kind;
  v_actor text;
begin
  if p_decision not in ('approved','correction_required') then
    raise exception 'invalid_decision';
  end if;

  select * into v_submission from public.evidence_submissions where id = p_submission_id for update;
  if not found then raise exception 'submission_not_found'; end if;
  select * into v_request from public.evidence_requests where id = v_submission.request_id for update;
  if not found then raise exception 'request_not_found'; end if;

  if not private.staff_can_manage_expedient(v_request.expedient_id, p_staff_id) then
    raise exception 'not_allowed';
  end if;
  if p_decision = 'correction_required' and nullif(trim(p_comment), '') is null then
    raise exception 'comment_required';
  end if;

  update public.evidence_submissions
  set status = p_decision,
      reviewed_by_staff_id = p_staff_id,
      reviewed_at = now(),
      review_comment = nullif(trim(p_comment), '')
  where id = p_submission_id;

  update public.evidence_requests
  set status = p_decision,
      updated_at = now()
  where id = v_request.id;

  if p_decision = 'approved' then
    if v_submission.legacy_evidence_id is null then
      v_kind := case when coalesce(v_submission.mime_type,'') like 'image/%'
        then 'screenshot'::public.evidence_kind else 'file'::public.evidence_kind end;

      insert into public.evidences(
        expedient_id, hito_id, kind, title, description, storage_path,
        mime_type, size_bytes, happened_on, uploaded_by, uploaded_by_staff_id
      ) values (
        v_request.expedient_id,
        v_request.hito_id,
        v_kind,
        v_request.title,
        concat_ws(E'\n', v_request.instructions, v_submission.teacher_comment),
        v_submission.storage_path,
        v_submission.mime_type,
        v_submission.size_bytes,
        current_date,
        null,
        null
      ) returning id into v_evidence_id;

      update public.evidence_submissions set legacy_evidence_id = v_evidence_id where id = p_submission_id;
    end if;

    update public.expedients e
    set evidence_hitos_count = (
      select count(distinct ev.hito_id)::int
      from public.evidences ev
      where ev.expedient_id = e.id and ev.hito_id is not null
    ),
    updated_at = now()
    where e.id = v_request.expedient_id;
  end if;

  select case when role = 'admin' then 'admin' else 'coordinator' end into v_actor
  from public.siacd_staff where id = p_staff_id;

  insert into public.activity_log(expedient_id, actor_type, actor_staff_id, event_type, message, metadata)
  values (
    v_request.expedient_id,
    coalesce(v_actor, 'coordinator'),
    p_staff_id,
    case when p_decision = 'approved' then 'evidence_approved' else 'evidence_correction_requested' end,
    case when p_decision = 'approved' then 'La evidencia del docente fue aprobada.' else 'Se solicitó una corrección de evidencia al docente.' end,
    jsonb_build_object('request_id', v_request.id, 'submission_id', p_submission_id, 'version', v_submission.version, 'comment', nullif(trim(p_comment), ''))
  );

  return true;
end;
$$;

grant execute on function public.staff_review_evidence_submission(uuid, uuid, text, text) to anon, authenticated;

create or replace function public.staff_cancel_evidence_request(p_request_id uuid, p_staff_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expedient_id uuid;
begin
  select expedient_id into v_expedient_id from public.evidence_requests where id = p_request_id;
  if not found then return false; end if;
  if not private.staff_can_manage_expedient(v_expedient_id, p_staff_id) then
    raise exception 'not_allowed';
  end if;

  update public.evidence_requests
  set status = 'cancelled', updated_at = now()
  where id = p_request_id and status <> 'approved';

  if not found then return false; end if;

  insert into public.activity_log(expedient_id, actor_type, actor_staff_id, event_type, message, metadata)
  values (v_expedient_id, 'coordinator', p_staff_id, 'evidence_request_cancelled', 'Se canceló una solicitud de evidencia.', jsonb_build_object('request_id', p_request_id));
  return true;
end;
$$;

grant execute on function public.staff_cancel_evidence_request(uuid, uuid) to anon, authenticated;

comment on table public.evidence_requests is 'Solicitudes de evidencia emitidas al docente por hito o criterio.';
comment on table public.evidence_submissions is 'Versiones de archivos enviados por el docente; nunca se sobrescriben al solicitar una corrección.';
