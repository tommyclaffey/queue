// Local web UI + scheduler in one process. No dependencies.
// Binds to 127.0.0.1 only — nothing on your network can reach it.
import { createServer } from 'node:http';
import { createReadStream, createWriteStream, existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { sendFile } from './range.js';
import { pipeline } from 'node:stream/promises';
import { join, basename, extname } from 'node:path';
import { INSTAGRAM_REELS as SPEC } from './specs.js';
import { hasFfmpeg, probe } from './probe.js';
import { preflight } from './preflight.js';
import { conformAsync } from './conform.js';
import { hasCloudflared } from './fileshare.js';
import { tick } from './worker.js';

const TYPES = { '.html': 'text/html', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.m4v': 'video/mp4' };

export function startServer({ root, queue, ig, files = null, tokens = null, port = 4400, stageWindowMin = 120, log = console.log, tickMs = 30_000, mediaDir = join(root, 'media') }) {
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
  const safeMedia = (name) => {
    const clean = basename(String(name || ''));
    const p = join(mediaDir, clean);
    return clean && existsSync(p) ? p : null;
  };
  const summarize = (file) => {
    const info = probe(file);
    return { info, result: preflight(info, SPEC) };
  };
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
    const [, api, resource, id, action] = url.pathname.split('/');
    if (!allowedHost(req.headers.host)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    if (req.method !== 'GET' && (req.headers['x-uncut'] !== '1' || !allowedOrigin(req.headers.origin))) {
      return send(res, 403, { error: 'Forbidden' });
    }
    try {
      if (req.method === 'GET' && url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
        return createReadStream(join(root, 'public', 'index.html')).pipe(res);
      }

      // Video preview, with range support so the <video> tag can seek.
      if (req.method === 'GET' && url.pathname.startsWith('/media/')) {
        const file = safeMedia(decodeURIComponent(url.pathname.slice(7)));
        if (!file) return send(res, 404, { error: 'not found' });
        return sendFile(req, res, file, TYPES[extname(file).toLowerCase()] || 'application/octet-stream');
      }

      if (api !== 'api') return send(res, 404, { error: 'not found' });

      if (req.method === 'GET' && resource === 'status') {
        return send(res, 200, {
          dryRun: ig.dryRun,
          login: ig.login,
          uploadMode: ig.uploadMode,
          ffmpeg: hasFfmpeg(),
          cloudflared: hasCloudflared(),
          account: account?.username || null,
          accountError,
          tokenDaysLeft: tokens?.daysLeft() ?? null,
        });
      }

      if (req.method === 'POST' && resource === 'upload') {
        const original = basename(url.searchParams.get('name') || 'video.mp4').replace(/[^\w.\- ]/g, '_');
        const name = `${Date.now()}-${original}`;
        const dest = join(mediaDir, name);
        await pipeline(req, createWriteStream(dest));
        try {
          const { info, result } = summarize(dest);
          return send(res, 200, { name, info, result });
        } catch {
          unlinkSync(dest);
          return send(res, 400, { error: "That file isn't a readable video." });
        }
      }

      if (req.method === 'POST' && resource === 'schedule') {
        const { name, at, caption = '', coverOffsetMs } = await readJson(req);
        const file = safeMedia(name);
        if (!file) return send(res, 400, { error: 'Upload the video first.' });
        const when = validTime(at);
        if (caption.length > 2200) return send(res, 400, { error: 'Caption is over 2,200 characters.' });

        const { info, result } = summarize(file);
        if (result.needsTrim) return send(res, 400, { error: 'Duration is out of range. Trim it in your editor.' });
        const cover = validCover(coverOffsetMs, info.durationSec);
        const ready = await conformAsync(info, result.plan, SPEC);
        const recheck = preflight(probe(ready), SPEC);
        if (!recheck.ok) return send(res, 400, { error: 'Still failing after the fix: ' + recheck.issues.map((i) => i.msg).join('; ') });

        const post = queue.add({ file: ready, caption, publishAt: when, coverOffsetMs: cover });
        return send(res, 200, { post, fixed: result.plan });
      }

      if (resource === 'queue') {
        if (req.method === 'GET' && !id) {
          const posts = [...queue.posts]
            .sort((a, b) => a.publishAt.localeCompare(b.publishAt))
            // shareToken is a live public link key — it never leaves the server.
            .map(({ log: _log, shareToken: _t, ...p }) => ({ ...p, media: basename(p.file), lastLog: _log?.at(-1)?.msg || null }));
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
          return post ? send(res, 200, { post }) : send(res, 404, { error: 'No post with that id.' });
        }
        if (req.method === 'POST' && id && action === 'retry') {
          const before = queue.get(id);
          const post = queue.retry(id);
          if (post && before?.shareToken && files) await files.unshare(before.shareToken);
          return post ? send(res, 200, { post }) : send(res, 400, { error: 'Only failed posts can be retried.' });
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
    try {
      if (tokens) await tokens.maybeRefresh(ig, { log });
      await tick(queue, ig, { files, stageWindowMin, log });
    } catch (err) {
      log(`scheduler error: ${err.message}`);
    }
  };
  refreshAccount();
  loop();
  const timers = [setInterval(loop, tickMs), setInterval(refreshAccount, 30 * 60_000)];

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
