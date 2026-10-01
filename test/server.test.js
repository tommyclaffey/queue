// The web app's API, driven like the browser does, against the fake Meta server in LIVE mode.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../src/server.js';
import { Queue } from '../src/queue.js';
import { InstagramClient } from '../src/instagram.js';
import { startMockMeta, GOOD_TOKEN } from './mock-meta.js';
import { tmp, cleanup, makeVideo } from './helpers.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let meta, dir, app, base, queue;

before(async () => {
  meta = await startMockMeta();
  dir = tmp();
  queue = new Queue(join(dir, 'queue.json'));
  const ig = new InstagramClient({ login: 'facebook', userId: meta.userId, token: GOOD_TOKEN, graphHost: meta.host, ruploadHost: meta.host, retryDelayMs: 5 });
  app = startServer({ root: ROOT, mediaDir: join(dir, 'media'), queue, ig, port: 0, tickMs: 150, log: () => {} });
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
const waitFor = async (fn, ms = 20000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
};

test('status shows LIVE and the connected account', async () => {
  await waitFor(async () => (await api('/api/status')).body.account);
  const { body } = await api('/api/status');
  assert.equal(body.dryRun, false);
  assert.equal(body.account, 'tommy.test');
  assert.equal(body.uploadMode, 'resumable');
});

test('browser flow: upload → check → schedule with cover → posts → View post link', async () => {
  const src = makeVideo(dir, 'clip.mov', { faststart: false });
  const up = await upload(src, 'My Reel.mov');
  assert.equal(up.status, 200);
  assert.equal(up.body.result.plan, 'remux');

  const at = new Date(Date.now() + 1500).toISOString();
  const s = await api('/api/schedule', json('POST', { name: up.body.name, at, caption: 'Launch day 🚀', coverOffsetMs: 1200 }));
  assert.equal(s.status, 200, JSON.stringify(s.body));
  const id = s.body.post.id;

  assert.ok(await waitFor(async () => (await api('/api/queue')).body.posts.find((p) => p.id === id)?.status === 'published'), 'published');
  const p = (await api('/api/queue')).body.posts.find((x) => x.id === id);
  assert.match(p.permalink, /instagram\.com\/reel/);
  const c = [...meta.state.containers.values()].at(-1);
  assert.equal(c.params.thumb_offset, '1200');
  assert.equal(c.params.caption, 'Launch day 🚀');
});

test('edit a staged post → it is re-sent with the new caption', async () => {
  const up = await upload(makeVideo(dir, 'e.mp4'), 'e.mp4');
  const at = new Date(Date.now() + 60 * 60e3).toISOString(); // inside the 2h window → stages now
  const { body } = await api('/api/schedule', json('POST', { name: up.body.name, at, caption: 'old' }));
  const id = body.post.id;
  assert.ok(await waitFor(async () => ['staged', 'ready'].includes(queue.get(id)?.status)));
  const first = queue.get(id).containerId;

  const e = await api(`/api/queue/${id}`, json('PATCH', { caption: 'new caption' }));
  assert.equal(e.status, 200);
  assert.ok(await waitFor(async () => queue.get(id).containerId && queue.get(id).containerId !== first));
  assert.equal(meta.state.containers.get(queue.get(id).containerId).params.caption, 'new caption');
  await api(`/api/queue/${id}`, { method: 'DELETE' });
});

test('failed post → Retry puts it back and it publishes', async () => {
  meta.state.rejectPublishWith = { code: 10, message: 'Temporary permission problem' };
  const up = await upload(makeVideo(dir, 'r.mp4'), 'r.mp4');
  const { body } = await api('/api/schedule', json('POST', { name: up.body.name, at: new Date(Date.now() + 800).toISOString() }));
  const id = body.post.id;
  assert.ok(await waitFor(async () => queue.get(id).status === 'failed'));
  meta.state.rejectPublishWith = null;
  assert.equal((await api(`/api/queue/${id}/retry`, { method: 'POST' })).status, 200);
  assert.ok(await waitFor(async () => queue.get(id).status === 'published'));
});

test('rejects: past time, missing upload, over-long caption, non-video, published delete', async () => {
  const up = await upload(makeVideo(dir, 'v.mp4'), 'v.mp4');
  assert.equal((await api('/api/schedule', json('POST', { name: up.body.name, at: '2020-01-01T00:00:00Z' }))).status, 400);
  assert.equal((await api('/api/schedule', json('POST', { name: 'nope.mp4', at: new Date(Date.now() + 9e6).toISOString() }))).status, 400);
  assert.equal((await api('/api/schedule', json('POST', { name: up.body.name, at: new Date(Date.now() + 9e6).toISOString(), caption: 'x'.repeat(2201) }))).status, 400);
  assert.equal((await api('/api/upload?name=notes.txt', { method: 'POST', body: 'hello' })).status, 400);
  const published = queue.posts.find((p) => p.status === 'published');
  assert.equal((await api(`/api/queue/${published.id}`, { method: 'DELETE' })).status, 400);
});

test('cannot read files outside media/', async () => {
  for (const path of ['/media/..%2Fqueue.json', '/media/%2E%2E%2F%2E%2E%2Fpackage.json', '/media/../../.env']) {
    const res = await fetch(base + path);
    assert.equal(res.status, 404, path);
  }
  const s = await api('/api/schedule', json('POST', { name: '../queue.json', at: new Date(Date.now() + 9e6).toISOString() }));
  assert.equal(s.status, 400);
});

test('serves the app page', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Queue/);
});

