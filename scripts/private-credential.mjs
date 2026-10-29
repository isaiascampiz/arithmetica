import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const filename = path.resolve('data/deployment/supabase-deploy-token.dpapi');
function windowsProtection(input, decode) {
  if (process.platform !== 'win32')
    throw new Error('Use an approved native credential store on this operating system.');
  const script = decode
    ? 'Add-Type -AssemblyName System.Security; $privateBytes=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()); [Console]::Out.Write([Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($privateBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)));'
    : 'Add-Type -AssemblyName System.Security; $privateBytes=[Text.Encoding]::UTF8.GetBytes([Console]::In.ReadToEnd()); [Console]::Out.Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($privateBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)));';
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    input,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 32768,
  });
}
export async function saveDeploymentToken(token) {
  if (typeof token !== 'string' || !/^sbp_[A-Za-z0-9_-]{30,}$/.test(token) || token.length > 12000)
    throw new Error('Invalid deployment credential.');
  const encrypted = windowsProtection(token, false);
  await writeFile(filename, encrypted, { flag: 'wx', mode: 0o600 });
  if ((await loadDeploymentToken()) !== token)
    throw new Error('Encrypted credential verification failed.');
}
export async function loadDeploymentToken() {
  return windowsProtection(await readFile(filename, 'utf8'), true);
}
