-- Acceso público directo solicitado expresamente para SIACD.
-- ADVERTENCIA: el rol anon puede consultar y modificar todos los registros.
grant usage on schema public to anon;
grant select, insert, update, delete on all tables in schema public to anon;
grant usage, select on all sequences in schema public to anon;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'campuses',
    'careers',
    'academic_periods',
    'coordinator_careers',
    'teachers',
    'expedients',
    'hito_definitions',
    'competency_definitions',
    'hito_schedules',
    'competency_scores',
    'followups',
    'improvement_actions',
    'evidences',
    'approvals',
    'generated_documents'
  ]
  loop
    execute format('drop policy if exists public_direct_access on public.%I', table_name);
    execute format(
      'create policy public_direct_access on public.%I for all to anon using (true) with check (true)',
      table_name
    );
  end loop;
end
$$;

drop policy if exists siacd_public_objects_all on storage.objects;
create policy siacd_public_objects_all
on storage.objects
for all
to anon
using (bucket_id = 'siacd-evidence')
with check (bucket_id = 'siacd-evidence');

drop policy if exists siacd_public_bucket_read on storage.buckets;
create policy siacd_public_bucket_read
on storage.buckets
for select
to anon
using (id = 'siacd-evidence');
