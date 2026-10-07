// Builds the demo account: `npm run demo` → http://localhost:4401
//
// Everything lives in demo/ (git-ignored) and never touches your real queue, media or login.
//   demo/assets/   photos (from Unsplash, see credits.json). Missing? Videos fall back to
//                  generated gradients, so the demo still runs on a fresh clone.
//   demo/media/    short "Ken Burns" videos made from those photos — a mix of 4K HDR, clean
//                  1080p, and files that need a fix, so every quality state shows up.
//   demo/data/     queue.json (re-dated on every start so "Today" is always today),
//                  demo.json (the connected accounts), quality.json + quality/ (REAL VMAF
//                  scores: each posted clip is re-encoded the way a platform would serve it,
//                  then measured with the same code as `queue compare`).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { compare } from './quality.js';

const run = promisify(execFile);

// name, photo, seconds, format, motion. Formats: clean | nofast (needs a lossless rewrap) |
// hiaudio (audio fix only) | 4k (one clean encode) | hdr (4K HLG → SDR + encode)
const VIDEOS = [
  ['worship-night.mov', 'worship', 12, 'hdr', 'in'],
  ['coffee-bts.mp4', 'coffeepour', 10, 'nofast', 'out'],
  ['marathon-wk6.mov', 'runner', 12, 'clean', 'in'],
  ['open-mic.mp4', 'mic', 12, 'hiaudio', 'up'],
  ['pour-over-60.mov', 'pourover', 10, 'hdr', 'in'],
  ['weekly-recap.mp4', 'barista', 10, 'clean', 'out'],
  ['sunday-recap.mov', 'concert', 10, 'clean', 'in'],
  ['latte-fails.mp4', 'latte', 10, 'clean', 'up'],
  ['youth-night.mov', 'youth', 10, 'clean', 'out'],
  ['camera-test.mp4', 'camera', 10, 'clean', 'in'],
  ['friday-crew.mp4', 'friends', 10, 'clean', 'out'],
  ['race-morning.mov', 'trail', 10, 'clean', 'in'],
  ['espresso-dialin.mov', 'espresso', 8, 'hdr', 'out'],
  ['airport-bit.mp4', 'airport', 10, 'clean', 'up'],
  ['q-and-a.mov', 'podcast', 10, '4k', 'in'],
  ['b-roll-01.mov', 'city', 8, '4k', 'out'],
  ['drums-story.mp4', 'drums', 10, 'clean', 'in'],
];

// A made-up social media studio, so the demo can be shared publicly and shows who Queue is for:
// it runs five accounts — a creator, a business, a church, a band and a nonprofit. Every name is
// invented. Photos are from Unsplash, logos drawn for the demo (demo/assets/credits.json).
export const DEMO_ACCOUNT = { username: 'northlinesocial', name: 'Northline Social', kind: 'Studio', avatar: 'northline-logo.jpg' };
export const DEMO_BRANDS = [
  { id: 'jess', name: 'Jess Rivera', handle: 'jessruns', type: 'Creator', avatar: 'brand-jess.jpg' },
  { id: 'harbor', name: 'Harbor Coffee', handle: 'harborcoffee', type: 'Business', avatar: 'brand-harbor.jpg' },
  { id: 'grace', name: 'Grace City Church', handle: 'gracecity', type: 'Church', avatar: 'brand-gracecity.jpg' },
  { id: 'tides', name: 'The Low Tides', handle: 'thelowtides', type: 'Band', avatar: 'brand-lowtides.jpg' },
  { id: 'riverside', name: 'Riverside Arts', handle: 'riversidearts', type: 'Nonprofit', avatar: 'brand-riverside.jpg' },
];
export const DEMO_TEAM = {
  you: 'maya',
  members: [
    { id: 'maya', name: 'Maya Torres', title: 'Founder', role: 'Owner', email: 'maya@northline.social', avatar: 'team-maya.jpg', activeMin: 0 },
    { id: 'jordan', name: 'Jordan Ellis', title: 'Content lead', role: 'Admin', email: 'jordan@northline.social', avatar: 'team-jordan.jpg', activeMin: 12 },
    { id: 'sofia', name: 'Sofia Ramos', title: 'Video editor', role: 'Editor', email: 'sofia@northline.social', avatar: 'team-sofia.jpg', activeMin: 95 },
    { id: 'marcus', name: 'Marcus Reed', title: 'Community manager', role: 'Editor', email: 'marcus@northline.social', avatar: 'team-marcus.jpg', activeMin: 60 * 26 },
    { id: 'sam', name: 'Sam Haddad', title: 'Social coordinator', role: 'Contributor', email: 'sam@northline.social', avatar: 'team-sam.jpg', activeMin: 60 * 50 },
    { id: 'ellie', name: 'Ellie Park', title: 'Photographer (freelance)', role: 'Viewer', email: 'ellie.park.photo@gmail.com', avatar: null, invited: true },
  ],
};
export const DEMO_PLATFORMS = {
  instagram: { state: 'connected', handle: '5 accounts · @jessruns, @harborcoffee +3' },
  youtube: { state: 'connected', handle: '4 channels' },
  facebook: { state: 'connected', handle: '3 Pages' },
  tiktok: { state: 'drafts', handle: '4 accounts' },
  linkedin: { state: 'connected', handle: '2 company pages', note: 'Key renews in 41d' },
  threads: { state: 'available' },
  pinterest: { state: 'available' },
  bluesky: { state: 'available' },
  x: { state: 'paid' },
};

