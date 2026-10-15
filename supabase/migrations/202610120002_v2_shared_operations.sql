-- ADDITIVE V2 migration. Keep V1 tables and their records intact.
-- V2 uses a private, center-scoped aggregate with optimistic revision checks.
-- Only server-held service credentials can execute these RPCs. Staff and kiosk
-- clients use the authenticated Next.js API; no private aggregate reaches anon.
begin;
create table public.centerflow_states (
 center_id uuid primary key references public.centers(id),
 revision bigint not null check(revision>=1),
 schema_version integer not null default 2 check(schema_version=2),
 payload jsonb not null check(payload->>'schemaVersion'='2'),
 updated_at timestamptz not null default now()
);
alter table public.centerflow_states enable row level security;
revoke all on public.centerflow_states from public,anon,authenticated;
grant select,insert,update on public.centerflow_states to service_role;
create policy private_server_states on public.centerflow_states to service_role using(true) with check(true);
create table public.centerflow_state_history (
 center_id uuid not null references public.centers(id),revision bigint not null,
 payload jsonb not null, saved_at timestamptz not null default now(),
 primary key(center_id,revision)
);
alter table public.centerflow_state_history enable row level security;
revoke all on public.centerflow_state_history from public,anon,authenticated;
grant select,insert on public.centerflow_state_history to service_role;
create policy private_server_history on public.centerflow_state_history to service_role using(true) with check(true);
create function public.read_centerflow(p_center uuid) returns jsonb
 language sql security invoker stable set search_path='' as $$
 select jsonb_build_object('revision',revision,'payload',payload) from public.centerflow_states where center_id=p_center;
$$;
create function public.write_centerflow(p_center uuid,p_expected_revision bigint,p_payload jsonb) returns boolean
 language plpgsql security invoker set search_path='' as $$
declare current_revision bigint;
begin
 if p_payload->>'schemaVersion'<>'2' or (p_payload->>'revision')::bigint<>p_expected_revision+1 then raise exception 'Invalid version or revision'; end if;
 select revision into current_revision from public.centerflow_states where center_id=p_center for update;
 if current_revision is null then
  -- Explicit provisioning only, via a server-side command with expected revision zero.
  if p_expected_revision<>0 then return false; end if;
  insert into public.centerflow_states(center_id,revision,payload) values(p_center,1,p_payload)
   on conflict(center_id) do nothing;
  if not found then return false; end if;
 else
  if current_revision<>p_expected_revision then return false; end if;
  insert into public.centerflow_state_history(center_id,revision,payload)
   select center_id,revision,payload from public.centerflow_states where center_id=p_center;
  update public.centerflow_states set revision=current_revision+1,payload=p_payload,updated_at=now() where center_id=p_center;
 end if;
 return true;
end;
$$;
revoke all on function public.read_centerflow(uuid),public.write_centerflow(uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.read_centerflow(uuid),public.write_centerflow(uuid,bigint,jsonb) to service_role;
insert into public.application_versions(version,description) values(2,'Private shared operations state, CAS transactions and append-only recovery history');
commit;
