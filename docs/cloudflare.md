# Hosting and code releases

V1 is deployed at https://arithmetica.arithmetica.workers.dev. Staging is https://arithmetica-staging.arithmetica.workers.dev and contains fictional students only. Both currently use Free plans; no paid upgrade was selected.

## Runtime

Cloudflare serves static browser assets and a small fixed-destination proxy. Supabase Edge Functions run the original authenticated HTTP handlers and domain/repository modules; PostgreSQL stores records independently of application deployments. The complete Next/OpenNext Worker exceeded the Free CPU allowance and was removed from the supported deployment path. Do not deploy old `.open-next` artifacts.

`wrangler.jsonc` selects staging; `wrangler.production.jsonc` selects production. Both use `src/server/static-worker.ts`, generated `data/browser-build/out` assets, and a 15-minute Cron trigger. The backend interprets center-local dates and closing time; the proxy timer is UTC. No demo initialization or roster import runs during build/deployment.

## Release commands

Use Node 24.20.0 and `corepack pnpm` 11.25.0. On this Windows machine dependencies use `--node-linker=hoisted --store-dir .pnpm-store` when installing. Keep the lockfile.

```powershell
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm test:e2e
corepack pnpm cloudflare:build
corepack pnpm api:deploy staging deploy
corepack pnpm cloudflare:deploy --config wrangler.jsonc
corepack pnpm test:hosted
```

Check staging workflows, permissions, exports, backup/restore and unchanged data after deployment. Make a fresh encrypted production backup before release. Then deploy the same reviewed API/browser artifacts:

```powershell
corepack pnpm api:deploy production deploy
corepack pnpm cloudflare:deploy --config wrangler.production.jsonc
```

Do not rebuild or change assets during an upload. Verify production with read-only checks, without synthetic students/visits. Keep the same URL, center UUID and database. Frontend code and API must be compatible during the brief separate deployments. Any schema change needs its own additive, tested migration; no database reset or auto-reseed.

## Secrets

`data/deployment/` is ignored and restricted by NTFS ACL to the Windows owner and SYSTEM. Runtime JSON files and the recovery key are sensitive. Never print their contents or upload them to Git. The narrowly scoped Supabase deployment PAT is DPAPI-encrypted for the Windows user and expires November 5, 2026. Renew through the same scoped flow before later deployments; this credential is not needed for the running app. Wrangler's existing authorized credential uses the OS credential store.

Supabase provides its own URL/anonymous/service-role inputs. App aliases are `ARITHMETICA_ENVIRONMENT`, `ARITHMETICA_DATA_APPROVED`, `ARITHMETICA_APP_ORIGIN`, `ARITHMETICA_CENTER_ID`, `ARITHMETICA_SESSION_SECRET` and `ARITHMETICA_JOBS_SECRET`. `api:deploy <environment> secrets` sets those from the protected environment-specific file. The gateway JWT check remains enabled; app staff roles and kiosk scope are verified separately on the server.

The Cloudflare proxy retains only `NEXT_PUBLIC_SUPABASE_ANON_KEY` for the gateway and `JOBS_SECRET` for scheduled calls. Database service keys and session-signing secrets are unnecessary there. `scripts/cloudflare-prune.mjs` removes those obsolete proxy secrets while protected recovery configuration remains available. Browser assets contain no credentials. An anonymous key does not authorize direct access to the private app tables/RPCs.

## Capacity and maintenance

Measured proxy HTTP CPU was 1–3 ms in staging, compared with the Free allowance of 10 ms. The live backend passed 32 synthetic workflow checks, including Excel export, in Supabase's runtime. These are samples, not an unlimited-capacity guarantee. Monitor Cloudflare errors/requests and Supabase database size, function usage, egress and authentication errors. Snapshot history retains prior aggregates; growth must be reviewed without silently deleting history.

Current plan limits are provider-controlled: [Cloudflare limits](https://developers.cloudflare.com/workers/platform/limits/), [Supabase pricing](https://supabase.com/pricing), [function limits](https://supabase.com/docs/guides/functions/limits). Free projects may pause after inactivity and do not offer paid uptime guarantees. Backups and the actual iPad pilot are covered in the [operations runbook](deployment-and-import-plan.md).