// The dashboard's "Team activity" card: recent things the team did, re-dated on every start.
export function demoActivity(posts, now = Date.now()) {
  const cap = (id) => (posts.find((p) => p.id === id)?.caption || '').split(/[.!?:]/)[0].slice(0, 48);
  const rows = [
    ['jordan', 'scheduled', 'd01', 12], ['sofia', 'scheduled', 'd20', 40], ['sofia', 'fixed the HDR on', 'd05', 95], ['sam', 'scheduled', 'd03', 60 * 5],
    ['marcus', 'moved', 'd04', 60 * 26], ['maya', 'invited Ellie Park as a Viewer', null, 60 * 30], ['jordan', 'posted', 'd06', 60 * 46],
  ];
  return rows.map(([who, verb, postId, mins]) => ({ who, verb, postId, brand: postId ? posts.find((p) => p.id === postId)?.brand || null : null, caption: postId ? cap(postId) : null, at: new Date(now - mins * 60e3).toISOString() }));
}

async function makeVideo(assets, media, [name, photo, secs, format, motion]) {
  const out = join(media, name);
  if (existsSync(out)) return;
  const big = format === 'hdr' || format === '4k';
  const [w, h] = big ? [2160, 3840] : [1080, 1920];
  const n = secs * 30;
  const zoom = motion === 'out' ? `1.16-0.16*on/${n}` : `1+0.16*on/${n}`;
  const y = motion === 'up' ? `(ih-ih/zoom)*(1-on/${n})` : 'ih/2-(ih/zoom/2)';
  const img = join(assets, `${photo}.jpg`);
  const input = existsSync(img) ? ['-i', img] : ['-f', 'lavfi', '-i', `gradients=s=1080x1920:n=3:seed=${name.length}:duration=0.04`];
  const vf = `crop='min(iw,ih*9/16)':'min(ih,iw*16/9)',scale=${w * 2}:${h * 2},zoompan=z='${zoom}':x='iw/2-(iw/zoom/2)':y='${y}':d=${n}:s=${w}x${h}:fps=30,noise=alls=7:allf=t,format=${format === 'hdr' ? 'yuv420p10le' : 'yuv420p'}`;
  const video = format === 'hdr'
    ? ['-c:v', 'libx265', '-preset', 'ultrafast', '-crf', '20', '-tag:v', 'hvc1', '-x265-params', 'colorprim=bt2020:transfer=arib-std-b67:colormatrix=bt2020nc:log-level=error', '-color_primaries', 'bt2020', '-color_trc', 'arib-std-b67', '-colorspace', 'bt2020nc']
    : ['-c:v', 'libx264', '-preset', 'fast', '-crf', big ? '22' : '19', '-maxrate', big ? '40M' : '14M', '-bufsize', '28M', '-profile:v', 'high'];
  const rate = format === 'hiaudio' ? '96000' : '48000';
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...input, '-f', 'lavfi', '-i', `anullsrc=r=${rate}:cl=stereo`,
    '-filter_complex', `[0:v]${vf}[v]`, '-map', '[v]', '-map', '1:a', '-t', String(secs), ...video,
    '-c:a', 'aac', '-b:a', '160k', ...(format === 'nofast' ? [] : ['-movflags', '+faststart']), out], { maxBuffer: 1 << 24 });
}

