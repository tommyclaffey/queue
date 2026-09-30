// Fixes a file with the LEAST destructive operation that works.
//   remux      → lossless. Rewraps the same video/audio, moves moov to the front.
//   audio-only → video copied bit-for-bit, only the audio is re-encoded.
//   reencode   → one high-quality pass: 1080 wide, H.264 High, CRF 17, closed GOP.
//   hdr        → HDR (iPhone HLG/Dolby Vision) → standard colour using Apple's own converter
//                (the same one Photos uses to share HDR), then the normal fix for the result.
// Every extra encode is a generation of quality loss, so we do at most one — except HDR,
// where Apple's conversion is a very high-bitrate first pass (~25 Mbps at 4K).
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { basename, dirname, extname, join } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';
import { probe } from './probe.js';
import { preflight } from './preflight.js';

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

export function hasAvconvert() {
  return process.platform === 'darwin' && existsSync('/usr/bin/avconvert');
}

const outPath = (file, tag) => join(dirname(file), basename(file, extname(file)) + `.${tag}.mp4`);
const sdrArgs = (src, out) => ['--source', src, '--preset', 'PresetHighestQuality', '--output', out, '--replace'];

// HDR → SDR with Apple's converter, then whatever the SDR file still needs.
function afterHdr(sdrFile, spec, runFix) {
  const info = probe(sdrFile);
  const { plan } = preflight(info, spec);
  if (plan === 'hdr') throw new Error('HDR conversion did not produce standard-colour video.');
  const final = runFix(info, plan);
  if (final !== sdrFile) unlinkSync(sdrFile);
  return final;
}

export function conform(info, plan, spec) {
  if (plan === 'none') return info.file;
  if (plan === 'hdr') {
    if (!hasAvconvert()) throw new Error('HDR video needs converting to standard colour. Export SDR from your editor, or run this on a Mac.');
    const sdr = outPath(info.file, 'sdr');
    execFileSync('/usr/bin/avconvert', sdrArgs(info.file, sdr), { stdio: 'ignore' });
    return afterHdr(sdr, spec, (i, p) => conform(i, p, spec));
  }
  const out = outPath(info.file, 'conformed');
  execFileSync('ffmpeg', conformArgs(info, plan, spec, out), { stdio: 'inherit' });
  return out;
}

// Non-blocking version for the web server, so a long re-encode doesn't freeze the UI.
export async function conformAsync(info, plan, spec) {
  if (plan === 'none') return info.file;
  if (plan === 'hdr') {
    if (!hasAvconvert()) throw new Error('HDR video needs converting to standard colour. Export SDR from your editor, or run this on a Mac.');
    const sdr = outPath(info.file, 'sdr');
    await execFileP('/usr/bin/avconvert', sdrArgs(info.file, sdr));
    const sdrInfo = probe(sdr);
    const { plan: next } = preflight(sdrInfo, spec);
    if (next === 'hdr') throw new Error('HDR conversion did not produce standard-colour video.');
    const final = await conformAsync(sdrInfo, next, spec);
    if (final !== sdr) unlinkSync(sdr);
    return final;
  }
  const out = outPath(info.file, 'conformed');
  await execFileP('ffmpeg', conformArgs(info, plan, spec, out));
  return out;
}
