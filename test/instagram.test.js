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
