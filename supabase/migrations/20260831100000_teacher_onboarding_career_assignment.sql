-- SIACD · Preasignación docente por carrera
-- El docente selecciona primero su carrera. La carrera determina automáticamente
-- el coordinador responsable mediante siacd_staff_careers.

create table if not exists public.teacher_onboarding_assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  career_id uuid not null references public.careers(id) on delete cascade,
  coordinator_staff_id uuid not null references public.siacd_staff(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (teacher_id, career_id)
);

create index if not exists teacher_onboarding_assignments_staff_status_idx
  on public.teacher_onboarding_assignments(coordinator_staff_id, status);

create index if not exists teacher_onboarding_assignments_teacher_idx
  on public.teacher_onboarding_assignments(teacher_id);

alter table public.teacher_onboarding_assignments enable row level security;

grant select, insert, update on public.teacher_onboarding_assignments to anon, authenticated;

drop policy if exists teacher_onboarding_direct_read on public.teacher_onboarding_assignments;
create policy teacher_onboarding_direct_read
on public.teacher_onboarding_assignments
for select
to anon, authenticated
using (true);

drop policy if exists teacher_onboarding_valid_insert on public.teacher_onboarding_assignments;
create policy teacher_onboarding_valid_insert
on public.teacher_onboarding_assignments
for insert
to anon, authenticated
with check (
  exists (
    select 1
    from public.siacd_staff_careers sc
    join public.siacd_staff s
      on s.id = sc.staff_id
     and s.active
     and s.role = 'coordinator'
    where sc.career_id = teacher_onboarding_assignments.career_id
      and sc.staff_id = teacher_onboarding_assignments.coordinator_staff_id
  )
);

drop policy if exists teacher_onboarding_valid_update on public.teacher_onboarding_assignments;
create policy teacher_onboarding_valid_update
on public.teacher_onboarding_assignments
for update
to anon, authenticated
using (true)
with check (
  exists (
    select 1
    from public.siacd_staff_careers sc
    join public.siacd_staff s
      on s.id = sc.staff_id
     and s.active
     and s.role = 'coordinator'
    where sc.career_id = teacher_onboarding_assignments.career_id
      and sc.staff_id = teacher_onboarding_assignments.coordinator_staff_id
  )
);

comment on table public.teacher_onboarding_assignments is
  'Preasignación creada desde el primer ingreso docente. La carrera determina el coordinador y permanece pendiente hasta completar el expediente.';
