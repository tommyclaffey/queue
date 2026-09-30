// Runs the REAL InstagramClient + scheduler against a strict fake of Meta's API.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { InstagramClient } from '../src/instagram.js';
import { Queue } from '../src/queue.js';
import { tick, MAX_ATTEMPTS } from '../src/worker.js';
import { startMockMeta, GOOD_TOKEN } from './mock-meta.js';
import { tmp, cleanup, makeVideo, sha } from './helpers.js';

let meta, dir, queue, video;
const quiet = () => {};
const HOUR = 3600e3;

beforeEach(async () => {
  meta = await startMockMeta();
  dir = tmp();
  queue = new Queue(join(dir, 'queue.json'));
  video = makeVideo(dir, 'reel.mp4', { secs: 3 });
});
afterEach(async () => {
  await meta.close();
  cleanup(dir);
});

const client = (over = {}) => new InstagramClient({
  userId: meta.userId, token: GOOD_TOKEN, graphHost: meta.host, ruploadHost: meta.host,
  retryDelayMs: 5, ...over,
});
const run = (ig, now = Date.now()) => tick(queue, ig, { log: quiet, now, stageWindowMin: 120 });

test('full lifecycle: queued → staged → ready → published, on time', async () => {
  const ig = client();
  const due = Date.now() + 30 * 60e3;
  const post = queue.add({ file: video, caption: 'First Reel 🎬', publishAt: due, coverOffsetMs: 1500 });

  await run(ig, due - 60 * 60e3);
  assert.equal(queue.get(post.id).status, 'staged', 'uploads inside the 2h window');
  await run(ig, due - 59 * 60e3);
  await run(ig, due - 58 * 60e3);
  assert.equal(queue.get(post.id).status, 'ready', 'Meta finished processing');

  await run(ig, due - 60e3);
  assert.equal(queue.get(post.id).status, 'ready', 'does NOT publish early');

  await run(ig, due);
  const done = queue.get(post.id);
  assert.equal(done.status, 'published');
  assert.match(done.permalink, /instagram\.com\/reel\//);
  assert.equal(meta.state.published, 1);
});

test('the uploaded bytes are IDENTICAL to the file on disk (no compression in transit)', async () => {
  const ig = client();
  const post = queue.add({ file: video, publishAt: Date.now() + 60e3 });
  await run(ig);
  const container = meta.state.containers.get(queue.get(post.id).containerId);
  assert.equal(container.sha, sha(video));
});

test('caption and cover frame are sent to Instagram', async () => {
  const ig = client();
  const post = queue.add({ file: video, caption: 'Hello #reels', publishAt: Date.now() + 60e3, coverOffsetMs: 2250 });
  await run(ig);
  const { params } = meta.state.containers.get(queue.get(post.id).containerId);
  assert.equal(params.caption, 'Hello #reels');
  assert.equal(params.thumb_offset, '2250');
  assert.equal(params.share_to_feed, 'true');
});

test('Instagram-only login (IG_LOGIN=instagram) works with user id "me" (resumable forced)', async () => {
  const ig = client({ login: 'instagram', userId: undefined, uploadMode: 'resumable' });
  assert.equal(ig.userId, 'me');
  const post = queue.add({ file: video, publishAt: Date.now() - 1000 });
  for (let i = 0; i < 3; i++) await run(ig);
  assert.equal(queue.get(post.id).status, 'published');
});

test('far-future posts are not uploaded yet', async () => {
  const post = queue.add({ file: video, publishAt: Date.now() + 72 * HOUR });
  await run(client());
  assert.equal(queue.get(post.id).status, 'queued');
  assert.equal(meta.state.containers.size, 0);
});

test('bad token fails immediately with a clear message (no pointless retries)', async () => {
  const post = queue.add({ file: video, publishAt: Date.now() + 60e3 });
  await run(client({ token: 'expired-token' }));
  const p = queue.get(post.id);
  assert.equal(p.status, 'failed');
  assert.match(p.error, /Invalid OAuth access token/);
  assert.equal(meta.state.requests.length, 1);
});

test('brief Meta outage (two 500s) is absorbed by in-call retries', async () => {
  meta.state.failNext = 2;
  const post = queue.add({ file: video, publishAt: Date.now() + 60e3 });
  await run(client());
  assert.equal(queue.get(post.id).status, 'staged');
});

test('wifi drop mid-request is retried', async () => {
  meta.state.dropNext = 1;
  const post = queue.add({ file: video, publishAt: Date.now() + 60e3 });
  await run(client());
  assert.equal(queue.get(post.id).status, 'staged');
});

test('long outage: post stays alive across ticks, then fails loudly after the retry budget', async () => {
  const ig = client({ retries: 0 });
  const post = queue.add({ file: video, publishAt: Date.now() + 60e3 });
  meta.state.failNext = 1000;
  await run(ig);
  assert.equal(queue.get(post.id).status, 'queued', 'one failed tick does not kill the post');
  assert.match(queue.get(post.id).error, /Retrying/);
  for (let i = 1; i < MAX_ATTEMPTS; i++) await run(ig);
  assert.equal(queue.get(post.id).status, 'failed');
});

test('outage ends → the retrying post recovers and publishes', async () => {
  const ig = client({ retries: 0 });
  const post = queue.add({ file: video, publishAt: Date.now() - 1000 });
  meta.state.failNext = 1;
  await run(ig);
  for (let i = 0; i < 3; i++) await run(ig);
  assert.equal(queue.get(post.id).status, 'published');
});

test('expired container (24h) goes back to the queue and is re-uploaded', async () => {
  const ig = client();
  const post = queue.add({ file: video, publishAt: Date.now() + 60e3 });
  await run(ig);
  const first = queue.get(post.id).containerId;
  meta.state.forceStatus = 'EXPIRED';
  await run(ig);
  meta.state.forceStatus = null;
  await run(ig);
  const p = queue.get(post.id);
  assert.equal(p.status, 'staged');
  assert.notEqual(p.containerId, first);
});

test('Instagram rejects the video during processing → failed with the reason', async () => {
  const post = queue.add({ file: video, publishAt: Date.now() + 60e3 });
  meta.state.forceStatus = 'ERROR';
  await run(client());
  await run(client());
  const p = queue.get(post.id);
  assert.equal(p.status, 'failed');
  assert.match(p.error, /video format not supported/);
});

test('daily API limit reached → post is held, not failed', async () => {
  meta.state.quotaTotal = 0;
  const post = queue.add({ file: video, publishAt: Date.now() - 1000 });
  for (let i = 0; i < 4; i++) await run(client());
  assert.equal(queue.get(post.id).status, 'ready');
  assert.equal(meta.state.published, 0);
});

test('permanent publish error (e.g. account restricted) fails without retry loops', async () => {
  meta.state.rejectPublishWith = { code: 10, message: 'Application does not have permission for this action' };
  const post = queue.add({ file: video, publishAt: Date.now() - 1000 });
  for (let i = 0; i < 3; i++) await run(client());
  const p = queue.get(post.id);
  assert.equal(p.status, 'failed');
  assert.match(p.error, /permission/);
});

test('backlog publishes oldest first', async () => {
  const ig = client();
  const later = queue.add({ file: video, caption: 'B', publishAt: Date.now() - 1000 });
  const earlier = queue.add({ file: video, caption: 'A', publishAt: Date.now() - 5000 });
  for (let i = 0; i < 3; i++) await run(ig);
  assert.ok(queue.get(earlier.id).publishedAt <= queue.get(later.id).publishedAt);
});

test('overlapping ticks do not double-upload', async () => {
  const ig = client();
  queue.add({ file: video, publishAt: Date.now() + 60e3 });
  await Promise.all([run(ig), run(ig), run(ig)]);
  assert.equal(meta.state.containers.size, 1);
});

test('account() reports the connected username', async () => {
  const me = await client().account();
  assert.equal(me.username, 'tommy.test');
});

// ---------- Instagram-only login: Meta downloads from a temporary link ----------
import { FileShare } from '../src/fileshare.js';

test('link mode: Meta downloads the ORIGINAL bytes, then the link is closed', async () => {
  // No tunnel in tests: the "public" URL is loopback, and the fake Meta fetches from it.
  const port = 47000 + Math.floor(Math.random() * 1000);
  const share = new FileShare({ publicBaseUrl: `http://127.0.0.1:${port}`, port });
  const ig = client({ login: 'instagram', userId: undefined });
  assert.equal(ig.uploadMode, 'url');
  const post = queue.add({ file: video, caption: 'link mode', publishAt: Date.now() - 1000 });

  const opts = { files: share, log: quiet, stageWindowMin: 120 };
  await tick(queue, ig, opts);
  const staged = queue.get(post.id);
  assert.equal(staged.status, 'staged');
  const c = meta.state.containers.get(staged.containerId);
  assert.match(c.params.video_url, /\/v\/[a-f0-9]{64}\/video\.mp4$/, 'unguessable link');
  assert.equal(share.active, 1, 'link open while Meta processes');

  for (let i = 0; i < 3; i++) await tick(queue, ig, opts);
  assert.equal(c.sha, sha(video), 'Meta received the exact original file');
  assert.equal(queue.get(post.id).status, 'published');
  assert.equal(share.active, 0, 'link closed after Meta has the file');
});

test('link mode: dead link → one automatic re-try, then a clear failure', async () => {
  const ig = client({ login: 'instagram', userId: undefined });
  // A FileShare whose public URL points nowhere, like a tunnel that dropped.
  const broken = new FileShare({ publicBaseUrl: 'http://127.0.0.1:9', port: 0 });
  const post = queue.add({ file: video, publishAt: Date.now() + 60e3 });
  const opts = { files: broken, log: quiet };
  for (let i = 0; i < 4; i++) await tick(queue, ig, opts);
  const p = queue.get(post.id);
  assert.equal(p.status, 'failed');
  assert.match(p.error, /download video/);
  assert.ok(p.log.some((l) => /retrying once/.test(l.msg)));
  await broken.stop();
});

test('the file link serves ONLY shared files', async () => {
  const port = 48000 + Math.floor(Math.random() * 1000);
  const share = new FileShare({ publicBaseUrl: `http://127.0.0.1:${port}`, port });
  const { url, token } = await share.share(video);
  assert.equal((await fetch(url)).status, 200);
  assert.equal((await fetch(url.replace(token, 'f'.repeat(64)))).status, 404, 'wrong token');
  assert.equal((await fetch(`http://127.0.0.1:${port}/../queue.json`)).status, 404);
  assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 404);
  await share.unshare(token);
  await assert.rejects(fetch(url), 'server shut down once nothing is shared');
});

