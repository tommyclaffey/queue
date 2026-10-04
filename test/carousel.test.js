// Instagram photo carousels and story frames, against the fake Meta server.
// Photos only travel as public links (image_url), so a tiny file server stands in for the tunnel.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, basename } from 'node:path';
import { InstagramClient } from '../src/instagram.js';
import { startMockMeta, GOOD_TOKEN } from './mock-meta.js';
import { tmp, cleanup, makeVideo } from './helpers.js';

let meta, dir, files, link, ig;
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const photo = (name, ext = 'jpg') => { const p = join(dir, `${name}.${ext}`); execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=1080x1350', '-frames:v', '1', p]); return p; };
const until = async (id, want = 'FINISHED') => { for (let i = 0; i < 50; i++) { const s = await ig.status(id); if (s.code === want || s.code === 'ERROR') return s; } throw new Error('never finished'); };

before(async () => {
  meta = await startMockMeta();
  dir = tmp();
  files = createServer((req, res) => { try { res.end(readFileSync(join(dir, basename(decodeURIComponent(req.url))))); } catch { res.writeHead(404); res.end(); } });
  await new Promise((r) => files.listen(0, '127.0.0.1', r));
  link = (f) => `http://127.0.0.1:${files.address().port}/${encodeURIComponent(basename(f))}`;
  ig = new InstagramClient({ login: 'facebook', userId: meta.userId, token: GOOD_TOKEN, graphHost: meta.host, ruploadHost: meta.host, retryDelayMs: 5 });
});
after(async () => { await meta.close(); await new Promise((r) => files.close(r)); cleanup(dir); });

test('3-photo carousel: items → carousel → processed → published, with the exact JPEG bytes', async () => {
  const pics = ['a', 'b', 'c'].map((n) => photo(n));
  const items = [];
  for (const p of pics) items.push(await ig.stageItem({ imageUrl: link(p) }));
  const carousel = await ig.stageCarousel({ children: items, caption: 'A week in 3 frames' });
  assert.equal((await until(carousel)).code, 'FINISHED');
  const live = await ig.publish(carousel);
  assert.ok(live);
  items.forEach((id, i) => assert.equal(meta.state.containers.get(id).sha, sha(pics[i]), 'Meta got the original photo, byte for byte'));
  assert.equal(meta.state.containers.get(carousel).params.caption, 'A week in 3 frames');
  assert.equal(meta.state.containers.get(carousel).params.children, items.join(','), 'order is kept');
});

test('a carousel can mix photos and a video item', async () => {
  const v = makeVideo(dir, 'clip.mp4');
  const items = [await ig.stageItem({ imageUrl: link(photo('m1')) }), await ig.stageItem({ videoUrl: link(v) })];
  assert.equal(meta.state.containers.get(items[1]).params.media_type, 'VIDEO');
  const c = await ig.stageCarousel({ children: items, caption: '' });
  assert.equal((await until(c)).code, 'FINISHED');
});

test('a PNG in a carousel fails processing with Instagram\'s reason (run photos through photo.js first)', async () => {
  const items = [await ig.stageItem({ imageUrl: link(photo('ok1')) }), await ig.stageItem({ imageUrl: link(photo('bad', 'png')) })];
  const c = await ig.stageCarousel({ children: items, caption: '' });
  const s = await until(c);
  assert.equal(s.code, 'ERROR');
  assert.match(s.detail, /Only JPEG/);
});

test('rules: 2–10 items, items are never published alone, one source per item', async () => {
  const one = await ig.stageItem({ imageUrl: link(photo('solo')) });
  await assert.rejects(ig.stageCarousel({ children: [one] }), /2 to 10/);
  await assert.rejects(ig.stageCarousel({ children: Array(11).fill(one) }), /2 to 10/);
  await until(one);
  await assert.rejects(ig.publish(one), /cannot be published on their own/);
  await assert.rejects(ig.stageItem({}), /exactly one/);
  await assert.rejects(ig.stageStory({ imageUrl: 'x', videoUrl: 'y' }), /exactly one/);
});

test('story frame: photo → processed → published on its own', async () => {
  const id = await ig.stageStory({ imageUrl: link(photo('story')) });
  assert.equal(meta.state.containers.get(id).params.media_type, 'STORIES');
  assert.equal((await until(id)).code, 'FINISHED');
  assert.ok(await ig.publish(id));
});

test('dry run never calls Instagram', async () => {
  const dry = new InstagramClient({ login: 'instagram', dryRun: true });
  const before = meta.state.containers.size;
  assert.match(await dry.stageItem({ imageUrl: 'x' }), /^dry_/);
  assert.match(await dry.stageCarousel({ children: ['a', 'b'] }), /^dry_/);
  assert.match(await dry.stageStory({ imageUrl: 'x' }), /^dry_/);
  assert.equal(meta.state.containers.size, before);
});
