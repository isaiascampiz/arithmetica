-- Run ONLY in a disposable Supabase test project after the migration.
-- Requires pgTAP. Fixtures roll back. Not executed in this credential-free delivery.
begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(8);
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.students'::regclass,'public.observations'::regclass,'public.visits'::regclass,'public.homework_packets'::regclass,'public.kiosk_devices'::regclass)), 'All record tables have RLS');
select ok(not has_table_privilege('anon','public.students','select'),'Anon cannot read roster');
select ok(not has_table_privilege('anon','public.observations','select'),'Anon cannot read observations');
select ok(not has_table_privilege('authenticated','public.staff_memberships','insert'),'Clients cannot create roles');
select ok(not has_table_privilege('authenticated','public.visits','delete'),'Clients cannot delete visits');
select ok(not has_table_privilege('authenticated','public.audit_events','update'),'Audit is append-only');
select ok(not has_function_privilege('anon','public.kiosk_attendance(text,text)','execute'),'Anonymous kiosk RPC denied');
select ok(exists(select 1 from pg_indexes where indexname='one_open_visit_per_student' and indexdef like '%UNIQUE%'),'Open visits are unique');
select * from finish();
rollback;
