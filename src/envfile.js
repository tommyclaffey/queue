// Updates KEY=value lines in .env without touching anything else (comments, order, other keys).
// Used by the in-app "Connect Instagram" page so nobody has to edit the file by hand.
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';

export function updateEnv(path, values) {
  const lines = existsSync(path) ? readFileSync(path, 'utf8').split('\n') : [];
  const left = new Map(Object.entries(values));
  const out = lines.map((line) => {
    const m = /^\s*([A-Z0-9_]+)\s*=/.exec(line);
    if (!m || !left.has(m[1])) return line;
    const v = left.get(m[1]); left.delete(m[1]);
    return `${m[1]}=${v}`;
  });
  if (left.size) {
    if (out.length && out[out.length - 1] !== '') out.push('');
    for (const [k, v] of left) out.push(`${k}=${v}`);
  }
  if (out[out.length - 1] !== '') out.push('');
  writeFileSync(path, out.join('\n'), { mode: 0o600 });
  try { chmodSync(path, 0o600); } catch {} // it holds a login key: owner-only
  for (const [k, v] of Object.entries(values)) process.env[k] = v;
}
