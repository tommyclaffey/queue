// Only ONE scheduler may run at a time — two would both try to post the same Reel.
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
};

export function acquireLock(path) {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) {
    const pid = Number(readFileSync(path, 'utf8'));
    if (pid && pid !== process.pid && alive(pid))
      throw new Error(`Uncut is already running in another Terminal window (process ${pid}). Close that one first.`);
  }
  writeFileSync(path, String(process.pid));
  const release = () => {
    try {
      if (Number(readFileSync(path, 'utf8')) === process.pid) unlinkSync(path);
    } catch {}
  };
  process.on('exit', release);
  return release;
}
