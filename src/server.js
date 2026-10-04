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
import { tick } from './worker.js';
import { mediaReport, clearMedia } from './storage.js';
import { readdirSync, statSync } from 'node:fs';
import { isLoaded as autostartOn } from './autostart.js';
import { compare, download } from './quality.js';
import { mergeSettings, saveSettings } from './settings.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';

const TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.m4v': 'video/mp4' };
const PUBLIC_FILES = new Set(['index.html', 'styles.css', 'app.js', 'pages.js']);

export function startServer({ root, queue, ig, files = null, tokens = null, port = 4400, stageWindowMin = 120, lateLimitMin = 120, notify = () => {}, log = console.log, tickMs = 30_000, mediaDir = join(root, 'media'), dataDir = join(root, 'data'), demo = null, notifyOn = true }) {
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
  const allowedOrigin = (o) => !o || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const [, api, resource, id, action, sub] = url.pathname.split('/');
    if (!allowedHost(req.headers.host)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    if (req.method !== 'GET' && (req.headers['x-queue'] !== '1' || !allowedOrigin(req.headers.origin))) {
      return send(res, 403, { error: 'Forbidden' });
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
        if (demo?.assetsDir) try { photos = readdirSync(demo.assetsDir).filter((f) => /\.jpe?g$/i.test(f) && f !== demo.account.avatar).sort(); } catch {}
        return send(res, 200, demo ? { demo: true, account: demo.account, platforms: demo.platforms, photos } : { demo: false, account: null, platforms: null, photos: [] });
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
          const post = queue.get(id);
          if (!post) return send(res, 404, { error: 'No post with that id.' });
          return send(res, 200, { comparison: await measure(post) });
        }
      }

      // Photo carousels and stories: the demo shows the flow; the real scheduler can't post them yet.
      if (req.method === 'POST' && resource === 'demo' && id === 'post') {
        if (!demo) return send(res, 404, { error: 'not found' });
        const { kind, images = [], caption = '', at, platforms = ['instagram'] } = await readJson(req);
        if (!['photos', 'story'].includes(kind)) return send(res, 400, { error: 'Unknown post type.' });
        const imgs = images.map((n) => basename(String(n))).filter((n) => safeIn(demo.assetsDir, n));
        if (!imgs.length) return send(res, 400, { error: 'Pick at least one photo.' });
        const post = queue.add({ file: null, caption, publishAt: validTime(at), kind, images: imgs, platforms, destinations: platforms.map((p) => ({ platform: p, format: kind === 'story' ? 'Story' : 'Carousel', status: 'queued' })) });
        return send(res, 200, { post });
      }

      if (req.method === 'GET' && resource === 'status') {
        if (demo) return send(res, 200, { demo: true, dryRun: false, login: 'instagram', uploadMode: 'url', ffmpeg: hasFfmpeg(), cloudflared: true, account: demo.account.username, accountError: null, tokenDaysLeft: 54, nextCheckAt, tickMs });
        return send(res, 200, {
          dryRun: ig.dryRun,
          login: ig.login,
          uploadMode: ig.uploadMode,
          ffmpeg: hasFfmpeg(),
          cloudflared: hasCloudflared(),
          account: account?.username || null,
          accountError,
          tokenDaysLeft: tokens?.daysLeft() ?? null,
          nextCheckAt,
          tickMs,
        });
      }

      // Library: every video copy Queue holds, and which post (if any) uses it.
      // One video's full check, so the composer can reopen something already in the Library.
      if (req.method === 'GET' && resource === 'media' && id) {
        const name = basename(decodeURIComponent(id));
        const file = safeMedia(name);
        if (!file || /\.(conformed|sdr)\.mp4$/.test(name)) return send(res, 404, { error: 'That video is no longer in the Library.' });
        try { const { info, result } = await summarizeAsync(file); return send(res, 200, { name, info, result }); }
        catch { return send(res, 400, { error: "That file isn't a readable video." }); }
      }

      if (req.method === 'GET' && resource === 'media') {
        const stem = (n) => n.replace(/\.(conformed|sdr)\.mp4$/, '').replace(/\.[^.]+$/, '');
        const users = new Map();
        for (const p of queue.posts) { if (!p.file) continue; const k = stem(p.source || basename(p.file)); if (!users.has(k)) users.set(k, []); users.get(k).push({ id: p.id, status: p.status, publishAt: p.publishAt, caption: p.caption }); }
        let files = [];
        try { files = readdirSync(mediaDir).filter((f) => !f.startsWith('.') && /\.(mp4|mov|m4v)$/i.test(f)); } catch {}
        const base = files.flatMap((name) => { let st; try { st = statSync(join(mediaDir, name)); } catch { return []; } return [{ name, bytes: st.size, modified: st.mtime.toISOString(), fixedCopy: /\.(conformed|sdr)\.mp4$/.test(name), posts: users.get(stem(name)) || [] }]; });
        const items = (await mapLimit(base, 4, async (it) => ({ ...it, meta: it.fixedCopy ? null : await metaOf(join(mediaDir, it.name)) })))
          .sort((a, b) => b.modified.localeCompare(a.modified));
        return send(res, 200, { items });
      }

      // Settings (read-only for now — values come from .env).
      if (req.method === 'GET' && resource === 'config') {
        let autostart = false; try { autostart = autostartOn(); } catch {}
        return send(res, 200, { ...settings, login: ig.login, uploadMode: ig.uploadMode, autostart, graphVersion: ig.version });
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
        const original = basename(url.searchParams.get('name') || 'video.mp4').replace(/[^\w.\- ]/g, '_');
        const name = `${Date.now()}-${original}`;
        const dest = join(mediaDir, name);
        await pipeline(req, createWriteStream(dest));
        try {
          const { info, result } = await summarizeAsync(dest);
          return send(res, 200, { name, info, result });
        } catch {
          unlinkSync(dest);
          return send(res, 400, { error: "That file isn't a readable video." });
        }
      }

      if (req.method === 'POST' && resource === 'schedule') {
        const { name, at, caption = '', coverOffsetMs, platforms } = await readJson(req);
        const file = safeMedia(name);
        if (!file) return send(res, 400, { error: 'Upload the video first.' });
        const when = validTime(at);
        if (caption.length > 2200) return send(res, 400, { error: 'Caption is over 2,200 characters.' });

        const { info, result } = await summarizeAsync(file);
        if (result.needsTrim) return send(res, 400, { error: 'Duration is out of range. Trim it in your editor.' });
        const cover = validCover(coverOffsetMs, info.durationSec);
        const ready = await conformAsync(info, result.plan, SPEC);
        const recheck = preflight(await probeAsync(ready), SPEC);
        if (!recheck.ok) return send(res, 400, { error: 'Still failing after the fix: ' + recheck.issues.map((i) => i.msg).join('; ') });

        const FORMAT = { instagram: 'Reel', youtubeshorts: 'Short', tiktok: 'Video', facebook: 'Reel', linkedin: 'Video' };
        const dests = demo && Array.isArray(platforms) && platforms.length ? platforms.filter((p) => FORMAT[p]) : ['instagram'];
        const post = queue.add({ file: ready, caption, publishAt: when, coverOffsetMs: cover, fix: result.plan, source: basename(file), platforms: dests, destinations: demo ? dests.map((p) => ({ platform: p, format: FORMAT[p], status: 'queued' })) : null });
        return send(res, 200, { post: { ...post, shareToken: undefined }, fixed: result.plan });
      }

      if (resource === 'queue') {
        if (req.method === 'GET' && !id) {
          const sorted = [...queue.posts].sort((a, b) => a.publishAt.localeCompare(b.publishAt));
          // shareToken is a live public link key — it never leaves the server.
          const posts = await mapLimit(sorted, 4, async ({ log: _log, shareToken: _t, ...p }) => ({ ...p, media: p.file ? basename(p.file) : null, meta: await metaOf(p.file), lastLog: _log?.at(-1)?.msg || null }));
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
          const post = queue.edit(id, patch);
          if (post && existing?.shareToken && files) await files.unshare(existing.shareToken);
          return post ? send(res, 200, { post: { ...post, shareToken: undefined } }) : send(res, 404, { error: 'No post with that id.' });
        }
        if (req.method === 'GET' && id && action === 'log') {
          const post = queue.get(id);
          return post ? send(res, 200, { log: post.log || [] }) : send(res, 404, { error: 'No post with that id.' });
        }
        if (req.method === 'POST' && id && action === 'post-now') {
          const post = queue.postNow(id);
          return post ? send(res, 200, { post: { ...post, shareToken: undefined } }) : send(res, 400, { error: 'Only missed posts can be posted now.' });
        }
        if (req.method === 'POST' && id && action === 'retry') {
          const before = queue.get(id);
          const post = queue.retry(id);
          if (post && before?.shareToken && files) await files.unshare(before.shareToken);
          return post ? send(res, 200, { post: { ...post, shareToken: undefined } }) : send(res, 400, { error: 'Only failed posts can be retried.' });
        }
        if (req.method === 'DELETE' && id) {
          const post = queue.get(id);
          if (post?.status === 'published') return send(res, 400, { error: "Already posted. Delete it in Instagram." });
          if (post?.shareToken && files) await files.unshare(post.shareToken);
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

  server.listen(port, '127.0.0.1');

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
