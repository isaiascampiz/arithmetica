import test from 'node:test';
import assert from 'node:assert/strict';
import { dictationAllowed } from '../src/lib/privacy';

test('real-data dictation requires an explicit server-approved flag; fictional fixtures remain usable', () => {
  const runtime = { demo: false, adapter: 'supabase', scheduler: false };
  assert.equal(dictationAllowed({ runtime }), false);
  assert.equal(dictationAllowed({ runtime: { ...runtime, dictationApproved: true } }), true);
  assert.equal(dictationAllowed({ runtime: { ...runtime, demo: true } }), true);
});
