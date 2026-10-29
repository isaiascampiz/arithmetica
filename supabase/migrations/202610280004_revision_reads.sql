-- Additive server-only conditional read. Existing state/history and RPCs remain intact.
begin;
create function public.read_arithmetica_if_changed(p_center uuid,p_revision bigint)
returns jsonb language sql security invoker stable set search_path='' as $$
  select case when revision=p_revision
    then jsonb_build_object('revision',revision,'unchanged',true)
    else jsonb_build_object('revision',revision,'payload',payload)
  end from public.centerflow_states where center_id=p_center;
$$;
revoke all on function public.read_arithmetica_if_changed(uuid,bigint) from public,anon,authenticated;
grant execute on function public.read_arithmetica_if_changed(uuid,bigint) to service_role;
insert into public.application_versions(version,description)
values(4,'Server-only conditional revision reads; preserve all record and recovery history');
commit;
