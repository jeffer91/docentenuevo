-- Primera evolución del horario: rango de inicio y fin.
alter table public.expedients
  add column if not exists schedule_start time,
  add column if not exists schedule_end time;

alter table public.expedients
  drop constraint if exists expedients_schedule_range_check;

alter table public.expedients
  add constraint expedients_schedule_range_check
  check (
    (schedule_start is null and schedule_end is null)
    or
    (schedule_start is not null and schedule_end is not null and schedule_end > schedule_start)
  );