test('Instagram-login token refresh returns a fresh 60-day token', async () => {
  const ig = client({ login: 'instagram', userId: undefined });
  const r = await ig.refreshToken();
  assert.equal(r.expiresInSec, 5184000);
  assert.equal(meta.state.refreshed, 1);
});

test('stuck processing for 60+ min → re-staged instead of waiting forever', async () => {
  const ig = client();
  const t0 = Date.now();
  const post = queue.add({ file: video, publishAt: t0 + 90 * 60e3 });
  await tick(queue, ig, { log: quiet, now: t0 });
  meta.state.forceStatus = 'IN_PROGRESS';
  await tick(queue, ig, { log: quiet, now: t0 + 61 * 60e3 });
  const p = queue.get(post.id);
  assert.equal(p.status, 'queued');
  assert.ok(p.log.some((l) => /stuck/.test(l.msg)));
});

test('caption edited WHILE uploading → that upload is discarded and the new caption is used', async () => {
  const ig = client();
  const post = queue.add({ file: video, caption: 'old caption', publishAt: Date.now() + 60e3 });
  // Simulate the web app editing the post in the middle of the upload.
  const realStage = ig.stage.bind(ig);
  let once = true;
  ig.stage = async (args) => {
    const id = await realStage(args);
    if (once) { once = false; queue.edit(post.id, { caption: 'new caption' }); }
    return id;
  };
  await run(ig);
  assert.equal(queue.get(post.id).status, 'queued', 'stale upload thrown away');
  await run(ig);
  const p = queue.get(post.id);
  assert.equal(p.status, 'staged');
  assert.equal(meta.state.containers.get(p.containerId).params.caption, 'new caption');
});