// How each route ends up on the viewer's phone. "Queue" = the platform re-encodes Queue's clean
// file once. "app" = the phone app compresses to 720p first, then the platform encodes it again.
const ROUTES = {
  instagram: ['-b:v', '3.5M', '-maxrate', '4M', '-bufsize', '8M'],
  facebook: ['-b:v', '4M', '-maxrate', '4.5M', '-bufsize', '9M'],
  linkedin: ['-b:v', '5M', '-maxrate', '6M', '-bufsize', '12M'],
  youtubeshorts: ['-b:v', '6M', '-maxrate', '7M', '-bufsize', '14M'],
};
async function serve(src, out, platform, viaApp) {
  if (existsSync(out)) return;
  const enc = (i, o, args, scale) => run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', i, '-vf', `scale=${scale},format=yuv420p`, '-c:v', 'libx264', '-preset', 'medium', ...args, '-an', '-movflags', '+faststart', o], { maxBuffer: 1 << 24 });
  if (!viaApp) return enc(src, out, ROUTES[platform], '1080:1920');
  const mid = out.replace(/\.mp4$/, '.app720.mp4');
  await enc(src, mid, ['-b:v', '2M', '-maxrate', '2.5M', '-bufsize', '5M'], '720:1280');
  await enc(mid, out, ROUTES[platform], '1080:1920');
}

async function pool(items, size, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: size }, async () => { while (queue.length) await fn(queue.shift()); }));
}

