// Settings: saved in data/settings.json, which wins over .env, which wins over defaults.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULTS, clean, mergeSettings, saveSettings } from '../src/settings.js';
import { tmp, cleanup } from './helpers.js';

test('defaults, then .env, then the saved file', () => {
  const dir = tmp();
  try {
    assert.deepEqual(mergeSettings(dir, {}), { ...DEFAULTS, postingTimes: [...DEFAULTS.postingTimes] });
    assert.equal(mergeSettings(dir, { STAGE_WINDOW_MIN: '60', NOTIFY: '0' }).stageWindowMin, 60);
    assert.equal(mergeSettings(dir, { NOTIFY: '0' }).notify, false);
    saveSettings(dir, { stageWindowMin: 240 });
    assert.equal(mergeSettings(dir, { STAGE_WINDOW_MIN: '60' }).stageWindowMin, 240, 'the app setting wins over .env');
  } finally { cleanup(dir); }
});

test('rejects values out of range with a readable message', () => {
  assert.throws(() => clean({ stageWindowMin: 5 }), /15 minutes and 23 hours/);
  assert.throws(() => clean({ stageWindowMin: 1440 }), /23 hours/, 'Instagram discards uploads after 24h');
  assert.throws(() => clean({ lateLimitMin: -1 }), /missed-post/);
  assert.throws(() => clean({ postingTimes: [] }), /1 and 6/);
  assert.throws(() => clean({ postingTimes: ['09:00', 'nope'] }).postingTimes.length === 1 && clean({ postingTimes: ['x'] }), /1 and 6/);
  assert.throws(() => clean({ defaultTime: '25:00' }), /default time/);
  assert.deepEqual(clean({ postingTimes: ['21:00', '09:00', '21:00'] }).postingTimes, ['09:00', '21:00'], 'sorted, no duplicates');
});

test('removing the default time moves the default to a time that still exists', () => {
  const dir = tmp();
  try {
    saveSettings(dir, { postingTimes: ['08:00', '18:30'], defaultTime: '18:30' });
    saveSettings(dir, { postingTimes: ['08:00'] });
    const m = mergeSettings(dir, {});
    assert.deepEqual(m.postingTimes, ['08:00']);
    assert.equal(m.defaultTime, '08:00');
    // A broken file never crashes the app — it falls back to defaults.
    const f = join(dir, 'settings.json');
    assert.ok(readFileSync(f, 'utf8').includes('08:00'));
    saveSettings(dir, {});
  } finally { cleanup(dir); }
});
