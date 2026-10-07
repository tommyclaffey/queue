// Prepares photos for Instagram's API, the way preflight/conform prepare video.
//
// Instagram's content API takes photos only as a JPEG at a public URL (there is no direct upload
// for images), so every photo goes out as: JPEG · sRGB · 320–1440 px wide · aspect between 4:5
// and 1.91:1 (feed/carousel) or 9:16 (story). Carousels use the FIRST photo's shape for all.
//
// iPhone photos are usually HEIC in Display P3. Instagram converts those itself and they come out
// dull, so Queue converts to sRGB first, then resizes once.
//   macOS          → sips (Apple's own ColorSync: any profile → sRGB)
//   Linux / hosted → ffmpeg. Display P3 → sRGB is a real conversion (colorspace filter, 12-bit
//                    intermediate so saturated colours don't clip). Other non-sRGB profiles are
//                    rare (Adobe RGB from cameras) and are passed through as if sRGB.
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFileSync, statSync, unlinkSync, openSync, readSync, closeSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const run = promisify(execFile);
const SRGB = '/System/Library/ColorSync/Profiles/sRGB Profile.icc';

export const PHOTO_SPEC = Object.freeze({
  formats: ['jpeg'],
  minWidth: 320,
  maxWidth: 1440,
  targetWidth: 1080,
  minAspect: 4 / 5, // tallest feed shape (portrait)
  maxAspect: 1.91, // widest feed shape (landscape)
  storyAspect: 9 / 16,
  maxBytes: 8 * 1024 * 1024,
});

// The Instagram-ready JPEG made from an original upload: "123-IMG_1.HEIC" → "123-IMG_1.photo.jpg"
// (feed shape), "…photo-story.jpg" (9:16), "…photo-r800.jpg" (a carousel's first-photo shape).
export const preparedName = (name, tag = null) => name.replace(/\.[^.]+$/, '') + (tag ? `.photo-${tag}.jpg` : '.photo.jpg');
export const isPreparedPhoto = (name) => /\.photo(-[\w]+)?\.jpg$/.test(name);

const ASPECTS = { '4:5': 4 / 5, '1:1': 1, '1.91:1': 1.91, '9:16': 9 / 16 };

let sipsCache = null;
export function hasSips() {
  if (sipsCache === null) {
    try { execFileSync('sips', ['--version'], { stdio: 'ignore' }); sipsCache = true; } catch { sipsCache = false; }
  }
  return sipsCache;
}

// What kind of photo the bytes say this is — never trust the file name. null = not a photo we take.
const HEIF_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs', 'mif1', 'msf1']);
export function photoType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.toString('latin1', 4, 8) === 'ftyp' && HEIF_BRANDS.has(buf.toString('latin1', 8, 12))) return 'heic';
  return null;
}
export function photoTypeOf(file) {
  const fd = openSync(file, 'r');
  try {
    const buf = Buffer.alloc(16);
    const n = readSync(fd, buf, 0, 16, 0);
    return photoType(buf.subarray(0, n));
  } finally {
    closeSync(fd);
  }
}

// Reads width, height, format and colour profile. sips on macOS, ffprobe elsewhere.
export async function photoInfo(file, { engine = hasSips() ? 'sips' : 'ffmpeg' } = {}) {
  if (engine === 'ffmpeg') return photoInfoFfmpeg(file);
  const { stdout } = await run('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', '-g', 'format', '-g', 'profile', file]);
  const get = (k) => (stdout.match(new RegExp(`${k}: (.+)`)) || [])[1]?.trim() || null;
  const width = Number(get('pixelWidth')); const height = Number(get('pixelHeight'));
  if (!width || !height) throw new Error("That file isn't a readable photo.");
  const profile = get('profile');
  return { file, width, height, format: get('format'), profile: profile && profile !== '<nil>' ? profile : null, bytes: statSync(file).size };
}

