// Local web UI + scheduler in one process. No dependencies.
// Binds to 127.0.0.1 only — nothing on your network can reach it.
import { createServer } from 'node:http';
import { createReadStream, createWriteStream, existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { sendFile } from './range.js';
import { pipeline } from 'node:stream/promises';
import { join, basename, extname } from 'node:path';
import { INSTAGRAM_REELS as SPEC } from './specs.js';
import { hasFfmpeg, probeAsync } from './probe.js';
import { preflight } from './preflight.js';
import { conformAsync } from './conform.js';
import { hasCloudflared } from './fileshare.js';
import { tick, tokensOf } from './worker.js';
import { mediaReport, clearMedia, stem as mediaStem, filesOf } from './storage.js';
import { photoTypeOf, photoInfo, photoPreflight, preparePhoto, preparedName, isPreparedPhoto } from './photo.js';
import { readdirSync, statSync } from 'node:fs';
import { isLoaded as autostartOn } from './autostart.js';
import { compare, download } from './quality.js';
import { mergeSettings, saveSettings } from './settings.js';
import { updateEnv } from './envfile.js';
import { InstagramClient } from './instagram.js';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Accounts, SESSION_DAYS } from './accounts.js';
import { OAuth, PROVIDERS, Connect, CONNECT } from './oauth.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';

const TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.m4v': 'video/mp4' };
const PUBLIC_FILES = new Set(['index.html', 'styles.css', 'app.js', 'pages.js']);
const LOGIN_FILES = new Set(['login.html', 'styles.css']); // all a signed-out visitor can load (hosted mode)

