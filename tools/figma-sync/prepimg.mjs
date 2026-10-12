import fs from 'node:fs'; import crypto from 'node:crypto'; import { execFileSync } from 'node:child_process';
const prefix = process.argv[2] || 'd-';
const keys = new Set();
for (const f of fs.readdirSync('cap').filter((f) => f.startsWith(prefix) && f.endsWith('.json'))) for (const k of JSON.parse(fs.readFileSync('cap/' + f)).images) keys.add(k);
const map = fs.existsSync('img/map.json') ? JSON.parse(fs.readFileSync('img/map.json')) : {};
const HDR = { 'worship-night.mov': 'worship', 'pour-over-60.mov': 'pourover', 'espresso-dialin.mov': 'espresso' };
const ROOT = '/tmp/qhead/demo';
for (const k0 of keys) { const k = k0.replace("localhost:4403", "localhost:4402");
  if (map[k] || k.startsWith('data:')) continue;
  const id = crypto.createHash('sha1').update(k).digest('hex').slice(0, 12);
  const out = `img/${id}.jpg`;
  try {
    if (k.startsWith('video:')) {
      const [, url, t] = k.match(/^video:(.*)@([\d.]+)$/);
      const p = new URL(url).pathname; const name = decodeURIComponent(p.split('/').pop());
      const file = p.startsWith('/quality-media/') ? `${ROOT}/data/quality/${name}` : `${ROOT}/media/${name}`;
      if (HDR[name]) execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', `${ROOT}/assets/${HDR[name]}.jpg`, '-vf', "crop='min(iw,ih*9/16)':'min(ih,iw*16/9)',scale=720:1280", '-q:v', '3', out]);
      else execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', t, '-i', file, '-frames:v', '1', '-vf', "scale='min(720,iw)':-2", '-q:v', '3', out]);
    } else {
      const p = decodeURIComponent(new URL(k).pathname);
      const file = p.startsWith('/demo-assets/') ? `${ROOT}/assets/${p.split('/').pop()}` : null;
      if (!file || !fs.existsSync(file)) { console.log('MISSING', k); continue; }
      execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', file, '-vf', "scale='min(900,iw)':-2", '-q:v', '3', out]);
    }
    map[k] = { file: out };
  } catch (e) { console.log('FAIL', k, String(e).slice(0, 200)); }
}
fs.writeFileSync('img/map.json', JSON.stringify(map, null, 1));
console.log('images', Object.keys(map).length, 'pending upload', Object.values(map).filter((v) => !v.hash).length);
