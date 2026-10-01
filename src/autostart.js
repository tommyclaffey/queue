// Start Queue automatically when you log in, and restart it if it ever crashes.
// Uses a macOS LaunchAgent (the standard way apps run in the background). Off until you run
// `queue autostart on`; `queue autostart off` removes it completely.
import { writeFileSync, existsSync, unlinkSync, statSync, readFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir, userInfo } from 'node:os';
import { join } from 'node:path';

// QUEUE_LABEL only exists so tests can install a throwaway copy without touching the real one.
export const LABEL = process.env.QUEUE_LABEL || 'com.queue.scheduler';

// Homebrew's stable link survives `brew upgrade node`; the versioned Cellar path would not.
const stableNode = () => ['/opt/homebrew/bin/node', '/usr/local/bin/node'].find((p) => existsSync(p)) || process.execPath;
export const plistPath = () => join(homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
const domain = () => `gui/${userInfo().uid}`;

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function buildPlist(root, nodePath = stableNode()) {
  const log = join(root, 'data', 'queue.log');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(nodePath)}</string>
    <string>${xml(join(root, 'bin', 'queue.js'))}</string>
    <string>serve</string>
  </array>
  <key>WorkingDirectory</key><string>${xml(root)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>QUEUE_LAUNCHD</key><string>1</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <!-- Restart after a crash, but not after a clean exit (e.g. "already running"). -->
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>${xml(log)}</string>
  <key>StandardErrorPath</key><string>${xml(log)}</string>
</dict>
</plist>
`;
}

export function isLoaded() {
  try {
    execFileSync('launchctl', ['print', `${domain()}/${LABEL}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function enable(root) {
  mkdirSync(join(homedir(), 'Library', 'LaunchAgents'), { recursive: true });
  mkdirSync(join(root, 'data'), { recursive: true });
  const path = plistPath();
  writeFileSync(path, buildPlist(root));
  execFileSync('plutil', ['-lint', path], { stdio: 'ignore' });
  if (isLoaded()) execFileSync('launchctl', ['bootout', `${domain()}/${LABEL}`], { stdio: 'ignore' });
  execFileSync('launchctl', ['bootstrap', domain(), path]);
}

export function disable() {
  if (isLoaded()) execFileSync('launchctl', ['bootout', `${domain()}/${LABEL}`], { stdio: 'ignore' });
  if (existsSync(plistPath())) unlinkSync(plistPath());
}

// Keep the background log from growing forever: over 5 MB → keep the last 1 MB.
export function trimLog(root) {
  const log = join(root, 'data', 'queue.log');
  try {
    if (statSync(log).size > 5e6) {
      const buf = readFileSync(log);
      writeFileSync(log, buf.subarray(buf.length - 1e6));
    }
  } catch {}
}
