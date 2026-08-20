-- SIACD · Bloque 1
-- Modelo de evidencias por criterio, entregas de hasta 3 elementos y solicitudes de No aplica.
-- Este cambio es aditivo: conserva evidencias, solicitudes y entregas históricas.

alter table public.evidence_requests
  add column if not exists origin text not null default 'manual';

alter table public.evidence_requests
  drop constraint if exists evidence_requests_origin_check;
alter table public.evidence_requests
  add constraint evidence_requests_origin_check
  check (origin in ('manual','criterion_default'));

create unique index if not exists evidence_requests_default_criterion_uidx
  on public.evidence_requests(expedient_id, criterion_id)
  where origin = 'criterion_default' and criterion_id is not null;

-- Una entrega deja de equivaler obligatoriamente a un solo archivo.
-- Los campos históricos se mantienen para compatibilidad con el flujo anterior.
alter table public.evidence_submissions
  alter column file_name drop not null,
  alter column storage_path drop not null;

create table if not exists public.evidence_submission_items (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.evidence_submissions(id) on delete cascade,
  position smallint not null check (position between 1 and 3),
  kind text not null check (kind in ('image','file','link')),
  file_name text,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  storage_path text,
  external_url text,
  created_at timestamptz not null default now(),
  constraint evidence_submission_items_payload_check check (
    (kind = 'link' and external_url is not null and storage_path is null)
    or
    (kind in ('image','file') and storage_path is not null and external_url is null and file_name is not null)
  ),
  unique (submission_id, position)
);

create index if not exists evidence_submission_items_submission_idx
  on public.evidence_submission_items(submission_id, position);

create unique index if not exists evidence_submission_items_storage_uidx
  on public.evidence_submission_items(storage_path)
  where storage_path is not null;

alter table public.evidence_submission_items enable row level security;
revoke all on public.evidence_submission_items from anon, authenticated;
grant all on public.evidence_submission_items to service_role;

-- Convierte entregas antiguas de un archivo en el nuevo formato de items,
-- sin modificar ni eliminar el registro histórico original.
insert into public.evidence_submission_items(
  submission_id, position, kind, file_name, mime_type, size_bytes, storage_path
)
select
  es.id,
  1,
  case when coalesce(es.mime_type, '') like 'image/%' then 'image' else 'file' end,
  es.file_name,
  es.mime_type,
  es.size_bytes,
  es.storage_path
from public.evidence_submissions es
where es.storage_path is not null
  and not exists (
    select 1 from public.evidence_submission_items esi where esi.submission_id = es.id
  );

create table if not exists public.criterion_na_requests (
  id uuid primary key default gen_random_uuid(),
  expedient_id uuid not null references public.expedients(id) on delete cascade,
  criterion_id text not null references public.competency_definitions(id),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  justification text not null,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','cancelled')),
  requested_at timestamptz not null default now(),
  reviewed_by_staff_id uuid references public.siacd_staff(id) on delete set null,
  reviewed_at timestamptz,
  review_comment text,
  updated_at timestamptz not null default now()
);

create index if not exists criterion_na_requests_expedient_idx
  on public.criterion_na_requests(expedient_id, criterion_id, requested_at desc);
create index if not exists criterion_na_requests_teacher_idx
  on public.criterion_na_requests(teacher_id, requested_at desc);
create unique index if not exists criterion_na_requests_one_pending_uidx
  on public.criterion_na_requests(expedient_id, criterion_id)
  where status = 'pending';

alter table public.criterion_na_requests enable row level security;
revoke all on public.criterion_na_requests from anon, authenticated;
grant all on public.criterion_na_requests to service_role;

-- Amplía los tipos admitidos por el bucket privado. El límite sigue siendo 10 MB por archivo.
update storage.buckets
set allowed_mime_types = array[
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain'
]::text[]
where id = 'siacd-teacher-evidence';

