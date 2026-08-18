-- Una carrera institucional solo puede estar asignada a un coordinador SIACD a la vez.
create unique index if not exists siacd_staff_careers_one_coordinator_per_career
  on public.siacd_staff_careers(career_id);
