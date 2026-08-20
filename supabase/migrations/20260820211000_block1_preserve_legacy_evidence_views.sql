-- SIACD · Bloque 1
-- Las pantallas actuales de Evidencias continúan mostrando únicamente solicitudes manuales.
-- Los 129 espacios automáticos por criterio se consumen mediante los nuevos workspaces.

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
    and er.origin = 'manual'
    and er.status <> 'cancelled';

  return jsonb_build_object(
    'requests', v_requests,
    'pending', (select count(*) from public.evidence_requests where expedient_id = p_expedient_id and origin = 'manual' and status = 'pending'),
    'corrections', (select count(*) from public.evidence_requests where expedient_id = p_expedient_id and origin = 'manual' and status = 'correction_required'),
    'waiting_review', (select count(*) from public.evidence_requests where expedient_id = p_expedient_id and origin = 'manual' and status in ('submitted','in_review')),
    'approved', (select count(*) from public.evidence_requests where expedient_id = p_expedient_id and origin = 'manual' and status = 'approved')
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
    and er.origin = 'manual'
    and er.status <> 'cancelled';

  return jsonb_build_object(
    'criteria', v_criteria,
    'requests', v_requests,
    'pending_review', (select count(*) from public.evidence_requests where expedient_id = p_expedient_id and origin = 'manual' and status in ('submitted','in_review')),
    'corrections', (select count(*) from public.evidence_requests where expedient_id = p_expedient_id and origin = 'manual' and status = 'correction_required'),
    'approved', (select count(*) from public.evidence_requests where expedient_id = p_expedient_id and origin = 'manual' and status = 'approved')
  );
end;
$$;

grant execute on function public.staff_evidence_workspace(uuid, uuid) to anon, authenticated;
