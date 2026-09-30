// Local web UI + scheduler in one process. No dependencies.
// Binds to 127.0.0.1 only — nothing on your network can reach it.
import { createServer } from 'node:http';
import { createReadStream, createWriteStream, existsSync, statSync, unlinkSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { join, basename, extname } from 'node:path';
import { INSTAGRAM_REELS as SPEC } from './specs.js';
import { hasFfmpeg, probe } from './probe.js';
import { preflight } from './preflight.js';
import { conformAsync } from './conform.js';
import { tick } from './worker.js';

const TYPES = { '.html': 'text/html', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.m4v': 'video/mp4' };

export function startServer({ root, queue, ig, port = 4400, stageWindowMin = 120 }) {
  const mediaDir = join(root, 'media');
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

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return createReadStream(join(root, 'public', 'index.html')).pipe(res);
      }

      // Video preview, with range support so the <video> tag can seek.
      if (req.method === 'GET' && url.pathname.startsWith('/media/')) {
        const file = safeMedia(decodeURIComponent(url.pathname.slice(7)));
        if (!file) return send(res, 404, { error: 'not found' });
        const size = statSync(file).size;
        const type = TYPES[extname(file).toLowerCase()] || 'application/octet-stream';
        const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
        if (!m) {
          res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' });
          return createReadStream(file).pipe(res);
        }
        const start = m[1] ? Number(m[1]) : 0;
        const end = m[2] ? Number(m[2]) : size - 1;
        res.writeHead(206, { 'Content-Type': type, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${size}` });
        return createReadStream(file, { start, end }).pipe(res);
      }

      if (req.method === 'GET' && url.pathname === '/api/status') {
        return send(res, 200, { dryRun: ig.dryRun, ffmpeg: hasFfmpeg(), userId: ig.userId || null });
      }

      if (req.method === 'POST' && url.pathname === '/api/upload') {
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

      if (req.method === 'POST' && url.pathname === '/api/schedule') {
        const { name, at, caption = '' } = await readJson(req);
        const file = safeMedia(name);
        if (!file) return send(res, 400, { error: 'Upload the video first.' });
        const when = new Date(at);
        if (isNaN(when)) return send(res, 400, { error: 'Pick a date and time.' });
        if (when < Date.now()) return send(res, 400, { error: 'That time is in the past.' });
        if (caption.length > 2200) return send(res, 400, { error: 'Caption is over 2,200 characters.' });

        const { info, result } = summarize(file);
        if (result.needsTrim) return send(res, 400, { error: 'Duration is out of range. Trim it in your editor.' });
        const ready = await conformAsync(info, result.plan, SPEC);
        const recheck = preflight(probe(ready), SPEC);
        if (!recheck.ok) return send(res, 400, { error: 'Still failing after the fix: ' + recheck.issues.map((i) => i.msg).join('; ') });

        const post = queue.add({ file: ready, caption, publishAt: when });
        return send(res, 200, { post, fixed: result.plan });
      }

      if (req.method === 'GET' && url.pathname === '/api/queue') {
        const posts = [...queue.posts]
          .sort((a, b) => a.publishAt.localeCompare(b.publishAt))
          .map((p) => ({ ...p, media: basename(p.file) }));
        return send(res, 200, { posts });
      }

      if (req.method === 'DELETE' && url.pathname.startsWith('/api/queue/')) {
        const ok = queue.remove(url.pathname.split('/').pop());
        return send(res, ok ? 200 : 404, { ok });
      }

      send(res, 404, { error: 'not found' });
    } catch (err) {
      send(res, 500, { error: err.message });
    }
  });

  server.listen(port, '127.0.0.1');

  const loop = () => tick(queue, ig, { stageWindowMin, log: (m) => console.log(new Date().toLocaleTimeString(), m) });
  loop();
  setInterval(loop, 30_000);

  return server;
}
