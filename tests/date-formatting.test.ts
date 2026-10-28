import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayKey } from '../src/lib/model';
import { zonedTimestamp } from '../src/lib/schedule';

test('day keys retain native Intl output across timezone changes, DST, midnight and cache eviction', () => {
  const dates = [
    '2026-03-08T09:59:00Z',
    '2026-03-08T10:00:00Z',
    '2026-11-01T09:30:00Z',
    '2026-10-19T00:30:00Z',
  ];
  const zones = [
    'America/Los_Angeles',
    'UTC',
    'Pacific/Kiritimati',
    ...Intl.supportedValuesOf('timeZone').slice(0, 24),
    'America/Los_Angeles',
  ];
  for (const timeZone of zones) {
    const reference = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    for (const date of dates) {
      assert.equal(dayKey(date, timeZone), reference.format(new Date(date)));
      assert.equal(dayKey(new Date(date), timeZone), reference.format(new Date(date)));
    }
  }
  assert.throws(() => dayKey('invalid', 'UTC'), RangeError);
  assert.throws(() => dayKey(dates[0], 'invalid/timezone'), RangeError);
});

test('local timestamps still reject nonexistent spring times and resolve ordinary midnight', () => {
  assert.throws(
    () => zonedTimestamp('2026-03-08', '02:30', 'America/Los_Angeles'),
    /does not exist/,
  );
  assert.equal(
    zonedTimestamp('2026-03-09', '00:00', 'America/Los_Angeles'),
    '2026-03-09T07:00:00.000Z',
  );
});
