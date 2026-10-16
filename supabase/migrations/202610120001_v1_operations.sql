-- V1 schema for a NEW, approved Supabase project. Forward-only; never reset a live database.
-- Cloud adapter and policy tests must be completed before real student use.
begin;
create extension if not exists pgcrypto with schema extensions;
create type public.staff_role as enum ('owner','instructor','assistant');
create type public.packet_status as enum ('assigned','prepared','handed-off');
create table public.centers (
 id uuid primary key default gen_random_uuid(), name text not null,
 timezone text not null default 'America/Los_Angeles', created_at timestamptz not null default now()
);
create table public.staff_memberships (
 center_id uuid not null references public.centers(id), user_id uuid not null references auth.users(id),
 role public.staff_role not null, display_name text not null, active boolean not null default true,
 primary key(center_id,user_id)
);
-- Only a privileged provisioning process manages memberships. Clients cannot grant themselves roles.
create function public.center_role(p_center uuid) returns public.staff_role
 language sql stable security definer set search_path = '' as $$
 select role from public.staff_memberships where center_id=p_center and user_id=auth.uid() and active;
$$;
revoke all on function public.center_role(uuid) from public;
grant execute on function public.center_role(uuid) to authenticated;
create table public.students (
 id uuid primary key default gen_random_uuid(), center_id uuid not null references public.centers(id),
 display_name text not null check(length(display_name) between 1 and 120), early_learner boolean not null default false,
 subjects text[] not null default '{}', level text not null default '', active boolean not null default true,
 created_at timestamptz not null default now(), unique(id,center_id)
);
create table public.student_codes (
 id uuid primary key default gen_random_uuid(), center_id uuid not null references public.centers(id),
 student_id uuid not null, token_hash bytea not null unique, revoked_at timestamptz,
 created_at timestamptz not null default now(), foreign key(student_id,center_id) references public.students(id,center_id)
);
create table public.kiosk_devices (
 user_id uuid primary key references auth.users(id), center_id uuid not null references public.centers(id),
 label text not null, enabled boolean not null default true, expires_at timestamptz not null
);
create table public.visits (
 id uuid primary key default gen_random_uuid(), center_id uuid not null references public.centers(id),
 student_id uuid not null, arrived_at timestamptz not null default now(), departed_at timestamptz,
 foreign key(student_id,center_id) references public.students(id,center_id),
 check(departed_at is null or departed_at>=arrived_at), unique(id,center_id,student_id)
);
create unique index one_open_visit_per_student on public.visits(student_id) where departed_at is null;
create index visits_by_center_time on public.visits(center_id,arrived_at desc);
create table public.observations (
 id uuid primary key default gen_random_uuid(), center_id uuid not null references public.centers(id),
 student_id uuid not null, visit_id uuid, choices text[] not null default '{}',
 note text not null default '' check(length(note)<=1200), follow_up boolean not null default false,
 author_id uuid not null references auth.users(id), created_at timestamptz not null default now(),
 reviewed_at timestamptz, reviewed_by uuid references auth.users(id),
 foreign key(student_id,center_id) references public.students(id,center_id),
 foreign key(visit_id,center_id,student_id) references public.visits(id,center_id,student_id),
 check(cardinality(choices)>0 or length(trim(note))>0),
 check((reviewed_at is null)=(reviewed_by is null))
);
create index pending_observations on public.observations(center_id,follow_up desc,created_at) where reviewed_at is null;
create table public.homework_packets (
 id uuid primary key default gen_random_uuid(), center_id uuid not null references public.centers(id),
 student_id uuid not null, description text not null check(length(trim(description)) between 1 and 240),
 status public.packet_status not null default 'assigned', assigned_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(student_id,center_id) references public.students(id,center_id)
);
create table public.audit_events (
 id uuid primary key default gen_random_uuid(), center_id uuid not null references public.centers(id),
 actor_id uuid references auth.users(id), action text not null, entity_id uuid not null, at timestamptz not null default now()
);
create table public.application_versions (
 version integer primary key, applied_at timestamptz not null default now(), description text not null
);
insert into public.application_versions(version,description) values(1,'Attendance, enduring observations and homework handoff');

alter table public.centers enable row level security;
alter table public.staff_memberships enable row level security;
alter table public.students enable row level security;
alter table public.student_codes enable row level security;
alter table public.kiosk_devices enable row level security;
alter table public.visits enable row level security;
alter table public.observations enable row level security;
alter table public.homework_packets enable row level security;
alter table public.audit_events enable row level security;
alter table public.application_versions enable row level security;

-- Explicit privileges: no public/anonymous access, no client deletes, no client role management.
revoke all on public.centers,public.staff_memberships,public.students,public.student_codes,
 public.kiosk_devices,public.visits,public.observations,public.homework_packets,public.audit_events,
 public.application_versions from anon,authenticated;
grant select on public.centers,public.staff_memberships,public.audit_events,public.application_versions to authenticated;
grant select,insert,update on public.students,public.student_codes,public.kiosk_devices,
 public.visits,public.observations,public.homework_packets to authenticated;

