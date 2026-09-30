// Reads a video's real technical properties with ffprobe.
import { execFileSync } from 'node:child_process';
import { openSync, readSync, closeSync, statSync } from 'node:fs';

export function hasFfmpeg() {
  try {
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' });
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function parseRate(r) {
  if (!r || r === '0/0') return null;
  const [n, d] = r.split('/').map(Number);
  return d ? n / d : n;
}

export function probe(file) {
  const out = execFileSync('ffprobe', [
    '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file,
  ]);
  const data = JSON.parse(out.toString());
  const v = data.streams.find((s) => s.codec_type === 'video');
  const a = data.streams.find((s) => s.codec_type === 'audio');

  return {
    file,
    bytes: statSync(file).size,
    formatNames: (data.format.format_name || '').split(','),
    durationSec: Number(data.format.duration),
    video: v && {
      codec: v.codec_name,
      width: v.width,
      height: v.height,
      pixFmt: v.pix_fmt,
      fps: parseRate(v.avg_frame_rate) ?? parseRate(v.r_frame_rate),
      bitrate: Number(v.bit_rate) || Number(data.format.bit_rate) || null,
      colorTransfer: v.color_transfer || null, // HLG / PQ = HDR
      rotation: Number(v.tags?.rotate || v.side_data_list?.find((s) => s.rotation)?.rotation || 0),
    },
    audio: a && {
      codec: a.codec_name,
      sampleRate: Number(a.sample_rate),
      channels: a.channels,
    },
    faststart: moovBeforeMdat(file),
  };
}

// Meta requires the "moov atom at the front of the file" (a.k.a. faststart).
// Walks the top-level MP4 boxes and reports whether moov comes before mdat.
export function moovBeforeMdat(file) {
  const fd = openSync(file, 'r');
  try {
    const size = statSync(file).size;
    const buf = Buffer.alloc(16);
    let pos = 0;
    while (pos < size) {
      if (readSync(fd, buf, 0, 16, pos) < 8) return null;
      let boxSize = buf.readUInt32BE(0);
      const type = buf.toString('latin1', 4, 8);
      if (type === 'moov') return true;
      if (type === 'mdat') return false;
      if (boxSize === 1) boxSize = Number(buf.readBigUInt64BE(8));
      else if (boxSize === 0) return null;
      pos += boxSize;
    }
    return null;
  } finally {
    closeSync(fd);
  }
}
