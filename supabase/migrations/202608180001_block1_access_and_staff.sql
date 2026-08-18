-- SIACD · Bloque 1
-- Accesos separados sin login, coordinadores institucionales y asignación de carreras.
-- Mantiene las tablas anteriores para compatibilidad con expedientes existentes.

create table if not exists public.siacd_staff (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  role public.siacd_role not null default 'coordinator',
  active boolean not null default true,
  legacy_profile_id uuid unique references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists siacd_staff_role_name_idx
  on public.siacd_staff (role, lower(full_name));

create table if not exists public.siacd_staff_careers (
  staff_id uuid not null references public.siacd_staff(id) on delete cascade,
  career_id uuid not null references public.careers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (staff_id, career_id)
);

create index if not exists siacd_staff_careers_career_idx
  on public.siacd_staff_careers(career_id);

alter table public.expedients
  add column if not exists coordinator_staff_id uuid references public.siacd_staff(id) on delete set null;

create index if not exists expedients_coordinator_staff_idx
  on public.expedients(coordinator_staff_id);

-- El nuevo flujo no usa Supabase Auth para identificar al coordinador.
-- Los campos antiguos quedan disponibles solo por compatibilidad histórica.
alter table public.teachers
  alter column created_by drop not null;

alter table public.expedients
  alter column coordinator_id drop not null;

-- Convertir perfiles existentes en personal SIACD para no perder información previa.
insert into public.siacd_staff(full_name, role, active, legacy_profile_id)
select p.full_name, p.role, p.active, p.id
from public.profiles p
where p.role in ('coordinator','admin','approver')
on conflict (legacy_profile_id) do update
set full_name = excluded.full_name,
    role = excluded.role,
    active = excluded.active,
    updated_at = now();

insert into public.siacd_staff_careers(staff_id, career_id)
select s.id, cc.career_id
from public.coordinator_careers cc
join public.siacd_staff s on s.legacy_profile_id = cc.coordinator_id
on conflict (staff_id, career_id) do nothing;

update public.expedients e
set coordinator_staff_id = s.id
from public.siacd_staff s
where e.coordinator_staff_id is null
  and e.coordinator_id is not null
  and s.legacy_profile_id = e.coordinator_id;

alter table public.siacd_staff enable row level security;
alter table public.siacd_staff_careers enable row level security;

grant select, insert, update, delete on public.siacd_staff to anon, authenticated;
grant select, insert, update, delete on public.siacd_staff_careers to anon, authenticated;
grant usage on all sequences in schema public to anon, authenticated;

drop policy if exists public_direct_access on public.siacd_staff;
create policy public_direct_access
on public.siacd_staff
for all
to anon
using (true)
with check (true);

drop policy if exists public_direct_access on public.siacd_staff_careers;
create policy public_direct_access
on public.siacd_staff_careers
for all
to anon
using (true)
with check (true);

-- El rol autenticado también puede trabajar con estas tablas si se activa login en el futuro.
drop policy if exists staff_authenticated_access on public.siacd_staff;
create policy staff_authenticated_access
on public.siacd_staff
for all
to authenticated
using (true)
with check (true);

drop policy if exists staff_careers_authenticated_access on public.siacd_staff_careers;
create policy staff_careers_authenticated_access
on public.siacd_staff_careers
for all
to authenticated
using (true)
with check (true);
