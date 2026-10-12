import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
http.createServer((req, res) => {
  const f = path.join('/tmp/qfig', decodeURIComponent(req.url.split('?')[0]));
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!f.startsWith('/tmp/qfig') || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': f.endsWith('.json') ? 'application/json' : 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(4499, '127.0.0.1');