export function startServer({ root, queue, ig, files = null, tokens = null, port = 4400, stageWindowMin = 120, lateLimitMin = 120, notify = () => {}, log = console.log, tickMs = 30_000, mediaDir = join(root, 'media'), dataDir = join(root, 'data'), demo = null, notifyOn = true, envFile = join(root, '.env'), makeIg = (o) => new InstagramClient(o), hosted = false, password = null, host = null, publicOrigin = null, ownerEmail = null, oauthFetch = fetch }) {
  // Live settings. Explicit options (from loadConfig or tests) win at start; changes made in the
  // app are saved to data/settings.json and applied immediately.
  let settings = { ...mergeSettings(dataDir), stageWindowMin, lateLimitMin, notify: notifyOn };
  const notifyGated = (...a) => { if (settings.notify) notify(...a); };
  mkdirSync(mediaDir, { recursive: true });
  let account = null;
  let accountError = null;

  const send = (res, code, body) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const readJson = async (req) => {
    let s = '';
    for await (const c of req) s += c;
    return JSON.parse(s || '{}');
  };
  // Only allow files that live inside media/ — never arbitrary paths from the browser.
  // A plain file name inside `dir`, or null. Rejects "", ".", ".." and anything that isn't a file.
  const fileIn = (dir, name) => {
    const clean = basename(String(name || ''));
    if (!clean || clean === '.' || clean === '..') return null;
    const p = join(dir, clean);
    try { return statSync(p).isFile() ? p : null; } catch { return null; }
  };
  const safeMedia = (name) => fileIn(mediaDir, name);
  // ffprobe is ~50 ms a file, so cache by path + size + mtime. The Library and Queue lists
  // ask for every file on every refresh.
  const probeCache = new Map();
  const summarizeAsync = async (file) => {
    const st = statSync(file);
    const key = `${file}|${st.size}|${st.mtimeMs}`;
    if (probeCache.has(key)) return probeCache.get(key);
    const info = await probeAsync(file);
    const out = { info, result: preflight(info, SPEC) };
    if (probeCache.size > 500) probeCache.clear();
    probeCache.set(key, out);
    return out;
  };
  // Runs fn over items, at most `n` at a time (ffprobe is CPU-bound).
  const mapLimit = async (items, n, fn) => {
    const out = new Array(items.length); let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
    return out;
  };
  // A small, safe description of a video for lists. Never throws.
  const metaOf = async (file) => {
    try {
      if (!file || !existsSync(file)) return null;
      const { info, result } = await summarizeAsync(file);
      const v = info.video || {};
      return {
        width: v.width, height: v.height, durationSec: info.durationSec, bytes: info.bytes,
        hdr: ['arib-std-b67', 'smpte2084'].includes(v.colorTransfer),
        plan: result.plan, needsTrim: !!result.needsTrim,
      };
    } catch { return null; }
  };
  // Photos: width/height of the prepared JPEG for the Library, cached like ffprobe results.
  const photoCache = new Map();
  const photoMetaOf = async (file) => {
    try {
      const st = statSync(file);
      const key = `${file}|${st.size}|${st.mtimeMs}`;
      if (!photoCache.has(key)) {
        const i = await photoInfo(file);
        if (photoCache.size > 500) photoCache.clear();
        photoCache.set(key, { width: i.width, height: i.height, bytes: i.bytes, photo: true, plan: 'none' });
      }
      return photoCache.get(key);
    } catch { return null; }
  };
  // An original photo upload in media/ (never one of the prepared copies), or null.
  const safePhoto = (name) => { const f = safeMedia(name); return f && !isPreparedPhoto(basename(f)) && photoTypeOf(f) ? f : null; };
  // The JPEGs Instagram gets for a post, made once each from the originals:
  //   story → every frame 9:16 · one photo → its own best feed shape · carousel → every photo at
  //   the FIRST photo's shape (Instagram shows them all at that shape anyway).
  async function preparePostPhotos(kind, originals) {
    const infos = [];
    for (const f of originals) infos.push(await photoInfo(f));
    const shape = kind === 'photos' && originals.length > 1 ? photoPreflight(infos[0]).aspect : null;
    const out = [];
    for (let i = 0; i < originals.length; i++) {
      const own = photoPreflight(infos[i]).aspect;
      const tag = kind === 'story' ? 'story' : shape && Math.abs(shape - own) > 0.005 ? `r${Math.round(shape * 1000)}` : null;
      const dest = join(mediaDir, preparedName(basename(originals[i]), tag));
      if (!existsSync(dest)) await preparePhoto(originals[i], dest, kind === 'story' ? { story: true } : tag ? { aspect: shape } : {});
      out.push(dest);
    }
    return out;
  }
  // Never send temporary-link keys or server file paths of photos to the browser.
  const pub = ({ shareToken: _a, shareTokens: _b, imageFiles: _c, ...p }) => p;
  let nextCheckAt = null;

  // Quality measurements (VMAF etc.), saved so the Quality Lab and post pages can show them.
  const qualityDir = join(dataDir, 'quality');
  const qualityFile = join(dataDir, 'quality.json');
  const readQuality = () => { try { return JSON.parse(readFileSync(qualityFile, 'utf8')); } catch { return []; } };
  const saveQuality = (list) => { mkdirSync(dataDir, { recursive: true }); writeFileSync(qualityFile, JSON.stringify(list, null, 1)); };
  const safeIn = fileIn;
  const originalOf = (post) => safeMedia(post.source) || (post.file && existsSync(post.file) ? post.file : null);

  // Benchmarks: the same clips posted through different routes (Queue, the Instagram app, other
  // schedulers), each scored against the original. Results live in quality.json with a benchmarkId.
  const benchFile = join(dataDir, 'benchmarks.json');
  const readBench = () => { try { return JSON.parse(readFileSync(benchFile, 'utf8')); } catch { return []; } };
  const saveBench = (list) => { mkdirSync(dataDir, { recursive: true }); writeFileSync(benchFile, JSON.stringify(list, null, 1)); };
  async function benchEntry(benchmarkId, clip, label, servedPath, extra = {}) {
    const original = safeMedia(clip);
    // "instagram app" and "Instagram app" are the same route — reuse the spelling already in use.
    label = readQuality().find((q) => q.benchmarkId === benchmarkId && q.label?.toLowerCase() === label.toLowerCase())?.label || label;
    const result = await compare(original, servedPath);
    const entry = { id: `b-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, benchmarkId, route: 'bench', label, platform: 'instagram', original: basename(original), served: basename(servedPath), at: new Date().toISOString(), result, ...extra };
    saveQuality([...readQuality(), entry]);
    return entry;
  }

  // Saves a checked Instagram key and switches over live (used by paste-a-key and one-click connect).
  function applyConnection({ login, token, userId, acct }) {
    updateEnv(envFile, { IG_LOGIN: login, IG_ACCESS_TOKEN: token, IG_USER_ID: userId || '', DRY_RUN: '0' });
    tokens?.reset(token);
    ig = makeIg({ login, userId: userId || undefined, token, version: ig.version });
    account = acct; accountError = null;
  }

  async function measure(post) {
    const original = originalOf(post);
    if (!original) throw new Error('The original video is no longer in the Library.');
    const id = `${post.id}-instagram`;
    let served = safeIn(qualityDir, `${id}.mp4`);
    if (demo && !served) {
      // The demo has no Instagram to download from, so it makes the copy Instagram would serve:
      // one 1080-wide encode at Instagram's ~3.5 Mbps.
      mkdirSync(qualityDir, { recursive: true });
      served = join(qualityDir, `${id}.mp4`);
      await promisify(execFile)('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', original, '-vf', 'scale=1080:1920,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-b:v', '3.5M', '-maxrate', '4M', '-bufsize', '8M', '-an', '-movflags', '+faststart', served], { maxBuffer: 1 << 24 });
    }
    if (!demo) {
      if (!post.mediaId) throw new Error('That post has not been published yet.');
      const url = (await ig.media(post.mediaId)).media_url;
      if (!url) throw new Error("Instagram didn't return a download link. (It withholds it for Reels with licensed music.)");
      const tmp = await download(url);
      mkdirSync(qualityDir, { recursive: true });
      served = join(qualityDir, `${id}.mp4`);
      copyFileSync(tmp, served);
    }
    const result = await compare(original, served);
    const entry = { id, postId: post.id, platform: 'instagram', route: 'queue', original: basename(original), served: basename(served), at: new Date().toISOString(), result };
    // Re-read: measuring takes a minute and other results may have been saved meanwhile.
    saveQuality([...readQuality().filter((q) => q.id !== id), entry]);
    queue.update(post, {}, `quality measured: VMAF ${result.vmaf}`);
    return entry;
  }
  // "Post now" from the composer: no date to check, it goes out as soon as it's ready.
  const whenOf = (at, now) => (now === true ? new Date() : validTime(at));
  // Don't make "Post now" wait for the next scheduled check.
  const kick = () => setTimeout(() => (demo ? demoTick() : loop()), 50);
  const validTime = (at) => {
    const when = new Date(at);
    if (isNaN(when)) throw new Error('Pick a date and time.');
    if (when < Date.now()) throw new Error('That time is in the past.');
    return when;
  };
  const validCover = (ms, durationSec) => {
    if (ms == null || ms === '') return null;
    const n = Math.round(Number(ms));
    if (!Number.isFinite(n) || n < 0) throw new Error('Invalid cover frame.');
    return durationSec ? Math.min(n, Math.floor(durationSec * 1000) - 1) : n;
  };

  async function refreshAccount() {
    if (ig.dryRun) return;
    try {
      account = await ig.account();
      accountError = null;
    } catch (err) {
      account = null;
      accountError = err.message;
    }
  }

  // Only this Mac's browser, on this app's own page, may talk to the API.
  //  • Host check blocks DNS-rebinding (a website pointing its domain at 127.0.0.1)
  //  • Non-GET requests need our custom header, which other websites can't send
  //    without a CORS preflight — and we never approve preflights.
  const allowedHost = (h) => /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(h || '');
  // The public demo (its own link on Railway): anyone may look around. Nothing posts anyway, but
  // anything that costs real CPU or disk (uploads, re-encodes, quality measuring) is switched off.
  const publicDemo = !!demo?.public;
  const DEMO_FULL = 80; // posts — the demo resets itself every few hours
  // The demo studio's account a new post is for (falls back to the first one).
  const demoBrand = (b) => (demo?.brands?.length ? (demo.brands.some((x) => x.id === b) ? b : demo.brands[0].id) : null);
  const allowedOrigin = (o) => !o || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);

  // ---- Hosted mode (Railway etc.): on the public internet, so everything except the sign-in
  // page and Instagram's temporary video links needs a signed-in account (src/accounts.js).
  if (hosted && (!password || password.length < 12)) throw new Error('Hosted mode needs QUEUE_PASSWORD (12+ characters): the one-time setup code.');
  const accounts = hosted ? new Accounts(dataDir) : null;
  const oauth = hosted ? new OAuth({ origin: publicOrigin, fetchImpl: oauthFetch }) : null;
  const connect = hosted ? new Connect({ origin: publicOrigin, fetchImpl: oauthFetch }) : null;
  const setupHash = password ? createHash('sha256').update(password).digest() : null;
  const cookieOf = (req) => (/(?:^|;\s*)queue_session=([^;]+)/.exec(req.headers.cookie || '') || [])[1];
  const userOf = (req) => (hosted ? accounts.fromSession(cookieOf(req)) : null);
  const attempts = new Map(); // ip → { n, until } — 10 failed tries locks that address out for 15 min
  const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const locked = (ip) => { const a = attempts.get(ip); return a && a.n >= 10 && a.until > Date.now(); };
  const failed = (ip) => { const a = attempts.get(ip); attempts.set(ip, { n: a && a.until > Date.now() ? a.n + 1 : 1, until: Date.now() + 15 * 60_000 }); };
  const startSession = (req, res, u, body = {}) => {
    const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
    res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': `queue_session=${accounts.sessionFor(u)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}` });
    res.end(JSON.stringify({ ok: true, user: accounts.publicUser(u), ...body }));
  };
  const sameOrigin = (req) => { const o = req.headers.origin; return !o || o === `https://${req.headers.host}` || o === `http://${req.headers.host}`; };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const [, api, resource, id, action, sub] = url.pathname.split('/');
    // Instagram downloads staged videos from /v/<256-bit token>/… — no session, token only.
    if (hosted && files?.embedded && url.pathname.startsWith('/v/')) return files.handle(req, res);
    if (!hosted && !publicDemo && !allowedHost(req.headers.host)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    if (req.method !== 'GET' && (req.headers['x-queue'] !== '1' || !(hosted || publicDemo ? sameOrigin(req) : allowedOrigin(req.headers.origin)))) {
      return send(res, 403, { error: 'Forbidden' });
    }
    const me = userOf(req);
    if (hosted && req.method === 'GET' && url.pathname === '/api/auth/state') {
      const providers = Object.fromEntries(Object.keys(PROVIDERS).map((p) => [p, { on: oauth.configured(p), redirectUri: publicOrigin ? oauth.redirectUri(p) : null }]));
      return send(res, 200, { firstRun: accounts.firstRun, user: accounts.publicUser(me), providers });
    }
    // Continue with Google / Facebook.
    const oauthRoute = hosted && req.method === 'GET' && /^\/api\/auth\/(start|callback)\/(google|facebook)$/.exec(url.pathname);
    if (oauthRoute) {
      const [, step, p] = oauthRoute;
      const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
      const go = (to, cookies = []) => { res.writeHead(302, cookies.length ? { Location: to, 'Set-Cookie': cookies } : { Location: to }); res.end(); };
      if (step === 'start') {
        if (!oauth.configured(p)) return go(`/?setup=${p}`);
        const { url: to, state } = oauth.start(p);
        return go(to, [`queue_oauth=${state}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=600${secure}`]);
      }
      const clear = `queue_oauth=; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
      const ip = clientIp(req);
      if (locked(ip)) return go(`/?error=${encodeURIComponent('Too many tries. Wait 15 minutes, then try again.')}`, [clear]);
      try {
        const cookieState = (/(?:^|;\s*)queue_oauth=([^;]+)/.exec(req.headers.cookie || '') || [])[1];
        const who = await oauth.finish(p, { code: url.searchParams.get('code'), state: url.searchParams.get('state'), cookieState });
        const u = accounts.providerSignIn(who, ownerEmail);
        attempts.delete(ip);
        return go('/', [clear, `queue_session=${accounts.sessionFor(u)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`]);
      } catch (err) {
        failed(ip);
        return go(`/?error=${encodeURIComponent(err.message)}`, [clear]);
      }
    }
    if (hosted && req.method === 'POST' && ['/api/auth/signup', '/api/auth/signin', '/api/auth/reset'].includes(url.pathname)) {
      const ip = clientIp(req);
      if (locked(ip)) return send(res, 429, { error: 'Too many tries. Wait 15 minutes, then try again.' });
      let b = {}; try { b = await readJson(req); } catch {}
      if (url.pathname === '/api/auth/signup') {
        if (!accounts.firstRun) return send(res, 403, { error: 'This Queue already has an owner. Sign in instead.' });
        const ok = timingSafeEqual(createHash('sha256').update(String(b.setupCode || '')).digest(), setupHash);
        if (!ok) { failed(ip); return send(res, 401, { error: 'That setup code isn’t right. It’s QUEUE_PASSWORD in Railway → Variables.' }); }
        try { const u = await accounts.create(b); attempts.delete(ip); return startSession(req, res, u); }
        catch (err) { return send(res, 400, { error: err.message }); }
      }
      if (url.pathname === '/api/auth/reset') {
        const ok = timingSafeEqual(createHash('sha256').update(String(b.setupCode || '')).digest(), setupHash);
        if (!ok) { failed(ip); return send(res, 401, { error: 'That setup code isn’t right. It’s QUEUE_PASSWORD in Railway → Variables.' }); }
        try { const u = await accounts.resetPassword(b.email, b.password); attempts.delete(ip); return startSession(req, res, u); }
        catch (err) { return send(res, 400, { error: err.message }); }
      }
      const u = await accounts.signIn(b.email, b.password);
      if (!u) { failed(ip); return send(res, 401, { error: 'Wrong email or password.' }); }
      attempts.delete(ip);
      return startSession(req, res, u);
    }
    // Official platform logos (public/brand). Harmless, so they load before sign-in too.
    const brandFile = req.method === 'GET' && /^\/brand\/([a-z]+(?:-dark)?)\.svg$/.exec(url.pathname);
    if (brandFile) {
      const f = fileIn(join(root, 'public', 'brand'), `${brandFile[1]}.svg`);
      if (!f) return send(res, 404, { error: 'not found' });
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
      return createReadStream(f).pipe(res);
    }
    if (hosted && !me) {
      const name = url.pathname === '/' ? 'login.html' : url.pathname.slice(1);
      if (req.method === 'GET' && LOGIN_FILES.has(name)) {
        res.writeHead(200, { 'Content-Type': TYPES[extname(name)] + '; charset=utf-8', 'Cache-Control': 'no-store' });
        return createReadStream(join(root, 'public', name)).pipe(res);
      }
      if (url.pathname.startsWith('/api/')) return send(res, 401, { error: 'Signed out. Reload the page and sign in.' });
      res.writeHead(302, { Location: '/' });
      return res.end();
    }
    if (hosted && req.method === 'POST' && url.pathname === '/api/logout') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'queue_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' });
      return res.end(JSON.stringify({ ok: true }));
    }
    if (hosted && req.method === 'POST' && url.pathname === '/api/auth/password') {
      let b = {}; try { b = await readJson(req); } catch {}
      try { const u = await accounts.changePassword(me.id, b.current, b.next); return startSession(req, res, u); }
      catch (err) { return send(res, 400, { error: err.message }); }
    }    // One-click "Connect with Instagram" (hosted, signed in). Not configured → the Connect page shows the steps.
    const connectRoute = hosted && req.method === 'GET' && /^\/api\/connect\/(start|callback)\/(instagram)$/.exec(url.pathname);
    if (connectRoute) {
      const [, step, p] = connectRoute;
      const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
      const go = (to, cookies = []) => { res.writeHead(302, cookies.length ? { Location: to, 'Set-Cookie': cookies } : { Location: to }); res.end(); };
      if (step === 'start') {
        if (!connect.configured(p)) return go('/#/connect?setup=instagram');
        const { url: to, state } = connect.start(p);
        return go(to, [`queue_connect=${state}; Path=/api/connect; HttpOnly; SameSite=Lax; Max-Age=600${secure}`]);
      }
      const clear = `queue_connect=; Path=/api/connect; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
      try {
        const cookieState = (/(?:^|;\s*)queue_connect=([^;]+)/.exec(req.headers.cookie || '') || [])[1];
        const { token, userId } = await connect.finish(p, { code: url.searchParams.get('code'), state: url.searchParams.get('state'), cookieState });
        const candidate = makeIg({ login: 'instagram', token, version: ig.version, retries: 1, retryDelayMs: 300 });
        const acct = await candidate.account();
        applyConnection({ login: 'instagram', token, userId: '', acct });
        return go('/#/setup', [clear]);
      } catch (err) {
        return go(`/#/connect?error=${encodeURIComponent(err.message)}`, [clear]);
      }
    }

    try {
      // The app itself: a fixed allowlist of files, never arbitrary paths.
      if (req.method === 'GET' && (url.pathname === '/' || PUBLIC_FILES.has(url.pathname.slice(1)))) {
        const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
        res.writeHead(200, { 'Content-Type': TYPES[extname(name)] + '; charset=utf-8', 'Cache-Control': 'no-store' });
        return createReadStream(join(root, 'public', name)).pipe(res);
      }

      // Video preview, with range support so the <video> tag can seek.
      if (req.method === 'GET' && url.pathname.startsWith('/media/')) {
        const file = safeMedia(decodeURIComponent(url.pathname.slice(7)));
        if (!file) return send(res, 404, { error: 'not found' });
        return sendFile(req, res, file, TYPES[extname(file).toLowerCase()] || 'application/octet-stream');
      }

      // Served copies kept by quality measurements, for the side-by-side viewer.
      if (req.method === 'GET' && url.pathname.startsWith('/quality-media/')) {
        const file = safeIn(qualityDir, decodeURIComponent(url.pathname.slice(15)));
        if (!file) return send(res, 404, { error: 'not found' });
        return sendFile(req, res, file, 'video/mp4');
      }
      // Demo photos (avatar, carousel and story frames). Only exists in the demo.
      if (req.method === 'GET' && url.pathname.startsWith('/demo-assets/') && demo?.assetsDir) {
        const file = safeIn(demo.assetsDir, decodeURIComponent(url.pathname.slice(13)));
        if (!file || !/\.(jpe?g|png)$/i.test(file)) return send(res, 404, { error: 'not found' });
        return sendFile(req, res, file, TYPES[extname(file).toLowerCase()]);
      }

      if (api !== 'api') return send(res, 404, { error: 'not found' });

      // What the demo pretends is connected. The real app only knows Instagram.
      if (req.method === 'GET' && resource === 'extras') {
        let photos = [];
        // Sample photos for the composer: not the brand mark or the team's profile pictures.
        if (demo?.assetsDir) try { photos = readdirSync(demo.assetsDir).filter((f) => !f.startsWith('.') && /\.jpe?g$/i.test(f) && f !== demo.account.avatar && !/^(team-|brand-|avatar\.)|-logo\./.test(f)).sort(); } catch {}
        return send(res, 200, demo ? { demo: true, public: publicDemo, resetHours: demo.resetHours || null, account: demo.account, platforms: demo.platforms, brands: demo.brands || null, team: demo.team || null, activity: demo.activity || [], photos } : { demo: false, account: null, platforms: null, brands: null, team: null, activity: [], photos: [] });
      }

      // Your recent Instagram posts (including ones made in other apps), to pick for a benchmark.
      if (req.method === 'GET' && resource === 'instagram' && id === 'recent') {
        if (demo || ig.dryRun) return send(res, 200, { media: [], reason: demo ? 'demo' : 'dryrun' });
        const media = (await ig.recentMedia(24)).filter((m) => m.media_type === 'VIDEO' || m.media_type === 'REELS');
        return send(res, 200, { media });
      }

      if (resource === 'benchmarks') {
        if (req.method === 'GET' && !id) return send(res, 200, { benchmarks: readBench() });
        if (req.method === 'POST' && !id) {
          const { name } = await readJson(req);
          const clean = String(name || '').trim().slice(0, 60);
          if (!clean) return send(res, 400, { error: 'Give the benchmark a name.' });
          const b = { id: `bm-${Date.now().toString(36)}`, name: clean, createdAt: new Date().toISOString() };
          saveBench([...readBench(), b]);
          return send(res, 200, { benchmark: b });
        }
        const bench = readBench().find((b) => b.id === id);
        if (id && !bench) return send(res, 404, { error: 'No benchmark with that id.' });
        if (req.method === 'DELETE' && id && !action) {
          const gone = readQuality().filter((q) => q.benchmarkId === id);
          for (const q of gone) { const f = safeIn(qualityDir, q.served); if (f) try { unlinkSync(f); } catch {} }
          saveQuality(readQuality().filter((q) => q.benchmarkId !== id));
          saveBench(readBench().filter((b) => b.id !== id));
          return send(res, 200, { ok: true });
        }
        if (action === 'entries' && req.method === 'DELETE' && sub) {
          const q = readQuality().find((x) => x.id === sub && x.benchmarkId === id);
          if (!q) return send(res, 404, { error: 'No result with that id.' });
          const f = safeIn(qualityDir, q.served); if (f) try { unlinkSync(f); } catch {}
          saveQuality(readQuality().filter((x) => x.id !== sub));
          return send(res, 200, { ok: true });
        }
        if (action === 'entries' && req.method === 'POST') {
          if (publicDemo) return send(res, 400, { error: 'Adding results is switched off in the public demo.' });
          // Either { clip, route, mediaId } as JSON (pulled from Instagram), or the downloaded
          // video as the request body with ?clip=&route= (for posts Instagram won't hand over).
          const isJson = (req.headers['content-type'] || '').includes('application/json');
          const body = isJson ? await readJson(req) : null;
          const clip = isJson ? body.clip : url.searchParams.get('clip');
          const label = String((isJson ? body.route : url.searchParams.get('route')) || '').trim().slice(0, 40);
          const file = safeMedia(clip);
          if (!file || /\.(conformed|sdr)\.mp4$/.test(String(clip))) return send(res, 400, { error: 'Pick the original clip from your Library.' });
          if (!label) return send(res, 400, { error: 'Name the route (for example "Instagram app" or "Buffer").' });
          mkdirSync(qualityDir, { recursive: true });
          const served = join(qualityDir, `bench-${Date.now().toString(36)}.mp4`);
          let extra = {};
          if (isJson) {
            if (demo || ig.dryRun) return send(res, 400, { error: 'Connect Instagram to pull posts. You can upload the downloaded file instead.' });
            if (!body.mediaId) return send(res, 400, { error: 'Pick a post.' });
            const m = await ig.media(String(body.mediaId));
            if (!m.media_url) return send(res, 400, { error: "Instagram didn't return a download link for that post. (It withholds it for Reels with licensed music.) Upload the file instead." });
            copyFileSync(await download(m.media_url), served);
            extra = { mediaId: String(body.mediaId), permalink: m.permalink || null };
          } else {
            await pipeline(req, createWriteStream(served));
          }
          try { return send(res, 200, { entry: await benchEntry(id, clip, label, served, extra) }); }
          catch { try { unlinkSync(served); } catch {} return send(res, 400, { error: "Couldn't measure that file. Is it a readable video?" }); }
        }
      }

      if (resource === 'quality') {
        if (req.method === 'GET' && !id) return send(res, 200, { comparisons: readQuality() });
        if (req.method === 'POST' && id && action === 'measure') {
          if (publicDemo) return send(res, 400, { error: 'Measuring is switched off in the public demo. Every posted clip here already has its score.' });
          const post = queue.get(id);
          if (!post) return send(res, 404, { error: 'No post with that id.' });
          return send(res, 200, { comparison: await measure(post) });
        }
      }

      // The demo's photo carousels and stories, from its sample photos (the real app uses /api/schedule).
      if (req.method === 'POST' && resource === 'demo' && id === 'post') {
        if (!demo) return send(res, 404, { error: 'not found' });
        const { kind, images = [], caption = '', at, platforms = ['instagram'], brand, now } = await readJson(req);
        if (!['photos', 'story'].includes(kind)) return send(res, 400, { error: 'Unknown post type.' });
        const imgs = images.map((n) => basename(String(n))).filter((n) => safeIn(demo.assetsDir, n));
        if (!imgs.length) return send(res, 400, { error: 'Pick at least one photo.' });
        const post = queue.add({ file: null, caption, publishAt: whenOf(at, now), kind, images: imgs, platforms, destinations: platforms.map((p) => ({ platform: p, format: kind === 'story' ? 'Story' : 'Carousel', status: 'queued' })), by: demo.team?.you || null, brand: demoBrand(brand) });
        if (now === true) kick();
        return send(res, 200, { post });
      }

      if (req.method === 'GET' && resource === 'status') {
        if (demo) return send(res, 200, { demo: true, dryRun: false, login: 'instagram', uploadMode: 'url', ffmpeg: hasFfmpeg(), cloudflared: true, account: demo.account.username, accountError: null, tokenDaysLeft: 54, nextCheckAt, tickMs });
        return send(res, 200, {
          dryRun: ig.dryRun,
          login: ig.login,
          uploadMode: ig.uploadMode,
          ffmpeg: hasFfmpeg(),
          cloudflared: hosted || hasCloudflared(), // hosted: the app serves the video links itself
          account: account?.username || null,
          accountError,
          tokenDaysLeft: tokens?.daysLeft() ?? null,
          hosted,
          user: hosted ? accounts.publicUser(me) : null,
          oneClick: hosted ? { instagram: connect.configured('instagram'), redirectUri: publicOrigin ? connect.redirectUri('instagram') : null } : null,
          nextCheckAt,
          tickMs,
        });
      }

      // Library: every video copy Queue holds, and which post (if any) uses it.
      // One video's full check, so the composer can reopen something already in the Library.
      if (req.method === 'GET' && resource === 'media' && id) {
        const name = basename(decodeURIComponent(id));
        const file = safeMedia(name);
        if (!file || /\.(conformed|sdr)\.mp4$/.test(name) || isPreparedPhoto(name)) return send(res, 404, { error: "That file is no longer in the Library." });
        if (photoTypeOf(file)) {
          try { const info = await photoInfo(file); return send(res, 200, { name, kind: 'photo', preview: preparedName(name), info, check: photoPreflight(info) }); }
          catch (err) { return send(res, 400, { error: err.message }); }
        }
        try { const { info, result } = await summarizeAsync(file); return send(res, 200, { name, info, result }); }
        catch { return send(res, 400, { error: "That file isn't a readable video." }); }
      }

      if (req.method === 'GET' && resource === 'media') {
        const stem = mediaStem;
        const users = new Map();
        for (const p of queue.posts) {
          for (const k of new Set(filesOf(p).map((f) => stem(basename(f))))) { if (!users.has(k)) users.set(k, []); users.get(k).push({ id: p.id, status: p.status, publishAt: p.publishAt, caption: p.caption, kind: p.kind }); }
        }
        let names = [];
        try { names = readdirSync(mediaDir).filter((f) => !f.startsWith('.')); } catch {}
        const base = names.flatMap((name) => {
          let st; try { st = statSync(join(mediaDir, name)); } catch { return []; }
          if (!st.isFile()) return [];
          const video = /\.(mp4|mov|m4v)$/i.test(name);
          // Photos are recognised by their bytes, like uploads. Prepared JPEGs are the "fixed copies".
          const photo = !video && (isPreparedPhoto(name) || (() => { try { return !!photoTypeOf(join(mediaDir, name)); } catch { return false; } })());
          if (!video && !photo) return [];
          const fixedCopy = video ? /\.(conformed|sdr)\.mp4$/.test(name) : isPreparedPhoto(name);
          const preview = photo && !fixedCopy ? preparedName(name) : null;
          return [{ name, type: photo ? 'photo' : 'video', ...(preview ? { preview } : {}), bytes: st.size, modified: st.mtime.toISOString(), fixedCopy, posts: users.get(stem(name)) || [] }];
        });
        const items = (await mapLimit(base, 4, async (it) => ({ ...it, meta: it.fixedCopy ? null : it.type === 'photo' ? await photoMetaOf(fileIn(mediaDir, it.preview) || join(mediaDir, it.name)) : await metaOf(join(mediaDir, it.name)) })))
          .sort((a, b) => b.modified.localeCompare(a.modified));
        return send(res, 200, { items });
      }

      // Settings (read-only for now — values come from .env).
      if (req.method === 'GET' && resource === 'config') {
        let autostart = false; try { autostart = autostartOn(); } catch {}
        return send(res, 200, { ...settings, login: ig.login, uploadMode: ig.uploadMode, autostart, graphVersion: ig.version });
      }
      // Connect Instagram from the app: check the key with Instagram first, then save it to .env
      // and switch over live. The key never comes back to the browser.
      if (req.method === 'POST' && resource === 'connect') {
        if (demo) return send(res, 400, { error: "The demo can't connect a real account. Run Queue with npm start." });
        const b = await readJson(req);
        const login = b.login === 'facebook' ? 'facebook' : 'instagram';
        const token = String(b.token || '').trim();
        const userId = String(b.userId || '').trim();
        if (token.length < 8 || /\s/.test(token)) return send(res, 400, { error: 'That doesn\'t look like an access token. Copy the whole long code from Meta\'s dashboard.' });
        if (userId && !/^\d{1,25}$/.test(userId)) return send(res, 400, { error: 'The Instagram user ID is a long number, like 17841400000000000.' });
        if (login === 'facebook' && !userId) return send(res, 400, { error: 'With a Facebook Page login, the Instagram user ID is required.' });
        const candidate = makeIg({ login, userId: userId || undefined, token, version: ig.version, retries: 1, retryDelayMs: 300 });
        let acct;
        try { acct = await candidate.account(); }
        catch (err) {
          const bad = err.code === 190 || err.status === 401;
          return send(res, 400, { error: bad ? "Instagram didn't accept that key. It may be incomplete, expired, or from a different app. Generate a new one and paste it again." : `Instagram couldn't be reached to check the key: ${err.message}` });
        }
        applyConnection({ login, token, userId, acct });
        return send(res, 200, { account: acct.username, login, uploadMode: ig.uploadMode, needsCloudflared: ig.uploadMode === 'url' && !hosted && !hasCloudflared() });
      }
      if (req.method === 'POST' && resource === 'disconnect') {
        if (demo) return send(res, 400, { error: "The demo can't disconnect." });
        updateEnv(envFile, { IG_ACCESS_TOKEN: '' });
        tokens?.reset(null);
        ig = makeIg({ login: ig.login, userId: ig.userId, version: ig.version, dryRun: true });
        account = null; accountError = null;
        return send(res, 200, { ok: true });
      }

      if (req.method === 'PATCH' && resource === 'config') {
        const saved = saveSettings(dataDir, await readJson(req));
        settings = { ...settings, ...saved };
        if (!settings.postingTimes.includes(settings.defaultTime)) settings.defaultTime = settings.postingTimes[0];
        stageWindowMin = settings.stageWindowMin; lateLimitMin = settings.lateLimitMin;
        let autostart = false; try { autostart = autostartOn(); } catch {}
        return send(res, 200, { ...settings, login: ig.login, uploadMode: ig.uploadMode, autostart, graphVersion: ig.version });
      }

      if (resource === 'storage') {
        if (req.method === 'GET') return send(res, 200, mediaReport(mediaDir, queue.posts).summary);
        if (req.method === 'POST' && id === 'clear') return send(res, 200, clearMedia(mediaDir, queue));
      }

      if (req.method === 'POST' && resource === 'upload') {
        if (publicDemo) { req.resume(); return send(res, 400, { error: 'Uploads are off in the public demo. Pick a video from the Library instead.' }); }
        const original = basename(url.searchParams.get('name') || 'video.mp4').replace(/[^\w.\- ]/g, '_')
          .replace(/\.photo(-[\w]+)?(\.jpe?g)$/i, '_photo$1$2').replace(/\.(conformed|sdr)(\.mp4)$/i, '_$1$2'); // never look like one of Queue's own copies
        const name = `${Date.now()}-${original}`;
        const dest = join(mediaDir, name);
        await pipeline(req, createWriteStream(dest));
        // A photo (JPEG / PNG / HEIC, recognised by its bytes, not its name): keep the original,
        // and make the Instagram-ready JPEG straight away so the check and the preview are real.
        if (photoTypeOf(dest)) {
          const preview = preparedName(name);
          try {
            const { info, check } = await preparePhoto(dest, join(mediaDir, preview));
            return send(res, 200, { name, kind: 'photo', preview, info, check, result: check });
          } catch (err) {
            for (const f of [dest, join(mediaDir, preview)]) try { unlinkSync(f); } catch {}
            return send(res, 400, { error: /readable photo|px wide|HEIC/.test(err.message) ? err.message : "That photo couldn't be read." });
          }
        }
        try {
          const { info, result } = await summarizeAsync(dest);
          if (!info.video?.width || !Number.isFinite(info.durationSec)) throw new Error('not a video');
          return send(res, 200, { name, info, result });
        } catch {
          unlinkSync(dest);
          return send(res, 400, { error: "That file isn't a readable video or photo." });
        }
      }

      if (req.method === 'POST' && (resource === 'schedule' || (resource === 'demo' && id === 'post')) && publicDemo && queue.posts.length >= DEMO_FULL) {
        return send(res, 429, { error: 'The demo is full. It resets itself every few hours.' });
      }
      if (req.method === 'POST' && resource === 'schedule') {
        const { name, at, caption = '', coverOffsetMs, platforms, kind, images, brand, now } = await readJson(req);
        // Photos (one photo or a carousel) and stories. Instagram only, by temporary link.
        if (kind === 'photos' || kind === 'story') {
          const names = Array.isArray(images) ? images.map((n) => basename(String(n))) : [];
          if (!names.length) return send(res, 400, { error: kind === 'story' ? 'Add at least one frame.' : 'Add at least one photo.' });
          if (names.length > 10) return send(res, 400, { error: kind === 'story' ? 'A story can have up to 10 frames.' : 'Instagram takes up to 10 photos per carousel.' });
          if (new Set(names).size !== names.length) return send(res, 400, { error: 'The same photo is in there twice.' });
          const originals = names.map(safePhoto);
          if (originals.some((f) => !f)) return send(res, 400, { error: 'Upload the photos first.' });
          const when = whenOf(at, now);
          if (typeof caption !== 'string' || caption.length > 2200) return send(res, 400, { error: 'Caption is over 2,200 characters.' });
          if (!ig.dryRun && !demo) {
            if (hosted && !files?.publicBaseUrl) return send(res, 400, { error: 'Hosted mode needs a public address (RAILWAY_PUBLIC_DOMAIN or PUBLIC_BASE_URL) so Instagram can fetch the photos.' });
            if (!files || (!hosted && !files.publicBaseUrl && !hasCloudflared())) return send(res, 400, { error: "Photos go to Instagram by temporary link, and cloudflared isn't installed. Run: brew install cloudflared" });
          }
          const prepared = await preparePostPhotos(kind, originals);
          const post = queue.add({ file: null, caption: kind === 'story' ? '' : caption, publishAt: when, kind, images: prepared.map((f) => basename(f)), imageFiles: prepared, sources: names, platforms: ['instagram'], destinations: demo ? [{ platform: 'instagram', format: kind === 'story' ? 'Story' : names.length > 1 ? 'Carousel' : 'Photo', status: 'queued' }] : null });
          if (now === true) kick();
          return send(res, 200, { post: pub(post) });
        }
        const file = safeMedia(name);
        if (!file) return send(res, 400, { error: 'Upload the video first.' });
        const when = whenOf(at, now);
        if (caption.length > 2200) return send(res, 400, { error: 'Caption is over 2,200 characters.' });

        const { info, result } = await summarizeAsync(file);
        if (result.needsTrim) return send(res, 400, { error: 'Duration is out of range. Trim it in your editor.' });
        const cover = validCover(coverOffsetMs, info.durationSec);
        // Public demo: no re-encoding on the server. It uses the fixed copy if one exists, else the original.
        const fixedCopy = (tag) => fileIn(mediaDir, basename(file).replace(/\.[^.]+$/, `.${tag}.mp4`));
        const ready = publicDemo ? (result.plan === 'none' ? file : fixedCopy('conformed') || fixedCopy('sdr.conformed') || fixedCopy('sdr') || file) : await conformAsync(info, result.plan, SPEC);
        const recheck = publicDemo ? { ok: true } : preflight(await probeAsync(ready), SPEC);
        if (!recheck.ok) return send(res, 400, { error: 'Still failing after the fix: ' + recheck.issues.map((i) => i.msg).join('; ') });

        const FORMAT = { instagram: 'Reel', youtubeshorts: 'Short', tiktok: 'Video', facebook: 'Reel', linkedin: 'Video' };
        const dests = demo && Array.isArray(platforms) && platforms.length ? platforms.filter((p) => FORMAT[p]) : ['instagram'];
        const post = queue.add({ file: ready, caption, publishAt: when, coverOffsetMs: cover, fix: result.plan, source: basename(file), platforms: dests, destinations: demo ? dests.map((p) => ({ platform: p, format: FORMAT[p], status: 'queued' })) : null, by: demo?.team?.you || null, brand: demoBrand(brand) });
        if (now === true) kick();
        return send(res, 200, { post: pub(post), fixed: result.plan });
      }

      if (resource === 'queue') {
        if (req.method === 'GET' && !id) {
          const sorted = [...queue.posts].sort((a, b) => a.publishAt.localeCompare(b.publishAt));
          // shareToken is a live public link key — it never leaves the server.
          const posts = await mapLimit(sorted, 4, async ({ log: _log, shareToken: _t, shareTokens: _ts, imageFiles: _f, ...p }) => ({ ...p, media: p.file ? basename(p.file) : null, meta: await metaOf(p.file), lastLog: _log?.at(-1)?.msg || null }));
          return send(res, 200, { posts });
        }
        if (req.method === 'PATCH' && id) {
          const { caption, at, coverOffsetMs } = await readJson(req);
          // Validate everything BEFORE touching the post, so a rejected edit changes nothing.
          if (caption !== undefined && caption.length > 2200) return send(res, 400, { error: 'Caption is over 2,200 characters.' });
          const patch = { caption };
          if (at !== undefined) patch.publishAt = validTime(at);
          if (coverOffsetMs !== undefined) patch.coverOffsetMs = validCover(coverOffsetMs);
          const existing = queue.get(id);
          const oldTokens = existing ? tokensOf(existing) : []; // read now: edit() clears them in place
          const post = queue.edit(id, patch);
          if (post && files) for (const t of oldTokens) await files.unshare(t);
          return post ? send(res, 200, { post: pub(post) }) : send(res, 404, { error: 'No post with that id.' });
        }
        if (req.method === 'GET' && id && action === 'log') {
          const post = queue.get(id);
          return post ? send(res, 200, { log: post.log || [] }) : send(res, 404, { error: 'No post with that id.' });
        }
        if (req.method === 'POST' && id && action === 'post-now') {
          const post = queue.postNow(id);
          if (post) kick();
          return post ? send(res, 200, { post: pub(post) }) : send(res, 400, { error: 'That post has already gone out, or is no longer in the queue.' });
        }
        if (req.method === 'POST' && id && action === 'retry') {
          const before = queue.get(id);
          const oldTokens = before ? tokensOf(before) : []; // read now: retry() clears them in place
          const post = queue.retry(id);
          if (post && files) for (const t of oldTokens) await files.unshare(t);
          return post ? send(res, 200, { post: pub(post) }) : send(res, 400, { error: 'Only failed posts can be retried.' });
        }
        if (req.method === 'DELETE' && id) {
          const post = queue.get(id);
          if (post?.status === 'published') return send(res, 400, { error: "Already posted. Delete it in Instagram." });
          if (post && files) for (const t of tokensOf(post)) await files.unshare(t);
          const ok = queue.remove(id);
          return send(res, ok ? 200 : 404, { ok });
        }
      }

      send(res, 404, { error: 'not found' });
    } catch (err) {
      if (res.headersSent) return res.destroy();
      send(res, 400, { error: err.message });
    }
  });
  server.on('clientError', (_err, socket) => socket.destroy());

  server.listen(port, host || (hosted ? '0.0.0.0' : '127.0.0.1'));

  const loop = async () => {
    nextCheckAt = new Date(Date.now() + tickMs).toISOString();
    try {
      if (tokens) await tokens.maybeRefresh(ig, { log });
      await tick(queue, ig, { files, stageWindowMin, lateLimitMin, notify: notifyGated, log });
    } catch (err) {
      log(`scheduler error: ${err.message}`);
    }
  };
  // The demo never talks to Instagram. Its "scheduler" just marks posts as posted when
  // their time comes (or straight away after Post now / Retry), so the flow can be tried.
  const demoTick = () => {
    nextCheckAt = new Date(Date.now() + tickMs).toISOString();
    for (const p of queue.posts) {
      const due = new Date(p.publishAt) <= Date.now() || p.allowLate;
      if (!['queued', 'staged', 'ready'].includes(p.status) || !due) continue;
      const done = new Date().toISOString();
      queue.update(p, { status: 'published', publishedAt: done, permalink: 'https://www.instagram.com/', mediaId: `demo${p.id}`, error: null, allowLate: false,
        destinations: (p.destinations || []).map((d) => ({ ...d, status: d.platform === 'tiktok' ? 'drafts' : 'posted' })) }, `published demo${p.id} (${Math.max(0, Math.round((Date.now() - new Date(p.publishAt)) / 1000))}s after target)`);
    }
  };
  let timers;
  if (demo) { demoTick(); timers = [setInterval(demoTick, tickMs)]; }
  else {
    refreshAccount();
    loop();
    timers = [setInterval(loop, tickMs), setInterval(refreshAccount, 30 * 60_000)];
  }

  return {
    server,
    ready: new Promise((r) => server.once('listening', r)),
    port: () => server.address()?.port,
    async stop() {
      timers.forEach(clearInterval);
      const closed = new Promise((r) => server.close(r));
      server.closeAllConnections();
      await closed;
      if (files) await files.stop();
    },
  };
}
