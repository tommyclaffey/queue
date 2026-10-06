// Hosted mode (Railway): on the public internet, so everything needs the password —
// except the sign-in page and Instagram's temporary video links.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../src/server.js';
import { Queue } from '../src/queue.js';
import { InstagramClient } from '../src/instagram.js';
import { FileShare } from '../src/fileshare.js';
import { tmp, cleanup, makeVideo } from './helpers.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PW = 'correct horse battery staple';
let dir, app, base, files;

before(async () => {
  dir = tmp();
  files = new FileShare({ publicBaseUrl: 'https://queue.example', embedded: true });
  app = startServer({ root: ROOT, mediaDir: join(dir, 'media'), dataDir: join(dir, 'data'), envFile: join(dir, '.env'), queue: new Queue(join(dir, 'q.json')), ig: new InstagramClient({ login: 'instagram', dryRun: true }), files, port: 0, host: '127.0.0.1', tickMs: 60_000, log: () => {}, hosted: true, password: PW });
  await app.ready;
  base = `http://127.0.0.1:${app.port()}`;
});
after(async () => { await app.stop(); cleanup(dir); });

const req = (path, { cookie, headers = {}, ...o } = {}) => fetch(base + path, { redirect: 'manual', ...o, headers: { 'X-Queue': '1', ...(cookie ? { Cookie: cookie } : {}), ...headers } });
const login = (password, ip = '1.1.1.1') => req('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip, Origin: base }, body: JSON.stringify({ password }) });

test('signed out: only the sign-in page; the app and the API are closed', async () => {
  const home = await req('/');
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Sign in/);
  assert.equal((await req('/app.js')).status, 302);
  assert.equal((await req('/api/status')).status, 401);
  assert.equal((await req('/api/queue')).status, 401);
  assert.equal((await req('/media/anything.mp4')).status, 302);
});

test('wrong password refused; right password gives a 30-day HttpOnly session that opens the app', async () => {
  assert.equal((await login('nope')).status, 401);
  const r = await login(PW);
  assert.equal(r.status, 200);
  const set = r.headers.get('set-cookie');
  assert.match(set, /HttpOnly/);
  assert.match(set, /Max-Age=2592000/);
  const cookie = set.split(';')[0];
  const st = await req('/api/status', { cookie });
  assert.equal(st.status, 200);
  assert.equal((await st.json()).hosted, true);
  assert.match(await (await req('/', { cookie })).text(), /app\.js/, 'signed in: the real app');
  assert.equal((await req('/api/status', { cookie: 'queue_session=123.abc' })).status, 401, 'forged cookie refused');
  // Signing out ends it.
  const out = await req('/api/logout', { method: 'POST', cookie, headers: { Origin: base } });
  assert.match(out.headers.get('set-cookie'), /Max-Age=0/);
});

test('10 wrong passwords lock that address out for 15 minutes (others unaffected)', async () => {
  for (let i = 0; i < 10; i++) await login('guess' + i, '9.9.9.9');
  const locked = await login(PW, '9.9.9.9');
  assert.equal(locked.status, 429);
  assert.equal((await login(PW, '8.8.8.8')).status, 200);
});

test('other websites cannot use a signed-in session (CSRF)', async () => {
  const cookie = (await login(PW)).headers.get('set-cookie').split(';')[0];
  const evil = await req('/api/disconnect', { method: 'POST', cookie, headers: { Origin: 'https://evil.example' } });
  assert.equal(evil.status, 403);
  const noHeader = await fetch(base + '/api/disconnect', { method: 'POST', headers: { Cookie: cookie, Origin: base } });
  assert.equal(noHeader.status, 403, 'without the X-Queue header');
});

test('Instagram can download a staged video by its secret link, no session; nothing else is reachable that way', async () => {
  const f = makeVideo(dir, 'staged.mp4');
  const { url } = await files.share(f);
  assert.ok(url.startsWith('https://queue.example/v/'));
  const path = new URL(url).pathname;
  const r = await fetch(base + path, {});
  assert.equal(r.status, 200);
  assert.ok((await r.arrayBuffer()).byteLength > 1000);
  assert.equal((await fetch(base + '/v/' + 'a'.repeat(64) + '/video.mp4', {})).status, 404);
});
