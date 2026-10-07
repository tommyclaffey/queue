// Photos for Instagram: JPEG, sRGB, 320–1440 wide, 4:5 to 1.91:1 (or 9:16 for stories).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { photoInfo, photoPreflight, preparePhoto, PHOTO_SPEC, photoType, photoTypeOf, iccName, preparedName, isPreparedPhoto } from '../src/photo.js';
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

// ---- The ffmpeg path (Linux / the hosted server, where there is no sips). Runs on every machine.
const ff = { engine: 'ffmpeg' };
// First pixel of a solid-colour image, as [r, g, b].
const rgbAt = (file) => [...execFileSync('ffmpeg', ['-loglevel', 'quiet', '-i', file, '-vf', 'format=rgb24', '-frames:v', '1', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 24 }).subarray(0, 3)];

test('ffmpeg path: tall PNG → 1080×1350 JPEG; panorama inside 1.91:1; story 9:16; a numeric (carousel) shape', async () => {
  const tall = await preparePhoto(img('ff-tall.png', 3024, 4032), join(dir, 'ff-tall.jpg'), ff);
  let o = await photoInfo(tall.out, ff);
  assert.equal(o.format, 'jpeg');
  assert.deepEqual([o.width, o.height], [1080, 1350]);
  assert.equal(photoTypeOf(tall.out), 'jpeg');
  o = await photoInfo((await preparePhoto(img('ff-wide.png', 4000, 1000), join(dir, 'ff-wide.jpg'), ff)).out, ff);
  assert.equal(o.width, 1080);
  assert.ok(o.width / o.height <= PHOTO_SPEC.maxAspect, `${o.width}×${o.height}`);
  o = await photoInfo((await preparePhoto(img('ff-s.png', 3024, 4032), join(dir, 'ff-s.jpg'), { ...ff, story: true })).out, ff);
  assert.deepEqual([o.width, o.height], [1080, 1920]);
  const sq = await preparePhoto(img('ff-sq.png', 2000, 1000), join(dir, 'ff-sq.jpg'), { ...ff, aspect: 1 });
  assert.match(sq.check.issues.map((i) => i.msg).join(), /Cropped to 1:1/);
  o = await photoInfo(sq.out, ff);
  assert.deepEqual([o.width, o.height], [1000, 1000], 'never upscaled');
});

test('ffmpeg path: a photo that already fits ships untouched; too small is refused; non-photos rejected', async () => {
  const ok = join(dir, 'ff-ok.jpg');
  execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=1080x1350', '-frames:v', '1', '-q:v', '2', ok]);
  const r = await preparePhoto(ok, join(dir, 'ff-ok-out.jpg'), ff);
  assert.equal(r.check.plan, 'none');
  assert.deepEqual(readFileSync(r.out), readFileSync(ok));
  await assert.rejects(preparePhoto(img('ff-tiny.png', 200, 250), join(dir, 'ff-tiny.jpg'), ff), /at least 320/);
  const txt = join(dir, 'fake.jpg');
  execFileSync('sh', ['-c', `printf 'hello, not a photo' > '${txt}'`]);
  await assert.rejects(photoInfo(txt, ff), /readable photo/);
});

test('photos are recognised by their bytes, not their name', () => {
  assert.equal(photoType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), 'jpeg');
  assert.equal(photoType(Buffer.from('89504e470d0a1a0a0000000d', 'hex')), 'png');
  assert.equal(photoType(Buffer.from('\0\0\0\x18ftypheic\0\0\0\0', 'latin1')), 'heic');
  assert.equal(photoType(Buffer.from('\0\0\0\x18ftypmif1\0\0\0\0', 'latin1')), 'heic');
  assert.equal(photoType(Buffer.from('\0\0\0\x18ftypisom\0\0\0\0', 'latin1')), null, 'an MP4 is not a photo');
  assert.equal(photoType(Buffer.from('\0\0\0\x14ftypqt  \0\0\0\0', 'latin1')), null, 'a MOV is not a photo');
  assert.equal(photoType(Buffer.from('hello world!')), null);
  assert.equal(preparedName('123-IMG_1.HEIC'), '123-IMG_1.photo.jpg');
  assert.equal(preparedName('123-IMG_1.HEIC', 'story'), '123-IMG_1.photo-story.jpg');
  assert.ok(isPreparedPhoto('123-a.photo-r800.jpg') && !isPreparedPhoto('123-a.jpg'));
});

// iPhone-style Display P3 photos (made with sips, so these need a Mac to create the fixtures).
test('ffmpeg path: Display P3 really becomes sRGB (a P3-tagged red comes out sRGB red), profile read from the file', { skip: !hasSips }, async () => {
  const red = join(dir, 'red.png');
  execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0xFF0000:s=400x500', '-frames:v', '1', red]);
  const p3 = join(dir, 'red-p3.png');
  execFileSync('sips', ['-m', '/System/Library/ColorSync/Profiles/Display P3.icc', red, '--out', p3], { stdio: 'ignore' });
  assert.equal(iccName(p3), 'Display P3');
  const [r0, g0] = rgbAt(p3);
  assert.ok(r0 < 245 && g0 > 30, `fixture is in P3 numbers (${r0},${g0})`);
  const r = await preparePhoto(p3, join(dir, 'red-p3.jpg'), ff);
  assert.ok(r.check.issues.some((i) => /Display P3 → sRGB/.test(i.msg)));
  const [r1, g1, b1] = rgbAt(r.out);
  assert.ok(r1 >= 250 && g1 <= 6 && b1 <= 6, `sRGB red, got ${r1},${g1},${b1}`);
});

test('ffmpeg path: an iPhone-style HEIC (tiled, Display P3) → 4:5 sRGB JPEG', { skip: !hasSips }, async () => {
  const heic = join(dir, 'phone.heic');
  execFileSync('sips', ['-m', '/System/Library/ColorSync/Profiles/Display P3.icc', '-s', 'format', 'heic', img('h.png', 1200, 1600), '--out', heic], { stdio: 'ignore' });
  assert.equal(photoTypeOf(heic), 'heic');
  const info = await photoInfo(heic, ff);
  assert.deepEqual([info.width, info.height, info.format, info.profile], [1200, 1600, 'heic', 'Display P3'], 'size of the whole picture, not one tile');
  const r = await preparePhoto(heic, join(dir, 'phone.jpg'), ff);
  const o = await photoInfo(r.out);
  assert.deepEqual([o.width, o.height, o.format], [1080, 1350, 'jpeg']);
});
