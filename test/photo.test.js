// Photos for Instagram: JPEG, sRGB, 320–1440 wide, 4:5 to 1.91:1 (or 9:16 for stories).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { photoInfo, photoPreflight, preparePhoto, PHOTO_SPEC } from '../src/photo.js';
import { tmp, cleanup } from './helpers.js';

const hasSips = (() => { try { execFileSync('which', ['sips']); return true; } catch { return false; } })();
let dir;
const img = (name, w, h) => { const p = join(dir, name); execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', `testsrc2=s=${w}x${h}`, '-frames:v', '1', p]); return p; };
before(() => { dir = tmp(); });
after(() => cleanup(dir));

test('a phone photo (tall PNG) becomes a 1080×1350 sRGB JPEG in one pass', { skip: !hasSips }, async () => {
  const src = img('tall.png', 3024, 4032);
  const r = await preparePhoto(src, join(dir, 'tall.jpg'));
  const out = await photoInfo(r.out);
  assert.equal(out.format, 'jpeg');
  assert.match(out.profile, /sRGB/);
  assert.deepEqual([out.width, out.height], [1080, 1350]);
  assert.ok(r.check.issues.some((i) => /JPEG only/.test(i.msg)));
});

test('panoramas are cropped inside the 1.91:1 limit, never over it', { skip: !hasSips }, async () => {
  const r = await preparePhoto(img('wide.png', 4000, 1000), join(dir, 'wide.jpg'));
  const out = await photoInfo(r.out);
  assert.equal(out.width, 1080);
  assert.ok(out.width / out.height <= PHOTO_SPEC.maxAspect, `${out.width}×${out.height}`);
});

test('stories are 9:16; a chosen crop is honoured', { skip: !hasSips }, async () => {
  const src = img('t2.png', 3024, 4032);
  const s = await photoInfo((await preparePhoto(src, join(dir, 's.jpg'), { story: true })).out);
  assert.deepEqual([s.width, s.height], [1080, 1920]);
  const sq = await photoInfo((await preparePhoto(src, join(dir, 'sq.jpg'), { aspect: '1:1' })).out);
  assert.deepEqual([sq.width, sq.height], [1080, 1080]);
});

test('a photo that already fits ships untouched; one too small is refused', { skip: !hasSips }, async () => {
  const ok = join(dir, 'ok.jpg');
  execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=1080x1350', '-frames:v', '1', '-q:v', '2', ok]);
  const r = await preparePhoto(ok, join(dir, 'ok-out.jpg'));
  assert.equal(r.check.plan, 'none');
  await assert.rejects(preparePhoto(img('tiny.png', 200, 250), join(dir, 'tiny.jpg')), /at least 320/);
});

test('preflight lists every issue without touching the file', () => {
  const c = photoPreflight({ width: 4032, height: 3024, format: 'heic', profile: 'Display P3', bytes: 3e6 });
  assert.equal(c.plan, 'convert');
  assert.equal(c.issues.length, 2 + 1, 'format, colour, size (4:3 landscape is already a legal shape)');
  assert.ok(c.issues.some((i) => /Display P3 → sRGB/.test(i.msg)));
});