test('post removed WHILE uploading → it does not come back', async () => {
  const ig = client();
  const post = queue.add({ file: video, publishAt: Date.now() + 60e3 });
  const realStage = ig.stage.bind(ig);
  ig.stage = async (args) => { const id = await realStage(args); queue.remove(post.id); return id; };
  await run(ig);
  assert.equal(queue.get(post.id), null);
  assert.equal(queue.posts.length, 0);
});

test('edit lands while checking processing status → the edit wins, nothing points at a dead upload', async () => {
  const ig = client();
  const post = queue.add({ file: video, caption: 'v1', publishAt: Date.now() + 60e3 });
  await run(ig); // staged
  const realStatus = ig.status.bind(ig);
  let once = true;
  ig.status = async (id) => {
    const r = await realStatus(id);
    if (once) { once = false; queue.edit(post.id, { caption: 'v2' }); }
    return { code: 'FINISHED' };
  };
  await run(ig);
  const p = queue.get(post.id);
  assert.equal(p.status, 'queued', 'edit not overwritten by the stale FINISHED');
  assert.equal(p.containerId, null);
  ig.status = realStatus;
  for (let i = 0; i < 3; i++) await run(ig);
  const q = queue.get(post.id);
  assert.ok(['ready', 'staged'].includes(q.status));
  assert.equal(meta.state.containers.get(q.containerId).params.caption, 'v2');
});

