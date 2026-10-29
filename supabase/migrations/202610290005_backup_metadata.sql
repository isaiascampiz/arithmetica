-- Read-only provisioning metadata for independent server backups.
-- Does not grant browser/anonymous clients access or change existing records.
begin;
grant select on public.centers, public.staff_memberships, public.application_versions to service_role;
insert into public.application_versions(version,description)
values(5,'Read-only center, membership and schema metadata for private backups');
commit;