function seedPosts(media, assets) {
  const now = new Date();
  const at = (days, h, m = 0) => { const d = new Date(now); d.setDate(d.getDate() + days); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const later = (hours) => { const d = new Date(now.getTime() + hours * 3600e3); d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0); return d.toISOString(); };
  const ago = (iso, mins) => new Date(new Date(iso).getTime() - mins * 60e3).toISOString();
  const FORMAT = { instagram: 'Reel', youtubeshorts: 'Short', tiktok: 'Video', facebook: 'Reel', linkedin: 'Video' };
  const post = (id, file, caption, publishAt, status, platforms, fix, extra = {}) => {
    const log = [{ at: ago(publishAt, 60 * 26), msg: 'queued' }, { at: ago(publishAt, 60 * 26 - 1), msg: `prepared: ${fix}` }];
    if (['staged', 'ready', 'published'].includes(status)) log.push({ at: ago(publishAt, 120), msg: 'staged rupload' });
    if (['ready', 'published'].includes(status)) log.push({ at: ago(publishAt, 117), msg: 'Instagram finished processing' });
    if (status === 'published') log.push({ at: new Date(new Date(publishAt).getTime() + 12e3).toISOString(), msg: `published 1789${id.slice(1)} (12s after target)` });
    if (status === 'missed') log.push({ at: new Date(new Date(publishAt).getTime() + 5 * 3600e3).toISOString(), msg: 'missed by 5h' });
    if (status === 'failed') log.push({ at: ago(publishAt, 100), msg: "error: Instagram couldn't process the video" });
    const dest = (p) => ({ platform: p, format: FORMAT[p], status: status === 'published' ? (p === 'tiktok' ? 'drafts' : 'posted') : status === 'failed' && p !== 'instagram' ? 'scheduled' : status === 'missed' && ['youtubeshorts', 'facebook'].includes(p) ? 'posted' : status });
    return {
      id, platform: 'instagram_reels', kind: 'reel', file: file && join(media, file), source: file, caption, coverOffsetMs: null, fix,
      publishAt, status, containerId: null, mediaId: status === 'published' ? `1789${id.slice(1)}` : null,
      permalink: status === 'published' ? 'https://www.instagram.com/' : null, attempts: status === 'failed' ? 3 : 0,
      error: status === 'failed' ? "Instagram couldn't process the video" : status === 'missed' ? `Missed its ${new Date(publishAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} slot by 5h (Mac off or asleep). Post now, pick a new time, or remove it.` : null,
      ...(status === 'published' ? { publishedAt: new Date(new Date(publishAt).getTime() + 12e3).toISOString() } : {}),
      platforms, destinations: platforms.map(dest), log, by: BY[id] || 'maya', brand: BRAND[id] || null, ...extra,
    };
  };
  // Who on the team scheduled each post, and which of the studio's accounts it's for.
  const BY = { d01: 'jordan', d02: 'sam', d03: 'sam', d04: 'marcus', d05: 'sofia', d06: 'jordan', d07: 'marcus', d08: 'sofia', d09: 'sam', d10: 'marcus', d11: 'sofia', d12: 'jordan', d13: 'maya', d14: 'marcus', d15: 'sam', d16: 'jordan', d17: 'sam', d18: 'jordan', d19: 'marcus', d20: 'sofia' };
  const BRAND = { d01: 'grace', d02: 'harbor', d03: 'jess', d04: 'riverside', d05: 'harbor', d06: 'harbor', d07: 'grace', d08: 'harbor', d09: 'harbor', d10: 'grace', d11: 'jess', d12: 'tides', d13: 'jess', d14: 'tides', d15: 'jess', d16: 'harbor', d17: 'jess', d18: 'tides', d19: 'riverside', d20: 'tides' };
  const P = [
    post('d01', 'worship-night.mov', 'Worship night highlights 🙌 Grateful for everyone who showed up. Full set on our channel. #worshipnight', later(2.5), 'ready', ['instagram', 'youtubeshorts', 'tiktok', 'facebook', 'linkedin'], 'hdr'),
    post('d02', 'coffee-bts.mp4', 'Behind the bar: our new espresso setup ☕', later(5), 'staged', ['instagram', 'tiktok'], 'remux'),
    post('d03', 'marathon-wk6.mov', 'Marathon training week 6 🏃‍♀️ the long run, the fuel, the wall', at(1, 12), 'queued', ['youtubeshorts', 'instagram'], 'none'),
    post('d04', 'open-mic.mp4', "Open mic night at Riverside: Dev's airport bit finally landed 😂 Sign-ups for next Thursday are open", at(1, 19, 15), 'queued', ['tiktok', 'instagram', 'youtubeshorts'], 'audio-only'),
    post('d05', 'pour-over-60.mov', 'Pour-over recipe in 60 seconds', at(2, 8), 'queued', ['instagram', 'tiktok', 'youtubeshorts', 'facebook'], 'hdr'),
    post('d06', 'weekly-recap.mp4', 'This week at Harbor Coffee', at(-2, 18, 30), 'published', ['instagram', 'linkedin', 'facebook'], 'none'),
    post('d07', 'sunday-recap.mov', 'Sunday recap', at(-3, 18, 30), 'missed', ['instagram', 'facebook'], 'none'),
    post('d08', 'pour-over-60.mov', 'Pour-over recipe (v1)', at(-1, 12), 'failed', ['instagram', 'tiktok'], 'hdr'),
    post('d09', 'latte-fails.mp4', 'Latte art fails compilation ☕😅', at(10, 8), 'queued', ['instagram', 'tiktok'], 'none'),
    post('d10', 'youth-night.mov', 'Youth night recap: thanks for packing the room', at(13, 18, 30), 'queued', ['instagram', 'facebook'], 'none'),
    post('d11', 'camera-test.mp4', 'New camera test: FX3 + 35mm, straight out of camera', at(-5, 18, 30), 'published', ['youtubeshorts', 'instagram'], 'none'),
    post('d12', 'friday-crew.mp4', 'Friday night with the crew after load-out', at(-7, 20), 'published', ['instagram', 'tiktok', 'facebook'], 'none'),
    post('d15', 'marathon-wk6.mov', 'Long run recap: 16 miles', at(-9, 7, 30), 'published', ['instagram'], 'none'),
    post('d16', 'coffee-bts.mp4', 'Coffee corner tour', at(-12, 12), 'published', ['instagram', 'tiktok'], 'remux'),
    post('d17', 'race-morning.mov', 'Race morning routine, start to start line', at(17, 9), 'queued', ['instagram', 'youtubeshorts'], 'none'),
    post('d18', 'youth-night.mov', 'Tour diary, night 3: you were LOUD 🔊', at(20, 18, 30), 'queued', ['instagram', 'youtubeshorts'], 'none'),
    post('d19', 'q-and-a.mov', "Artist Q&A: this month's resident muralist", at(4, 12), 'queued', ['instagram', 'youtubeshorts', 'linkedin'], 'reencode'),
    post('d20', 'drums-story.mp4', 'New single "Undertow" out Friday 🌊 Pre-save, link in bio', at(5, 18), 'queued', ['instagram', 'tiktok', 'youtubeshorts'], 'none'),
  ];
  // Photo carousel + story — only the demo knows these formats so far.
  const img = (n) => (existsSync(join(assets, `${n}.jpg`)) ? `${n}.jpg` : null);
  P.push({ ...post('d13', null, 'My week in 6 frames 📸 long runs, a trail sunrise, a new lens and too much coffee.', at(2, 9), 'queued', ['instagram', 'tiktok', 'facebook'], 'none'), kind: 'photos', images: ['runner', 'trail', 'camera', 'city', 'latte', 'airport'].map(img).filter(Boolean) });
  P.push({ ...post('d14', null, "Tonight's show 🥁", at(3, 21), 'queued', ['instagram', 'facebook'], 'none'), kind: 'story', images: ['drums', 'concert', 'youth'].map(img).filter(Boolean) });
  for (const p of P) if (p.kind !== 'reel') p.destinations = p.platforms.map((pl) => ({ platform: pl, format: p.kind === 'story' ? 'Story' : pl === 'instagram' ? 'Carousel' : pl === 'tiktok' ? 'Photo post' : pl === 'linkedin' ? 'Multi-image' : 'Multi-photo', status: 'queued' }));
  return P;
}

