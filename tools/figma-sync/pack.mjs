// pack.mjs <capture.json> <out.svg> [yLimit] — compact a capture for the Figma builder, as an SVG text payload.
import fs from 'node:fs';
const [,, inp, outp, lim = '2700'] = process.argv;
const C = JSON.parse(fs.readFileSync(inp));
const imgmap = JSON.parse(fs.readFileSync('/tmp/qfig/img/map.json'));
const LOGOS = { bluesky: '82:12005', facebook: '82:12006', instagram: '82:12007', linkedin: '82:12008', pinterest: '82:12009', 'threads-dark': '82:12010', threads: '82:12011', 'tiktok-dark': '82:12012', tiktok: '82:12013', 'x-dark': '82:12014', x: '82:12015', youtube: '82:12016', youtubeshorts: '82:12017' };
const h2 = (n) => Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, '0');
const hex = (c) => (c ? h2(c[0]) + h2(c[1]) + h2(c[2]) + (c[3] < 0.999 ? h2(c[3]) : '') : undefined);
const R = (n) => Math.round(n * 10) / 10;
// absolute positions + trimming
const abs = []; const keep = [];
const limit = +lim;
const svgs = {}; const hashes = {};
const out = [];
const remap = [];
C.nodes.forEach((n, i) => {
  const pa = n.p < 0 ? { x: 0, y: 0 } : abs[n.p];
  abs[i] = pa ? { x: pa.x + n.x, y: pa.y + n.y } : null;
  const parentKept = n.p < 0 || keep[n.p];
  keep[i] = !!(parentKept && abs[i] && abs[i].y < limit);
  if (!keep[i]) return;
  remap[i] = out.length;
  const o = { t: n.t, p: n.p < 0 ? -1 : remap[n.p], x: R(n.x), y: R(n.y), w: R(n.w), h: R(n.h) };
  if (n.n) o.n = n.n;
  if (n.t === 'F') {
    if (n.bg) o.bg = hex(n.bg);
    if (n.gr) o.gr = { angle: n.gr.angle, stops: n.gr.stops.map((s) => ({ c: hex(s.c) + (s.c[3] >= 0.999 ? 'ff' : ''), p: s.p })) };
    if (n.rad && n.rad.some((r) => r > 0)) o.rad = n.rad.map(R);
    if (n.bw) { o.bw = n.bw; o.bc = n.bc.map((c) => (c ? hex(c) : null)); }
    if (n.sh) o.sh = n.sh.map((s) => ({ i: s.inset ? 1 : 0, c: hex(s.c) + (s.c[3] >= 0.999 ? 'ff' : ''), x: s.x, y: s.y, b: s.b, s: s.s }));
    if (n.clip) o.clip = 1; if (n.sy) o.sy = 1; if (n.sx) o.sx = 1; if (n.op != null) o.op = n.op;
    if (n.link) o.n = (o.n || 'link') + ' →' + n.link;
  } else if (n.t === 'T') {
    o.s = n.s; o.st = { ...n.st, c: hex(n.st.c) }; if (n.ml) o.ml = 1; if (n.tr) o.tr = 1; if (n.cl) o.cl = n.cl;
    for (const k of ['up', 'it', 'ul']) if (!o.st[k]) delete o.st[k];
    if (!o.st.ls) delete o.st.ls; if (o.st.al === 'start' || o.st.al === 'left') delete o.st.al;
  } else if (n.t === 'I') {
    if (n.k.startsWith('data:image/svg+xml')) {
      let s = decodeURIComponent(n.k.replace(/^data:image\/svg\+xml(;utf8)?,/, ''));
      s = s.replace(/<svg([^>]*)>/, (m, attrs) => `<svg${attrs.replace(/\s(width|height)=(['"])[^'"]*\2/g, '')} width="${n.w}" height="${n.h}">`);
      const key = 'd' + Object.keys(svgs).length; svgs[key] = s; o.t = 'S'; o.k = key; o.n = 'icon';
    } else {
      o.k = n.k.replace('localhost:4403', 'localhost:4402'); if (imgmap[o.k]?.hash) hashes[o.k] = imgmap[o.k].hash; else console.error('no hash for', n.k);
      if (n.rad && n.rad.some((r) => r > 0)) o.rad = n.rad.map(R);
      if (n.fit === 'contain') o.fit = 'contain'; if (n.op != null) o.op = n.op; if (n.bw) { o.bw = n.bw; o.bc = hex(n.bc); }
    }
  } else if (n.t === 'S') { o.k = n.k; svgs[n.k] = C.svgs[n.k]; }
  else if (n.t === 'L') { o.k = n.k; }
  out.push(o);
});
const payload = { w: C.w, h: C.h, nodes: out, svgs, hashes, logos: LOGOS };
const json = JSON.stringify(payload);
const id = outp.split('/').pop().replace(/\.svg$/, '');
fs.writeFileSync(outp, `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><text x="0" y="10" font-family="Geist Mono" font-size="2">QDATA:${id}:${Buffer.from(json).toString('base64')}</text></svg>`);
console.log(id, 'kept', out.length, 'of', C.nodes.length, 'json', json.length);
