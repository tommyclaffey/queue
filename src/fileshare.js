// Temporary public links for videos, served straight off this Mac.
//
// Why: with Instagram-only login, Meta won't accept a direct upload — it wants a
// public URL (video_url) that it downloads from. Rather than hand the file to a
// third-party host, we serve the ORIGINAL bytes ourselves for the few minutes
// Meta needs, then close the link.
//
// Safety:
//   • Only files explicitly shared are served, each behind a random 256-bit token.
//   • Nothing else on this Mac is reachable — this is a separate tiny server, not the web app.
//   • The tunnel only runs while at least one post is staging, then shuts down.
//
// Tunnel: Cloudflare quick tunnel (free, no account). Or set PUBLIC_BASE_URL if you
// host the files yourself (then this server listens on SHARE_PORT and you route to it).
import { createServer } from 'node:http';
import { get as httpsGet } from 'node:https';
import { createReadStream, statSync, existsSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { extname } from 'node:path';

const TYPES = { '.mp4': 'video/mp4', '.mov': 'video/quicktime' };

export function hasCloudflared() {
  try {
    execFileSync('cloudflared', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export class FileShare {
  #server = null;
  #tunnel = null;
  #baseUrl = null;
  #starting = null;
  #shares = new Map(); // token → file

  constructor({ publicBaseUrl = null, port = 0, log = () => {} } = {}) {
    this.publicBaseUrl = publicBaseUrl;
    this.port = port;
    this.log = log;
  }

  get active() {
    return this.#shares.size;
  }

  async share(file) {
    if (!existsSync(file)) throw new Error(`File missing: ${file}`);
    const base = await this.#ensureStarted();
    const token = randomBytes(32).toString('hex');
    this.#shares.set(token, file);
    const ext = extname(file).toLowerCase() === '.mov' ? '.mov' : '.mp4';
    return { token, url: `${base}/v/${token}/video${ext}` };
  }

  async unshare(token) {
    this.#shares.delete(token);
    if (this.#shares.size === 0) await this.stop();
  }

  // Tokens from a previous run are meaningless — links never survive a restart.
  has(token) {
    return this.#shares.has(token);
  }

  #handle = (req, res) => {
    const m = /^\/v\/([a-f0-9]{64})\/video\.(mp4|mov)$/.exec(req.url.split('?')[0]);
    const file = m && this.#shares.get(m[1]);
    if (!file || !['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(404);
      return res.end();
    }
    const size = statSync(file).size;
    const type = TYPES[extname(file).toLowerCase()] || 'video/mp4';
    const r = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    this.log(`file link: Meta is downloading (${req.method}${r ? ' range' : ''})`);
    if (!r) {
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' });
      if (req.method === 'HEAD') return res.end();
      return createReadStream(file).pipe(res);
    }
    const start = r[1] ? Number(r[1]) : 0;
    const end = r[2] ? Math.min(Number(r[2]), size - 1) : size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes' });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file, { start, end }).pipe(res);
  };

  async #ensureStarted() {
    if (this.#baseUrl) return this.#baseUrl;
    if (!this.#starting) this.#starting = this.#start().finally(() => (this.#starting = null));
    return this.#starting;
  }

  async #start() {
    this.#server = createServer(this.#handle);
    await new Promise((r) => this.#server.listen(this.port, '127.0.0.1', r));
    const port = this.#server.address().port;

    if (this.publicBaseUrl) {
      this.#baseUrl = this.publicBaseUrl.replace(/\/$/, '');
      return this.#baseUrl;
    }
    if (!hasCloudflared()) throw new Error('cloudflared is not installed. Run: brew install cloudflared');

    this.#tunnel = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    trackTunnel(this.#tunnel);
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Tunnel did not start within 45s')), 45_000);
      const onData = (buf) => {
        const hit = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(buf.toString());
        if (hit) {
          clearTimeout(timer);
          resolve(hit[0]);
        }
      };
      this.#tunnel.stdout.on('data', onData);
      this.#tunnel.stderr.on('data', onData);
      this.#tunnel.on('exit', (code) => reject(new Error(`cloudflared exited (${code})`)));
    });

    // Prove the link works from the OUTSIDE before handing it to Meta.
    // Uses Cloudflare's public DNS (not the ISP's): ISP resolvers often cache
    // "doesn't exist" for a brand-new hostname, which would give a false alarm.
    const ready = await this.#waitUntilReachable(url);
    if (!ready) {
      await this.stop();
      throw Object.assign(new Error('Temporary file link never became reachable'), { transient: true });
    }
    this.log(`file link: tunnel open (${url})`);
    this.#baseUrl = url;
    return url;
  }

  async #waitUntilReachable(url, timeoutMs = 90_000) {
    const host = new URL(url).hostname;
    const probePath = `/v/${'0'.repeat(64)}/video.mp4`; // valid shape, unknown token → our server says 404
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const ip = await publicDnsLookup(host);
        if (ip && (await statusVia(host, ip, probePath)) === 404) return true;
      } catch {}
      await new Promise((r) => setTimeout(r, 2000));
    }
    return false;
  }

  async stop() {
    this.#shares.clear();
    if (this.#tunnel) {
      this.#tunnel.kill();
      this.#tunnel = null;
      this.log('file link: tunnel closed');
    }
    if (this.#server) {
      const closed = new Promise((r) => this.#server.close(r));
      this.#server.closeAllConnections(); // don't wait on a stalled or abandoned download
      await closed;
      this.#server = null;
    }
    this.#baseUrl = null;
  }
}

async function publicDnsLookup(host) {
  const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${host}&type=A`, {
    headers: { accept: 'application/dns-json' },
    signal: AbortSignal.timeout(5000),
  });
  const json = await res.json();
  return json.Answer?.find((a) => a.type === 1)?.data || null;
}

// HTTPS request pinned to a specific IP (bypasses the local DNS cache), correct SNI/Host.
function statusVia(host, ip, path) {
  return new Promise((resolve, reject) => {
    const req = httpsGet({ host, path, servername: host, timeout: 5000, lookup: (_h, opts, cb) => (opts?.all ? cb(null, [{ address: ip, family: 4 }]) : cb(null, ip, 4)) }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

// Never leave a tunnel running if the app exits or crashes.
const liveTunnels = new Set();
export function trackTunnel(child) {
  liveTunnels.add(child);
  child.on('exit', () => liveTunnels.delete(child));
}
for (const sig of ['exit', 'SIGINT', 'SIGTERM', 'uncaughtException']) {
  process.on(sig, (e) => {
    for (const t of liveTunnels) t.kill();
    if (sig === 'uncaughtException') { console.error(e); process.exit(1); }
    if (sig !== 'exit') process.exit(0);
  });
}
