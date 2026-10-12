// upmock.mjs <page> <offset> <uuids...> — upload mock/*.png in sorted order from <offset>; hashes -> mock/hashes.json
import fs from 'node:fs';
const [, , page, off, ...uuids] = process.argv;
const out = fs.existsSync('/tmp/qfig/mock/hashes.json') ? JSON.parse(fs.readFileSync('/tmp/qfig/mock/hashes.json')) : {};
const files = fs.readdirSync('/tmp/qfig/mock').filter((f) => f.endsWith('.png') && !out[f.replace('.png', '')]).sort().slice(0, uuids.length);
await Promise.all(files.map(async (f, i) => {
  for (let t = 0; t < 5; t++) {
    try {
      const fd = new FormData(); fd.append('file', new Blob([fs.readFileSync('/tmp/qfig/mock/' + f)], { type: 'image/png' }), f);
      const r = await fetch(`https://mcp.figma.com/mcp/upload/${uuids[i]}/submit?scaleMode=FILL&currentPageId=${encodeURIComponent(page)}`, { method: 'POST', body: fd });
      const j = await r.json(); if (j.imageHash) { out[f.replace('.png', '')] = j.imageHash; return; } console.log('FAIL', f, JSON.stringify(j).slice(0, 150)); return;
    } catch (e) { await new Promise((ok) => setTimeout(ok, 2000)); }
  }
  console.log('FAIL network', f);
}));
fs.writeFileSync('/tmp/qfig/mock/hashes.json', JSON.stringify(out, null, 1));
console.log('hashes', Object.keys(out).length);
