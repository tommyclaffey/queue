import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { Queue } from '../src/queue.js';
import { TokenStore } from '../src/token.js';
import { InstagramClient } from '../src/instagram.js';
import { startMockMeta, GOOD_TOKEN } from './mock-meta.js';
import { tmp, cleanup } from './helpers.js';

test('web app and CLI share one schedule without overwriting each other', () => {
  const dir = tmp();
  const path = join(dir, 'q.json');
  const webApp = new Queue(path);
  const cli = new Queue(path);
  const a = webApp.add({ file: '/x.mp4', publishAt: Date.now() + 9e6, caption: 'from web' });
  const b = cli.add({ file: '/y.mp4', publishAt: Date.now() + 9e6, caption: 'from cli' });
  assert.equal(webApp.posts.length, 2, 'web app sees the CLI post');
  webApp.update(a, { status: 'staged' });
  assert.equal(cli.get(a.id).status, 'staged', 'CLI sees the web app update');
  cli.remove(b.id);
  assert.equal(webApp.posts.length, 1);
  cleanup(dir);
});

test('edit resets a staged post; retry only works on failed posts', () => {
  const dir = tmp();
  const q = new Queue(join(dir, 'q.json'));
  const p = q.add({ file: '/x.mp4', publishAt: Date.now() + 9e6 });
  q.update(p, { status: 'staged', containerId: 'c9' });
  q.edit(p.id, { caption: 'new' });
  assert.equal(q.get(p.id).status, 'queued');
  assert.equal(q.get(p.id).containerId, null);
  assert.equal(q.retry(p.id), null);
  q.update(p, { status: 'published' });
  assert.throws(() => q.edit(p.id, { caption: 'too late' }), /Already published/);
  cleanup(dir);
});

test('login key renews, is saved privately, and a newly pasted .env key wins', async () => {
  const meta = await startMockMeta();
  const dir = tmp();
  const path = join(dir, 'token.json');
  const ig = new InstagramClient({ login: 'instagram', token: GOOD_TOKEN, graphHost: meta.host });
  const store = new TokenStore(path, GOOD_TOKEN);
  assert.equal(store.due(), true);
  await store.maybeRefresh(ig);
  assert.equal(meta.state.refreshed, 1);
  assert.ok(existsSync(path));
  assert.equal(statSync(path).mode & 0o777, 0o600, 'token file is owner-only');
  assert.equal(store.daysLeft(), 59);
  assert.equal(store.due(), false, 'not due again for a week');
  await store.maybeRefresh(ig);
  assert.equal(meta.state.refreshed, 1);

  const reopened = new TokenStore(path, GOOD_TOKEN);
  assert.equal(reopened.daysLeft(), 59, 'survives restart');
  const replaced = new TokenStore(path, 'brand-new-token');
  assert.equal(replaced.token, 'brand-new-token', 'user pasted a new token → it wins');

  await meta.close();
  cleanup(dir);
});

test('failed renewal is not fatal and does not hammer Meta', async () => {
  const meta = await startMockMeta();
  const dir = tmp();
  const ig = new InstagramClient({ login: 'instagram', token: 'rejected', graphHost: meta.host, retries: 0 });
  const store = new TokenStore(join(dir, 't.json'), 'rejected');
  const logs = [];
  await store.maybeRefresh(ig, { log: (m) => logs.push(m) });
  await store.maybeRefresh(ig, { log: (m) => logs.push(m) });
  assert.equal(logs.length, 1);
  assert.match(logs[0], /not renewed yet/);
  await meta.close();
  cleanup(dir);
});

test('facebook login never tries to refresh (Page tokens do not expire)', async () => {
  const ig = new InstagramClient({ login: 'facebook', token: 'x', userId: '1' });
  assert.equal(await ig.refreshToken(), null);
});