create or replace function private.sync_default_criterion_evidence_requests(p_expedient_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_expedient_id is null then return; end if;

  insert into public.evidence_requests(
    expedient_id,
    hito_id,
    criterion_id,
    title,
    instructions,
    required,
    status,
    origin,
    created_by_staff_id
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
  on conflict (expedient_id, criterion_id)
    where origin = 'criterion_default' and criterion_id is not null
  do update set
    hito_id = excluded.hito_id,
    title = excluded.title,
    instructions = excluded.instructions,
    required = true,
    updated_at = now();
end;
$$;

revoke all on function private.sync_default_criterion_evidence_requests(uuid) from public, anon, authenticated;
grant execute on function private.sync_default_criterion_evidence_requests(uuid) to service_role;

create or replace function private.expedient_seed_default_criterion_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_default_criterion_evidence_requests(new.id);
  return new;
end;
$$;

revoke all on function private.expedient_seed_default_criterion_evidence() from public, anon, authenticated;
grant execute on function private.expedient_seed_default_criterion_evidence() to service_role;

drop trigger if exists expedient_seed_default_criterion_evidence on public.expedients;
create trigger expedient_seed_default_criterion_evidence
after insert on public.expedients
for each row execute function private.expedient_seed_default_criterion_evidence();

create or replace function private.competency_seed_default_criterion_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expedient_id uuid;
begin
  if new.active then
    for v_expedient_id in
      select e.id
      from public.expedients e
      where e.status::text not in ('certified','archived')
    loop
      perform private.sync_default_criterion_evidence_requests(v_expedient_id);
    end loop;
  end if;
  return new;
end;
$$;

revoke all on function private.competency_seed_default_criterion_evidence() from public, anon, authenticated;
grant execute on function private.competency_seed_default_criterion_evidence() to service_role;

drop trigger if exists competency_seed_default_criterion_evidence on public.competency_definitions;
create trigger competency_seed_default_criterion_evidence
after insert or update of active, hito_id, observable_competency, expected_evidence
on public.competency_definitions
for each row execute function private.competency_seed_default_criterion_evidence();

-- Crea automáticamente el espacio de evidencia de los 129 criterios activos
-- para todos los expedientes que aún no están certificados/archivados.
do $$
declare
  v_expedient_id uuid;
begin
  for v_expedient_id in
    select e.id
    from public.expedients e
    where e.status::text not in ('certified','archived')
  loop
    perform private.sync_default_criterion_evidence_requests(v_expedient_id);
  end loop;
end $$;

create or replace function public.teacher_request_not_applicable(
  p_token text,
  p_expedient_id uuid,
  p_criterion_id text,
  p_justification text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_teacher_id uuid;
  v_request_id uuid;
  v_existing uuid;
begin
  if nullif(trim(p_justification), '') is null then
    raise exception 'justification_required';
  end if;

  select s.teacher_id into v_teacher_id
  from public.teacher_device_sessions s
  join public.teacher_access a on a.teacher_id = s.teacher_id and a.active
  join public.expedients e on e.teacher_id = s.teacher_id and e.id = p_expedient_id
  where s.token_hash = extensions.digest(p_token, 'sha256')
    and s.revoked_at is null
    and s.expires_at > now()
  limit 1;

  if not found then raise exception 'invalid_session'; end if;

  if not exists (
    select 1 from public.competency_definitions cd
    where cd.id = p_criterion_id and cd.active
  ) then
    raise exception 'invalid_criterion';
  end if;

  select r.id into v_existing
  from public.criterion_na_requests r
  where r.expedient_id = p_expedient_id
    and r.criterion_id = p_criterion_id
    and r.status = 'pending'
  limit 1;

  if v_existing is not null then return v_existing; end if;

  insert into public.criterion_na_requests(
    expedient_id, criterion_id, teacher_id, justification
  ) values (
    p_expedient_id, p_criterion_id, v_teacher_id, trim(p_justification)
  ) returning id into v_request_id;

  insert into public.activity_log(
    expedient_id, actor_type, actor_teacher_id, event_type, message, metadata
  ) values (
    p_expedient_id,
    'teacher',
    v_teacher_id,
    'criterion_na_requested',
    'El docente solicitó marcar un criterio como No aplica.',
    jsonb_build_object('na_request_id', v_request_id, 'criterion_id', p_criterion_id)
  );

  return v_request_id;
end;
$$;

grant execute on function public.teacher_request_not_applicable(text, uuid, text, text) to anon, authenticated;

create or replace function public.teacher_cancel_not_applicable(
  p_token text,
  p_request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_teacher_id uuid;
  v_row public.criterion_na_requests%rowtype;
begin
  select s.teacher_id into v_teacher_id
  from public.teacher_device_sessions s
  join public.teacher_access a on a.teacher_id = s.teacher_id and a.active
  where s.token_hash = extensions.digest(p_token, 'sha256')
    and s.revoked_at is null
    and s.expires_at > now()
  limit 1;

  if not found then raise exception 'invalid_session'; end if;

  select * into v_row
  from public.criterion_na_requests r
  where r.id = p_request_id and r.teacher_id = v_teacher_id
  for update;

  if not found then raise exception 'request_not_found'; end if;
  if v_row.status <> 'pending' then raise exception 'request_not_pending'; end if;

  update public.criterion_na_requests
  set status = 'cancelled', updated_at = now()
  where id = p_request_id;

  return true;
end;
$$;

grant execute on function public.teacher_cancel_not_applicable(text, uuid) to anon, authenticated;

create or replace function public.staff_review_not_applicable(
  p_request_id uuid,
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
  v_row public.criterion_na_requests%rowtype;
  v_actor text;
begin
  if p_decision not in ('approved','rejected') then
    raise exception 'invalid_decision';
  end if;
  if p_decision = 'rejected' and nullif(trim(p_comment), '') is null then
    raise exception 'comment_required';
  end if;

  select * into v_row
  from public.criterion_na_requests
  where id = p_request_id
  for update;

  if not found then raise exception 'request_not_found'; end if;
  if v_row.status <> 'pending' then raise exception 'request_not_pending'; end if;
  if not private.staff_can_manage_expedient(v_row.expedient_id, p_staff_id) then
    raise exception 'not_allowed';
  end if;

  update public.criterion_na_requests
  set status = p_decision,
      reviewed_by_staff_id = p_staff_id,
      reviewed_at = now(),
      review_comment = nullif(trim(p_comment), ''),
      updated_at = now()
  where id = p_request_id;

  if p_decision = 'approved' then
    insert into public.competency_scores(
      expedient_id,
      competency_id,
      score,
      not_applicable,
      coordinator_observation,
      evaluated_by,
      evaluated_by_staff_id,
      evaluated_at
    ) values (
      v_row.expedient_id,
      v_row.criterion_id,
      null,
      true,
      nullif(trim(p_comment), ''),
      null,
      p_staff_id,
      now()
    )
    on conflict (expedient_id, competency_id)
    do update set
      score = null,
      not_applicable = true,
      coordinator_observation = excluded.coordinator_observation,
      evaluated_by = null,
      evaluated_by_staff_id = p_staff_id,
      evaluated_at = now();

    update public.evidence_requests
    set status = 'cancelled', updated_at = now()
    where expedient_id = v_row.expedient_id
      and criterion_id = v_row.criterion_id
      and origin = 'criterion_default'
      and status in ('pending','correction_required');
  end if;

  select case when role = 'admin' then 'admin' else 'coordinator' end into v_actor
  from public.siacd_staff where id = p_staff_id;

  insert into public.activity_log(
    expedient_id, actor_type, actor_staff_id, event_type, message, metadata
  ) values (
    v_row.expedient_id,
    coalesce(v_actor, 'coordinator'),
    p_staff_id,
    case when p_decision = 'approved' then 'criterion_na_approved' else 'criterion_na_rejected' end,
    case when p_decision = 'approved'
      then 'La solicitud de No aplica fue aprobada.'
      else 'La solicitud de No aplica fue rechazada.' end,
    jsonb_build_object(
      'na_request_id', p_request_id,
      'criterion_id', v_row.criterion_id,
      'comment', nullif(trim(p_comment), '')
    )
  );

  return true;
end;
$$;

grant execute on function public.staff_review_not_applicable(uuid, uuid, text, text) to anon, authenticated;

-- Workspace nuevo y aditivo para el Bloque 2. No reemplaza los RPC históricos.
create or replace function public.teacher_criterion_evidence_workspace(
  p_token text,
  p_expedient_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_teacher_id uuid;
  v_criteria jsonb;
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

  perform private.sync_default_criterion_evidence_requests(p_expedient_id);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', cd.id,
      'hito_id', cd.hito_id,
      'process', cd.process,
      'label', cd.observable_competency,
      'criticality', cd.criticality,
      'expected_evidence', cd.expected_evidence,
      'score', case when cs.competency_id is null then null else jsonb_build_object(
        'score', cs.score,
        'not_applicable', cs.not_applicable,
        'observation', cs.coordinator_observation,
        'evaluated_at', cs.evaluated_at
      ) end,
      'na_request', (
        select jsonb_build_object(
          'id', nr.id,
          'justification', nr.justification,
          'status', nr.status,
          'requested_at', nr.requested_at,
          'review_comment', nr.review_comment,
          'reviewed_at', nr.reviewed_at
        )
        from public.criterion_na_requests nr
        where nr.expedient_id = p_expedient_id
          and nr.criterion_id = cd.id
        order by nr.requested_at desc
        limit 1
      ),
      'request', (
        select jsonb_build_object(
          'id', er.id,
          'status', er.status,
          'title', er.title,
          'instructions', er.instructions,
          'origin', er.origin,
          'submissions', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', es.id,
              'version', es.version,
              'teacher_comment', es.teacher_comment,
              'status', es.status,
              'submitted_at', es.submitted_at,
              'reviewed_at', es.reviewed_at,
              'review_comment', es.review_comment,
              'items', coalesce((
                select jsonb_agg(jsonb_build_object(
                  'id', esi.id,
                  'position', esi.position,
                  'kind', esi.kind,
                  'file_name', esi.file_name,
                  'mime_type', esi.mime_type,
                  'size_bytes', esi.size_bytes,
                  'external_url', esi.external_url
                ) order by esi.position)
                from public.evidence_submission_items esi
                where esi.submission_id = es.id
              ), '[]'::jsonb)
            ) order by es.version desc)
            from public.evidence_submissions es
            where es.request_id = er.id and es.teacher_id = v_teacher_id
          ), '[]'::jsonb)
        )
        from public.evidence_requests er
        where er.expedient_id = p_expedient_id
          and er.criterion_id = cd.id
          and er.origin = 'criterion_default'
        limit 1
      )
    ) order by cd.hito_id, cd.id
  ), '[]'::jsonb)
  into v_criteria
  from public.competency_definitions cd
  left join public.competency_scores cs
    on cs.expedient_id = p_expedient_id and cs.competency_id = cd.id
  where cd.active;

  return jsonb_build_object(
    'criteria', v_criteria,
    'total', (select count(*) from public.competency_definitions where active),
    'na_pending', (
      select count(*) from public.criterion_na_requests
      where expedient_id = p_expedient_id and status = 'pending'
    )
  );
