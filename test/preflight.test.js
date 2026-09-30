import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { INSTAGRAM_REELS as SPEC } from '../src/specs.js';
import { probe, moovBeforeMdat } from '../src/probe.js';
import { preflight } from '../src/preflight.js';
import { conformAsync } from '../src/conform.js';
import { tmp, cleanup, makeVideo, videoStreamHash } from './helpers.js';

let dir;
before(() => (dir = tmp()));
after(() => cleanup(dir));

const check = (file) => preflight(probe(file), SPEC);

test('an in-spec Reel ships untouched', () => {
  const r = check(makeVideo(dir, 'clean.mp4'));
  assert.equal(r.ok, true);
  assert.equal(r.plan, 'none');
  assert.equal(r.issues.length, 0);
});

test('moov atom detection', () => {
  assert.equal(moovBeforeMdat(makeVideo(dir, 'fs.mp4')), true);
  assert.equal(moovBeforeMdat(makeVideo(dir, 'nofs.mp4', { faststart: false })), false);
});

test('moov-at-end is fixed LOSSLESSLY — video packets are identical', async () => {
  const src = makeVideo(dir, 'moovend.mp4', { faststart: false });
  const r = check(src);
  assert.equal(r.ok, false);
  assert.equal(r.plan, 'remux');
  const out = await conformAsync(probe(src), r.plan, SPEC);
  assert.equal(check(out).ok, true);
  assert.equal(videoStreamHash(out), videoStreamHash(src));
});

test('wrong audio only → audio-only fix, video untouched', async () => {
  const src = makeVideo(dir, 'pcm.mov', { acodec: 'pcm_s16le', arate: 96000 });
  const r = check(src);
  assert.equal(r.plan, 'audio-only');
  const out = await conformAsync(probe(src), r.plan, SPEC);
  assert.equal(check(out).ok, true);
  assert.equal(videoStreamHash(out), videoStreamHash(src));
});

test('MKV container → rewrap to MP4', async () => {
  const src = makeVideo(dir, 'clip.mkv');
  const r = check(src);
  assert.equal(r.plan, 'remux');
  const out = await conformAsync(probe(src), r.plan, SPEC);
  assert.equal(check(out).ok, true);
});

test('4K 10-bit 60fps high-bitrate → one clean re-encode to 1080×1920', async () => {
  const src = makeVideo(dir, 'bad4k.mov', { w: 2160, h: 3840, fps: 60, pix: 'yuv420p10le', vbitrate: '40M', faststart: false });
  const r = check(src);
  assert.equal(r.ok, false);
  assert.equal(r.plan, 'reencode');
  const out = await conformAsync(probe(src), r.plan, SPEC);
  const info = probe(out);
  assert.equal(check(out).ok, true);
  assert.equal(info.video.width, 1080);
  assert.equal(info.video.height, 1920);
  assert.equal(Math.round(info.video.fps), 60, 'frame rate is preserved, not dropped');
});

test('never upscales a small source', async () => {
  const src = makeVideo(dir, 'small.mp4', { w: 720, h: 1280, vcodec: 'mpeg4', pix: 'yuv420p' });
  const r = check(src);
  assert.equal(r.plan, 'reencode');
  assert.ok(r.issues.some((i) => /below 1080/.test(i.msg)));
  const info = probe(await conformAsync(probe(src), r.plan, SPEC));
  assert.equal(info.video.width, 720);
});

test('too short → needs a trim, no automatic fix', () => {
  const r = check(makeVideo(dir, 'short.mp4', { secs: 2 }));
  assert.equal(r.needsTrim, true);
  assert.equal(r.ok, false);
});

test('landscape is allowed but warned', () => {
  const r = check(makeVideo(dir, 'land.mp4', { w: 1920, h: 1080 }));
  assert.equal(r.ok, true);
  assert.ok(r.issues.some((i) => /Aspect ratio/.test(i.msg)));
});

test('5.1 audio → downmixed to stereo', async () => {
  const src = makeVideo(dir, 'surround.mp4', { channels: 6 });
  const r = check(src);
  assert.equal(r.plan, 'audio-only');
  const out = await conformAsync(probe(src), r.plan, SPEC);
  assert.equal(probe(out).audio.channels, 2);
});

test('iPhone-style HDR (HLG, 10-bit HEVC, 4K) → standard colour 1080×1920 via Apple converter', { skip: process.platform !== 'darwin' }, async () => {
  const src = makeVideo(dir, 'hlg.mov', {
    w: 2160, h: 3840, vcodec: 'libx265', pix: 'yuv420p10le',
    extraV: ['-x265-params', 'colorprim=bt2020:transfer=arib-std-b67:colormatrix=bt2020nc:log-level=error', '-color_primaries', 'bt2020', '-color_trc', 'arib-std-b67', '-colorspace', 'bt2020nc', '-tag:v', 'hvc1'],
  });
  const r = check(src);
  assert.equal(r.plan, 'hdr');
  assert.ok(r.issues.some((i) => /HDR/.test(i.msg)));
  const out = await conformAsync(probe(src), r.plan, SPEC);
  const info = probe(out);
  assert.equal(check(out).ok, true);
  assert.equal(check(out).plan, 'none');
  assert.equal(info.video.pixFmt, 'yuv420p');
  assert.notEqual(info.video.colorTransfer, 'arib-std-b67');
  assert.equal(info.video.width, 1080);
});
