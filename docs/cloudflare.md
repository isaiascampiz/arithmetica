# Future Cloudflare hosting

No deployment, database replacement, framework conversion, billing change or Cloudflare account connection was performed. These notes describe the existing implementation and a future decision path, not a ready-to-deploy configuration.

Centerflow is a full Next.js 16.4.0/React 19.3.0 app with authenticated server routes. Static-file hosting alone cannot run it. The validated runtime is a persistent Node 24 server; `next.config.ts` contains headers but no Cloudflare adapter.

| Current concern                                        | Implication for future Workers hosting                                                                                                              |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| JSON writes and directory locks in `repository.ts`     | Need durable shared storage. A Worker filesystem is not a replacement for the data file; never publish it as an asset or rely on per-instance disk. |
| Existing Supabase REST/RPC/CAS adapter and Auth        | Potential shared PostgreSQL path, requiring actual RLS/auth/tenant/concurrency/recovery validation. No switch now.                                  |
| `node:fs/promises`, `node:path`, `node:crypto` imports | Validate bundling and runtime support, including modules imported when Supabase is selected. API availability does not make file storage durable.   |
| Node-only periodic jobs from `instrumentation.ts`      | Worker invocations are not an always-running process. Later use a secured scheduled mechanism with the existing idempotent job endpoint.            |
| In-memory throttling/runtime state                     | Per-process memory is not shared enforcement across instances. Review infrastructure limits.                                                        |
| Cookies, membership and kiosk pairing                  | Recheck proxy/origin handling, HTTPS, permanent secrets, refresh/revocation and separate kiosk scope on the host.                                   |
| PWA/camera                                             | Need HTTPS and physical iPad/Safari testing. A coding-cloud preview does not prove device support.                                                  |
| Backups                                                | Need independent managed record backups and tested recovery. Git stores source, not student records.                                                |

As of October 15, 2026, [Cloudflare's Next.js guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/) recommends **vinext** for Workers and identifies it as beta. An OpenNext path also exists. A future hosting task must check exact framework/adapter support before choosing. Neither adapter was installed or tested here; a Node build is not already a Workers artifact.

When deployment is separately authorized, use a branch and approved fictional-data staging. Review exact adapter compatibility, validate existing Supabase shared persistence, configure server-only secrets and a protected scheduler, then run regressions plus cloud/device/security/recovery checks. Price actual database, backup, hosting and usage needs then; no cost or free-tier promise is made.

The likely future arrangement is iPads/computers → HTTPS application/API → shared Supabase/PostgreSQL, with a secured scheduler and independent backups. The current app remains local until that separate task.
