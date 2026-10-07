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
const post = (path, body, { ip = '1.1.1.1', cookie } = {}) => req(path, { method: 'POST', cookie, headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip, Origin: base }, body: JSON.stringify(body) });
const cookieFrom = (r) => r.headers.get('set-cookie').split(';')[0];
const OWNER = { name: 'Tommy', email: 'Tommy@Example.com', password: 'my-own-password-123' };

test('signed out: only the sign-in page; the app and the API are closed', async () => {
  const home = await req('/');
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Sign in/);
  assert.equal((await req('/app.js')).status, 302);
  assert.equal((await req('/api/status')).status, 401);
  assert.equal((await req('/media/anything.mp4')).status, 302);
  assert.equal((await (await req('/api/auth/state')).json()).firstRun, true);
});

test('the first account needs the setup code; then it is the owner and signed in', async () => {
  assert.equal((await post('/api/auth/signup', { ...OWNER, setupCode: 'wrong' })).status, 401);
  assert.equal((await post('/api/auth/signup', { ...OWNER, password: 'short', setupCode: PW })).status, 400, 'password too short');
  const r = await post('/api/auth/signup', { ...OWNER, setupCode: PW });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.user.role, 'owner');
  assert.equal(body.user.email, 'tommy@example.com', 'email stored lower-case');
  assert.ok(!JSON.stringify(body).includes('scrypt'), 'no password hash leaves the server');
  const set = r.headers.get('set-cookie');
  assert.match(set, /HttpOnly/);
  assert.match(set, /Max-Age=2592000/);
  const st = await (await req('/api/status', { cookie: cookieFrom(r) })).json();
  assert.equal(st.user.name, 'Tommy');
  // Nobody can create a second owner — even with the code.
  assert.equal((await post('/api/auth/signup', { name: 'X', email: 'x@y.co', password: 'another-password-1', setupCode: PW })).status, 403);
  assert.equal((await (await req('/api/auth/state')).json()).firstRun, false);
});

test('sign in: wrong password refused, right one opens the app; forged cookie refused; sign out', async () => {
  assert.equal((await post('/api/auth/signin', { email: OWNER.email, password: 'nope-nope-nope' })).status, 401);
  assert.equal((await post('/api/auth/signin', { email: 'nobody@x.co', password: OWNER.password })).status, 401);
  const r = await post('/api/auth/signin', { email: 'tommy@example.com', password: OWNER.password });
  assert.equal(r.status, 200);
  const cookie = cookieFrom(r);
  assert.match(await (await req('/', { cookie })).text(), /app\.js/, 'signed in: the real app');
  assert.equal((await req('/api/status', { cookie: 'queue_session=owner.9999999999999.' + 'a'.repeat(64) })).status, 401);
  const out = await post('/api/logout', {}, { cookie });
  assert.match(out.headers.get('set-cookie'), /Max-Age=0/);
});

test('10 failed tries lock that address out for 15 minutes (others unaffected)', async () => {
  for (let i = 0; i < 10; i++) await post('/api/auth/signin', { email: OWNER.email, password: 'guess' + i }, { ip: '9.9.9.9' });
  assert.equal((await post('/api/auth/signin', { email: OWNER.email, password: OWNER.password }, { ip: '9.9.9.9' })).status, 429);
  assert.equal((await post('/api/auth/signin', { email: OWNER.email, password: OWNER.password }, { ip: '8.8.8.8' })).status, 200);
});

test('changing the password signs out every other device; forgot-password needs the setup code', async () => {
  const old = cookieFrom(await post('/api/auth/signin', { email: OWNER.email, password: OWNER.password }));
  assert.equal((await post('/api/auth/password', { current: 'wrong-current-pw', next: 'brand-new-password-1' }, { cookie: old })).status, 400);
  const r = await post('/api/auth/password', { current: OWNER.password, next: 'brand-new-password-1' }, { cookie: old });
  assert.equal(r.status, 200);
  assert.equal((await req('/api/status', { cookie: old })).status, 401, 'old session ended');
  assert.equal((await req('/api/status', { cookie: cookieFrom(r) })).status, 200, 'this device stays in');
  assert.equal((await post('/api/auth/reset', { email: OWNER.email, password: 'reset-password-123', setupCode: 'nope' }, { ip: '7.7.7.7' })).status, 401);
  const reset = await post('/api/auth/reset', { email: OWNER.email, password: 'reset-password-123', setupCode: PW }, { ip: '7.7.7.7' });
  assert.equal(reset.status, 200);
  assert.equal((await post('/api/auth/signin', { email: OWNER.email, password: 'reset-password-123' })).status, 200);
});

test('other websites cannot use a signed-in session (CSRF)', async () => {
  const cookie = cookieFrom(await post('/api/auth/signin', { email: OWNER.email, password: 'reset-password-123' }));
  const evil = await req('/api/disconnect', { method: 'POST', cookie, headers: { Origin: 'https://evil.example' } });
  assert.equal(evil.status, 403);
  const noHeader = await fetch(base + '/api/disconnect', { method: 'POST', headers: { Cookie: cookie, Origin: base } });
  assert.equal(noHeader.status, 403, 'without the X-Queue header');
});

test('Instagram can download a staged video by its secret link, no session; nothing else is reachable that way', async () => {
  const f = makeVideo(dir, 'staged.mp4');
  const { url } = await files.share(f);
  assert.ok(url.startsWith('https://queue.example/v/'));
  const r = await fetch(base + new URL(url).pathname);
  assert.equal(r.status, 200);
  assert.ok((await r.arrayBuffer()).byteLength > 1000);
  assert.equal((await fetch(base + '/v/' + 'a'.repeat(64) + '/video.mp4')).status, 404);
});

test('Instagram can fetch a staged PHOTO by its secret link too (photos only travel as links)', async () => {
  const { execFileSync } = await import('node:child_process');
  const p = join(dir, 'staged.jpg');
  execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=1080x1350', '-frames:v', '1', p]);
  const { url, token } = await files.share(p);
  assert.match(url, /^https:\/\/queue\.example\/v\/[a-f0-9]{64}\/photo\.jpg$/);
  const r = await fetch(base + new URL(url).pathname);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/jpeg');
  assert.equal((await fetch(base + new URL(url).pathname.replace('photo.jpg', 'photo.png'))).status, 404);
  await files.unshare(token);
  assert.equal((await fetch(base + new URL(url).pathname)).status, 404, 'closed link is gone');
});
