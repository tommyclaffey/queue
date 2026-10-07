// Photos and stories through the web app's API, like the browser does, in LIVE mode against the fake
// Meta server. Upload (JPEG / PNG / HEIC, by content) → Library → schedule → posted.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../src/server.js';
import { Queue } from '../src/queue.js';
import { InstagramClient } from '../src/instagram.js';
import { FileShare } from '../src/fileshare.js';
import { photoInfo, photoTypeOf } from '../src/photo.js';
import { startMockMeta, GOOD_TOKEN } from './mock-meta.js';
import { tmp, cleanup, makeVideo, sha } from './helpers.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let meta, dir, app, base, queue, files, media, videos;
const freePort = () => new Promise((r) => { const s = createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => r(port)); }); });

before(async () => {
  meta = await startMockMeta();
  dir = tmp();
  // Videos are slow to make; doing it mid-test can outlast the server's 5 s keep-alive (ECONNRESET).
  videos = { lib: makeVideo(dir, 'lib.mp4'), rv: makeVideo(dir, 'rv.mp4') };
  media = join(dir, 'media');
  queue = new Queue(join(dir, 'queue.json'));
  const port = await freePort();
  files = new FileShare({ publicBaseUrl: `http://127.0.0.1:${port}`, port });
  const ig = new InstagramClient({ login: 'instagram', token: GOOD_TOKEN, graphHost: meta.host, ruploadHost: meta.host, retryDelayMs: 5 });
  app = startServer({ root: ROOT, mediaDir: media, dataDir: join(dir, 'data'), envFile: join(dir, '.env'), queue, ig, files, port: 0, tickMs: 150, log: () => {} });
  await app.ready;
  base = `http://127.0.0.1:${app.port()}`;
});
after(async () => {
  await app.stop();
  await meta.close();
  cleanup(dir);
});

