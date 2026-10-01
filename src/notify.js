// macOS notifications: a post went live, failed, or missed its time.
// Silent everywhere else, in tests, and when NOTIFY=0.
import { execFile } from 'node:child_process';

// AppleScript string literal: escape backslashes and quotes, strip newlines.
const as = (s) => `"${String(s).replace(/[\r\n]+/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"').slice(0, 220)}"`;

export function makeNotifier({ enabled = process.platform === 'darwin' && process.env.NOTIFY !== '0' } = {}) {
  if (!enabled) return () => {};
  return (title, message) => {
    execFile('osascript', ['-e', `display notification ${as(message)} with title "Queue" subtitle ${as(title)}`], () => {});
  };
}