// Which posted clips get measured, and through which routes.
const MEASURE = [
  ['d06', 'weekly-recap.mp4', [['instagram', false], ['instagram', true], ['linkedin', false], ['facebook', false]]],
  ['d11', 'camera-test.mp4', [['instagram', false], ['instagram', true], ['youtubeshorts', false]]],
  ['d12', 'friday-crew.mp4', [['instagram', false], ['facebook', false]]],
  ['d15', 'marathon-wk6.mov', [['instagram', false]]],
  ['d16', 'coffee-bts.mp4', [['instagram', false], ['instagram', true]]],
];

// A sample benchmark: three clips through five routes. The routes are SIMULATED stand-ins
// (Scheduler A/B/C are not real products), but every score is a real VMAF measurement.
const BENCH_CLIPS = ['marathon-wk6.mov', 'open-mic.mp4', 'q-and-a.mov'];
const BENCH_ROUTES = {
  // what each route does to the file before Instagram's own ~3.5 Mbps encode
  Queue: (clip) => (clip === 'q-and-a.mov' ? ['-vf', "scale='min(1080,iw)':-2:flags=lanczos,format=yuv420p", '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '17'] : null),
  'Instagram app': () => ['-vf', 'scale=720:-2,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '2M', '-maxrate', '2.5M', '-bufsize', '5M'],
  'Scheduler A': () => ['-vf', 'scale=1080:-2,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '6M', '-maxrate', '7M', '-bufsize', '14M'],
  'Scheduler B': () => ['-vf', 'scale=720:-2,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '3M', '-maxrate', '3.5M', '-bufsize', '7M'],
  'Scheduler C': () => null, // hands Instagram the original untouched
};
async function benchServe(src, out, route, clip) {
  if (existsSync(out)) return;
  const pre = BENCH_ROUTES[route](clip);
  let input = src;
  if (pre) { input = out.replace(/\.mp4$/, '.pre.mp4'); await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, ...pre, '-an', input], { maxBuffer: 1 << 24 }); }
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-vf', 'scale=1080:1920,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', ...ROUTES.instagram, '-an', '-movflags', '+faststart', out], { maxBuffer: 1 << 24 });
}

export async function buildDemo(root, { log = console.log } = {}) {
  const dir = join(root, 'demo');
  const assets = join(dir, 'assets'); const media = join(dir, 'media'); const data = join(dir, 'data'); const qdir = join(data, 'quality');
  for (const d of [assets, media, data, qdir]) mkdirSync(d, { recursive: true });

  const missing = VIDEOS.filter(([n]) => !existsSync(join(media, n)));
  if (missing.length) log(`  Making ${missing.length} demo videos (first run only, about a minute)…`);
  await pool(missing, 3, (v) => makeVideo(assets, media, v));

  const posts = seedPosts(media, assets);
  writeFileSync(join(data, 'queue.json'), JSON.stringify(posts, null, 1));
  const now = Date.now();
  const team = { ...DEMO_TEAM, members: DEMO_TEAM.members.map(({ activeMin, ...m }) => ({ ...m, lastActive: activeMin == null ? null : new Date(now - activeMin * 60e3).toISOString() })) };
  writeFileSync(join(data, 'demo.json'), JSON.stringify({ account: DEMO_ACCOUNT, platforms: DEMO_PLATFORMS, brands: DEMO_BRANDS, team, activity: demoActivity(posts, now) }, null, 1));

  // Real measurements, cached by the clip's size so a rebuilt video is re-measured.
  const qfile = join(data, 'quality.json');
  const old = existsSync(qfile) ? JSON.parse(readFileSync(qfile, 'utf8')) : [];
  const jobs = MEASURE.flatMap(([postId, file, routes]) => routes.map(([platform, viaApp]) => ({ postId, file, platform, viaApp, id: `${postId}-${platform}${viaApp ? '-app' : ''}` })));
  const todo = jobs.filter((j) => !old.some((q) => q.id === j.id && q.bytes === statSync(join(media, j.file)).size));
  if (todo.length) log(`  Measuring ${todo.length} quality comparisons with VMAF (first run only)…`);
  const fresh = [];
  await pool(todo, 2, async (j) => {
    const served = `${j.id}.mp4`;
    await serve(join(media, j.file), join(qdir, served), j.platform, j.viaApp);
    const result = await compare(join(media, j.file), join(qdir, served));
    fresh.push({ id: j.id, postId: j.postId, platform: j.platform, route: j.viaApp ? 'app' : 'queue', original: j.file, served, bytes: statSync(join(media, j.file)).size, result });
  });
  // The sample benchmark (cached like the measurements above).
  const benchJobs = BENCH_CLIPS.flatMap((clip) => Object.keys(BENCH_ROUTES).map((route) => ({ clip, route, id: `bench-demo-${clip.replace(/\W+/g, '')}-${route.replace(/\W+/g, '').toLowerCase()}` })));
  const benchTodo = benchJobs.filter((j) => !old.some((q) => q.id === j.id && q.bytes === statSync(join(media, j.clip)).size));
  if (benchTodo.length) log(`  Running the sample benchmark: ${benchTodo.length} measurements (first run only)…`);
  await pool(benchTodo, 2, async (j) => {
    const served = `${j.id}.mp4`;
    await benchServe(join(media, j.clip), join(qdir, served), j.route, j.clip);
    const result = await compare(join(media, j.clip), join(qdir, served));
    fresh.push({ id: j.id, benchmarkId: 'bm-demo', route: 'bench', label: j.route, platform: 'instagram', original: j.clip, served, bytes: statSync(join(media, j.clip)).size, at: new Date(Date.now() - 86400e3).toISOString(), result });
  });
  writeFileSync(join(data, 'benchmarks.json'), JSON.stringify([{ id: 'bm-demo', name: 'Launch benchmark', createdAt: new Date(Date.now() - 2 * 86400e3).toISOString(), note: 'Simulated routes: Scheduler A, B and C are stand-ins, not real products. Every score is a real VMAF measurement of the simulated file.' }], null, 1));

  const keep = (q) => jobs.some((j) => j.id === q.id) || benchJobs.some((j) => j.id === q.id);
  const all = [...old.filter((q) => keep(q) && !fresh.some((f) => f.id === q.id)), ...fresh];
  // Re-date measurements to just after each post went out.
  for (const q of all) { if (q.benchmarkId) continue; const p = posts.find((x) => x.id === q.postId); q.at = p ? new Date(new Date(p.publishAt).getTime() + 5 * 60e3).toISOString() : q.at; }
  writeFileSync(qfile, JSON.stringify(all, null, 1));
  for (const p of posts) {
    const q = all.find((x) => x.postId === p.id && x.platform === 'instagram' && x.route === 'queue');
    if (q) p.log.push({ at: q.at, msg: `quality measured: VMAF ${q.result.vmaf}` });
    for (const d of p.destinations) { const m = all.find((x) => x.postId === p.id && x.platform === d.platform && x.route === 'queue'); if (m) d.vmaf = m.result.vmaf; }
  }
  writeFileSync(join(data, 'queue.json'), JSON.stringify(posts, null, 1));
  return { dir, media, data };
}
