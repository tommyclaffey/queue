// Settings you change in the app. Saved to data/settings.json, which wins over .env, which
// wins over these defaults. The scheduler picks changes up immediately — no restart.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const DEFAULTS = Object.freeze({
  stageWindowMin: 120, // hand the file to Instagram this early (it discards uploads after 24h)
  lateLimitMin: 120, // posts later than this (Mac was asleep) wait for your OK
  notify: true, // macOS notifications: posted, failed, missed
  postingTimes: ['12:00', '18:30', '21:00'], // quick picks in New post
  defaultTime: '18:30', // where calendar drops land
});

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function readSettings(dataDir) {
  try { return JSON.parse(readFileSync(join(dataDir, 'settings.json'), 'utf8')); } catch { return {}; }
}

// .env values (if set) sit between the defaults and the saved file.
export function fromEnv(env = process.env) {
  const out = {};
  if (env.STAGE_WINDOW_MIN) out.stageWindowMin = Number(env.STAGE_WINDOW_MIN);
  if (env.LATE_LIMIT_MIN) out.lateLimitMin = Number(env.LATE_LIMIT_MIN);
  if (env.NOTIFY !== undefined) out.notify = env.NOTIFY !== '0';
  return out;
}

export function mergeSettings(dataDir, env = process.env) {
  return clean({ ...DEFAULTS, ...fromEnv(env), ...readSettings(dataDir) }, true);
}

// Validates a (partial) change. Throws a readable error on anything out of range.
export function clean(s, lenient = false) {
  const out = {};
  const bad = (msg) => { if (!lenient) throw new Error(msg); };
  if (s.stageWindowMin !== undefined) {
    const n = Math.round(Number(s.stageWindowMin));
    if (Number.isFinite(n) && n >= 15 && n <= 1380) out.stageWindowMin = n; else bad('Send early must be between 15 minutes and 23 hours.');
  }
  if (s.lateLimitMin !== undefined) {
    const n = Math.round(Number(s.lateLimitMin));
    if (Number.isFinite(n) && n >= 0 && n <= 1440) out.lateLimitMin = n; else bad('The missed-post limit must be between 0 minutes and 24 hours.');
  }
  if (s.notify !== undefined) out.notify = !!s.notify;
  if (s.postingTimes !== undefined) {
    const t = Array.isArray(s.postingTimes) ? [...new Set(s.postingTimes.map(String).filter((x) => HHMM.test(x)))].sort() : [];
    if (t.length >= 1 && t.length <= 6) out.postingTimes = t; else bad('Keep between 1 and 6 posting times.');
  }
  if (s.defaultTime !== undefined) {
    if (HHMM.test(String(s.defaultTime))) out.defaultTime = String(s.defaultTime); else bad('Pick a valid default time.');
  }
  if (lenient) {
    for (const [k, v] of Object.entries(DEFAULTS)) if (out[k] === undefined) out[k] = v;
    if (!out.postingTimes.includes(out.defaultTime)) out.defaultTime = out.postingTimes[0];
  }
  return out;
}

export function saveSettings(dataDir, patch) {
  const cur = readSettings(dataDir);
  const next = { ...cur, ...clean(patch) };
  const merged = clean({ ...DEFAULTS, ...next }, true);
  if (next.defaultTime && !merged.postingTimes.includes(next.defaultTime)) next.defaultTime = merged.postingTimes[0];
  if (next.postingTimes && next.defaultTime === undefined && !next.postingTimes.includes(merged.defaultTime)) next.defaultTime = next.postingTimes[0];
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, 'settings.json'), JSON.stringify(next, null, 1));
  return next;
}
