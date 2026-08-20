-- SIACD · Fusión conservadora de duplicados históricos de docentes.
-- Solo actúa cuando existe exactamente un registro con cédula y uno sin cédula
-- con el mismo nombre normalizado, el registro sin cédula no tiene acceso/sesión
-- ni actividad propia y mover sus expedientes no viola la unicidad por período/carrera.

do $$
declare
  r record;
begin
  for r in
    with normalized as (
      select
        t.*,
        lower(regexp_replace(trim(t.full_name), '\s+', ' ', 'g')) as normalized_name
      from public.teachers t
      where t.active
    ), candidate_names as (
      select normalized_name
      from normalized
      group by normalized_name
      having count(*) = 2
         and count(*) filter (where national_id is not null and trim(national_id) <> '') = 1
         and count(*) filter (where national_id is null or trim(national_id) = '') = 1
    )
    select
      canonical.id as canonical_id,
      duplicate.id as duplicate_id
    from candidate_names c
    join normalized canonical
      on canonical.normalized_name = c.normalized_name
     and canonical.national_id is not null
     and trim(canonical.national_id) <> ''
    join normalized duplicate
      on duplicate.normalized_name = c.normalized_name
     and (duplicate.national_id is null or trim(duplicate.national_id) = '')
    where not exists (select 1 from public.teacher_access a where a.teacher_id = duplicate.id)
      and not exists (select 1 from public.teacher_device_sessions s where s.teacher_id = duplicate.id)
      and not exists (select 1 from public.teacher_login_codes l where l.teacher_id = duplicate.id)
      and not exists (select 1 from public.evidence_submissions es where es.teacher_id = duplicate.id)
      and not exists (select 1 from public.activity_log al where al.actor_teacher_id = duplicate.id)
      and not exists (
        select 1
        from public.expedients d
        join public.expedients cexp
          on cexp.teacher_id = canonical.id
         and cexp.period_id = d.period_id
         and cexp.career_id = d.career_id
        where d.teacher_id = duplicate.id
      )
  loop
    update public.teachers canonical
      set institutional_email = coalesce(canonical.institutional_email, duplicate.institutional_email),
          started_institution_on = coalesce(canonical.started_institution_on, duplicate.started_institution_on),
          updated_at = now()
    from public.teachers duplicate
    where canonical.id = r.canonical_id
      and duplicate.id = r.duplicate_id;

    update public.expedients
      set teacher_id = r.canonical_id
    where teacher_id = r.duplicate_id;

    delete from public.teachers
    where id = r.duplicate_id;
  end loop;
end;
$$;
