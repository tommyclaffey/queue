// "Continue with Google" / "Continue with Facebook" for hosted Queue. Server-side code flow:
//   start → provider's consent page → /api/auth/callback/<provider>?code&state → exchange the code
//   for the person's verified email → sign in. The state is random, expires in 10 minutes, and is
//   tied to a cookie on this browser, so nobody can push a sign-in into someone else's browser.
import { randomBytes } from 'node:crypto';

export const PROVIDERS = {
  google: {
    label: 'Google', idEnv: 'GOOGLE_CLIENT_ID', secretEnv: 'GOOGLE_CLIENT_SECRET',
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    params: { response_type: 'code', scope: 'openid email profile', prompt: 'select_account' },
    async identity(code, redirectUri, id, secret, fetchImpl = fetch) {
      const r = await fetchImpl('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: redirectUri, grant_type: 'authorization_code' }) });
      const t = await r.json();
      if (!r.ok || !t.id_token) throw new Error(t.error_description || 'Google didn’t sign you in.');
      // Received straight from Google over TLS with our secret, so the payload can be read directly.
      const c = JSON.parse(Buffer.from(t.id_token.split('.')[1], 'base64url').toString());
      if (c.aud !== id || !/^(https:\/\/)?accounts\.google\.com$/.test(c.iss)) throw new Error('Google’s answer wasn’t meant for this Queue.');
      if (!c.email_verified) throw new Error('That Google account’s email isn’t verified.');
      return { email: c.email, name: c.name };
    },
  },
  facebook: {
    label: 'Facebook', idEnv: 'FACEBOOK_APP_ID', secretEnv: 'FACEBOOK_APP_SECRET',
    authorize: 'https://www.facebook.com/v25.0/dialog/oauth',
    params: { response_type: 'code', scope: 'email,public_profile' },
    async identity(code, redirectUri, id, secret, fetchImpl = fetch) {
      const q = new URLSearchParams({ client_id: id, client_secret: secret, redirect_uri: redirectUri, code });
      const r = await fetchImpl(`https://graph.facebook.com/v25.0/oauth/access_token?${q}`);
      const t = await r.json();
      if (!r.ok || !t.access_token) throw new Error(t.error?.message || 'Facebook didn’t sign you in.');
      const me = await (await fetchImpl(`https://graph.facebook.com/v25.0/me?fields=id,name,email&access_token=${encodeURIComponent(t.access_token)}`)).json();
      if (!me.email) throw new Error('Facebook didn’t share an email address. Allow email when Facebook asks, or use email sign-in.');
      return { email: me.email, name: me.name };
    },
  },
};

export class OAuth {
  constructor({ origin, env = process.env, fetchImpl = fetch }) {
    this.origin = (origin || '').replace(/\/$/, '');
    this.env = env;
    this.fetch = fetchImpl;
    this.pending = new Map(); // state → { provider, exp }
  }
  configured(p) { const c = PROVIDERS[p]; return !!(c && this.env[c.idEnv] && this.env[c.secretEnv] && this.origin); }
  redirectUri(p) { return `${this.origin}/api/auth/callback/${p}`; }
  start(p) {
    const c = PROVIDERS[p];
    for (const [k, v] of this.pending) if (v.exp < Date.now()) this.pending.delete(k);
    const state = randomBytes(24).toString('hex');
    this.pending.set(state, { provider: p, exp: Date.now() + 10 * 60_000 });
    const u = new URL(c.authorize);
    for (const [k, v] of Object.entries({ ...c.params, client_id: this.env[c.idEnv], redirect_uri: this.redirectUri(p), state })) u.searchParams.set(k, v);
    return { url: u.toString(), state };
  }
  async finish(p, { code, state, cookieState }) {
    const want = this.pending.get(state);
    this.pending.delete(state);
    if (!want || want.provider !== p || want.exp < Date.now() || !state || state !== cookieState) throw new Error('That sign-in link expired or was started in another browser. Try again.');
    if (!code) throw new Error('Sign-in was cancelled.');
    const c = PROVIDERS[p];
    const who = await c.identity(code, this.redirectUri(p), this.env[c.idEnv], this.env[c.secretEnv], this.fetch);
    return { ...who, provider: p };
  }
}
