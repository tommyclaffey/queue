// Compares a probed file against a platform spec.
// Returns what's wrong AND the cheapest fix for each thing, so we never
// re-encode video when a lossless remux would do.

const mb = (b) => (b / 1024 / 1024).toFixed(1) + ' MB';
const mbps = (b) => (b / 1_000_000).toFixed(1) + ' Mbps';

export function preflight(info, spec) {
  const issues = [];
  const add = (level, msg, fix) => issues.push({ level, msg, fix });
  const v = info.video;
  const a = info.audio;

  if (!info.formatNames.some((f) => spec.containers.includes(f)))
    add('error', `Container is ${info.formatNames.join('/')}, needs MP4 or MOV`, 'remux');
  if (info.bytes > spec.maxBytes)
    add('error', `File is ${mb(info.bytes)}, max is ${mb(spec.maxBytes)}`, 'reencode');
  if (info.durationSec < spec.durationSec.min || info.durationSec > spec.durationSec.max)
    add('error', `Duration ${info.durationSec.toFixed(1)}s is outside ${spec.durationSec.min}–${spec.durationSec.max}s`, 'trim');
  if (info.faststart === false)
    add('error', 'moov atom is at the end of the file (Meta requires it at the front)', 'remux');

  if (!v) {
    add('error', 'No video stream found', null);
  } else {
    if (!spec.videoCodecs.includes(v.codec))
      add('error', `Video codec is ${v.codec}, needs H.264 or HEVC`, 'reencode');
    if (!spec.pixFmts.includes(v.pixFmt))
      add('error', `Pixel format is ${v.pixFmt}, needs 8-bit 4:2:0 (yuv420p)`, 'reencode');
    if (v.fps && (v.fps < spec.fps.min || v.fps > spec.fps.max))
      add('error', `Frame rate ${v.fps.toFixed(2)} is outside ${spec.fps.min}–${spec.fps.max} fps`, 'reencode');
    if (v.bitrate && v.bitrate > spec.maxVideoBitrate)
      add('warn', `Video bitrate ${mbps(v.bitrate)} is over ${mbps(spec.maxVideoBitrate)} — Instagram will crush it`, 'reencode');

    const shortSide = Math.min(v.width, v.height);
    if (shortSide > spec.targetWidth)
      add('warn', `Resolution ${v.width}×${v.height} — Instagram will downscale this itself. Better to do it once, cleanly.`, 'reencode');
    if (shortSide < spec.targetWidth)
      add('warn', `Resolution ${v.width}×${v.height} is below 1080 — it will look soft. Re-export from the source; no tool can add detail.`, null);

    if (['arib-std-b67', 'smpte2084'].includes(v.colorTransfer))
      add('warn', 'HDR video (iPhone default). Instagram tone-maps HDR badly — export SDR from your editor.', null);

    const aspect = (v.rotation % 180 ? v.height / v.width : v.width / v.height);
    if (Math.abs(aspect - spec.idealAspect) > 0.02)
      add('warn', `Aspect ratio is ${aspect.toFixed(3)}, Reels are 9:16 (0.5625) — expect cropping or bars`, null);
  }

  if (!a) {
    add('warn', 'No audio track', null);
  } else {
    if (!spec.audioCodecs.includes(a.codec))
      add('error', `Audio codec is ${a.codec}, needs AAC`, 'audio');
    if (a.sampleRate > spec.maxAudioSampleRate)
      add('error', `Audio sample rate ${a.sampleRate} Hz is over 48 kHz`, 'audio');
    if (a.channels > spec.maxAudioChannels)
      add('error', `Audio has ${a.channels} channels, max is 2`, 'audio');
  }

  const fixes = new Set(issues.map((i) => i.fix).filter(Boolean));
  const plan = fixes.has('reencode') ? 'reencode'
    : fixes.has('audio') ? 'audio-only'
    : fixes.has('remux') ? 'remux'
    : 'none';

  return {
    ok: !issues.some((i) => i.level === 'error'),
    issues,
    plan, // cheapest safe fix: none < remux (lossless) < audio-only < reencode
    needsTrim: fixes.has('trim'),
  };
}
