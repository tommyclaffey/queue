// Continue with Google / Facebook on hosted Queue, against fake provider servers.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../src/server.js';
import { Queue } from '../src/queue.js';
import { InstagramClient } from '../src/instagram.js';
import { PROVIDERS } from '../src/oauth.js';
import { tmp, cleanup } from './helpers.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let dir, app, base;
let googleClaims = {};
const jwt = (claims) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;
const fakeFetch = async (url, opts = {}) => {
  if (String(url).startsWith('https://oauth2.googleapis.com/token')) {
    const b = new URLSearchParams(opts.body);
    if (b.get('code') !== 'good-code' || b.get('client_secret') !== 'g-secret') return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
    return new Response(JSON.stringify({ id_token: jwt({ aud: 'g-id', iss: 'https://accounts.google.com', email_verified: true, ...googleClaims }) }));
  }
  throw new Error('unexpected fetch ' + url);
};

before(async () => {
  dir = tmp();
  Object.assign(process.env, { GOOGLE_CLIENT_ID: 'g-id', GOOGLE_CLIENT_SECRET: 'g-secret' });
  delete process.env.FACEBOOK_APP_ID; delete process.env.FACEBOOK_APP_SECRET;
  app = startServer({ root: ROOT, mediaDir: join(dir, 'media'), dataDir: join(dir, 'data'), envFile: join(dir, '.env'), queue: new Queue(join(dir, 'q.json')), ig: new InstagramClient({ login: 'instagram', dryRun: true }), port: 0, host: '127.0.0.1', tickMs: 60_000, log: () => {}, hosted: true, password: 'setup-code-123456', publicOrigin: 'https://queue.example', ownerEmail: 'Tommy@Example.com', oauthFetch: fakeFetch });
  await app.ready;
  base = `http://127.0.0.1:${app.port()}`;
});
after(async () => { await app.stop(); cleanup(dir); delete process.env.GOOGLE_CLIENT_ID; delete process.env.GOOGLE_CLIENT_SECRET; });

const get = (path, cookie) => fetch(base + path, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} });
async function startGoogle() {
  const r = await get('/api/auth/start/google');
  const to = new URL(r.headers.get('location'));
  return { to, state: to.searchParams.get('state'), cookie: r.headers.get('set-cookie').split(';')[0] };
}
const errorOf = (r) => new URL(r.headers.get('location'), base).searchParams.get('error');

test('both buttons report their state; an unconfigured one explains instead of failing', async () => {
  const s = await (await get('/api/auth/state')).json();
  assert.equal(s.providers.google.on, true);
  assert.equal(s.providers.facebook.on, false);
  assert.equal(s.providers.google.redirectUri, 'https://queue.example/api/auth/callback/google');
  const fb = await get('/api/auth/start/facebook');
  assert.equal(fb.status, 302);
  assert.equal(fb.headers.get('location'), '/?setup=facebook');
});

test('Google start sends you to Google with this Queue\'s address and a fresh state tied to this browser', async () => {
  const { to, state, cookie } = await startGoogle();
  assert.equal(to.host, 'accounts.google.com');
  assert.equal(to.searchParams.get('client_id'), 'g-id');
  assert.equal(to.searchParams.get('redirect_uri'), 'https://queue.example/api/auth/callback/google');
  assert.match(to.searchParams.get('scope'), /email/);
  assert.equal(cookie, `queue_oauth=${state}`);
});

test('first run: only the named owner email can create the account through Google', async () => {
  googleClaims = { email: 'stranger@x.co', name: 'Stranger' };
  let { state, cookie } = await startGoogle();
  let r = await get(`/api/auth/callback/google?code=good-code&state=${state}`, cookie);
  assert.match(errorOf(r), /isn’t set up yet/);
  googleClaims = { email: 'tommy@example.com', name: 'Tommy C' };
  ({ state, cookie } = await startGoogle());
  r = await get(`/api/auth/callback/google?code=good-code&state=${state}`, cookie);
  assert.equal(r.headers.get('location'), '/');
  const session = r.headers.get('set-cookie').split(',').map((x) => x.trim()).find((x) => x.startsWith('queue_session=')).split(';')[0];
  const st = await (await get('/api/status', session)).json();
  assert.equal(st.user.email, 'tommy@example.com');
  assert.equal(st.user.role, 'owner');
});

test('a sign-in started in another browser, a reused state, or a bad code is refused', async () => {
  googleClaims = { email: 'tommy@example.com' };
  const { state, cookie } = await startGoogle();
  assert.match(errorOf(await get(`/api/auth/callback/google?code=good-code&state=${state}`)), /another browser/, 'no state cookie');
  const second = await startGoogle();
  assert.match(errorOf(await get(`/api/auth/callback/google?code=bad-code&state=${second.state}`, second.cookie)), /invalid_grant|didn’t sign you in/);
  assert.match(errorOf(await get(`/api/auth/callback/google?code=good-code&state=${state}`, cookie)), /expired|another browser/, 'state already used up');
});

test('after setup: an unknown email gets no account; an unverified Google email is refused', async () => {
  googleClaims = { email: 'someone@else.co' };
  let s = await startGoogle();
  assert.match(errorOf(await get(`/api/auth/callback/google?code=good-code&state=${s.state}`, s.cookie)), /no Queue account/);
  googleClaims = { email: 'tommy@example.com', email_verified: false };
  s = await startGoogle();
  assert.match(errorOf(await get(`/api/auth/callback/google?code=good-code&state=${s.state}`, s.cookie)), /isn’t verified/);
});

test('Facebook identity: needs an email back from Facebook', async () => {
  const fb = (me) => async (url) => (String(url).includes('/oauth/access_token') ? new Response(JSON.stringify({ access_token: 't' })) : new Response(JSON.stringify(me)));
  assert.deepEqual(await PROVIDERS.facebook.identity('c', 'r', 'id', 's', fb({ id: '1', name: 'T', email: 't@x.co' })), { email: 't@x.co', name: 'T' });
  await assert.rejects(PROVIDERS.facebook.identity('c', 'r', 'id', 's', fb({ id: '1', name: 'T' })), /didn’t share an email/);
});