create policy centers_staff_read on public.centers for select to authenticated using(public.center_role(id) is not null);
create policy membership_self_read on public.staff_memberships for select to authenticated using(user_id=auth.uid() or public.center_role(center_id)='owner');
create policy students_staff_read on public.students for select to authenticated using(public.center_role(center_id) is not null);
create policy students_owner_insert on public.students for insert to authenticated with check(public.center_role(center_id)='owner');
create policy students_owner_update on public.students for update to authenticated using(public.center_role(center_id)='owner') with check(public.center_role(center_id)='owner');
create policy codes_owner on public.student_codes for all to authenticated using(public.center_role(center_id)='owner') with check(public.center_role(center_id)='owner');
create policy devices_owner on public.kiosk_devices for all to authenticated using(public.center_role(center_id)='owner') with check(public.center_role(center_id)='owner');
create policy visits_staff_read on public.visits for select to authenticated using(public.center_role(center_id) is not null);
create policy visits_staff_insert on public.visits for insert to authenticated with check(public.center_role(center_id) is not null);
create policy visits_staff_update on public.visits for update to authenticated using(public.center_role(center_id) is not null) with check(public.center_role(center_id) is not null);
create policy notes_instructor_read on public.observations for select to authenticated using(public.center_role(center_id) in ('owner','instructor'));
create policy notes_instructor_insert on public.observations for insert to authenticated with check(public.center_role(center_id) in ('owner','instructor') and author_id=auth.uid() and reviewed_at is null);
create policy notes_instructor_update on public.observations for update to authenticated using(public.center_role(center_id) in ('owner','instructor')) with check(public.center_role(center_id) in ('owner','instructor'));
create policy homework_staff_read on public.homework_packets for select to authenticated using(public.center_role(center_id) is not null);
create policy homework_staff_insert on public.homework_packets for insert to authenticated with check(public.center_role(center_id) is not null and assigned_by=auth.uid());
create policy homework_staff_update on public.homework_packets for update to authenticated using(public.center_role(center_id) is not null) with check(public.center_role(center_id) is not null);
create policy audit_owner_read on public.audit_events for select to authenticated using(public.center_role(center_id)='owner');
create policy versions_staff_read on public.application_versions for select to authenticated using(exists(select 1 from public.staff_memberships where user_id=auth.uid() and active));

-- Preserve attribution and student/center identity when a record is reviewed or checked out.
create function public.guard_operation_update() returns trigger language plpgsql set search_path='' as $$
begin
 if new.center_id<>old.center_id or new.student_id<>old.student_id or new.id<>old.id then raise exception 'Record identity is immutable'; end if;
 if tg_table_name='observations' then
  if new.author_id<>old.author_id or new.created_at<>old.created_at or new.note<>old.note or new.choices<>old.choices or new.follow_up<>old.follow_up or new.visit_id is distinct from old.visit_id then raise exception 'Observation content is immutable'; end if;
  if old.reviewed_at is not null then raise exception 'Review is already complete'; end if;
  if new.reviewed_at is null or new.reviewed_by is distinct from auth.uid() then raise exception 'Reviewer attribution required'; end if;
 elsif tg_table_name='visits' then
  if new.arrived_at<>old.arrived_at or old.departed_at is not null then raise exception 'Closed visit is immutable'; end if;
 elsif tg_table_name='homework_packets' then
  if new.status<old.status then raise exception 'Packet cannot move backwards'; end if;
  if new.description<>old.description or new.assigned_by<>old.assigned_by or new.created_at<>old.created_at then raise exception 'Assignment is immutable'; end if;
  new.updated_at=now();
 end if;
 return new;
end;
$$;
create trigger guard_observations before update on public.observations for each row execute function public.guard_operation_update();
create trigger guard_visits before update on public.visits for each row execute function public.guard_operation_update();
create trigger guard_homework before update on public.homework_packets for each row execute function public.guard_operation_update();
create function public.audit_operation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_events(center_id,actor_id,action,entity_id) values(new.center_id,auth.uid(),tg_table_name||':'||tg_op,new.id);
 return new;
end;
$$;
revoke all on function public.audit_operation() from public;
create trigger audit_visits after insert or update on public.visits for each row execute function public.audit_operation();
create trigger audit_observations after insert or update on public.observations for each row execute function public.audit_operation();
create trigger audit_homework after insert or update on public.homework_packets for each row execute function public.audit_operation();

-- A provisioned kiosk auth user has no memberships and no direct table access.
-- Resolve a hashed bearer code privately and return only a generic result.
create function public.kiosk_attendance(p_token text,p_direction text) returns text
 language plpgsql security definer set search_path='' as $$
declare cid uuid; sid uuid; vid uuid;
begin
 if p_direction not in ('in','out') or length(p_token)>100 then raise exception 'Invalid request'; end if;
 select center_id into cid from public.kiosk_devices where user_id=auth.uid() and enabled and expires_at>now();
 if cid is null then raise exception 'Kiosk unavailable'; end if;
 select s.id into sid from public.student_codes c join public.students s on s.id=c.student_id and s.center_id=c.center_id
  where c.center_id=cid and c.revoked_at is null and s.active and c.token_hash=extensions.digest(p_token,'sha256');
 if sid is null then raise exception 'Code not recognized'; end if;
 -- Lock the student to serialize simultaneous arrivals and departures on different devices.
 perform 1 from public.students where id=sid for update;
 select id into vid from public.visits where student_id=sid and departed_at is null;
 if p_direction='in' then
  if vid is not null then return 'Already checked in'; end if;
  insert into public.visits(center_id,student_id) values(cid,sid); return 'Checked in';
 end if;
 if vid is null then return 'Already checked out'; end if;
 update public.visits set departed_at=now() where id=vid;return 'Checked out';
end;
$$;
revoke all on function public.kiosk_attendance(text,text) from public,anon;
grant execute on function public.kiosk_attendance(text,text) to authenticated;
commit;
