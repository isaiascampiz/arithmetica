-- Forward-only compatibility upgrade. V2 payloads and recovery history remain.
begin;
alter table public.centerflow_states drop constraint centerflow_states_schema_version_check;
alter table public.centerflow_states drop constraint centerflow_states_payload_check;
alter table public.centerflow_states add constraint centerflow_states_schema_version_check check(schema_version in (2,3));
alter table public.centerflow_states add constraint centerflow_states_payload_check check(payload->>'schemaVersion' in ('2','3'));
create or replace function public.write_centerflow(p_center uuid,p_expected_revision bigint,p_payload jsonb) returns boolean
 language plpgsql security invoker set search_path='' as $$
declare current_revision bigint; target_schema integer;
begin
 target_schema:=(p_payload->>'schemaVersion')::integer;
 if target_schema not in (2,3) or (p_payload->>'revision')::bigint<>p_expected_revision+1 then raise exception 'Invalid version or revision'; end if;
 select revision into current_revision from public.centerflow_states where center_id=p_center for update;
 if current_revision is null then
  if p_expected_revision<>0 then return false; end if;
  insert into public.centerflow_states(center_id,revision,schema_version,payload) values(p_center,1,target_schema,p_payload) on conflict(center_id) do nothing;
  if not found then return false; end if;
 else
  if current_revision<>p_expected_revision then return false; end if;
  insert into public.centerflow_state_history(center_id,revision,payload) select center_id,revision,payload from public.centerflow_states where center_id=p_center;
  update public.centerflow_states set revision=current_revision+1,schema_version=target_schema,payload=p_payload,updated_at=now() where center_id=p_center;
 end if;
 return true;
end; $$;
revoke all on function public.write_centerflow(uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.write_centerflow(uuid,bigint,jsonb) to service_role;
insert into public.application_versions(version,description) values(3,'Additive handoff and exact packet sequencing; preserve all prior state');
commit;