test('serves the stylesheet and script, and nothing else from public/', async () => {
  const css = await fetch(base + '/styles.css');
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type'), /text\/css/);
  const js = await fetch(base + '/app.js');
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /javascript/);
  assert.equal((await fetch(base + '/pages.js')).status, 200);
  for (const p of ['/package.json', '/src/server.js', '/public/app.js', '/..%2Fpackage.json', '/.env', '/quality-media/..%2F..%2Fpackage.json', '/demo-assets/avatar.jpg']) {
    assert.notEqual((await fetch(base + p)).status, 200, p);
  }
});

test('library lists uploaded videos with the posts that use them', async () => {
  const src = makeVideo(dir, 'lib.mp4');
  const up = await upload(src, 'Library Clip.mp4');
  await api('/api/schedule', json('POST', { name: up.body.name, at: new Date(Date.now() + 9e6).toISOString(), caption: 'lib test' }));
  const { status, body } = await api('/api/media');
  assert.equal(status, 200);
  const item = body.items.find((i) => i.name === up.body.name);
  assert.ok(item, 'upload is listed');
  assert.ok(item.bytes > 0);
  assert.equal(item.fixedCopy, false);
  assert.equal(item.posts[0].caption, 'lib test');
  assert.ok(!JSON.stringify(body).includes(dir), 'no local paths leak');
});

test('library and queue carry video details; a Library video reopens in the composer', async () => {
  const src = makeVideo(dir, 'details.mov', { faststart: false });
  const up = await upload(src, 'Details Clip.mov');
  // Listed with size, length and what it needs before it's ever scheduled.
  const listed = (await api('/api/media')).body.items.find((i) => i.name === up.body.name);
  assert.ok(listed.meta.width > 0 && listed.meta.durationSec > 0);
  assert.equal(listed.meta.plan, 'remux');
  assert.equal(listed.meta.needsTrim, false);
  // Reopening it gives the composer the same check as a fresh upload.
  const again = await api(`/api/media/${encodeURIComponent(up.body.name)}`);
  assert.equal(again.status, 200);
  assert.equal(again.body.name, up.body.name);
  assert.equal(again.body.result.plan, 'remux');
  // The post remembers which fix was applied and where it came from.
  const s = await api('/api/schedule', json('POST', { name: up.body.name, at: new Date(Date.now() + 9e6).toISOString(), caption: 'details' }));
  const post = (await api('/api/queue')).body.posts.find((p) => p.id === s.body.post.id);
  assert.equal(post.fix, 'remux');
  assert.equal(post.source, up.body.name);
  assert.ok(post.meta.width > 0);
  // Unknown names, Queue's own fixed copies, and paths outside media/ can't be reopened.
  assert.equal((await api('/api/media/nope.mov')).status, 404);
  assert.equal((await api(`/api/media/${encodeURIComponent(post.media)}`)).status, 404);
  assert.equal((await api('/api/media/..%2F..%2Fpackage.json')).status, 404);
});

test('status reports when the scheduler checks next', async () => {
  const { body } = await api('/api/status');
  assert.ok(new Date(body.nextCheckAt) > Date.now() - 1000);
  assert.equal(body.tickMs, 150);
});

