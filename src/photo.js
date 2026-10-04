// Prepares photos for Instagram's API, the way preflight/conform prepare video.
//
// Instagram's content API takes photos only as a JPEG at a public URL (there is no direct upload
// for images), so every photo goes out as: JPEG · sRGB · 320–1440 px wide · aspect between 4:5
// and 1.91:1 (feed/carousel) or 9:16 (story). Carousels use the FIRST photo's shape for all.
//
// iPhone photos are usually HEIC in Display P3. Instagram converts those itself and they come out
// dull, so Queue converts to sRGB first with macOS's own ColorSync (sips), then resizes once.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFileSync, statSync, unlinkSync } from 'node:fs';

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

const ASPECTS = { '4:5': 4 / 5, '1:1': 1, '1.91:1': 1.91, '9:16': 9 / 16 };

// Reads width, height, format and colour profile with sips.
export async function photoInfo(file) {
  const { stdout } = await run('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', '-g', 'format', '-g', 'profile', file]);
  const get = (k) => (stdout.match(new RegExp(`${k}: (.+)`)) || [])[1]?.trim() || null;
  const width = Number(get('pixelWidth')); const height = Number(get('pixelHeight'));
  if (!width || !height) throw new Error("That file isn't a readable photo.");
  const profile = get('profile');
  return { file, width, height, format: get('format'), profile: profile && profile !== '<nil>' ? profile : null, bytes: statSync(file).size };
}

// What has to change for Instagram. Like preflight(), lists every issue and the one fix plan.
export function photoPreflight(info, { story = false, aspect = null } = {}) {
  const issues = [];
  const ratio = info.width / info.height;
  // Wide photos are cropped to 1.9:1, a hair inside Instagram's 1.91 limit, so rounding to whole
  // pixels can never tip them over it.
  const want = story ? PHOTO_SPEC.storyAspect : aspect ? ASPECTS[aspect] : ratio > PHOTO_SPEC.maxAspect ? 1.9 : Math.max(PHOTO_SPEC.minAspect, ratio);
  const srgb = /srgb/i.test(info.profile || '') || !info.profile;
  if (!PHOTO_SPEC.formats.includes(info.format)) issues.push({ level: 'fix', msg: `${String(info.format || 'unknown').toUpperCase()} → JPEG (Instagram takes JPEG only)` });
  if (!srgb) issues.push({ level: 'fix', msg: `${info.profile} → sRGB, so colours don't come out dull` });
  if (Math.abs(ratio - want) > 0.01) issues.push({ level: 'fix', msg: `Cropped to ${story ? '9:16' : aspect || (ratio < PHOTO_SPEC.minAspect ? '4:5' : '1.91:1')} (was ${info.width}×${info.height})` });
  if (info.width > PHOTO_SPEC.maxWidth) issues.push({ level: 'fix', msg: `Resized to ${PHOTO_SPEC.targetWidth} wide (Instagram's maximum is ${PHOTO_SPEC.maxWidth})` });
  if (info.width < PHOTO_SPEC.minWidth) issues.push({ level: 'error', msg: `Only ${info.width} px wide — Instagram needs at least ${PHOTO_SPEC.minWidth}` });
  if (info.bytes > PHOTO_SPEC.maxBytes && !issues.length) issues.push({ level: 'fix', msg: 'Re-compressed to fit Instagram\'s 8 MB limit' });
  return { ok: !issues.length, issues, aspect: want, plan: issues.some((i) => i.level === 'error') ? 'reject' : issues.length ? 'convert' : 'none' };
}

// One pass: crop to the target shape (centred), resize, convert to sRGB JPEG. Never upscales.
export async function preparePhoto(file, out, { story = false, aspect = null, quality = 92 } = {}) {
  const info = await photoInfo(file);
  const check = photoPreflight(info, { story, aspect });
  if (check.plan === 'reject') throw new Error(check.issues.find((i) => i.level === 'error').msg);
  if (check.plan === 'none') { copyFileSync(file, out); return { info, check, out }; }
  // Crop box at the target aspect, as large as the photo allows.
  let w = info.width; let h = Math.round(w / check.aspect);
  if (h > info.height) { h = info.height; w = Math.round(h * check.aspect); }
  const width = Math.min(PHOTO_SPEC.targetWidth, w);
  // Two passes: sips resizes before it crops when given both, which shrinks the result.
  const cropped = `${out}.crop.png`;
  await run('sips', ['--cropToHeightWidth', String(h), String(w), '-s', 'format', 'png', file, '--out', cropped]);
  const args = ['-m', SRGB, '-s', 'format', 'jpeg', '-s', 'formatOptions', String(quality)];
  if (w > width) args.push('--resampleWidth', String(width));
  try { await run('sips', [...args, cropped, '--out', out]); } finally { try { unlinkSync(cropped); } catch {} }
  return { info, check, out };
}
