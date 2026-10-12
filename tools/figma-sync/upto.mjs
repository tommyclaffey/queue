// upto.mjs <start> <url...> — POST mock/jobs.json[start+i].file to url i (raw bytes, then form fallback)
import fs from 'node:fs';
const [, , start, ...urls] = process.argv; const jobs = JSON.parse(fs.readFileSync(process.env.JOBS||'/tmp/qfig/mock/jobs.json'));
const res = {}; let bad = 0;
const POOL = 8; const one = async (u, i) => { const j = jobs[+start + i]; const buf = fs.readFileSync('/tmp/qfig/' + j.file);
  for (let t = 0; t < 4; t++) { try { const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: buf }); const txt = await r.text(); if (r.ok) { res[j.node] = txt.slice(0, 120); return; } if (/already/i.test(txt)) { res[j.node] = 'already'; return; } console.log('HTTP', r.status, j.file, txt.slice(0, 150)); bad++; return; } catch (e) { if (t === 3) console.log('ERR', j.file, String(e.cause || e).slice(0, 120)); await new Promise((ok) => setTimeout(ok, 2000)); } }
  console.log('NET', j.file); bad++; };
let next = 0; await Promise.all(Array.from({ length: POOL }, async () => { while (next < urls.length) { const i = next++; await one(urls[i], i); } }));
console.log('ok', Object.keys(res).length, 'bad', bad); console.log(JSON.stringify(Object.entries(res).slice(0, 2)));