test('the real app is not the demo: no fake accounts, no demo posts, honest quality list', async () => {
  const ex = await api('/api/extras');
  assert.equal(ex.body.demo, false);
  assert.equal(ex.body.platforms, null);
  assert.equal((await api('/api/status')).body.demo, undefined);
  assert.equal((await api('/api/demo/post', json('POST', { kind: 'photos', images: ['a.jpg'], at: new Date(Date.now() + 9e6).toISOString() }))).status, 404);
  const q = await api('/api/quality');
  assert.ok(Array.isArray(q.body.comparisons));
  // Measuring something that never posted is refused, not faked.
  const src = makeVideo(dir, 'unposted.mp4');
  const up = await upload(src, 'Unposted.mp4');
  const s = await api('/api/schedule', json('POST', { name: up.body.name, at: new Date(Date.now() + 9e6).toISOString(), caption: 'later' }));
  const m = await api(`/api/quality/${s.body.post.id}/measure`, { method: 'POST' });
  assert.equal(m.status, 400);
  assert.match(m.body.error, /not been published/);
  assert.deepEqual(s.body.post.platforms, ['instagram'], 'real posts only ever go to Instagram');
});

test('config reports the scheduler settings', async () => {
  const { status, body } = await api('/api/config');
  assert.equal(status, 200);
  assert.equal(body.stageWindowMin, 120);
  assert.equal(body.lateLimitMin, 120);
  assert.equal(body.login, 'facebook');
  assert.equal(typeof body.autostart, 'boolean');
});

test('🔒 other websites cannot use the API (CSRF + DNS rebinding)', async () => {
  const body = JSON.stringify({ name: 'x', at: new Date(Date.now() + 9e6).toISOString() });
  // Missing our header (what a cross-site form/fetch would send)
  let r = await fetch(base + '/api/schedule', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body });
  assert.equal(r.status, 403);
  // Header present but from another site
  r = await fetch(base + '/api/schedule', { method: 'POST', headers: { 'X-Queue': '1', Origin: 'https://evil.example' }, body });
  assert.equal(r.status, 403);
  // DNS rebinding: request arrives with a foreign Host
  const { request } = await import('node:http');
  const status = await new Promise((resolve) => {
    request({ host: '127.0.0.1', port: app.port(), path: '/api/queue', headers: { Host: 'evil.example' } }, (res) => { res.resume(); resolve(res.statusCode); }).end();
  });
  assert.equal(status, 403);
  // Deletes/uploads blocked too
  assert.equal((await fetch(base + '/api/upload?name=a.mp4', { method: 'POST', body: 'x' })).status, 403);
});

test('🔒 temporary-link keys never reach the browser', async () => {
  const p = queue.posts[0];
  queue.update(p, { shareToken: 'a'.repeat(64) });
  const { body } = await api('/api/queue');
  assert.ok(body.posts.every((x) => !('shareToken' in x)));
  queue.update(p, { shareToken: null });
});

test('bad Range on the preview does not crash the app', async () => {
  const up = await upload(makeVideo(dir, 'range.mp4'), 'range.mp4');
  const r = await fetch(`${base}/media/${encodeURIComponent(up.body.name)}`, { headers: { Range: 'bytes=999999999-' } });
  assert.equal(r.status, 416);
  assert.equal((await api('/api/status')).status, 200, 'still running');
});

test('missed post: shows as missed, "Post now" works, history is readable', async () => {
  const up = await upload(makeVideo(dir, 'm.mp4'), 'm.mp4');
  const s = await api('/api/schedule', json('POST', { name: up.body.name, at: new Date(Date.now() + 60e3).toISOString() }));
  const id = s.body.post.id;
  // Pretend the Mac slept through it: move the time 5h into the past directly.
  queue.update(queue.get(id), { publishAt: new Date(Date.now() - 5 * 3600e3).toISOString(), status: 'queued', containerId: null });
  assert.ok(await waitFor(async () => queue.get(id).status === 'missed'));
  assert.equal((await api(`/api/queue/${id}/post-now`, json('POST', {}))).status, 200);
  assert.ok(await waitFor(async () => queue.get(id).status === 'published'));
  const { body } = await api(`/api/queue/${id}/log`);
  const msgs = body.log.map((l) => l.msg);
  assert.ok(msgs.includes('post now requested'));
  assert.ok(msgs.some((m) => /^missed by/.test(m)));
  assert.equal((await api('/api/queue/nope/post-now', json('POST', {}))).status, 400);
});
