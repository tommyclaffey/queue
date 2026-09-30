// Fixes a file with the LEAST destructive operation that works.
//   remux      → lossless. Rewraps the same video/audio, moves moov to the front.
//   audio-only → video copied bit-for-bit, only the audio is re-encoded.
//   reencode   → one high-quality pass: 1080 wide, H.264 High, CRF 17, closed GOP.
// Every extra encode is a generation of quality loss, so we do at most one.
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { basename, dirname, extname, join } from 'node:path';

const execFileP = promisify(execFile);

export function conformArgs(info, plan, spec, out) {
  const base = ['-y', '-hide_banner', '-loglevel', 'error', '-i', info.file];
  const audioFix = ['-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2'];
  const tail = ['-movflags', '+faststart', '-map_metadata', '-1', out];

  if (plan === 'remux') return [...base, '-c', 'copy', ...tail];
  if (plan === 'audio-only') return [...base, '-c:v', 'copy', ...audioFix, ...tail];

  const v = info.video;
  const portrait = v.height >= v.width;
  const fps = Math.min(Math.max(v.fps || 30, spec.fps.min), spec.fps.max);
  // Only ever scale DOWN. Upscaling adds pixels, not detail.
  const scale = portrait
    ? `scale='min(${spec.targetWidth},iw)':-2:flags=lanczos`
    : `scale=-2:'min(${spec.targetWidth},ih)':flags=lanczos`;

  return [
    ...base,
    '-vf', `${scale},fps=${fps},format=yuv420p`,
    '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '17',
    '-maxrate', '20M', '-bufsize', '40M',
    '-g', String(Math.round(fps * 2)), '-flags', '+cgop', // closed GOP, per Meta spec
    ...(info.audio ? audioFix : []),
    ...tail,
  ];
}

export function conform(info, plan, spec) {
  if (plan === 'none') return info.file;
  const out = join(dirname(info.file), basename(info.file, extname(info.file)) + '.conformed.mp4');
  execFileSync('ffmpeg', conformArgs(info, plan, spec, out), { stdio: 'inherit' });
  return out;
}

// Non-blocking version for the web server, so a long re-encode doesn't freeze the UI.
export async function conformAsync(info, plan, spec) {
  if (plan === 'none') return info.file;
  const out = join(dirname(info.file), basename(info.file, extname(info.file)) + '.conformed.mp4');
  await execFileP('ffmpeg', conformArgs(info, plan, spec, out));
  return out;
}