// ---------- Code-review fixes ----------

test('🛑 publish reply lost (wifi drop AFTER Meta posted) → marked published, NOT posted twice', async () => {
  const ig = client();
  const post = queue.add({ file: video, publishAt: Date.now() - 1000 });
  meta.state.dropAfterPublish = 1;
  for (let i = 0; i < 5; i++) await run(ig);
  const p = queue.get(post.id);
  assert.equal(p.status, 'published');
  assert.match(p.permalink, /instagram\.com\/reel/);
  assert.equal(meta.state.published, 1, 'exactly one post on Instagram');
});

test('🛑 Retry on a post that secretly went live → recognised, NOT posted twice', async () => {
  const ig = client();
  const post = queue.add({ file: video, publishAt: Date.now() + 60e3 });
  for (let i = 0; i < 2; i++) await run(ig); // staged → ready (not yet due)
  assert.equal(queue.get(post.id).status, 'ready');
  // Meta publishes, but we recorded a failure (old behaviour / unknown outcome).
  const cid = queue.get(post.id).containerId;
  meta.state.containers.get(cid).status = 'PUBLISHED';
  meta.state.media.set('m-secret', { container: cid, timestamp: new Date().toISOString() });
  meta.state.published++;
  queue.update(queue.get(post.id), { status: 'failed', error: 'Network error' });

  queue.retry(post.id);
  for (let i = 0; i < 4; i++) await run(ig, Date.now() + 120e3);
  assert.equal(queue.get(post.id).status, 'published');
  assert.equal(meta.state.published, 1, 'still exactly one post');
  assert.equal(meta.state.containers.size, 1, 'no new upload was made');
});

test('container expired while waiting to post → re-uploaded, not failed', async () => {
  const ig = client();
  const post = queue.add({ file: video, publishAt: Date.now() + 60e3 });
  for (let i = 0; i < 2; i++) await run(ig);
  assert.equal(queue.get(post.id).status, 'ready');
  meta.state.containers.get(queue.get(post.id).containerId).status = 'EXPIRED';
  const later = Date.now() + 120e3;
  await run(ig, later);
  assert.equal(queue.get(post.id).status, 'queued');
  for (let i = 0; i < 3; i++) await run(ig, later);
  assert.equal(queue.get(post.id).status, 'published');
  assert.equal(meta.state.published, 1);
});