const CODEC_FORMAT = { mjpeg: 'jpeg', png: 'png', hevc: 'heic' };
async function photoInfoFfmpeg(file) {
  const type = photoTypeOf(file);
  if (!type) throw new Error("That file isn't a readable photo.");
  let data;
  try {
    // Tile grids (HEIC) need ffmpeg 7.1+; older ffprobes don't know -show_stream_groups at all.
    const args = ['-v', 'error', '-show_streams', ...(type === 'heic' ? ['-show_stream_groups'] : []), '-of', 'json', file];
    const { stdout } = await run('ffprobe', args, { maxBuffer: 1 << 24 });
    data = JSON.parse(stdout);
  } catch {
    throw new Error(type === 'heic' ? "This computer's ffmpeg can't read HEIC photos (it needs ffmpeg 7.1 or newer). Export the photo as JPEG and upload that." : "That file isn't a readable photo.");
  }
  const s = (data.streams || []).find((x) => x.codec_type === 'video');
  // HEIC from a phone is a grid of 512 px tiles; the real picture size lives on the tile grid.
  const grid = (data.stream_groups || []).find((g) => g.type === 'Tile Grid')?.components?.[0];
  const width = Number(grid?.width || s?.width); const height = Number(grid?.height || s?.height);
  if (!s || !CODEC_FORMAT[s.codec_name] || !width || !height) throw new Error("That file isn't a readable photo.");
  let profile = null;
  try { profile = iccName(file, type); } catch {}
  return { file, width, height, format: CODEC_FORMAT[s.codec_name], profile, bytes: statSync(file).size };
}

// What has to change for Instagram. Like preflight(), lists every issue and the one fix plan.
// `aspect` is a named crop ('4:5', '1:1', '1.91:1', '9:16') or a number (a carousel's first-photo shape).
export function photoPreflight(info, { story = false, aspect = null } = {}) {
  const issues = [];
  const ratio = info.width / info.height;
  const named = typeof aspect === 'string' ? ASPECTS[aspect] : null;
  const numeric = typeof aspect === 'number' && Number.isFinite(aspect) ? aspect : null;
  // Wide photos are cropped to 1.9:1, a hair inside Instagram's 1.91 limit, so rounding to whole
  // pixels can never tip them over it.
  const want = story ? PHOTO_SPEC.storyAspect : named || numeric || (ratio > PHOTO_SPEC.maxAspect ? 1.9 : Math.max(PHOTO_SPEC.minAspect, ratio));
  const label = story ? '9:16' : named ? aspect : numeric ? shapeLabel(numeric) : ratio < PHOTO_SPEC.minAspect ? '4:5' : '1.91:1';
  const srgb = /srgb/i.test(info.profile || '') || !info.profile;
  if (!PHOTO_SPEC.formats.includes(info.format)) issues.push({ level: 'fix', msg: `${String(info.format || 'unknown').toUpperCase()} → JPEG (Instagram takes JPEG only)` });
  if (!srgb) issues.push({ level: 'fix', msg: `${info.profile} → sRGB, so colours don't come out dull` });
  if (Math.abs(ratio - want) > 0.01) issues.push({ level: 'fix', msg: `Cropped to ${label} (was ${info.width}×${info.height})` });
  if (info.width > PHOTO_SPEC.maxWidth) issues.push({ level: 'fix', msg: `Resized to ${PHOTO_SPEC.targetWidth} wide (Instagram's maximum is ${PHOTO_SPEC.maxWidth})` });
  if (info.width < PHOTO_SPEC.minWidth) issues.push({ level: 'error', msg: `Only ${info.width} px wide — Instagram needs at least ${PHOTO_SPEC.minWidth}` });
  if (info.bytes > PHOTO_SPEC.maxBytes && !issues.length) issues.push({ level: 'fix', msg: 'Re-compressed to fit Instagram\'s 8 MB limit' });
  return { ok: !issues.length, issues, aspect: want, plan: issues.some((i) => i.level === 'error') ? 'reject' : issues.length ? 'convert' : 'none' };
}
const shapeLabel = (a) => (Math.abs(a - 0.8) < 0.01 ? '4:5' : Math.abs(a - 1) < 0.01 ? '1:1' : Math.abs(a - 9 / 16) < 0.01 ? '9:16' : `${a.toFixed(2)}:1`);

