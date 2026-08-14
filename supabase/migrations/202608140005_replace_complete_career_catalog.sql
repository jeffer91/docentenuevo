-- Catálogo institucional completo de carreras y tipos de programa.
alter table public.careers
  add column if not exists program text;

delete from public.coordinator_careers;
delete from public.careers;

insert into public.careers (campus_id, name, program, modality, active)
select
  c.id,
  v.name,
  v.program,
  null,
  true
from public.campuses c
cross join (
  values
    ('Enfermería', 'Técnico Superior'),
    ('Mecánica Automotriz', 'Tecnología Superior'),
    ('Mecánica de Motos', 'Tecnología Superior'),
    ('Diseño Multimedia', 'Tecnología Superior'),
    ('Marketing Digital y Comercio Electrónico', 'Tecnología Superior'),
    ('Marketing Digital y Comercio Electrónico TSU', 'Tecnología Universitaria'),
    ('Ventas', 'Tecnología Superior'),
    ('Desarrollo de Software', 'Tecnología Superior'),
    ('Desarrollo de Software y Ciberseguridad', 'Tecnología Universitaria'),
    ('Redes y Telecomunicaciones', 'Tecnología Superior'),
    ('Redes y Telecomunicaciones TSU', 'Tecnología Universitaria'),
    ('Estética Integral', 'Tecnología Superior'),
    ('Educación Básica', 'Tecnología Superior'),
    ('Educación Inicial', 'Tecnología Superior'),
    ('Educación Inicial TSU', 'Tecnología Universitaria'),
    ('Pedagogía', 'Tecnología Universitaria'),
    ('Procesamiento de Alimentos', 'Tecnología Superior'),
    ('Administración', 'Tecnología Superior'),
    ('Administración de Empresas e Inteligencia de Negocios', 'Tecnología Universitaria'),
    ('Administración del Talento Humano', 'Tecnología Universitaria'),
    ('Contabilidad', 'Tecnología Superior'),
    ('Contabilidad y Tributación TSU', 'Tecnología Universitaria'),
    ('Gestión del Talento Humano', 'Tecnología Superior'),
    ('Seguridad y Prevención de Riesgos Laborales', 'Tecnología Superior'),
    ('Rehabilitación Física', 'Tecnología Superior'),
    ('Seguridad Ciudadana y Orden Público', 'Tecnología Superior'),
    ('Gastronomía', 'Tecnología Superior')
) as v(name, program)
where c.name = 'Matriz';

alter table public.careers
  alter column program set not null;

alter table public.careers
  drop constraint if exists careers_program_check;

alter table public.careers
  add constraint careers_program_check
  check (program in ('Técnico Superior', 'Tecnología Superior', 'Tecnología Universitaria'));

drop index if exists public.careers_name_program_unique;
create unique index careers_name_program_unique
  on public.careers (lower(trim(name)), lower(trim(program)));
