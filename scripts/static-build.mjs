import { readFile, writeFile, mkdir, readdir, copyFile, symlink, realpath } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { parse } from 'parse5';

const workspace = process.cwd(),
  target = path.resolve('data/browser-build');
assert.ok(target.startsWith(workspace + path.sep));
await mkdir(path.join(target, 'app'), { recursive: true });
// Generated browser entry points import the existing components; no copied business logic or server routes.
const pages = {
  'page.tsx':
    "import { StaffApp } from '@/components/workspace/staff-app'; export default function Page(){return <StaffApp/>;}",
  'login/page.tsx':
    "import { Login } from '@/components/auth/login'; export default function Page(){return <Login cloud/>;}",
  'kiosk/page.tsx':
    "import { Kiosk } from '@/components/attendance/kiosk'; export default function Page(){return <Kiosk/>;}",
  'reception/page.tsx':
    "import { Kiosk } from '@/components/attendance/kiosk'; export default function Page(){return <Kiosk staffPreview/>;}",
  'pouch/page.tsx':
    "import { StaticPouch } from '@/components/pouch/static-pouch'; export default function Page(){return <StaticPouch/>;}",
};
for (const [name, source] of Object.entries(pages)) {
  const destination = path.join(target, 'app', name);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, source);
}
let layout = await readFile('src/app/layout.tsx', 'utf8');
layout = layout
  .replace("export const dynamic = 'force-dynamic';", '')
  .replaceAll('../../public/', '../public/');
await writeFile(path.join(target, 'app/layout.tsx'), layout);
for (const name of await readdir('src/app'))
  if (name.endsWith('.css'))
    await copyFile(path.join('src/app', name), path.join(target, 'app', name));
const publicLink = path.join(target, 'public');
try {
  await symlink(
    path.resolve('public'),
    publicLink,
    process.platform === 'win32' ? 'junction' : 'dir',
  );
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  assert.equal(await realpath(publicLink), await realpath('public'));
}
const original = JSON.parse(await readFile('tsconfig.json', 'utf8'));
await writeFile(
  path.join(target, 'tsconfig.json'),
  JSON.stringify(
    {
      compilerOptions: {
        ...original.compilerOptions,
        baseUrl: workspace,
        paths: { '@/*': ['./src/*'] },
      },
      include: ['next-env.d.ts', 'app/**/*.tsx', '.next/types/**/*.ts'],
      exclude: ['node_modules'],
    },
    null,
    2,
  ),
);
await writeFile(
  path.join(target, 'package.json'),
  JSON.stringify({ name: 'arithmetica-browser-build', private: true }),
);
await writeFile(
  path.join(target, 'next.config.mjs'),
  `export default {output:'export',trailingSlash:true,poweredByHeader:false,images:{unoptimized:true},webpack(config){config.resolve.alias['@']=${JSON.stringify(path.resolve('src'))};return config;}};`,
);
const child = spawn(
  process.execPath,
  [path.resolve('node_modules/next/dist/bin/next'), 'build', target, '--webpack'],
  {
    stdio: 'inherit',
    windowsHide: true,
    env: {
      ...process.env,
      ARITHMETICA_BUILD: 'true',
      ENABLE_SCHEDULER: 'false',
    },
  },
);
const status = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', resolve);
});
process.exitCode = status ?? 1;
if (status === 0) {
  const hashes = new Set();
  async function inspectHtml(directory) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const filename = path.join(directory, item.name);
      if (item.isDirectory()) await inspectHtml(filename);
      else if (item.name.endsWith('.html')) {
        const html = await readFile(filename, 'utf8');
        const visit = (node) => {
          if (node.tagName === 'script' && !node.attrs.some((attr) => attr.name === 'src')) {
            const location = node.sourceCodeLocation;
            assert.ok(
              location?.startTag && location.endTag,
              `Unclosed inline script in ${filename}`,
            );
            const source = html.slice(location.startTag.endOffset, location.endTag.startOffset);
            if (source)
              hashes.add("'sha256-" + createHash('sha256').update(source).digest('base64') + "'");
          }
          for (const child of node.childNodes ?? []) visit(child);
        };
        visit(parse(html, { sourceCodeLocationInfo: true }));
      }
    }
  }
  await inspectHtml(path.join(target, 'out'));
  const policy = [
    "default-src 'self'",
    "script-src 'self' " + [...hashes].join(' '),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
  await writeFile(
    path.join(target, 'out/_headers'),
    `/*\n  Content-Security-Policy: ${policy}\n\n/_next/static/*\n  Cache-Control: public,max-age=31536000,immutable\n`,
  );
  console.log(
    `Static script policy generated with ${hashes.size} approved inline hashes; no unsafe-inline scripts.`,
  );
}
