import { createReadStream, statSync } from 'node:fs';

// HTTP Range header → byte range. Handles "bytes=a-b", "bytes=a-" and suffix "bytes=-n".
// Returns null (send the whole file), { start, end }, or 'invalid' (reply 416).
export function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim());
  if (!m || (!m[1] && !m[2])) return null;
  let start, end;
  if (!m[1]) {
    const n = Number(m[2]); // last n bytes
    if (n === 0) return 'invalid';
    start = Math.max(size - n, 0);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  }
  if (start >= size || start > end) return 'invalid';
  return { start, end };
}

// Streams a file (or a range of it) without ever crashing the process.
export function sendFile(req, res, file, type) {
  let size;
  try {
    size = statSync(file).size;
  } catch {
    res.writeHead(404);
    return res.end();
  }
  const range = parseRange(req.headers.range, size);
  if (range === 'invalid') {
    res.writeHead(416, { 'Content-Range': `bytes */${size}` });
    return res.end();
  }
  const { start, end } = range || { start: 0, end: size - 1 };
  const headers = { 'Content-Type': type, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes' };
  if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  res.writeHead(range ? 206 : 200, headers);
  if (req.method === 'HEAD' || size === 0) return res.end();
  createReadStream(file, { start, end })
    .on('error', () => res.destroy()) // file deleted mid-download, etc.
    .pipe(res);
}
