-- Directorio maestro de docentes: vínculo por cédula entre SIACD y Firebase.

alter table public.teachers
  add column if not exists national_id text;

alter table public.teachers
  drop constraint if exists teachers_national_id_format;

alter table public.teachers
  add constraint teachers_national_id_format
  check (national_id is null or national_id ~ '^[0-9]{10}$');

create unique index if not exists teachers_national_id_unique
  on public.teachers (national_id)
  where national_id is not null;

comment on column public.teachers.national_id is
  'Cédula ecuatoriana normalizada a 10 dígitos. Vincula Supabase con Firebase /docentes-registrados/{cedula}.';
