-- Sustituye el rango único por varias jornadas independientes.
alter table public.expedients
  drop constraint if exists expedients_schedule_range_check;

alter table public.expedients
  drop column if exists schedule_start,
  drop column if exists schedule_end;

create table if not exists public.expedient_schedules (
  id uuid primary key default gen_random_uuid(),
  expedient_id uuid not null references public.expedients(id) on delete cascade,
  sequence smallint not null check (sequence > 0),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  constraint expedient_schedules_time_check check (end_time > start_time),
  constraint expedient_schedules_sequence_unique unique (expedient_id, sequence)
);

create index if not exists expedient_schedules_expedient_idx
  on public.expedient_schedules(expedient_id);

alter table public.expedient_schedules enable row level security;

grant select, insert, update, delete on public.expedient_schedules to anon;

drop policy if exists public_direct_access on public.expedient_schedules;
create policy public_direct_access
on public.expedient_schedules
for all
to anon
using (true)
with check (true);
