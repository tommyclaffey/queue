// One-click "Connect with Instagram" on the online Queue: Instagram login → long-lived key → live.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../src/server.js';
import { Queue } from '../src/queue.js';
import { InstagramClient } from '../src/instagram.js';
import { startMockMeta, GOOD_TOKEN } from './mock-meta.js';
import { tmp, cleanup } from './helpers.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let meta, dir, app, base, session;
const fakeFetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith('https://api.instagram.com/oauth/access_token')) {
    const b = new URLSearchParams(opts.body);
    if (b.get('code') !== 'ok-code' || b.get('client_secret') !== 'ig-secret') return new Response(JSON.stringify({ error_message: 'Invalid authorization code' }), { status: 400 });
    return new Response(JSON.stringify({ data: [{ access_token: 'short-lived', user_id: '17841400000000001' }] }));
  }
  if (u.startsWith('https://graph.instagram.com/access_token')) {
    const q = new URL(u).searchParams;
    if (q.get('grant_type') !== 'ig_exchange_token' || q.get('access_token') !== 'short-lived') return new Response(JSON.stringify({ error: { message: 'bad exchange' } }), { status: 400 });
    return new Response(JSON.stringify({ access_token: GOOD_TOKEN, token_type: 'bearer', expires_in: 5183944 }));
  }
  throw new Error('unexpected fetch ' + u);
};

before(async () => {
  meta = await startMockMeta();
  dir = tmp();
  Object.assign(process.env, { INSTAGRAM_APP_ID: 'ig-id', INSTAGRAM_APP_SECRET: 'ig-secret' });
  app = startServer({ root: ROOT, mediaDir: join(dir, 'media'), dataDir: join(dir, 'data'), envFile: join(dir, '.env'), queue: new Queue(join(dir, 'q.json')), ig: new InstagramClient({ login: 'instagram', dryRun: true }), makeIg: (o) => new InstagramClient({ ...o, graphHost: meta.host, ruploadHost: meta.host, retryDelayMs: 5 }), port: 0, host: '127.0.0.1', tickMs: 60_000, log: () => {}, hosted: true, password: 'setup-code-123456', publicOrigin: 'https://queue.example', oauthFetch: fakeFetch });
  await app.ready;
  base = `http://127.0.0.1:${app.port()}`;
  const r = await fetch(base + '/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Queue': '1', Origin: base }, body: JSON.stringify({ name: 'T', email: 't@x.co', password: 'owner-password-1', setupCode: 'setup-code-123456' }) });
  session = r.headers.get('set-cookie').split(';')[0];
});
after(async () => { await app.stop(); await meta.close(); cleanup(dir); delete process.env.INSTAGRAM_APP_ID; delete process.env.INSTAGRAM_APP_SECRET; });

const get = (path, cookie) => fetch(base + path, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} });
const where = (r) => r.headers.get('location');

test('signed out, the connect button goes nowhere near Instagram', async () => {
  const r = await get('/api/connect/start/instagram');
  assert.equal(r.status, 401);
  assert.equal(where(r), null);
});

test('status says one-click is on, with the address to register', async () => {
  const st = await (await get('/api/status', session)).json();
  assert.deepEqual(st.oneClick, { instagram: true, redirectUri: 'https://queue.example/api/connect/callback/instagram' });
});

test('connect: Instagram login → 60-day key saved → Queue goes live, no restart', async () => {
  const start = await get('/api/connect/start/instagram', session);
  const to = new URL(where(start));
  assert.equal(to.host, 'www.instagram.com');
  assert.equal(to.searchParams.get('client_id'), 'ig-id');
  assert.match(to.searchParams.get('scope'), /instagram_business_content_publish/);
  const state = to.searchParams.get('state');
  const cookie = `${session}; ${start.headers.get('set-cookie').split(';')[0]}`;
  const done = await get(`/api/connect/callback/instagram?code=ok-code&state=${state}`, cookie);
  assert.equal(where(done), '/#/setup');
  const st = await (await get('/api/status', session)).json();
  assert.equal(st.dryRun, false);
  assert.equal(st.account, 'tommy.test');
  assert.match(readFileSync(join(dir, '.env'), 'utf8'), new RegExp(`^IG_ACCESS_TOKEN=${GOOD_TOKEN}$`, 'm'), 'the long-lived key, not the 1-hour one');
});

test('a bad code or a link from another browser shows the reason on the Connect page', async () => {
  const start = await get('/api/connect/start/instagram', session);
  const state = new URL(where(start)).searchParams.get('state');
  const cookie = `${session}; ${start.headers.get('set-cookie').split(';')[0]}`;
  assert.match(decodeURIComponent(where(await get(`/api/connect/callback/instagram?code=bad&state=${state}`, cookie))), /Invalid authorization code/);
  const again = await get('/api/connect/start/instagram', session);
  const s2 = new URL(where(again)).searchParams.get('state');
  assert.match(decodeURIComponent(where(await get(`/api/connect/callback/instagram?code=ok-code&state=${s2}`, session))), /another browser/);
});
