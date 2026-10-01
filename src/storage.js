// Queue keeps its OWN copies of videos in media/ (the upload copy, plus any fixed version).
// This reports what's using space and — only when you ask — clears copies that are done with.
// Never touches anything outside media/, and never touches a post that hasn't gone out yet.
import { readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, basename } from 'node:path';

const UNUSED_GRACE_MS = 60 * 60_000; // an upload you haven't scheduled yet gets an hour's grace

// The upload copy a post's (possibly fixed) file came from: "x.conformed.mp4" / "x.sdr.mp4" → "x.*"
const stem = (name) => name.replace(/\.(conformed|sdr)\.mp4$/, '').replace(/\.[^.]+$/, '');

export function mediaReport(mediaDir, posts, now = Date.now()) {
  let files;
  try {
    files = readdirSync(mediaDir).filter((f) => !f.startsWith('.'));
  } catch {
    files = [];
  }
  const byStem = new Map(); // stem → statuses of posts using it
  for (const p of posts) {
    if (!p.file) continue;
    const s = stem(basename(p.file));
    if (!byStem.has(s)) byStem.set(s, []);
    byStem.get(s).push(p.status);
  }

  const out = { totalBytes: 0, active: [], posted: [], unused: [] };
  for (const name of files) {
    const path = join(mediaDir, name);
    let st;
    try {
      st = statSync(path);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    out.totalBytes += st.size;
    const entry = { name, path, bytes: st.size };
    const statuses = byStem.get(stem(name));
    if (!statuses) {
      if (now - st.mtimeMs > UNUSED_GRACE_MS) out.unused.push(entry);
      else out.active.push(entry);
    } else if (statuses.every((s) => s === 'published')) out.posted.push(entry);
    else out.active.push(entry);
  }
  const sum = (a) => a.reduce((n, f) => n + f.bytes, 0);
  return {
    ...out,
    summary: {
      totalBytes: out.totalBytes,
      clearable: { count: out.posted.length + out.unused.length, bytes: sum(out.posted) + sum(out.unused) },
      posted: { count: out.posted.length, bytes: sum(out.posted) },
      unused: { count: out.unused.length, bytes: sum(out.unused) },
    },
  };
}

// Deletes posted + unused copies. Returns what was freed.
export function clearMedia(mediaDir, queue) {
  const report = mediaReport(mediaDir, queue.posts);
  let bytes = 0;
  let count = 0;
  for (const f of [...report.posted, ...report.unused]) {
    try {
      unlinkSync(f.path);
      bytes += f.bytes;
      count++;
    } catch {}
  }
  const gone = new Set(report.posted.map((f) => stem(f.name)));
  for (const p of queue.posts) {
    if (p.status === 'published' && p.file && gone.has(stem(basename(p.file))) && !p.fileCleared) {
      queue.update(p, { fileCleared: true }, "Queue's copy of the video cleared to save space");
    }
  }
  return { count, bytes };
}

export const human = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${Math.round(b / 1e6)} MB` : `${Math.round(b / 1e3)} KB`);
