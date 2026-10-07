#!/usr/bin/env node
// Queue — schedule Instagram Reels without wrecking video quality.
import { existsSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { spawn } from 'node:child_process';
import { INSTAGRAM_REELS as SPEC } from '../src/specs.js';
import { hasFfmpeg, probe } from '../src/probe.js';
import { preflight } from '../src/preflight.js';
import { conform } from '../src/conform.js';
import { tick } from '../src/worker.js';
import { startServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';
import { hasCloudflared } from '../src/fileshare.js';
import { compare, download } from '../src/quality.js';
import { acquireLock } from '../src/lock.js';
import { mediaReport, clearMedia, human } from '../src/storage.js';
import * as autostart from '../src/autostart.js';
import { buildDemo } from '../src/demo.js';
import { Queue } from '../src/queue.js';
import { InstagramClient } from '../src/instagram.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = loadConfig(ROOT);

const ICON = { error: '🛑', warn: '⚠️ ' };
const PLAN = {
  none: '✅ Ship it untouched. Instagram gets your original file.',
  remux: '🔧 Lossless fix — rewrap only, zero quality change.',
  'audio-only': '🔧 Audio fix only — video stays bit-for-bit identical.',
  reencode: '🎞  One clean re-encode (1080w, H.264 High, CRF 17) — better you do it than Instagram.',
  hdr: "🎨 HDR → standard colour with Apple's converter, then one clean encode.",
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

// Stop the Mac from idle-sleeping while the scheduler runs. Released automatically on exit.
function keepAwake() {
  if (process.platform !== 'darwin') return;
  const c = spawn('caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore', detached: true });
  c.unref();
}

function printQuality(r) {
  console.log(`\n  VMAF  ${r.vmaf} / 100   (worst moment: ${r.vmafWorst})`);
  console.log(`  SSIM  ${r.ssim}`);
  console.log(`  PSNR  ${r.psnr} dB`);
  console.log(`\n  → ${r.verdict}`);
  console.log(`\n  Original: ${r.original.resolution} · ${r.original.fps} fps · ${r.original.mbps ?? '?'} Mbps · ${r.original.mb} MB`);
  console.log(`  Posted:   ${r.posted.resolution} · ${r.posted.fps} fps · ${r.posted.mbps ?? '?'} Mbps · ${r.posted.mb} MB\n`);
}

const [cmd, ...rest] = process.argv.slice(2);
const { values: opt, positionals: pos } = parseArgs({
  args: rest,
  allowPositionals: true,
  options: {
    at: { type: 'string' },
    caption: { type: 'string', default: '' },
    cover: { type: 'string' },
    'no-fix': { type: 'boolean', default: false },
    post: { type: 'string' },
    latest: { type: 'boolean', default: false },
    tunnel: { type: 'boolean', default: false },
    clear: { type: 'boolean', default: false },
  },
});

try {
  switch (cmd) {
    case 'check': {
      if (!pos[0]) throw new Error('Usage: queue check <video>');
      report(resolve(pos[0]));
      break;
    }

    case 'add': {
      const file = pos[0] && resolve(pos[0]);
      if (!file || !opt.at) throw new Error('Usage: queue add <video> --at "2026-10-02 18:30" --caption "..." [--cover 2.5]');
      // "2026-10-02" alone would be read as UTC midnight (the evening before, in the US). Use local.
      const when = new Date(/^\d{4}-\d{2}-\d{2}$/.test(opt.at.trim()) ? `${opt.at.trim()}T00:00` : opt.at);
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
      const coverOffsetMs = opt.cover != null ? Math.round(Number(opt.cover) * 1000) : null;
      const post = cfg.queue.add({ file: ready, caption: opt.caption, publishAt: when, coverOffsetMs });
      console.log(`\n📅 Queued ${post.id} for ${when.toLocaleString()}`);
      break;
    }

    case 'list': {
      const posts = [...cfg.queue.posts].sort((a, b) => a.publishAt.localeCompare(b.publishAt));
      if (!posts.length) console.log('Nothing scheduled.');
      for (const p of posts) {
        console.log(`${p.id}  ${p.status.padEnd(9)}  ${new Date(p.publishAt).toLocaleString().padEnd(24)}  ${(p.caption || '').slice(0, 40)}`);
        if (p.error) console.log(`          ↳ ${p.error}`);
        if (p.permalink) console.log(`          ↳ ${p.permalink}`);
      }
      break;
    }

    case 'remove': {
      console.log(cfg.queue.remove(pos[0]) ? 'Removed.' : 'No post with that id.');
      break;
    }

    case 'storage': {
      const mediaDir = join(ROOT, 'media');
      const { summary } = mediaReport(mediaDir, cfg.queue.posts);
      console.log(`\n  Queue's video copies: ${human(summary.totalBytes)}`);
      console.log(`  Clearable: ${human(summary.clearable.bytes)} — ${summary.posted.count} from posted Reels, ${summary.unused.count} uploaded but never scheduled`);
      if (!opt.clear) {
        if (summary.clearable.count) console.log('\n  To clear them: node bin/queue.js storage --clear');
        console.log("  (Only Queue's own copies in ~/Coding/queue/media. Your originals are never touched.)\n");
        break;
      }
      const r = clearMedia(mediaDir, cfg.queue);
      console.log(`\n  🧹 Cleared ${r.count} files, ${human(r.bytes)}.\n`);
      break;
    }

    case 'autostart': {
      const action = pos[0] || 'status';
      if (process.platform !== 'darwin') throw new Error('Autostart is only available on macOS.');
      if (action === 'on') {
        // A copy running in a Terminal window would block the background one.
        const lockFile = join(ROOT, 'data', 'scheduler.lock');
        if (existsSync(lockFile) && !autostart.isLoaded()) {
          try {
            process.kill(Number(readFileSync(lockFile, 'utf8')), 0);
            throw new Error('Queue is running in a Terminal window. Close it first (Ctrl+C), then run this again.');
          } catch (e) {
            if (e.code !== 'ESRCH') throw e;
          }
        }
        autostart.enable(ROOT);
        console.log(`\n✅ Autostart is ON. Queue is running in the background now, and will start`);
        console.log(`   by itself whenever you log in. Open http://localhost:${cfg.port}`);
        console.log(`   Log: ~/Coding/queue/data/queue.log   ·   To turn off: node bin/queue.js autostart off\n`);
      } else if (action === 'off') {
        autostart.disable();
        console.log('\n⏹  Autostart is OFF. Queue is stopped and won\'t start at login.\n   Run it by hand any time with: npm start\n');
      } else {
        console.log(autostart.isLoaded() ? `\n✅ Autostart is ON — running in the background. http://localhost:${cfg.port}\n` : '\n⏹  Autostart is OFF. Turn on with: node bin/queue.js autostart on\n');
      }
      break;
    }

    case 'post-now': {
      console.log(cfg.queue.postNow(pos[0]) ? 'Posting on the next tick (within 30s) while the scheduler is running.' : 'No missed post with that id.');
      break;
    }

    case 'retry': {
      console.log(cfg.queue.retry(pos[0]) ? 'Back in the queue.' : 'No failed post with that id.');
      break;
    }

    case 'run': {
      const { ig, queue, files, tokens, log, stageWindowMin, lateLimitMin } = cfg;
      const notify = cfg.notifyOn ? cfg.notify : () => {};
      acquireLock(join(ROOT, 'data', 'scheduler.lock'));
      keepAwake();
      console.log(ig.dryRun ? '🧪 DRY RUN — no token set, nothing will actually post.' : `🟢 LIVE — ${ig.login} login, ${ig.uploadMode} upload`);
      console.log('Scheduler running. Ctrl+C to stop.\n');
      const loop = async () => {
        try {
          await tokens.maybeRefresh(ig, { log });
          await tick(queue, ig, { files, stageWindowMin, lateLimitMin, notify, log });
        } catch (err) {
          log(`scheduler error: ${err.message}`); // keep running; the next tick tries again
        }
      };
      await loop();
      setInterval(loop, 30_000);
      break;
    }

    case 'serve': {
      const { ig } = cfg;
      if (cfg.hosted && (!cfg.password || cfg.password.length < 12)) {
        console.error('\n❌ Hosted mode needs QUEUE_PASSWORD (12+ characters). Without it, anyone could post to your Instagram.\n');
        process.exit(1);
      }
      mkdirSync(cfg.dataDir, { recursive: true });
      acquireLock(join(cfg.dataDir, 'scheduler.lock'));
      autostart.trimLog(ROOT);
      keepAwake();
      const app = startServer({ root: ROOT, ...cfg });
      app.server.on('error', (err) => {
        console.error(err.code === 'EADDRINUSE'
          ? `\n❌ Port ${cfg.port} is already in use — Queue (or something else) is already running.\n   Open http://localhost:${cfg.port} or close the other window.\n`
          : `\n❌ ${err.message}\n`);
        process.exit(1);
      });
      app.ready.then(() => {
        if (cfg.hosted) {
          console.log(`\n  Queue is running (hosted) → ${process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : `port ${cfg.port}`}`);
          console.log(ig.dryRun ? '  🧪 DRY RUN until Instagram is connected (Connect page).\n' : `  🟢 LIVE: ${ig.login} login\n`);
          return;
        }
        console.log(`\n  Queue is running →  http://localhost:${cfg.port}`);
        console.log(ig.dryRun ? '  🧪 DRY RUN: nothing will actually post.' : `  🟢 LIVE: ${ig.login} login, ${ig.uploadMode} upload`);
        console.log('  The scheduler runs while this window is open. The Mac won\'t idle-sleep meanwhile');
        console.log('  (closing the lid still sleeps it).\n');
      });
      break;
    }

    case 'demo': {
      // A separate demo account with sample content: never touches your real queue, media or login.
      needFfmpeg();
      // DEMO_PUBLIC=1 → the shareable demo (Railway): listens on $PORT for everyone, and puts
      // everything back the way it was every DEMO_RESET_HOURS so visitors always see a tidy account.
      const pub = process.env.DEMO_PUBLIC === '1';
      const port = Number((pub && process.env.PORT) || process.env.DEMO_PORT || 4401);
      const resetHours = pub ? Math.max(1, Number(process.env.DEMO_RESET_HOURS || 3)) : null;
      console.log('\n  Building the demo account…');
      const { media, data } = await buildDemo(ROOT);
      const extras = JSON.parse(readFileSync(join(data, 'demo.json'), 'utf8'));
      const demoCfg = { ...extras, assetsDir: join(ROOT, 'demo', 'assets'), public: pub, resetHours };
      const app = startServer({
        root: ROOT, mediaDir: media, dataDir: data, port, tickMs: 5000, host: pub ? '0.0.0.0' : null,
        queue: new Queue(join(data, 'queue.json')),
        ig: new InstagramClient({ login: 'instagram', dryRun: true }),
        demo: demoCfg,
        notify: () => {}, log: () => {},
      });
      if (pub) {
        setInterval(async () => {
          try {
            rmSync(join(data, 'settings.json'), { force: true }); // visitors' Settings changes
            await buildDemo(ROOT, { log: () => {} }); // re-seeds posts, team activity and dates
            Object.assign(demoCfg, JSON.parse(readFileSync(join(data, 'demo.json'), 'utf8')));
            console.log(`  ↻ demo reset ${new Date().toISOString()}`);
          } catch (err) { console.error('  demo reset failed:', err.message); }
        }, resetHours * 3600e3).unref();
      }
      app.server.on('error', (err) => {
        console.error(err.code === 'EADDRINUSE' ? `\n❌ Port ${port} is already in use. The demo may already be running: http://localhost:${port}\n` : `\n❌ ${err.message}\n`);
        process.exit(1);
      });
      app.ready.then(() => {
        console.log(pub ? `\n  Queue public demo → ${process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : `port ${port}`} (resets every ${resetHours}h)` : `\n  Queue demo →  http://localhost:${port}`);
        console.log('  🎭 Sample account and content. Nothing here ever posts anywhere.');
        console.log('  Dates refresh every time you start it. Ctrl+C to stop.\n');
      });
      break;
    }

    case 'doctor': {
      const { ig, tokens } = cfg;
      const row = (ok, label, fix) => console.log(`  ${ok === null ? '➖' : ok ? '✅' : '❌'} ${label}${!ok && fix ? `\n       → ${fix}` : ''}`);
      console.log('\nQueue — setup check\n');
      row(hasFfmpeg(), 'ffmpeg installed', 'brew install ffmpeg');
      row(existsSync(join(ROOT, '.env')), '.env file exists', 'cp .env.example .env');
      row(!!ig.token, 'Access token set', 'Paste the token from the Meta dashboard into IG_ACCESS_TOKEN in .env');
      console.log(`  ➖ Login type: ${ig.login}  ·  upload method: ${ig.uploadMode === 'url' ? 'temporary link (Meta downloads your original file)' : 'direct upload'}`);
      if (ig.uploadMode === 'url') row(hasCloudflared(), 'cloudflared installed (for temporary links)', 'brew install cloudflared');
      if (!ig.token) {
        console.log('\n  Running in DRY RUN until a token is set.\n');
        break;
      }
      try {
        const me = await ig.account();
        row(true, `Connected to Instagram as @${me.username}${me.account_type ? ` (${me.account_type})` : ''}`);
      } catch (err) {
        row(false, 'Connect to Instagram', err.message.includes('190') || /token/i.test(err.message)
          ? `The token was rejected: ${err.message}. Generate a new one in the Meta dashboard.`
          : err.message);
        break;
      }
      try {
        const q = await ig.quota();
        row(true, `Publishing allowed — ${q.used}/${q.total} posts used in the last 24h`);
      } catch (err) {
        row(false, 'Publishing permission', `${err.message}. Add the instagram_business_content_publish permission, then generate a new token.`);
      }
      const days = tokens.daysLeft();
      if (ig.login === 'instagram') console.log(`  ➖ Token renewal: ${days != null ? `${days} days left, renews automatically weekly` : 'will auto-renew once the token is a day old'}`);
      if (ig.uploadMode === 'url' && opt.tunnel) {
        console.log('\n  Testing a temporary link (takes about a minute)…');
        const { url, token } = await cfg.files.share(join(ROOT, 'README.md'));
        row(url.startsWith('https://'), 'Temporary link reachable from the internet');
        await cfg.files.unshare(token);
      }
      console.log('\n  Ready for a first real post. Schedule one ~15 min out and watch the terminal.\n');
      break;
    }

    case 'compare': {
      // queue compare <original> <downloaded>        — two local files
      // queue compare <original> --post <queue-id>   — fetch what Queue posted
      // queue compare <original> --latest            — fetch your newest Instagram post (e.g. one made in the app)
      needFfmpeg();
      const original = pos[0] && resolve(pos[0]);
      if (!original) throw new Error('Usage: queue compare <original> (<posted-file> | --post <id> | --latest)');
      let posted = pos[1] && resolve(pos[1]);
      if (!posted) {
        let mediaUrl;
        if (opt.post) {
          const p = cfg.queue.get(opt.post);
          if (!p?.mediaId) throw new Error('That post has not been published yet.');
          mediaUrl = (await cfg.ig.media(p.mediaId)).media_url;
        } else if (opt.latest) {
          const [latest] = await cfg.ig.recentMedia(1);
          if (!latest) throw new Error('No posts found on the account.');
          console.log(`\n  Latest post: ${latest.permalink} (${new Date(latest.timestamp).toLocaleString()})`);
          mediaUrl = latest.media_url;
        } else {
          throw new Error('Give a second file, --post <id>, or --latest.');
        }
        if (!mediaUrl) throw new Error("Instagram didn't return a download link. (It withholds it for Reels with licensed music.)");
        console.log('  Downloading the posted version…');
        posted = await download(mediaUrl);
      }
      console.log('  Measuring (this takes a moment)…');
      printQuality(await compare(original, posted));
      break;
    }

    default:
      console.log(`Queue — social media scheduler that keeps your video quality

  Web app
    npm start                                          open http://localhost:4400

  Commands
    queue check <video>                                inspect a file against Instagram's spec
    queue add <video> --at "YYYY-MM-DD HH:MM" [--caption "..."] [--cover <seconds>]
    queue list | remove <id> | retry <id> | post-now <id>
    queue storage [--clear]                            space used by Queue's video copies
    queue autostart on | off | status                  run in the background & start at login
    queue run                                          scheduler only, no web app
    queue doctor [--tunnel]                            check your Meta connection
    queue compare <original> <posted-file>             measure quality loss
    queue compare <original> --post <id> | --latest    …downloading the posted version from Instagram`);
  }
} catch (err) {
  if (/already running/.test(err.message) && autostart.isLoaded()) {
    console.error(`\n✅ Queue is already running in the background (autostart is on).\n   Open http://localhost:${cfg.port}\n`);
    process.exit(0);
  }
  console.error(`\n❌ ${err.message}\n`);
  // Under launchd a clean exit stops it from endlessly retrying a duplicate start.
  process.exit(process.env.QUEUE_LAUNCHD === '1' && /already running/.test(err.message) ? 0 : 1);
}