test('stuck processing forever → fails after 3 hour-long tries (no endless re-uploads)', async () => {
  const ig = client();
  let t = Date.now();
  // Post time far enough ahead that 3 stuck hours don't make it late.
  const post = queue.add({ file: video, publishAt: t + 20 * HOUR });
  meta.state.forceStatus = 'IN_PROGRESS';
  for (let i = 0; i < 20 && queue.get(post.id).status !== 'failed'; i++) {
    await tick(queue, ig, { log: quiet, now: t, stageWindowMin: 23 * 60 });
    t += 61 * 60e3;
  }
  const p = queue.get(post.id);
  assert.equal(p.status, 'failed');
  assert.match(p.error, /still processing/);
  assert.ok(meta.state.containers.size <= 3);
});

test('failed post in link mode → its temporary link is closed', async () => {
  const port = 49000 + Math.floor(Math.random() * 900);
  const share = new FileShare({ publicBaseUrl: `http://127.0.0.1:${port}`, port });
  const ig = client({ login: 'instagram', userId: undefined });
  const post = queue.add({ file: video, publishAt: Date.now() + 60e3 });
  await tick(queue, ig, { files: share, log: quiet });
  assert.equal(share.active, 1);
  meta.state.failNext = 1000; // status checks now fail…
  const ig0 = client({ login: 'instagram', userId: undefined, retries: 0 });
  for (let i = 0; i < MAX_ATTEMPTS + 1; i++) await tick(queue, ig0, { files: share, log: quiet });
  assert.equal(queue.get(post.id).status, 'failed');
  meta.state.failNext = 0;
  await tick(queue, ig, { files: share, log: quiet });
  assert.equal(share.active, 0, 'link closed');
  await share.stop();
});

test('temporary link server: bad range → 416, deleted file → clean error, never crashes', async () => {
  const { unlinkSync, copyFileSync } = await import('node:fs');
  const port = 49900 + Math.floor(Math.random() * 90);
  const share = new FileShare({ publicBaseUrl: `http://127.0.0.1:${port}`, port });
  const copy = video.replace('.mp4', '.copy.mp4');
  copyFileSync(video, copy);
  const { url } = await share.share(copy);
  assert.equal((await fetch(url, { headers: { Range: 'bytes=999999999-' } })).status, 416);
  const tail = await fetch(url, { headers: { Range: 'bytes=-100' } });
  assert.equal(tail.status, 206);
  assert.equal((await tail.arrayBuffer()).byteLength, 100);
  unlinkSync(copy);
  assert.equal((await fetch(url)).status, 404);
  assert.equal((await fetch(url.replace('/v/', '/x/'))).status, 404, 'still alive');
  await share.stop();
});

test('link server failing to start (port taken) → clean error, nothing leaked', async () => {
  const { createServer } = await import('node:http');
  const blocker = createServer().listen(0, '127.0.0.1');
  await new Promise((r) => blocker.once('listening', r));
  const port = blocker.address().port;
  const share = new FileShare({ publicBaseUrl: `http://127.0.0.1:${port}`, port });
  await assert.rejects(share.share(video));
  assert.equal(share.active, 0);
  blocker.close();
});

// ---------- Matches the LIVE Meta error formats (probed Sept 30 with a fake token) ----------

test('upload server says "busy, retriable" → retried and succeeds', async () => {
  meta.state.ruploadFailNext = 2;
  const post = queue.add({ file: video, publishAt: Date.now() + 60e3 });
  await run(client());
  assert.equal(queue.get(post.id).status, 'staged');
});

