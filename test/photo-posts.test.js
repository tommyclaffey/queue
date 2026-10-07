// The scheduler posting photo carousels, single photos and stories, against the fake Meta server.
// Photos only travel by temporary link (image_url), so a real FileShare serves them on loopback.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { InstagramClient } from '../src/instagram.js';
import { Queue } from '../src/queue.js';
import { FileShare } from '../src/fileshare.js';
import { tick } from '../src/worker.js';
import { startMockMeta, GOOD_TOKEN } from './mock-meta.js';
import { tmp, cleanup, sha } from './helpers.js';

let meta, dir, queue, share;
const quiet = () => {};
const freePort = () => new Promise((r) => { const s = createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => r(port)); }); });
let hue = 0; // every test photo looks different, so byte-for-byte checks can tell them apart
const photo = (name, size = '1080x1350') => { const p = join(dir, name); execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', `testsrc2=s=${size}`, '-vf', `hue=h=${(hue += 23) % 360}`, '-frames:v', '1', '-q:v', '3', p]); return p; };
const client = (over = {}) => new InstagramClient({ login: 'instagram', token: GOOD_TOKEN, graphHost: meta.host, ruploadHost: meta.host, retryDelayMs: 5, ...over });
const run = (ig, opts = {}) => tick(queue, ig, { files: share, log: quiet, stageWindowMin: 120, ...opts });
const add = (kind, files, over = {}) => queue.add({ file: null, kind, images: files.map((f) => f.split('/').pop()), imageFiles: files, caption: over.caption ?? '', publishAt: over.publishAt ?? Date.now() - 1000 });
const publishes = () => meta.state.requests.filter((r) => r.endsWith('/media_publish')).length;

beforeEach(async () => {
  meta = await startMockMeta();
  dir = tmp();
  queue = new Queue(join(dir, 'queue.json'));
  const port = await freePort();
  share = new FileShare({ publicBaseUrl: `http://127.0.0.1:${port}`, port });
});
afterEach(async () => {
  await share.stop();
  await meta.close();
  cleanup(dir);
});

test('carousel: every photo staged by link, carousel published at post time with the exact JPEG bytes; links closed', async () => {
  const pics = ['a', 'b', 'c'].map((n) => photo(`${n}.jpg`));
  const due = Date.now() + 30 * 60e3;
  const post = add('photos', pics, { caption: 'Three frames 📸', publishAt: due });
  const ig = client();

  await run(ig, { now: due - 60 * 60e3 });
  let p = queue.get(post.id);
  assert.equal(p.status, 'staged');
  assert.equal(p.children.length, 3);
  assert.equal(share.active, 3, 'one temporary link per photo while Meta fetches them');
  const carousel = meta.state.containers.get(p.containerId);
  assert.equal(carousel.kind, 'carousel');
  assert.equal(carousel.params.caption, 'Three frames 📸', 'caption lives on the carousel');
  assert.equal(carousel.params.children, p.children.join(','), 'order kept');
  for (const id of p.children) assert.match(meta.state.containers.get(id).params.image_url, /\/v\/[a-f0-9]{64}\/photo\.jpg$/);

  await run(ig, { now: due - 59 * 60e3 });
  await run(ig, { now: due - 58 * 60e3 });
  p = queue.get(post.id);
  assert.equal(p.status, 'ready');
  assert.equal(share.active, 0, 'links closed once Instagram has the photos');
  p.children.forEach((id, i) => assert.equal(meta.state.containers.get(id).sha, sha(pics[i]), 'Meta got the original JPEG, byte for byte'));

  await run(ig, { now: due - 60e3 });
  assert.equal(queue.get(post.id).status, 'ready', 'never early');
  await run(ig, { now: due });
  p = queue.get(post.id);
  assert.equal(p.status, 'published');
  assert.equal(meta.state.published, 1, 'ONE publish: the carousel, not its items');
  assert.ok(p.mediaId);
});

test('single photo: one image container with the caption, published on its own', async () => {
  const post = add('photos', [photo('one.jpg')], { caption: 'Just one' });
  const ig = client();
  for (let i = 0; i < 4; i++) await run(ig);
  const p = queue.get(post.id);
  assert.equal(p.status, 'published');
  const c = meta.state.containers.get(p.containerId);
  assert.equal(c.isItem, false);
  assert.equal(c.params.caption, 'Just one');
  assert.ok(c.params.image_url);
  assert.equal(p.children, null);
  assert.equal(meta.state.published, 1);
});

test('story: one container per frame, frames published in order at post time, each recorded', async () => {
  const pics = ['s1', 's2', 's3'].map((n) => photo(`${n}.jpg`, '1080x1920'));
  const post = add('story', pics);
  const ig = client();
  await run(ig);
  let p = queue.get(post.id);
  assert.equal(p.status, 'staged');
  assert.equal(p.frames.length, 3);
  for (const f of p.frames) assert.equal(meta.state.containers.get(f.id).params.media_type, 'STORIES');
  for (let i = 0; i < 3; i++) await run(ig);
  p = queue.get(post.id);
  assert.equal(p.status, 'published');
  assert.ok(p.frames.every((f) => f.published && f.mediaId));
  const order = [...meta.state.media.values()].map((m) => m.container);
  assert.deepEqual(order, p.frames.map((f) => f.id), 'published in frame order');
  p.frames.forEach((f, i) => assert.equal(meta.state.containers.get(f.id).sha, sha(pics[i])));
  assert.equal(p.mediaId, p.frames[0].mediaId);
});

test('🛑 story stops midway → the frame already live is NEVER re-posted; Retry posts only the rest', async () => {
  const pics = ['x1', 'x2', 'x3'].map((n) => photo(`${n}.jpg`, '1080x1920'));
  const post = add('story', pics);
  const ig = client();
  await run(ig); // staged
  const frame2 = queue.get(post.id).frames[1].id;
  meta.state.rejectPublishIds.add(frame2);
  for (let i = 0; i < 3; i++) await run(ig);
  let p = queue.get(post.id);
  assert.equal(p.status, 'failed');
  assert.deepEqual(p.frames.map((f) => f.published), [true, false, false]);
  assert.equal(meta.state.published, 1);

  meta.state.rejectPublishIds.clear();
  queue.retry(post.id);
  for (let i = 0; i < 4; i++) await run(ig);
  p = queue.get(post.id);
  assert.equal(p.status, 'published');
  assert.equal(meta.state.published, 3, 'three frames, three publishes — frame 1 was not sent again');
  const stories = [...meta.state.containers.values()].filter((c) => c.kind === 'story');
  assert.equal(stories.filter((c) => c.sha === sha(pics[0])).length, 1, 'frame 1 was not even re-uploaded');
  assert.equal(new Set([...meta.state.media.values()].map((m) => m.container)).size, 3);
});

test('🛑 story: publish reply lost on a frame → Meta confirms it went live → recorded, NOT posted twice', async () => {
  const post = add('story', [photo('l1.jpg', '1080x1920'), photo('l2.jpg', '1080x1920')]);
  const ig = client();
  await run(ig); // staged
  meta.state.dropAfterPublish = 1; // frame 1 goes live, the reply never arrives
  await run(ig); // processed → posting
  const p = queue.get(post.id);
  assert.equal(p.status, 'published');
  assert.equal(meta.state.published, 2);
  assert.ok(p.log.some((l) => /reply was lost/.test(l.msg)));
});

test('story: a frame expired before posting → only the frames not yet live are re-staged', async () => {
  const pics = ['e1', 'e2'].map((n) => photo(`${n}.jpg`, '1080x1920'));
  const due = Date.now() + 60e3;
  const post = add('story', pics, { publishAt: due });
  const ig = client();
  await run(ig);
  await run(ig);
  assert.equal(queue.get(post.id).status, 'ready');
  const second = queue.get(post.id).frames[1].id;
  meta.state.expiredIds.add(second);
  await run(ig, { now: due }); // frame 1 live, frame 2 expired → back to queued
  let p = queue.get(post.id);
  assert.equal(p.status, 'queued');
  assert.equal(p.frames[0].published, true);
  for (let i = 0; i < 3; i++) await run(ig, { now: due + 60e3 });
  p = queue.get(post.id);
  assert.equal(p.status, 'published');
  assert.notEqual(p.frames[1].id, second, 'frame 2 re-staged');
  assert.equal(meta.state.published, 2);
});

test('carousel links stay open across ticks while Meta is still processing (retainOnly keeps them)', async () => {
  await meta.close();
  meta = await startMockMeta({ processingPolls: 4 });
  const post = add('photos', [photo('k1.jpg'), photo('k2.jpg')]);
  const ig = client();
  await run(ig);
  await run(ig);
  assert.equal(queue.get(post.id).status, 'staged');
  assert.equal(share.active, 2, 'not closed by the next tick');
  for (let i = 0; i < 6; i++) await run(ig);
  assert.equal(queue.get(post.id).status, 'published');
  assert.equal(share.active, 0);
});

test('carousel expired while staged → re-staged with fresh items', async () => {
  const post = add('photos', [photo('r1.jpg'), photo('r2.jpg')], { publishAt: Date.now() + 60 * 60e3 });
  const ig = client();
  await run(ig);
  const first = structuredClone(queue.get(post.id));
  meta.state.forceStatus = 'EXPIRED';
  await run(ig);
  meta.state.forceStatus = null;
  assert.equal(queue.get(post.id).status, 'queued');
  await run(ig);
  const again = queue.get(post.id);
  assert.equal(again.status, 'staged');
  assert.notEqual(again.containerId, first.containerId);
  assert.notDeepEqual(again.children, first.children);
});

test('🛑 carousel publish reply lost → marked published, NOT posted twice', async () => {
  const post = add('photos', [photo('d1.jpg'), photo('d2.jpg')]);
  const ig = client();
  await run(ig);
  await run(ig);
  meta.state.dropAfterPublish = 1;
  await run(ig);
  await run(ig);
  assert.equal(queue.get(post.id).status, 'published');
  assert.equal(meta.state.published, 1);
  assert.equal(publishes(), 1);
});

test('🛑 Retry on a carousel that secretly went live → recognised, NOT posted twice', async () => {
  const post = add('photos', [photo('g1.jpg'), photo('g2.jpg')], { publishAt: Date.now() + 60 * 60e3 });
  const ig = client();
  await run(ig);
  await run(ig);
  assert.equal(queue.get(post.id).status, 'ready');
  const id = queue.get(post.id).containerId;
  // Pretend publishing "failed" from our side after Meta actually published it.
  await ig.publish(id);
  queue.update(queue.get(post.id), { status: 'failed', error: 'lost' });
  queue.retry(post.id);
  await run(ig);
  const p = queue.get(post.id);
  assert.equal(p.status, 'published');
  assert.equal(meta.state.published, 1);
  assert.ok(p.log.some((l) => /already gone live/.test(l.msg)));
});

test('a PNG (not run through photo prep) → Instagram refuses it → one retry, then a clear failure', async () => {
  const png = photo('raw.png');
  const post = add('photos', [photo('ok.jpg'), png]);
  const ig = client();
  for (let i = 0; i < 5; i++) await run(ig);
  const p = queue.get(post.id);
  assert.equal(p.status, 'failed');
  assert.match(p.error, /Only JPEG/);
  assert.ok(p.log.some((l) => /retrying once/.test(l.msg)));
  assert.equal(share.active, 0);
});

test('live mode with no link server → fails with a clear reason; dry run needs none', async () => {
  const post = add('photos', [photo('n1.jpg')]);
  await tick(queue, client(), { files: null, log: quiet });
  assert.match(queue.get(post.id).error, /temporary link/);
  queue.remove(post.id);

  const dry = new InstagramClient({ login: 'instagram', dryRun: true });
  const s = add('story', [photo('n2.jpg'), photo('n3.jpg')]);
  const c = add('photos', [photo('n4.jpg'), photo('n5.jpg')]);
  for (let i = 0; i < 3; i++) await tick(queue, dry, { files: null, log: quiet });
  assert.equal(queue.get(s.id).status, 'published');
  assert.equal(queue.get(c.id).status, 'published');
  assert.equal(meta.state.containers.size, 0);
});

test('story missed (Mac off) → waits; Post now resumes with the frames not yet live', async () => {
  const pics = ['m1', 'm2'].map((n) => photo(`${n}.jpg`, '1080x1920'));
  const due = Date.now() + 60e3;
  const post = add('story', pics, { publishAt: due });
  const ig = client();
  await run(ig);
  await run(ig);
  assert.equal(queue.get(post.id).status, 'ready');
  await run(ig, { now: due + 5 * 3600e3 });
  assert.equal(queue.get(post.id).status, 'missed');
  assert.equal(meta.state.published, 0);
  queue.postNow(post.id);
  assert.equal(queue.get(post.id).status, 'ready', 'still uploaded, so it goes straight out');
  await run(ig, { now: due + 5 * 3600e3 });
  assert.equal(queue.get(post.id).status, 'published');
  assert.equal(meta.state.published, 2);
});
