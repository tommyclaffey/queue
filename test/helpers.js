// Generates real test videos with ffmpeg so every test runs against actual files.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const tmp = () => mkdtempSync(join(tmpdir(), 'queue-test-'));
export const cleanup = (dir) => rmSync(dir, { recursive: true, force: true });
export const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

// Hash of the encoded video packets only — proves a remux left the picture untouched.
export function videoStreamHash(file) {
  return execFileSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-map', '0:v', '-c', 'copy', '-f', 'hash', '-hash', 'sha256', '-'])
    .toString().trim();
}

export function makeVideo(dir, name, {
  w = 1080, h = 1920, fps = 30, secs = 4, vcodec = 'libx264', pix = 'yuv420p', vbitrate,
  acodec = 'aac', arate = 48000, channels = 2, faststart = true, audio = true, extraV = [],
} = {}) {
  const out = join(dir, name);
  const args = ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `testsrc2=s=${w}x${h}:r=${fps}`];
  if (audio) args.push('-f', 'lavfi', '-i', `sine=f=440:r=${arate}`);
  args.push('-t', String(secs), '-c:v', vcodec, '-pix_fmt', pix, ...extraV);
  if (vbitrate) args.push('-b:v', vbitrate);
  if (audio) args.push('-c:a', acodec, '-ac', String(channels));
  if (faststart && /\.(mp4|mov)$/.test(name)) args.push('-movflags', '+faststart');
  args.push(out);
  execFileSync('ffmpeg', args);
  return out;
}
