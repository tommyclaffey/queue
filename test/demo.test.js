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
import { DEMO_ACCOUNT, DEMO_PLATFORMS, DEMO_TEAM, DEMO_BRANDS } from '../src/demo.js';
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
  for (const n of ['northline-logo', 'brand-jess', 'team-maya', 'drums', 'latte']) execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=gray:s=64x96', '-frames:v', '1', join(assets, `${n}.jpg`)]);
  queue = new Queue(join(dir, 'queue.json'));
  app = startServer({ root: ROOT, mediaDir: join(dir, 'media'), dataDir: join(dir, 'data'), queue, ig: new InstagramClient({ login: 'instagram', dryRun: true }), port: 0, tickMs: 100, log: () => {}, demo: { account: DEMO_ACCOUNT, platforms: DEMO_PLATFORMS, team: DEMO_TEAM, brands: DEMO_BRANDS, assetsDir: assets } });
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
  assert.equal(st.account, 'northlinesocial');
  const ex = (await api('/api/extras')).body;
  assert.equal(ex.platforms.tiktok.state, 'drafts');
  assert.deepEqual(ex.photos, ['drums.jpg', 'latte.jpg'], 'photos list leaves out logos, account pictures and team pictures');
  assert.deepEqual(ex.brands.map((b) => b.type), ['Creator', 'Business', 'Church', 'Band', 'Nonprofit'], 'the studio runs a mix of accounts, not just one kind');
  assert.equal(ex.team.you, 'maya');
  assert.ok(ex.team.members.length >= 5 && ex.team.members.every((m) => m.name && m.role), 'a made-up team with names and roles');
  assert.equal(ex.public, false);
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

test('posts scheduled in the demo are credited to the signed-in teammate and the picked account', async () => {
  const r = await api('/api/demo/post', json('POST', { kind: 'photos', images: ['drums.jpg', 'latte.jpg'], at: new Date(Date.now() + 9e6).toISOString(), platforms: ['instagram'] }));
  assert.equal(r.status, 200);
  assert.equal(queue.get(r.body.post.id).by, 'maya');
  assert.equal(queue.get(r.body.post.id).brand, 'jess', 'no account picked → the first one');
  const t = await api('/api/demo/post', json('POST', { kind: 'story', images: ['drums.jpg'], at: new Date(Date.now() + 9e6).toISOString(), platforms: ['instagram'], brand: 'tides' }));
  assert.equal(queue.get(t.body.post.id).brand, 'tides');
});

// The shareable demo on its own public link: open to every host, but anything that costs CPU or disk is off.
test('public demo: any host can view it; uploads, measuring and cross-site writes are refused', async () => {
  const d = tmp();
  const assets = join(d, 'assets'); mkdirSync(assets);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=gray:s=64x96', '-frames:v', '1', join(assets, 'drums.jpg')]);
  const q = new Queue(join(d, 'queue.json'));
  const pub = startServer({ root: ROOT, mediaDir: join(d, 'media'), dataDir: join(d, 'data'), queue: q, ig: new InstagramClient({ login: 'instagram', dryRun: true }), port: 0, tickMs: 100, log: () => {}, demo: { account: DEMO_ACCOUNT, platforms: DEMO_PLATFORMS, team: DEMO_TEAM, assetsDir: assets, public: true, resetHours: 3 } });
  await pub.ready;
  const port = pub.port();
  const { request } = await import('node:http');
  const call = (method, path, headers = {}, body = null) => new Promise((resolve, reject) => {
    const r = request({ host: '127.0.0.1', port, method, path, headers: { Host: 'queue-demo.example.app', ...headers } }, (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ status: res.statusCode, body: b })); });
    r.on('error', reject); if (body) r.write(body); r.end();
  });
  try {
    assert.equal((await call('GET', '/')).status, 200, 'a public hostname is allowed');
    const ex = JSON.parse((await call('GET', '/api/extras')).body);
    assert.equal(ex.public, true); assert.equal(ex.resetHours, 3);
    const same = { 'X-Queue': '1', Origin: 'https://queue-demo.example.app' };
    const up = await call('POST', '/api/upload?name=a.mp4', same, 'x');
    assert.equal(up.status, 400); assert.match(up.body, /Uploads are off/);
    assert.match((await call('POST', '/api/quality/abc/measure', same)).body, /switched off/);
    const cross = await call('POST', '/api/upload?name=a.mp4', { 'X-Queue': '1', Origin: 'https://evil.example' }, 'x');
    assert.equal(cross.status, 403, 'another website cannot write to the demo');
    const ok = await call('POST', '/api/demo/post', { ...same, 'Content-Type': 'application/json' }, JSON.stringify({ kind: 'story', images: ['drums.jpg'], at: new Date(Date.now() + 9e6).toISOString(), platforms: ['instagram'] }));
    assert.equal(ok.status, 200, 'looking around and scheduling still works');
  } finally { await pub.stop(); cleanup(d); }
});

// Post now: skip the schedule, from the composer or on a post that's already waiting.
test('post now: a scheduled post goes out straight away, and so does one sent with now: true', async () => {
  const later = await api('/api/demo/post', json('POST', { kind: 'photos', images: ['drums.jpg', 'latte.jpg'], at: new Date(Date.now() + 9e6).toISOString(), platforms: ['instagram'] }));
  assert.equal(later.status, 200);
  const r = await api(`/api/queue/${later.body.post.id}/post-now`, { method: 'POST' });
  assert.equal(r.status, 200);
  assert.ok(await waitFor(() => queue.get(later.body.post.id)?.status === 'published'), 'the scheduled post was published on Post now');
  const again = await api(`/api/queue/${later.body.post.id}/post-now`, { method: 'POST' });
  assert.equal(again.status, 400, 'a post that already went out cannot be posted again');
  const now = await api('/api/demo/post', json('POST', { kind: 'story', images: ['drums.jpg'], now: true, platforms: ['instagram'] }));
  assert.equal(now.status, 200, 'no date needed with now: true');
  assert.ok(await waitFor(() => queue.get(now.body.post.id)?.status === 'published'), 'posted straight from the composer');
});

test('official platform logos are served, and nothing else from that folder', async () => {
  const r = await fetch(base + '/brand/instagram.svg');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /image\/svg\+xml/);
  assert.equal((await fetch(base + '/brand/tiktok-dark.svg')).status, 200);
  for (const bad of ['/brand/SOURCES.md', '/brand/..%2Fapp.js', '/brand/nope.svg']) assert.notEqual((await fetch(base + bad)).status, 200, bad);
});

test('phone-screen screenshots are served by name, and nothing else from that folder', async () => {
  const r = await fetch(base + '/shots/composer.jpg');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /image\/jpeg/);
  for (const bad of ['/shots/..%2Fapp.js', '/shots/nope.jpg', '/shots/composer.png']) assert.notEqual((await fetch(base + bad)).status, 200, bad);
});
