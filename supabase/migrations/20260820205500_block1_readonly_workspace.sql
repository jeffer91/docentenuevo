-- SIACD · Bloque 1
-- Los workspaces son consultas puras. La siembra de solicitudes por criterio
-- queda a cargo del backfill y de los triggers de expedientes/catálogo.

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