// One pass: crop to the target shape (centred), resize, convert to sRGB JPEG. Never upscales.
export async function preparePhoto(file, out, { story = false, aspect = null, quality = 92, engine = hasSips() ? 'sips' : 'ffmpeg' } = {}) {
  const info = await photoInfo(file, { engine });
  const check = photoPreflight(info, { story, aspect });
  if (check.plan === 'reject') throw new Error(check.issues.find((i) => i.level === 'error').msg);
  if (check.plan === 'none') { copyFileSync(file, out); return { info, check, out }; }
  // Crop box at the target aspect, as large as the photo allows.
  let w = info.width; let h = Math.round(w / check.aspect);
  if (h > info.height) { h = info.height; w = Math.round(h * check.aspect); }
  const width = Math.min(PHOTO_SPEC.targetWidth, w);
  if (engine === 'ffmpeg') {
    // Be honest: without ColorSync only Display P3 is truly converted.
    const other = info.profile && !/srgb|p3/i.test(info.profile);
    if (other) check.issues = check.issues.map((i) => (i.msg.startsWith(`${info.profile} → sRGB`) ? { level: 'warn', msg: `${info.profile} colour profile can't be converted here (needs a Mac) — colours may shift slightly` } : i));
    await prepareFfmpeg(info, out, { w, h, width, quality });
    return { info, check, out };
  }
  // Two passes: sips resizes before it crops when given both, which shrinks the result.
  const cropped = `${out}.crop.png`;
  await run('sips', ['--cropToHeightWidth', String(h), String(w), '-s', 'format', 'png', file, '--out', cropped]);
  const args = ['-m', SRGB, '-s', 'format', 'jpeg', '-s', 'formatOptions', String(quality)];
  // Exact height too: sips rounds down on its own (2133 → 1919.7 → 1919), which would miss 9:16.
  if (w > width) args.push('--resampleHeightWidth', String(Math.round((width * h) / w)), String(width));
  try { await run('sips', [...args, cropped, '--out', out]); } finally { try { unlinkSync(cropped); } catch {} }
  return { info, check, out };
}

// Same crop/resize/colour rules as the sips path, with ffmpeg (Linux, the hosted server).
async function prepareFfmpeg(info, out, { w, h, width, quality }) {
  const height = Math.max(1, Math.round((width * h) / w));
  const filters = [`crop=${w}:${h}:${Math.floor((info.width - w) / 2)}:${Math.floor((info.height - h) / 2)}`];
  if (width < w) filters.push(`scale=${width}:${height}:flags=lanczos`);
  if (/p3/i.test(info.profile || '')) {
    // Display P3 → sRGB: same transfer curve, wider primaries. Done at 12 bits so reds and greens
    // outside sRGB clip once at the end instead of drifting in the middle.
    filters.push('scale=out_color_matrix=bt709:out_range=pc', 'format=yuv444p12',
      'colorspace=iprimaries=smpte432:itrc=iec61966-2-1:ispace=bt709:irange=pc:primaries=bt709:trc=iec61966-2-1:space=bt709:range=pc:format=yuv444p12',
      // JPEG decoders read BT.601 full range: convert to exactly that, never leave it to auto-negotiation.
      'scale=in_color_matrix=bt709:in_range=pc:out_color_matrix=bt601:out_range=pc');
  }
  filters.push('format=yuvj420p');
  // JPEG quality 92 ≈ ffmpeg's q 2 (1 = best, 31 = worst).
  const q = String(Math.max(1, Math.min(31, Math.round((100 - quality) / 4))));
  const ff = (args) => run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { maxBuffer: 1 << 24 });
  // A phone HEIC is a grid of tiles that ffmpeg stitches in its own filter graph, which can't be
  // combined with ours. Stitch to a lossless 16-bit PNG first (like the sips path's PNG step).
  let src = info.file; let tmp = null;
  if (info.format === 'heic') { tmp = `${out}.grid.png`; await ff(['-i', info.file, '-frames:v', '1', '-pix_fmt', 'rgb48be', tmp]); src = tmp; }
  try {
    await ff(['-i', src, '-frames:v', '1', '-vf', filters.join(','), '-c:v', 'mjpeg', '-q:v', q, '-map_metadata', '-1', '-f', 'image2', out]);
  } finally {
    if (tmp) try { unlinkSync(tmp); } catch {}
  }
}

