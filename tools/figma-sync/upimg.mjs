import fs from 'node:fs';
const uuids = process.argv.slice(3); const page = process.argv[2];
const map = JSON.parse(fs.readFileSync('img/map.json'));
const todo = Object.entries(map).filter(([, v]) => !v.hash).slice(0, uuids.length);
await Promise.all(todo.map(async ([k, v], i) => {
  const fd = new FormData(); fd.append('file', new Blob([fs.readFileSync(v.file)], { type: 'image/jpeg' }), v.file.split('/').pop());
  const r = await fetch(`https://mcp.figma.com/mcp/upload/${uuids[i]}/submit?scaleMode=FILL&currentPageId=${encodeURIComponent(page)}`, { method: 'POST', body: fd });
  const j = await r.json(); if (j.imageHash) { v.hash = j.imageHash; v.node = j.placedOnNodeId; } else console.log('FAIL', k, JSON.stringify(j).slice(0, 200));
}));
fs.writeFileSync('img/map.json', JSON.stringify(map, null, 1));
console.log('uploaded', todo.length, 'remaining', Object.values(map).filter((v) => !v.hash).length);
