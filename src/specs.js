// Platform delivery specs.
// Source: Meta docs, IG User Media reference (REELS), checked Sept 30 2026.
// "error" = the API will reject it. "warn" = accepted, but Instagram's transcoder
// will hit it harder than it needs to. That second group is where quality dies.

export const INSTAGRAM_REELS = {
  id: 'instagram_reels',
  label: 'Instagram Reel',
  containers: ['mov', 'mp4'],
  videoCodecs: ['h264', 'hevc'],
  audioCodecs: ['aac'],
  pixFmts: ['yuv420p', 'yuvj420p'], // 8-bit 4:2:0
  fps: { min: 23, max: 60 },
  durationSec: { min: 3, max: 900 },
  maxBytes: 300 * 1024 * 1024,
  maxVideoBitrate: 25_000_000,
  maxAudioSampleRate: 48_000,
  maxAudioChannels: 2,
  // Anything wider than this, Instagram scales down itself. Better you do it once, cleanly.
  targetWidth: 1080,
  idealAspect: 9 / 16,
};
