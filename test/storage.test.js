import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, existsSync, utimesSync } from 'node:fs';
import { Queue } from '../src/queue.js';
import { mediaReport, clearMedia } from '../src/storage.js';
import { tmp, cleanup } from './helpers.js';

test("storage cleanup only clears posted + abandoned copies — never anything still to post", () => {
  const dir = tmp();
  const media = join(dir, 'media');
  mkdirSync(media);
  const q = new Queue(join(dir, 'q.json'));
  const f = (n, bytes = 1000) => { writeFileSync(join(media, n), Buffer.alloc(bytes)); return join(media, n); };
  const old = (p) => { const t = new Date(Date.now() - 3 * 3600e3); utimesSync(p, t, t); };

  // Posted: upload copy + fixed copy
  f('100-posted.mov'); const postedFixed = f('100-posted.conformed.mp4');
  q.update(q.add({ file: postedFixed, publishAt: Date.now() + 9e6 }), { status: 'published' });
  // Waiting to post: must survive
  f('200-waiting.mov'); const waiting = f('200-waiting.conformed.mp4');
  q.add({ file: waiting, publishAt: Date.now() + 9e6 });
  // Failed: must survive (you might Retry)
  const failed = f('300-failed.mp4');
  q.update(q.add({ file: failed, publishAt: Date.now() + 9e6 }), { status: 'failed' });
  // Uploaded, never scheduled: old → clearable, fresh → kept
  old(f('400-abandoned.mp4'));
  f('500-just-uploaded.mp4');

  const { summary } = mediaReport(media, q.posts);
  assert.equal(summary.posted.count, 2);
  assert.equal(summary.unused.count, 1);

  const r = clearMedia(media, q);
  assert.equal(r.count, 3);
  assert.ok(!existsSync(postedFixed) && !existsSync(join(media, '100-posted.mov')) && !existsSync(join(media, '400-abandoned.mp4')));
  for (const keep of [waiting, join(media, '200-waiting.mov'), failed, join(media, '500-just-uploaded.mp4')]) assert.ok(existsSync(keep), keep);
  assert.equal(q.posts.find((p) => p.status === 'published').fileCleared, true);
  cleanup(dir);
});