test('upload server says "not authorized" → fails at once with the real reason', async () => {
  const ig = client();
  const post = queue.add({ file: video, publishAt: Date.now() + 60e3 });
  // Graph accepts the key; the upload server rejects it (as it would for a wrong key type).
  const orig = globalThis.fetch;
  globalThis.fetch = (url, opts) => (String(url).includes('/ig-api-upload/') ? orig(url, { ...opts, headers: { ...opts.headers, Authorization: 'OAuth wrong' } }) : orig(url, opts));
  try {
    await run(ig);
  } finally {
    globalThis.fetch = orig;
  }
  const p = queue.get(post.id);
  assert.equal(p.status, 'failed');
  assert.match(p.error, /User not authorized to perform this request/);
  assert.match(p.error, /NotAuthorizedError/);
});

// ---------- ⏰ Missed posts + notifications ----------

test('⏰ Mac was off: post 5h late is NOT posted by surprise — it waits as "missed"', async () => {
  const notes = [];
  const post = queue.add({ file: video, caption: 'Sunday recap', publishAt: Date.now() - 5 * HOUR });
  await tick(queue, client(), { log: quiet, notify: (t, m) => notes.push(t) });
  const p = queue.get(post.id);
  assert.equal(p.status, 'missed');
  assert.match(p.error, /Missed its .* slot by 5h/);
  assert.equal(meta.state.containers.size, 0, 'nothing uploaded');
  assert.deepEqual(notes, ['Missed a post']);
});

test('⏰ a few minutes late (Mac just woke up) → still posts normally', async () => {
  const post = queue.add({ file: video, publishAt: Date.now() - 10 * 60e3 });
  for (let i = 0; i < 3; i++) await run(client());
  assert.equal(queue.get(post.id).status, 'published');
});

test('⏰ missed → "Post now" → uploads and posts immediately', async () => {
  const post = queue.add({ file: video, publishAt: Date.now() - 5 * HOUR });
  await run(client());
  assert.equal(queue.get(post.id).status, 'missed');
  assert.ok(queue.postNow(post.id));
  for (let i = 0; i < 3; i++) await run(client());
  assert.equal(queue.get(post.id).status, 'published');
  assert.equal(meta.state.published, 1);
});

test('⏰ was ready (already uploaded) when missed → "Post now" reuses the upload', async () => {
  const ig = client();
  const post = queue.add({ file: video, publishAt: Date.now() + 60e3 });
  for (let i = 0; i < 2; i++) await run(ig);
  assert.equal(queue.get(post.id).status, 'ready');
  await run(ig, Date.now() + 5 * HOUR); // Mac slept through the slot
  assert.equal(queue.get(post.id).status, 'missed');
  assert.ok(queue.get(post.id).containerId, 'upload kept');
  queue.postNow(post.id);
  await run(ig, Date.now() + 5 * HOUR);
  assert.equal(queue.get(post.id).status, 'published');
  assert.equal(meta.state.containers.size, 1, 'no second upload');
});

test('⏰ missed → edit to a new time → back on the schedule', async () => {
  const post = queue.add({ file: video, publishAt: Date.now() - 5 * HOUR });
  await run(client());
  queue.edit(post.id, { publishAt: Date.now() + 30 * 60e3 });
  const p = queue.get(post.id);
  assert.equal(p.status, 'queued');
  await run(client());
  assert.equal(queue.get(post.id).status, 'staged');
});

test('🔔 notifications: posted and failed', async () => {
  const notes = [];
  const notify = (t, m) => notes.push(`${t}: ${m}`);
  const a = queue.add({ file: video, caption: 'Good one', publishAt: Date.now() - 1000 });
  for (let i = 0; i < 3; i++) await tick(queue, client(), { log: quiet, notify });
  assert.equal(queue.get(a.id).status, 'published');
  assert.ok(notes.some((n) => /^Posted ✅: “Good one” is live/.test(n)));
  const b = queue.add({ file: video, caption: 'Bad one', publishAt: Date.now() + 60e3 });
  await tick(queue, client({ token: 'expired' }), { log: quiet, notify });
  assert.equal(queue.get(b.id).status, 'failed');
  assert.ok(notes.some((n) => /^Post failed: “Bad one”/.test(n)));
});
