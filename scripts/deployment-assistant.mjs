// Local-only migration review/copy aid. Never serves records, credentials or arbitrary files.
import { createServer } from 'node:http';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { saveDeploymentToken } from './private-credential.mjs';

const loadModule = createRequire(import.meta.url);
loadModule('./run-ts.cjs');
const { emptyProductionCenter } = loadModule('../src/lib/center-initialization.ts');
const projectRef = process.argv[2] || '';
const environment = process.argv[3] || 'staging';
if (!['staging', 'production'].includes(environment))
  throw new Error('Unknown deployment environment.');
const port = environment === 'production' ? 3103 : 3102;
if (projectRef && !/^[a-z]{20}$/.test(projectRef))
  throw new Error('Expected the exact approved project reference.');
const privateDirectory = path.resolve('data/deployment');
let plan;
if (projectRef) {
  await mkdir(privateDirectory, { recursive: true });
  const planFile = path.join(privateDirectory, `${environment}-plan.json`);
  try {
    plan = JSON.parse(await readFile(planFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    plan = { projectRef, centerId: randomUUID() };
    await writeFile(planFile, JSON.stringify(plan, null, 2), {
      flag: 'wx',
      mode: 0o600,
    });
  }
  if (plan.projectRef !== projectRef)
    throw new Error('Project differs from the existing plan. Nothing was replaced.');
}

const directory = path.resolve('supabase/migrations');
const files = (await readdir(directory)).filter((file) => /^\d+_[\w-]+\.sql$/.test(file)).sort();
const migrations = await Promise.all(
  files.map(async (name) => ({
    name,
    sql: await readFile(path.join(directory, name), 'utf8'),
  })),
);
if (plan) {
  const bootstrapFile = path.join(privateDirectory, `${environment}-bootstrap.sql`);
  let bootstrap;
  try {
    bootstrap = await readFile(bootstrapFile, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const db = emptyProductionCenter(
      {
        name:
          environment === 'staging'
            ? 'Arithmetica staging — synthetic testing only'
            : 'Kumon Learning Center · Yuba City',
        timezone: 'America/Los_Angeles',
        operatingDays: [1, 2, 3, 4],
        closingTime: '19:15',
        expectedMinutes: 45,
        earlyPerInstructor: 2,
      },
      'Authorized deployment setup',
    );
    db.revision = 1;
    bootstrap = `-- Explicit empty ${environment}-center initialization. Refuses occupied state.\nbegin;\ninsert into public.centers(id,name,timezone) values('${plan.centerId}','Arithmetica ${environment}','America/Los_Angeles');\nselect public.write_centerflow('${plan.centerId}',0,'${JSON.stringify(db).replaceAll("'", "''")}'::jsonb) as initialized;\ncommit;`;
    await writeFile(bootstrapFile, bootstrap, { flag: 'wx', mode: 0o600 });
  }
  migrations.push({
    name: `${environment.toUpperCase()} — initialize an empty center`,
    sql: bootstrap,
  });
  try {
    if (environment !== 'staging')
      throw Object.assign(new Error('Not staging'), { code: 'ENOENT' });
    migrations.push({
      name: 'SYNTHETIC QA STAFF — staging only',
      sql: await readFile(path.join(privateDirectory, 'staging-test-memberships.sql'), 'utf8'),
    });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (environment === 'staging') {
    try {
      migrations.push({
        name: 'SYNTHETIC RESTORE — new isolated staging center only',
        sql: await readFile(path.join(privateDirectory, 'staging-restore.sql'), 'utf8'),
      });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}
const escape = (value) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Arithmetica deployment review</title><style>body{font:16px system-ui;max-width:900px;margin:40px auto;padding:24px;background:#f7f7f5;color:#222}article{background:white;padding:24px;margin:20px 0;border:1px solid #ddd;border-radius:12px}button{font:inherit;min-height:44px;padding:10px 20px;cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px}h2{font-size:18px}summary{padding:16px 0;cursor:pointer}#status{min-height:24px}</style>
<h1>Arithmetica deployment review — ${environment}</h1><p>Apply these ordered, additive migrations only to the approved ${environment} project ${projectRef}. This local page contains source SQL only. It exposes no student records, passwords or API keys.</p><p id="status" role="status"></p>
${migrations.map((item, i) => `<article><h2>${i + 1}. ${escape(item.name)}</h2><button data-copy="${i}">Copy migration ${i + 1}</button><details><summary>Review SQL</summary><pre>${escape(item.sql)}</pre></details></article>`).join('')}
${plan ? `<article><h2>${environment} connection</h2><p>Save the approved existing API keys in this project's ignored private configuration. Values are never displayed, logged or served back. This does not publish a site.</p><form id="connection"><label>Anon key<br><input name="anon" type="password" autocomplete="off" required></label><br><label>Service-role key<br><input name="service" type="password" autocomplete="off" required></label><br><button>Save private ${environment} connection</button></form></article>` : ''}
<script>const migrations=${JSON.stringify(migrations).replaceAll('<', '\\u003c')};document.querySelectorAll('[data-copy]').forEach(button=>button.addEventListener('click',async()=>{await navigator.clipboard.writeText(migrations[Number(button.dataset.copy)].sql);document.getElementById('status').textContent='Migration '+(Number(button.dataset.copy)+1)+' copied.';}));document.getElementById('connection')?.addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;const result=await fetch('/credentials',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(form)))});document.getElementById('status').textContent=result.ok?'Private staging connection saved. No student records uploaded.':'Unable to save. Existing configuration was preserved.';if(result.ok)form.reset();});</script></html>`;
const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/deployment-token') {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Frame-Options': 'DENY',
    });
    res.end(
      '<!doctype html><title>Private deployment credential</title><h1>Save approved deployment access</h1><p>The scoped token is encrypted for this Windows account. It is never displayed, logged, served back, or sent to the app browser.</p><form><label>Scoped deployment token<input name="token" type="password" autocomplete="off" required></label><button>Save encrypted deployment token</button></form><p role="status"></p><script>document.querySelector("form").onsubmit=async event=>{event.preventDefault();const form=event.currentTarget;const response=await fetch("/deployment-token",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(Object.fromEntries(new FormData(form)))});document.querySelector("[role=status]").textContent=response.ok?"Encrypted credential saved and verified.":"Not saved; existing credential preserved.";if(response.ok)form.reset();};</script>',
    );
    return;
  }
  if (req.method === 'POST' && req.url === '/deployment-token') {
    try {
      if (
        req.headers.origin !== `http://127.0.0.1:${port}` ||
        !req.headers['content-type']?.startsWith('application/json')
      )
        throw new Error('Origin denied');
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 16000) throw new Error('Input limit');
      }
      const input = JSON.parse(body);
      if (Object.keys(input).join(',') !== 'token') throw new Error('Invalid input');
      await saveDeploymentToken(input.token);
      res.writeHead(200, { 'Cache-Control': 'no-store' });
      res.end('Saved');
    } catch {
      res.writeHead(400, { 'Cache-Control': 'no-store' });
      res.end('Not saved');
    }
    return;
  }
  if (req.method === 'GET' && req.url === '/edge-bundle') {
    try {
      const source = await readFile(
        path.resolve('data/edge-build/supabase/functions/arithmetica-api/index.ts'),
        'utf8',
      );
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Frame-Options': 'DENY',
        'Content-Security-Policy': "default-src 'none'",
      });
      res.end(
        '<!doctype html><title>Reviewed Arithmetica API bundle</title><h1>Application source only — no records or credentials</h1><pre>' +
          escape(source) +
          '</pre>',
      );
    } catch {
      res.writeHead(404);
      res.end();
    }
    return;
  }
  if (req.method === 'POST' && req.url === '/credentials' && plan) {
    if (
      req.headers.origin !== `http://127.0.0.1:${port}` ||
      !req.headers['content-type']?.startsWith('application/json')
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 20000) throw new Error('Input limit');
      }
      const keys = JSON.parse(body);
      if (
        Object.keys(keys).sort().join(',') !== 'anon,service' ||
        [keys.anon, keys.service].some(
          (value) =>
            typeof value !== 'string' ||
            value.length < 32 ||
            value.length > 10000 ||
            /\s/.test(value),
        )
      )
        throw new Error('Invalid keys');
      const settings = {
        DEPLOYMENT_ENV: environment,
        DEMO_MODE: 'false',
        DATA_ADAPTER: 'supabase',
        PRODUCTION_DATA_APPROVED: 'true',
        ENABLE_SCHEDULER: 'false',
        COOKIE_SECURE: 'true',
        CENTER_TIMEZONE: 'America/Los_Angeles',
        NEXT_PUBLIC_SUPABASE_URL: `https://${projectRef}.supabase.co`,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: keys.anon,
        SUPABASE_SERVICE_ROLE_KEY: keys.service,
        CENTER_ID: plan.centerId,
        SESSION_SECRET: randomBytes(48).toString('base64url'),
        JOBS_SECRET: randomBytes(48).toString('base64url'),
      };
      await writeFile(
        path.join(privateDirectory, `${environment}.runtime.json`),
        JSON.stringify(settings, null, 2),
        { flag: 'wx', mode: 0o600 },
      );
      res.writeHead(200, { 'Cache-Control': 'no-store' });
      res.end('Saved');
    } catch {
      res.writeHead(400, { 'Cache-Control': 'no-store' });
      res.end('Not saved');
    }
    return;
  }
  if (req.method !== 'GET' || req.url !== '/') {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
  });
  res.end(html);
});
server.listen(port, '127.0.0.1', () =>
  console.log(`Local ${environment} migration review: http://127.0.0.1:${port}/ (source SQL only)`),
);
server.on('error', () => {
  console.error('Local review port is unavailable; existing servers were not reused.');
  process.exitCode = 1;
});