const api = async (path, opts = {}) => {
  const res = await fetch(base + path, { ...opts, headers: { ...(opts.headers || {}), 'X-Queue': '1' } });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const upload = (file, name) => api(`/api/upload?name=${encodeURIComponent(name)}`, { method: 'POST', body: readFileSync(file) });
const img = (name, size, fmt = []) => { const p = join(dir, name); execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=s=${size}`, '-frames:v', '1', ...fmt, p]); return p; };
const waitFor = async (fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 100)); } return false; };
const soon = () => new Date(Date.now() + 1500).toISOString();

test('photo upload: PNG → Instagram-ready JPEG made at once, with its check; original kept', async () => {
  const up = await upload(img('tall.png', '1500x2000'), 'Beach day.png');
  assert.equal(up.status, 200, JSON.stringify(up.body));
  assert.equal(up.body.kind, 'photo');
  assert.ok(up.body.check.issues.some((i) => /PNG → JPEG/.test(i.msg)));
  assert.ok(existsSync(join(media, up.body.name)), 'original kept');
  const prepared = join(media, up.body.preview);
  assert.equal(photoTypeOf(prepared), 'jpeg');
  const info = await photoInfo(prepared);
  assert.deepEqual([info.width, info.height], [1080, 1350]);
  assert.equal((await fetch(`${base}/media/${encodeURIComponent(up.body.preview)}`)).headers.get('content-type'), 'image/jpeg');
});

test('photos are recognised by content: a JPEG named .txt is a photo; text named .jpg is refused', async () => {
  const jpg = img('real.jpg', '1080x1080', ['-q:v', '2']);
  const up = await upload(jpg, 'notes.txt');
  assert.equal(up.status, 200);
  assert.equal(up.body.kind, 'photo');
  assert.equal(up.body.check.plan, 'none');
  const bad = await api('/api/upload?name=fake.jpg', { method: 'POST', body: 'hello' });
  assert.equal(bad.status, 400);
  assert.notEqual(bad.body.kind, 'photo');
  const tiny = await upload(img('tiny.png', '200x250'), 'tiny.png');
  assert.equal(tiny.status, 400);
  assert.match(tiny.body.error, /at least 320/);
});

test('Library lists photos (with a preview) next to videos', async () => {
  const v = await upload(videos.lib, 'lib.mp4');
  const p = await upload(img('lib.png', '1200x1500'), 'lib-photo.png');
  const { body } = await api('/api/media');
  const originals = body.items.filter((i) => !i.fixedCopy);
  const photo = originals.find((i) => i.name === p.body.name);
  assert.equal(photo.type, 'photo');
  assert.equal(photo.preview, p.body.preview);
  assert.equal(photo.meta.width, 1080);
  const video = originals.find((i) => i.name === v.body.name);
  assert.equal(video.type, 'video');
  assert.ok(video.meta.durationSec > 0);
  assert.ok(body.items.some((i) => i.fixedCopy && i.name === p.body.preview), 'the prepared JPEG is a fixed copy');
  const one = await api(`/api/media/${encodeURIComponent(p.body.name)}`);
  assert.equal(one.body.kind, 'photo');
});

test('carousel: schedule 3 uploads → every photo cut to the FIRST photo\'s shape → posted to Instagram', async () => {
  const names = [];
  for (const [n, size] of [['c1.png', '1200x1500'], ['c2.png', '1600x1600'], ['c3.jpg', '1080x1350']]) names.push((await upload(img(n, size), n)).body.name);
  const s = await api('/api/schedule', json('POST', { kind: 'photos', images: names, caption: 'Carousel 📸', at: soon() }));
  assert.equal(s.status, 200, JSON.stringify(s.body));
  const post = s.body.post;
  assert.equal(post.kind, 'photos');
  assert.deepEqual(post.sources, names);
  assert.equal(post.images.length, 3);
  for (const n of post.images) {
    const i = await photoInfo(join(media, n));
    assert.equal(i.format, 'jpeg');
    assert.ok(Math.abs(i.width / i.height - 0.8) < 0.01, `${n} is 4:5 like the first photo (${i.width}×${i.height})`);
  }
  assert.ok(await waitFor(() => queue.get(post.id)?.status === 'published'), queue.get(post.id)?.error || queue.get(post.id)?.status);
  const p = queue.get(post.id);
  const carousel = meta.state.containers.get(p.containerId);
  assert.equal(carousel.params.caption, 'Carousel 📸');
  p.children.forEach((id, i) => assert.equal(meta.state.containers.get(id).sha, sha(join(media, post.images[i]))));
  assert.equal(files.active, 0, 'every temporary link closed');
});

test('story: 2 frames → 9:16 → each frame published in order', async () => {
  const names = [];
  for (const n of ['s1.png', 's2.png']) names.push((await upload(img(n, '1200x2400'), n)).body.name);
  const before = meta.state.published;
  const s = await api('/api/schedule', json('POST', { kind: 'story', images: names, at: soon() }));
  assert.equal(s.status, 200, JSON.stringify(s.body));
  for (const n of s.body.post.images) {
    const i = await photoInfo(join(media, n));
    assert.deepEqual([i.width, i.height], [1080, 1920]);
  }
  assert.ok(await waitFor(() => queue.get(s.body.post.id)?.status === 'published'), queue.get(s.body.post.id)?.error);
  assert.equal(meta.state.published - before, 2);
  assert.ok(queue.get(s.body.post.id).frames.every((f) => f.published));
});

test('schedule rejects: no photos, 11 photos, a video, a missing file, the same photo twice', async () => {
  const one = (await upload(img('r1.png', '1200x1500'), 'r1.png')).body.name;
  const vid = (await upload(videos.rv, 'rv.mp4')).body.name;
  const at = new Date(Date.now() + 9e6).toISOString();
  const bad = async (body) => (await api('/api/schedule', json('POST', { at, ...body }))).status;
  assert.equal(await bad({ kind: 'photos', images: [] }), 400);
  assert.equal(await bad({ kind: 'story', images: Array(11).fill(one) }), 400);
  assert.equal(await bad({ kind: 'photos', images: [one, vid] }), 400);
  assert.equal(await bad({ kind: 'photos', images: [one, 'nope.jpg'] }), 400);
  assert.equal(await bad({ kind: 'photos', images: [one, one] }), 400);
  assert.equal(await bad({ kind: 'photos', images: ['../queue.json'] }), 400);
  assert.equal(await bad({ kind: 'photos', images: [one], at: '2020-01-01T00:00:00Z' }), 400);
});

test('🔒 temporary-link keys and server paths of photo posts never reach the browser', async () => {
  const name = (await upload(img('k.png', '1200x1500'), 'k.png')).body.name;
  await api('/api/schedule', json('POST', { kind: 'photos', images: [name], at: new Date(Date.now() + 60 * 60e3).toISOString() }));
  await waitFor(() => queue.posts.some((p) => p.shareTokens?.length), 3000); // best effort: catch it while staged
  const { body } = await api('/api/queue');
  const text = JSON.stringify(body);
  assert.ok(!/shareToken/.test(text));
  assert.ok(!/imageFiles/.test(text));
  const photoPost = body.posts.find((p) => p.kind === 'photos' && p.sources?.includes(name));
  assert.ok(photoPost.images.length === 1);
});
