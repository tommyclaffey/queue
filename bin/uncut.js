#!/usr/bin/env node
// uncut — schedule Instagram Reels without wrecking video quality.
import { existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { INSTAGRAM_REELS as SPEC } from '../src/specs.js';
import { hasFfmpeg, probe } from '../src/probe.js';
import { preflight } from '../src/preflight.js';
import { conform } from '../src/conform.js';
import { Queue } from '../src/queue.js';
import { InstagramClient } from '../src/instagram.js';
import { tick } from '../src/worker.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(join(ROOT, '.env'))) process.loadEnvFile(join(ROOT, '.env'));

const queue = () => new Queue(join(ROOT, 'data', 'queue.json'));
const ig = () => new InstagramClient({
  userId: process.env.IG_USER_ID,
  token: process.env.IG_ACCESS_TOKEN,
  version: process.env.GRAPH_VERSION || 'v25.0',
  dryRun: process.env.DRY_RUN === '1',
});

const ICON = { error: '🛑', warn: '⚠️ ' };
const PLAN = {
  none: '✅ Ship it untouched. Instagram gets your original file.',
  remux: '🔧 Lossless fix — rewrap only, zero quality change.',
  'audio-only': '🔧 Audio fix only — video stays bit-for-bit identical.',
  reencode: '🎞  One clean re-encode (1080w, H.264 High, CRF 17) — better you do it than Instagram.',
};

function needFfmpeg() {
  if (!hasFfmpeg()) {
    console.error('ffmpeg is not installed. Run:  brew install ffmpeg');
    process.exit(1);
  }
}

function report(file) {
  needFfmpeg();
  const info = probe(file);
  const v = info.video;
  console.log(`\n${file}`);
  if (v) console.log(`  ${v.width}×${v.height} · ${v.codec} · ${v.fps?.toFixed(2)} fps · ${(info.bytes / 1048576).toFixed(1)} MB · ${info.durationSec.toFixed(1)}s`);
  const result = preflight(info, SPEC);
  if (!result.issues.length) console.log('  No issues.');
  for (const i of result.issues) console.log(`  ${ICON[i.level]} ${i.msg}`);
  console.log(`\n  ${PLAN[result.plan]}`);
  if (result.needsTrim) console.log('  ✂️  Duration is out of range — trim it in your editor, then re-run.');
  return { info, result };
}

const [cmd, ...rest] = process.argv.slice(2);
const { values: opt, positionals: pos } = parseArgs({
  args: rest,
  allowPositionals: true,
  options: {
    at: { type: 'string' },
    caption: { type: 'string', default: '' },
    'no-fix': { type: 'boolean', default: false },
  },
});

switch (cmd) {
  case 'check': {
    if (!pos[0]) throw new Error('Usage: uncut check <video>');
    report(resolve(pos[0]));
    break;
  }

  case 'add': {
    const file = pos[0] && resolve(pos[0]);
    if (!file || !opt.at) throw new Error('Usage: uncut add <video> --at "2026-10-02 18:30" --caption "..."');
    const when = new Date(opt.at);
    if (isNaN(when)) throw new Error(`Can't read the date "${opt.at}". Try "2026-10-02 18:30".`);
    if (when < Date.now()) throw new Error('That time is in the past.');

    const { info, result } = report(file);
    if (result.needsTrim) process.exit(1);
    let ready = file;
    if (result.plan !== 'none') {
      if (opt['no-fix']) {
        if (!result.ok) throw new Error('File fails spec and --no-fix was set.');
      } else {
        console.log('\n  Fixing…');
        ready = conform(info, result.plan, SPEC);
        const recheck = preflight(probe(ready), SPEC);
        if (!recheck.ok) throw new Error('Still failing after fix: ' + recheck.issues.map((i) => i.msg).join('; '));
        console.log(`  → ${ready}`);
      }
    }
    const post = queue().add({ file: ready, caption: opt.caption, publishAt: when });
    console.log(`\n📅 Queued ${post.id} for ${when.toLocaleString()}`);
    break;
  }

  case 'list': {
    const posts = queue().posts.sort((a, b) => a.publishAt.localeCompare(b.publishAt));
    if (!posts.length) console.log('Nothing scheduled.');
    for (const p of posts) {
      console.log(`${p.id}  ${p.status.padEnd(9)}  ${new Date(p.publishAt).toLocaleString().padEnd(24)}  ${p.caption.slice(0, 40)}`);
      if (p.error) console.log(`          ↳ ${p.error}`);
    }
    break;
  }

  case 'remove': {
    console.log(queue().remove(pos[0]) ? 'Removed.' : 'No post with that id.');
    break;
  }

  case 'run': {
    const client = ig();
    const q = queue();
    const stageWindowMin = Number(process.env.STAGE_WINDOW_MIN || 120);
    console.log(client.dryRun
      ? '🧪 DRY RUN — no token set, nothing will actually post.'
      : `🟢 LIVE — posting to IG user ${client.userId}`);
    console.log('Worker running. Ctrl+C to stop. Keep this Mac awake.\n');
    const loop = async () => {
      await tick(q, client, { stageWindowMin, log: (m) => console.log(new Date().toLocaleTimeString(), m) });
    };
    await loop();
    setInterval(loop, 30_000);
    break;
  }

  default:
    console.log(`uncut — schedule Instagram Reels without wrecking quality

  uncut check <video>                              inspect a file against Instagram's spec
  uncut add <video> --at "YYYY-MM-DD HH:MM" [--caption "..."] [--no-fix]
  uncut list                                       show the schedule
  uncut remove <id>
  uncut run                                        start the scheduler (dry run until .env has a token)`);
}