end;
$$;

grant execute on function public.teacher_criterion_evidence_workspace(text, uuid) to anon, authenticated;

create or replace function public.staff_criterion_evidence_workspace(
  p_expedient_id uuid,
  p_staff_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_criteria jsonb;
begin
  if not private.staff_can_manage_expedient(p_expedient_id, p_staff_id) then
    return null;
  end if;

  perform private.sync_default_criterion_evidence_requests(p_expedient_id);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', cd.id,
      'hito_id', cd.hito_id,
      'process', cd.process,
      'label', cd.observable_competency,
      'criticality', cd.criticality,
      'expected_evidence', cd.expected_evidence,
      'score', case when cs.competency_id is null then null else jsonb_build_object(
        'score', cs.score,
        'not_applicable', cs.not_applicable,
        'observation', cs.coordinator_observation,
        'evaluated_at', cs.evaluated_at
      ) end,
      'na_request', (
        select jsonb_build_object(
          'id', nr.id,
          'justification', nr.justification,
          'status', nr.status,
          'requested_at', nr.requested_at,
          'review_comment', nr.review_comment,
          'reviewed_at', nr.reviewed_at
        )
        from public.criterion_na_requests nr
        where nr.expedient_id = p_expedient_id
          and nr.criterion_id = cd.id
        order by nr.requested_at desc
        limit 1
      ),
      'request', (
        select jsonb_build_object(
          'id', er.id,
          'status', er.status,
          'title', er.title,
          'instructions', er.instructions,
          'origin', er.origin,
          'submissions', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', es.id,
              'version', es.version,
              'teacher_comment', es.teacher_comment,
              'status', es.status,
              'submitted_at', es.submitted_at,
              'reviewed_at', es.reviewed_at,
              'review_comment', es.review_comment,
              'items', coalesce((
                select jsonb_agg(jsonb_build_object(
                  'id', esi.id,
                  'position', esi.position,
                  'kind', esi.kind,
                  'file_name', esi.file_name,
                  'mime_type', esi.mime_type,
                  'size_bytes', esi.size_bytes,
                  'external_url', esi.external_url
                ) order by esi.position)
                from public.evidence_submission_items esi
                where esi.submission_id = es.id
              ), '[]'::jsonb)
            ) order by es.version desc)
            from public.evidence_submissions es
            where es.request_id = er.id
          ), '[]'::jsonb)
        )
        from public.evidence_requests er
        where er.expedient_id = p_expedient_id
          and er.criterion_id = cd.id
          and er.origin = 'criterion_default'
        limit 1
      )
    ) order by cd.hito_id, cd.id
  ), '[]'::jsonb)
  into v_criteria
  from public.competency_definitions cd
  left join public.competency_scores cs
    on cs.expedient_id = p_expedient_id and cs.competency_id = cd.id
  where cd.active;

  return jsonb_build_object(
    'criteria', v_criteria,
    'total', (select count(*) from public.competency_definitions where active),
    'na_pending', (
      select count(*) from public.criterion_na_requests
      where expedient_id = p_expedient_id and status = 'pending'
    )
  );
end;
$$;

grant execute on function public.staff_criterion_evidence_workspace(uuid, uuid) to anon, authenticated;
