// Demo mode: sample account, photo/story posts, simulated posting — and none of it can post for real.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../src/server.js';
import { Queue } from '../src/queue.js';
import { InstagramClient } from '../src/instagram.js';
import { timeline } from '../src/quality.js';
import { DEMO_ACCOUNT, DEMO_PLATFORMS } from '../src/demo.js';
import { tmp, cleanup, makeVideo } from './helpers.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let dir, app, base, queue, multiSrc;

before(async () => {
  dir = tmp();
  // Made before the server starts: a slow, blocking ffmpeg run between two requests lets the server's
  // 5 s keep-alive close the socket fetch is about to reuse (ECONNRESET on a loaded machine).
  multiSrc = makeVideo(dir, 'multi.mp4');
  const assets = join(dir, 'assets');
  mkdirSync(assets);
  for (const n of ['avatar', 'drums', 'latte']) execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=gray:s=64x96', '-frames:v', '1', join(assets, `${n}.jpg`)]);
  queue = new Queue(join(dir, 'queue.json'));
  app = startServer({ root: ROOT, mediaDir: join(dir, 'media'), dataDir: join(dir, 'data'), queue, ig: new InstagramClient({ login: 'instagram', dryRun: true }), port: 0, tickMs: 100, log: () => {}, demo: { account: DEMO_ACCOUNT, platforms: DEMO_PLATFORMS, assetsDir: assets } });
  await app.ready;
  base = `http://127.0.0.1:${app.port()}`;
});
after(async () => { await app.stop(); cleanup(dir); });

const api = async (path, opts = {}) => {
  const res = await fetch(base + path, { ...opts, headers: { ...(opts.headers || {}), 'X-Queue': '1' } });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const waitFor = async (fn, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 50)); } return false; };

test('status and extras describe the sample account', async () => {
  const st = (await api('/api/status')).body;
  assert.equal(st.demo, true);
  assert.equal(st.account, 'tommyclaffey');
  const ex = (await api('/api/extras')).body;
  assert.equal(ex.platforms.tiktok.state, 'drafts');
  assert.deepEqual(ex.photos, ['drums.jpg', 'latte.jpg'], 'photos list leaves out the avatar');
  assert.equal((await fetch(base + '/demo-assets/drums.jpg')).status, 200);
  assert.notEqual((await fetch(base + '/demo-assets/..%2F..%2Fpackage.json')).status, 200);
});

test('photo and story posts can be scheduled, and the simulated scheduler posts them on time', async () => {
  const bad = await api('/api/demo/post', json('POST', { kind: 'photos', images: ['nope.jpg'], at: new Date(Date.now() + 9e6).toISOString() }));
  assert.equal(bad.status, 400);
  const r = await api('/api/demo/post', json('POST', { kind: 'story', images: ['drums.jpg', '../latte.jpg'], at: new Date(Date.now() + 300).toISOString(), platforms: ['instagram', 'facebook'] }));
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.post.images, ['drums.jpg', 'latte.jpg'], 'paths are reduced to names inside assets/');
  assert.ok(await waitFor(async () => (await api('/api/queue')).body.posts.find((p) => p.id === r.body.post.id)?.status === 'published'));
  const p = (await api('/api/queue')).body.posts.find((x) => x.id === r.body.post.id);
  assert.equal(p.media, null);
  assert.ok(p.destinations.every((d) => d.status === 'posted'));
});

test('multi-platform video posts keep their platforms; TikTok lands in drafts', async () => {
  const src = multiSrc;
  const { readFileSync } = await import('node:fs');
  const up = await api('/api/upload?name=multi.mp4', { method: 'POST', body: readFileSync(src) });
  const s = await api('/api/schedule', json('POST', { name: up.body.name, at: new Date(Date.now() + 400).toISOString(), caption: 'multi', platforms: ['instagram', 'tiktok', 'bogus'] }));
  assert.deepEqual(s.body.post.platforms, ['instagram', 'tiktok']);
  assert.ok(await waitFor(async () => (await api('/api/queue')).body.posts.find((p) => p.id === s.body.post.id)?.status === 'published'));
  const p = (await api('/api/queue')).body.posts.find((x) => x.id === s.body.post.id);
  assert.deepEqual(p.destinations.map((d) => d.status), ['posted', 'drafts']);
});

test('the demo has no Instagram to pull benchmark posts from', async () => {
  const r = (await api('/api/instagram/recent')).body;
  assert.deepEqual(r, { media: [], reason: 'demo' });
});

test('quality timeline buckets frames and finds the worst moment', () => {
  const frames = Array.from({ length: 300 }, (_, i) => ({ frameNum: i, metrics: { vmaf: i === 150 ? 70 : 95 } }));
  const { series, worstAt } = timeline(frames, 30, 50);
  assert.ok(series.length <= 50);
  assert.equal(worstAt, 5);
  assert.ok(series.some((x) => x.vmaf < 95));
  assert.deepEqual(timeline([], 30), { series: [], worstAt: null });
});
