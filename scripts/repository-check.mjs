import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** High-confidence patterns only; findings never include the matched value. */
export function credentialFindings(bytes) {
  const text = bytes.toString('utf8');
  const findings = [];
  const patterns = [
    ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
    ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
    ['Supabase token', /\bsbp_[A-Za-z0-9_-]{30,}\b/],
    ['Supabase secret key', /\bsb_secret_[A-Za-z0-9_-]{20,}\b/],
    ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
    ['OpenAI key', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{40,}\b/],
  ];
  for (const [label, pattern] of patterns) if (pattern.test(text)) findings.push(label);
  for (const match of text.matchAll(/\beyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+\b/g)) {
    try {
      const payload = JSON.parse(Buffer.from(match[1], 'base64url').toString());
      if (payload.role === 'service_role') findings.push('privileged service-role JWT');
    } catch {
      // Text that resembles a JWT is not necessarily a credential.
    }
  }
  return [...new Set(findings)];
}

export function isPrivatePath(filename) {
  const normalized = filename.replaceAll('\\', '/');
  return (
    /^(?:data|node_modules|\.next|\.open-next|\.wrangler|\.pnpm-store|test-results|playwright-report|coverage)\//.test(
      normalized,
    ) ||
    (/(?:^|\/)\.env(?:\.|$)/.test(normalized) &&
      !normalized.endsWith('/.env.example') &&
      normalized !== '.env.example') ||
    /\.(?:xlsx?|csv|tsv|pem|key|pfx|dpapi|sqlite3?|db|bak)$/i.test(normalized)
  );
}

function git(args, options = {}) {
  return execFileSync('git', args, {
    maxBuffer: 128 * 1024 * 1024,
    windowsHide: true,
    ...options,
  });
}

function main() {
  const findings = [];
  const files = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
    .toString()
    .split('\0')
    .filter(Boolean);
  let checkedFiles = 0;
  for (const file of files) {
    let bytes;
    try {
      bytes = readFileSync(file);
    } catch (error) {
      if (error.code === 'ENOENT') continue; // A moved file may still be in the index.
      throw error;
    }
    checkedFiles++;
    if (isPrivatePath(file)) findings.push({ path: file, kind: 'private/generated path' });
    for (const kind of credentialFindings(bytes)) findings.push({ path: file, kind });
  }
  let historyBlobs = 0;
  if (process.argv.includes('--history')) {
    const objects = git(['rev-list', '--objects', '--all'])
      .toString()
      .trim()
      .split('\n')
      .filter(Boolean);
    for (const row of objects) {
      const separator = row.indexOf(' ');
      if (separator >= 0 && isPrivatePath(row.slice(separator + 1)))
        findings.push({
          path: row.slice(separator + 1),
          kind: 'private/generated path in history',
        });
    }
    for (let start = 0; start < objects.length; start += 40) {
      const ids = objects.slice(start, start + 40).map((row) => row.split(' ')[0]);
      const batch = git(['cat-file', '--batch'], {
        input: ids.join('\n') + '\n',
      });
      let offset = 0;
      while (offset < batch.length) {
        const end = batch.indexOf(10, offset);
        if (end < 0) throw Error('Incomplete Git object header.');
        const [id, type, size] = batch.subarray(offset, end).toString().split(' ');
        const length = Number(size);
        if (!Number.isSafeInteger(length) || length < 0 || end + 1 + length >= batch.length)
          throw Error('Invalid Git object length.');
        if (type === 'blob') {
          historyBlobs++;
          for (const kind of credentialFindings(batch.subarray(end + 1, end + 1 + length)))
            findings.push({ object: id, kind });
        }
        offset = end + 1 + length + 1;
      }
    }
  }
  console.log(
    JSON.stringify(
      { checkedFiles, historyBlobs, findings, credentialValuesLogged: false },
      null,
      2,
    ),
  );
  if (findings.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main();
