-- Bloque 2: organización funcional del acompañamiento por fases.
-- Conserva H1-H6 y sus pesos; únicamente agrega la clasificación Antes / Durante / Después.

alter table public.hito_definitions
  add column if not exists phase text;

alter table public.hito_definitions
  drop constraint if exists hito_definitions_phase_check;

alter table public.hito_definitions
  add constraint hito_definitions_phase_check
  check (phase is null or phase in ('before','during','after'));

update public.hito_definitions
set phase = case
  when id in ('H1','H2') then 'before'
  when id in ('H3','H4','H5') then 'during'
  when id = 'H6' then 'after'
  else phase
end
where id in ('H1','H2','H3','H4','H5','H6');

comment on column public.hito_definitions.phase is
  'Organización funcional del acompañamiento: before=Antes, during=Durante, after=Después.';
