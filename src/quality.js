// Measures how much quality a platform took away.
// Compares the ORIGINAL file with the version Instagram serves back, using:
//   VMAF — Netflix's "how would a human rate this" score, 0–100
//   SSIM — structural similarity, 0–1
//   PSNR — raw pixel difference, in dB
// Both videos are scaled to the same 1080-wide frame and frame rate first, so the
// score reflects compression damage, not just a size difference.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, rmSync, mkdtempSync, createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { probe } from './probe.js';

const run = promisify(execFile);

export function verdict(vmaf) {
  if (vmaf >= 93) return 'Visually identical to most viewers';
  if (vmaf >= 85) return 'Very good — small loss, hard to notice on a phone';
  if (vmaf >= 70) return 'Noticeable loss — soft detail, some artifacts';
  return 'Heavy loss — clearly degraded';
}

export async function compare(originalPath, postedPath) {
  const ref = probe(originalPath);
  const dist = probe(postedPath);
  const portrait = ref.video.height >= ref.video.width;
  const [w, h] = portrait ? [1080, 1920] : [1920, 1080];
  const fps = Math.round(dist.video.fps || 30);

  const dir = mkdtempSync(join(tmpdir(), 'queue-q-'));
  const logPath = join(dir, 'vmaf.json');
  const prep = `scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=bicubic,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,fps=${fps},setpts=PTS-STARTPTS,format=yuv420p`;
  try {
    await run('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      '-i', postedPath, '-i', originalPath,
      '-lavfi', `[0:v]${prep}[d];[1:v]${prep}[r];[d][r]libvmaf=log_fmt=json:log_path=${logPath}:n_threads=4:feature=name=psnr|name=float_ssim:shortest=1`,
      '-f', 'null', '-',
    ], { maxBuffer: 16 * 1024 * 1024 });
    const log = JSON.parse(readFileSync(logPath, 'utf8'));
    const pooled = log.pooled_metrics;
    const vmaf = pooled.vmaf;
    const { series, worstAt } = timeline(log.frames || [], fps);
    return {
      vmaf: round(vmaf.mean),
      vmafWorst: round(vmaf.min),
      worstAt,
      series,
      ssim: round(pooled.float_ssim?.mean, 4),
      psnr: round(pooled.psnr_y?.mean),
      verdict: verdict(vmaf.mean),
      original: describe(ref),
      posted: describe(dist),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Per-frame VMAF, averaged into at most `points` buckets so the app can draw it.
// worstAt is the time (seconds) of the single worst frame.
export function timeline(frames, fps, points = 96) {
  if (!frames.length) return { series: [], worstAt: null };
  let worst = frames[0];
  for (const f of frames) if (f.metrics.vmaf < worst.metrics.vmaf) worst = f;
  const per = Math.max(1, Math.ceil(frames.length / points));
  const series = [];
  for (let i = 0; i < frames.length; i += per) {
    const chunk = frames.slice(i, i + per);
    const mean = chunk.reduce((a, f) => a + f.metrics.vmaf, 0) / chunk.length;
    series.push({ t: round(chunk[0].frameNum / fps, 2), vmaf: round(mean) });
  }
  return { series, worstAt: round(worst.frameNum / fps, 2) };
}

const round = (n, d = 1) => (n == null ? null : Number(n.toFixed(d)));
const describe = (i) => ({
  resolution: `${i.video.width}×${i.video.height}`,
  fps: round(i.video.fps),
  codec: i.video.codec,
  mbps: i.video.bitrate ? round(i.video.bitrate / 1e6) : null,
  mb: round(i.bytes / 1048576),
});

// Downloads a published video from Instagram's CDN (media_url) to a temp file.
export async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const dir = mkdtempSync(join(tmpdir(), 'queue-dl-'));
  const out = join(dir, 'posted.mp4');
  await pipeline(Readable.fromWeb(res.body), createWriteStream(out));
  return out;
}
