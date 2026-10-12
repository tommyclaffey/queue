// upsvg.mjs <page> <files-list.txt> <uuid...> → appends {file: nodeId} to up/nodes.json
import fs from 'node:fs';
const [, , page, list, ...uuids] = process.argv;
const files = fs.readFileSync(list, 'utf8').trim().split('\n').slice(0, uuids.length);
const map = fs.existsSync('up/nodes.json') ? JSON.parse(fs.readFileSync('up/nodes.json')) : {};
await Promise.all(files.map(async (f, i) => {
  const fd = new FormData(); fd.append('file', new Blob([fs.readFileSync(f)], { type: 'image/svg+xml' }), f.split('/').pop());
  let r; for (let t = 0; t < 5; t++) { try { r = await fetch(`https://mcp.figma.com/mcp/upload/${uuids[i]}/submit?scaleMode=FILL&currentPageId=${encodeURIComponent(page)}`, { method: 'POST', body: fd }); break; } catch (e) { await new Promise((ok) => setTimeout(ok, 2000)); } }
  if (!r) { console.log('FAIL network', f); return; }
  const j = await r.json(); if (j.placedOnNodeId) map[f.split('/').pop().replace('.svg', '')] = j.placedOnNodeId; else console.log('FAIL', f, JSON.stringify(j).slice(0, 200));
}));
fs.writeFileSync('up/nodes.json', JSON.stringify(map, null, 1)); console.log(Object.keys(map).length, 'nodes');
