import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';

const magic = Buffer.from('ARITHMETICA-BACKUP-1\n');
const aad = Buffer.from('Arithmetica independent backup v1; gzip; AES-256-GCM');
/** Authentication covers the format and all compressed contents; keys never enter the archive. */
export function encryptBackup(contents: unknown, key: Buffer): Buffer {
  if (key.length !== 32) throw new Error('A 256-bit recovery key is required.');
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([
    cipher.update(gzipSync(JSON.stringify(contents))),
    cipher.final(),
  ]);
  return Buffer.concat([magic, iv, cipher.getAuthTag(), ciphertext]);
}
export function decryptBackup(archive: Buffer, key: Buffer): unknown {
  if (
    key.length !== 32 ||
    !archive.subarray(0, magic.length).equals(magic) ||
    archive.length < magic.length + 29
  )
    throw new Error('Unsupported backup or invalid recovery key.');
  const offset = magic.length;
  const decipher = createDecipheriv('aes-256-gcm', key, archive.subarray(offset, offset + 12));
  decipher.setAAD(aad);
  decipher.setAuthTag(archive.subarray(offset + 12, offset + 28));
  const compressed = Buffer.concat([
    decipher.update(archive.subarray(offset + 28)),
    decipher.final(),
  ]);
  return JSON.parse(
    gunzipSync(compressed, { maxOutputLength: 1024 * 1024 * 1024 }).toString('utf8'),
  );
}
