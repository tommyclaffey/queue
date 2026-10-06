// Accounts for hosted Queue (Railway): name, email, password. Same shape as Growth's email sign-in.
//
//   • The FIRST account becomes the owner. Creating it needs the one-time setup code
//     (QUEUE_PASSWORD on the server), so a stranger who finds the address can't claim it first.
//   • Passwords are stored as scrypt$<salt>$<hash>. Checking always spends the scrypt time, even
//     for an unknown email, so response time doesn't reveal who has an account.
//   • Sessions are signed cookies: userId.expiry.signature. The signature covers the stored
//     password hash, so changing the password signs every device out.
import { randomBytes, scrypt, createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const scryptP = promisify(scrypt);
const DUMMY = `scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`;
export const SESSION_DAYS = 30;
export const MIN_PASSWORD = 10;
const normEmail = (e) => String(e || '').trim().toLowerCase();

export class Accounts {
  constructor(dataDir) {
    this.file = join(dataDir, 'accounts.json');
    this.dataDir = dataDir;
    const sf = join(dataDir, 'session.secret');
    try { this.secret = readFileSync(sf, 'utf8').trim(); } catch {}
    if (!this.secret) { mkdirSync(dataDir, { recursive: true }); this.secret = randomBytes(32).toString('hex'); writeFileSync(sf, this.secret, { mode: 0o600 }); }
  }

  #read() { try { return JSON.parse(readFileSync(this.file, 'utf8')); } catch { return []; } }
  #write(list) { mkdirSync(this.dataDir, { recursive: true }); writeFileSync(this.file, JSON.stringify(list, null, 1), { mode: 0o600 }); }

  get firstRun() { return this.#read().length === 0; }
  publicUser(u) { return u && { id: u.id, name: u.name, email: u.email, role: u.role }; }

  static async hash(pw) {
    const salt = randomBytes(16);
    return `scrypt$${salt.toString('hex')}$${(await scryptP(pw, salt, 64)).toString('hex')}`;
  }
  static async verify(pw, stored) {
    const [, saltHex, hashHex] = (stored || DUMMY).split('$');
    const got = await scryptP(String(pw), Buffer.from(saltHex, 'hex'), 64);
    const want = Buffer.from(hashHex, 'hex');
    return Boolean(stored) && got.length === want.length && timingSafeEqual(got, want);
  }

  async create({ name, email, password }) {
    const list = this.#read();
    const e = normEmail(email);
    if (!String(name || '').trim()) throw new Error('Add your name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error('That email address doesn’t look right.');
    if (String(password || '').length < MIN_PASSWORD) throw new Error(`Use at least ${MIN_PASSWORD} characters for your password.`);
    if (list.some((u) => u.email === e)) throw new Error('There’s already an account with that email.');
    const u = { id: list.length ? `u_${randomBytes(6).toString('hex')}` : 'owner', name: String(name).trim().slice(0, 60), email: e, role: list.length ? 'member' : 'owner', pw: await Accounts.hash(String(password)), createdAt: new Date().toISOString() };
    this.#write([...list, u]);
    return u;
  }

  findByEmail(email) { return this.#read().find((x) => x.email === normEmail(email)) || null; }

  // Signing in with Google or Facebook. An existing account with the same email signs in (and
  // remembers the provider). With no accounts yet, only the named owner email may create one.
  providerSignIn({ provider, email, name }, ownerEmail) {
    const list = this.#read();
    const e = normEmail(email);
    if (!e) throw new Error('That account didn’t share an email address, so Queue can’t match it to you.');
    const u = list.find((x) => x.email === e);
    if (u) {
      if (!(u.providers || []).includes(provider)) { u.providers = [...(u.providers || []), provider]; this.#write(list); }
      return u;
    }
    if (list.length) throw new Error('There’s no Queue account for that email. Ask the owner to add you.');
    if (!ownerEmail || normEmail(ownerEmail) !== e) throw new Error('This Queue isn’t set up yet. The owner creates the first account (with the setup code, or with the owner’s own email).');
    const owner = { id: 'owner', name: String(name || e.split('@')[0]).slice(0, 60), email: e, role: 'owner', pw: null, providers: [provider], createdAt: new Date().toISOString() };
    this.#write([owner]);
    return owner;
  }

  async signIn(email, password) {
    const u = this.#read().find((x) => x.email === normEmail(email));
    const ok = await Accounts.verify(password, u?.pw);
    return ok ? u : null;
  }

  async changePassword(userId, current, next) {
    const list = this.#read();
    const u = list.find((x) => x.id === userId);
    if (!u || (u.pw && !(await Accounts.verify(current, u.pw)))) throw new Error('Your current password isn’t right.');
    if (String(next || '').length < MIN_PASSWORD) throw new Error(`Use at least ${MIN_PASSWORD} characters for your new password.`);
    u.pw = await Accounts.hash(String(next));
    this.#write(list);
    return u;
  }

  // Forgot password: allowed with the setup code (only someone with access to the server has it).
  async resetPassword(email, next) {
    const list = this.#read();
    const u = list.find((x) => x.email === normEmail(email));
    if (!u) throw new Error('There’s no account with that email.');
    if (String(next || '').length < MIN_PASSWORD) throw new Error(`Use at least ${MIN_PASSWORD} characters for your new password.`);
    u.pw = await Accounts.hash(String(next));
    this.#write(list);
    return u;
  }

  #sign(userId, exp, pw) { return createHmac('sha256', this.secret).update(`${userId}.${exp}.${pw}`).digest('hex'); }
  sessionFor(u) {
    const exp = Date.now() + SESSION_DAYS * 86_400_000;
    return `${u.id}.${exp}.${this.#sign(u.id, exp, u.pw)}`;
  }
  // Returns the signed-in account, or null.
  fromSession(value) {
    const [id, exp, sig] = String(value || '').split('.');
    if (!id || !exp || !sig || sig.length !== 64 || Number(exp) < Date.now()) return null;
    const u = this.#read().find((x) => x.id === id);
    if (!u) return null;
    try { return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(this.#sign(id, exp, u.pw), 'hex')) ? u : null; } catch { return null; }
  }
}