// ---- The embedded ICC profile's name ("Display P3", "sRGB IEC61966-2.1"…), read straight from the
// file, so the ffmpeg path can report and convert colour like sips does. null = no profile (= sRGB).
export function iccName(file, type = photoTypeOf(file)) {
  const head = readHead(file, 4 << 20);
  const icc = type === 'jpeg' ? iccFromJpeg(head) : type === 'png' ? iccFromPng(head) : type === 'heic' ? iccFromHeif(head) : null;
  return icc ? iccDescription(icc) : null;
}
function readHead(file, max) {
  const size = statSync(file).size;
  if (size <= max) return readFileSync(file);
  const fd = openSync(file, 'r');
  try { const buf = Buffer.alloc(max); readSync(fd, buf, 0, max, 0); return buf; } finally { closeSync(fd); }
}
function iccFromJpeg(b) {
  const parts = [];
  for (let i = 2; i + 4 <= b.length && b[i] === 0xff;) {
    const marker = b[i + 1];
    if (marker === 0xda || marker === 0xd9) break; // image data starts: no more metadata
    const len = b.readUInt16BE(i + 2);
    if (marker === 0xe2 && b.toString('latin1', i + 4, i + 16) === 'ICC_PROFILE\0') parts.push([b[i + 16], b.subarray(i + 18, i + 2 + len)]);
    i += 2 + len;
  }
  return parts.length ? Buffer.concat(parts.sort((a, c) => a[0] - c[0]).map((p) => p[1])) : null;
}
function iccFromPng(b) {
  for (let i = 8; i + 8 <= b.length;) {
    const len = b.readUInt32BE(i); const type = b.toString('latin1', i + 4, i + 8);
    if (type === 'iCCP') {
      const data = b.subarray(i + 8, i + 8 + len);
      const nul = data.indexOf(0);
      return inflateSync(data.subarray(nul + 2));
    }
    if (type === 'IDAT' || type === 'IEND') return null;
    i += 12 + len;
  }
  return null;
}
function iccFromHeif(b) {
  // The profile sits in a 'colr' box of type 'prof' (inside meta → iprp → ipco). Find it directly.
  for (let i = b.indexOf('colrprof', 0, 'latin1'); i >= 4; i = b.indexOf('colrprof', i + 1, 'latin1')) {
    const size = b.readUInt32BE(i - 4);
    if (size > 12 && i - 4 + size <= b.length) return b.subarray(i + 8, i - 4 + size);
  }
  return null;
}
function iccDescription(p) {
  if (p.length < 132 || p.toString('latin1', 36, 40) !== 'acsp') return null;
  const n = p.readUInt32BE(128);
  for (let k = 0; k < n && 132 + k * 12 + 12 <= p.length; k++) {
    const at = 132 + k * 12;
    if (p.toString('latin1', at, at + 4) !== 'desc') continue;
    const off = p.readUInt32BE(at + 4);
    const type = p.toString('latin1', off, off + 4);
    if (type === 'desc') { const len = p.readUInt32BE(off + 8); return p.toString('latin1', off + 12, off + 12 + len).replace(/\0+$/, '').trim() || null; }
    if (type === 'mluc') {
      // 'mluc' · reserved · record count · record size · then records of lang(2) country(2) length(4) offset(4).
      const len = p.readUInt32BE(off + 20); const start = off + p.readUInt32BE(off + 24);
      const s = p.subarray(start, start + len);
      let str = ''; for (let j = 0; j + 1 < s.length; j += 2) str += String.fromCharCode(s.readUInt16BE(j));
      return str.replace(/\0+$/, '').trim() || null;
    }
  }
  return null;
}
