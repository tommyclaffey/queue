// Keeps the Instagram-login token alive.
// Tokens from the dashboard last 60 days. Meta lets you refresh once a token is 24h+ old,
// which returns a new 60-day token. We refresh weekly and save the new token to
// data/token.json (which then takes priority over .env).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const DAY = 86_400_000;
const REFRESH_EVERY = 7 * DAY;

export class TokenStore {
  constructor(path, envToken) {
    this.path = path;
    this.envToken = envToken || null;
    this.data = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
    // If .env has a DIFFERENT token than the one we last saved, the user pasted a new one: it wins.
    if (this.data && this.envToken && this.data.sourceEnvToken !== this.envToken) this.data = null;
  }

  get token() {
    return this.data?.token || this.envToken;
  }

  get expiresAt() {
    return this.data?.expiresAt || null;
  }

  daysLeft(now = Date.now()) {
    return this.expiresAt ? Math.floor((new Date(this.expiresAt) - now) / DAY) : null;
  }

  due(now = Date.now()) {
    if (!this.token) return false;
    if (!this.data?.refreshedAt) return true;
    return now - new Date(this.data.refreshedAt) > REFRESH_EVERY;
  }

  // Returns a short status line for logs. Never throws: a failed refresh isn't fatal
  // while the current token is still valid.
  async maybeRefresh(ig, { now = Date.now(), log = () => {} } = {}) {
    if (ig.login !== 'instagram' || ig.dryRun || !this.due(now)) return;
    if (this.lastAttempt && now - this.lastAttempt < 6 * 3600_000) return; // don't hammer Meta
    this.lastAttempt = now;
    try {
      const r = await ig.refreshToken();
      if (!r) return;
      this.data = {
        token: r.token,
        refreshedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + r.expiresInSec * 1000).toISOString(),
        sourceEnvToken: this.envToken,
      };
      writeFileSync(this.path, JSON.stringify(this.data, null, 2), { mode: 0o600 });
      log(`🔑 Login key renewed — good for ${Math.round(r.expiresInSec / 86400)} more days`);
    } catch (err) {
      // Meta refuses refresh for tokens under 24h old — expected on day one.
      log(`🔑 Login key not renewed yet (${err.message}). Will try again later.`);
    }
  }
}
