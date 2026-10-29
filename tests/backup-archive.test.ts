import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { decryptBackup, encryptBackup } from '../src/lib/backup-archive';

test('encrypted recovery archive preserves exact identities, dates, attribution and schema history', () => {
  const key = randomBytes(32),
    data = {
      students: [{ id: 'stable-id', name: 'Fictional Recovery' }],
      observations: [
        {
          id: 'note',
          at: '2026-10-29T00:00:00Z',
          text: 'Original note',
          reviewer: 'Fictional teacher',
        },
      ],
      versions: [{ version: 3, applied_at: '2026-10-01T00:00:00Z' }],
      history: [1, 2, 3],
    };
  const archive = encryptBackup(data, key);
  assert.equal(archive.includes(Buffer.from('Original note')), false);
  assert.deepEqual(decryptBackup(archive, key), data);
  assert.notDeepEqual(encryptBackup(data, key), archive);
});
test('wrong recovery keys, truncation, altered format and changed contents fail authentication', () => {
  const key = randomBytes(32),
    archive = encryptBackup({ text: 'Fictional private record' }, key);
  assert.throws(() => decryptBackup(archive, randomBytes(32)));
  assert.throws(() => decryptBackup(archive.subarray(0, -1), key));
  for (const position of [0, 24, archive.length - 1]) {
    const altered = Buffer.from(archive);
    altered[position] ^= 1;
    assert.throws(() => decryptBackup(altered, key));
  }
});
