import test from 'node:test';
import assert from 'node:assert/strict';
import { isPouchCode, isPouchCodePrefix } from '../src/lib/pouch-code';

test('scanner accepts Arithmetica labels and previously printed Centerflow labels', () => {
  assert.equal(isPouchCode('AR-1234-abcd'), true);
  assert.equal(isPouchCode('CF-DEMO-FICTIONAL-1234'), true);
  assert.equal(isPouchCode('AR-'), false);
  assert.equal(isPouchCode('Fictional Student'), false);
  assert.equal(isPouchCode('AR-1234\nforged'), false);
  assert.equal(isPouchCodePrefix('AR-'), true);
  assert.equal(isPouchCodePrefix('CF-'), true);
  assert.equal(isPouchCodePrefix('Fictional Student'), false);
});
