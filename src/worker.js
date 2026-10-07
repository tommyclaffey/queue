// One tick of the scheduler. Runs every 30 seconds.
//
//   queued ──(inside stage window)──▶ staged ──(Meta: FINISHED)──▶ ready ──(post time)──▶ published
//     ▲                                  │                           │
//     └──── EXPIRED / stuck / lost link ─┘◀──── EXPIRED at publish ──┘
//                                              ERROR / permanent API error ──▶ failed
//
// Transient problems (wifi drop, Meta hiccup, rate limit) don't fail the post.
// They're retried on later ticks, up to MAX_ATTEMPTS, then it fails loudly.
//
// 🛑 NEVER DOUBLE-POST. A container can only be published once, so re-publishing the SAME
// container is safe. The danger is a NEW container for a post whose old one secretly went
// live (e.g. the wifi dropped after Meta published but before we heard back). So:
//   • after any publish error we ask Meta what happened to the container
//   • retry/edit remember the old container (prevContainerId) and check it before re-uploading
//
// 📸 PHOTOS AND STORIES (kind 'photos' | 'story', files in post.imageFiles). Photos only travel by
// temporary public link (image_url), so they always use the FileShare, whatever the upload mode.
//   • one photo   → one image container (caption on it) → publish it
//   • 2–10 photos → one container per item (post.children) + the carousel container (post.containerId,
//                   caption on it). Meta reports the carousel FINISHED once every item is → publish it
//   • story       → one STORIES container per frame (post.frames[i].id), published in order at post
//                   time. Each frame is recorded the moment it goes live (frames[i].published), so a
//                   story that stops midway resumes with the NEXT frame — a live frame is never re-sent.
//
// ⏰ MISSED POSTS. If the Mac was off or asleep at post time, a post more than LATE_LIMIT_MIN
// late is NOT posted automatically — it becomes 'missed' and waits for "Post now" or a new time.
const STAGE_MAX_MIN = 23 * 60; // containers expire at 24h — leave an hour of margin
export const MAX_ATTEMPTS = 6;
export const MAX_STUCK = 3;
const STUCK_MIN = 60; // Meta usually processes in minutes. An hour means something's wrong.

export const isMulti = (post) => post.kind === 'photos' || post.kind === 'story';
// Every temporary link a post holds open (a Reel has one; a carousel or story one per photo).
export const tokensOf = (post) => [post.shareToken, ...(post.shareTokens || [])].filter(Boolean);
const what = (post) => (isMulti(post) ? (post.imageFiles?.length > 1 ? 'photos' : 'photo') : 'video');

export async function tick(queue, ig, { files = null, stageWindowMin = 120, lateLimitMin = 120, notify = () => {}, log = console.log, now = Date.now() } = {}) {
  if (tick.running) return; // a slow upload must not overlap the next tick
  tick.running = true;
  try {
    // Close any temporary link whose post is no longer waiting on Meta (failed, edited from
    // the CLI, removed…). Only 'staged' posts need their link.
    if (files) await files.retainOnly(new Set(queue.posts.filter((p) => p.status === 'staged').flatMap(tokensOf)));

    const windowMs = Math.min(stageWindowMin, STAGE_MAX_MIN) * 60_000;
    // Earliest first, so a backlog publishes in order.
    const posts = [...queue.posts].sort((a, b) => a.publishAt.localeCompare(b.publishAt));
    const ctx = { queue, ig, files, windowMs, lateLimitMs: lateLimitMin * 60_000, notify, log, now };
    for (const post of posts) await step(post, ctx);
  } finally {
    tick.running = false;
  }
}

// Best-effort: find the live post Meta made from a container we lost track of.
async function findLiveMedia(ig, sinceMs) {
  try {
    const recent = await ig.recentMedia(5);
    return recent.find((m) => new Date(m.timestamp).getTime() >= sinceMs - 10 * 60_000) || null;
  } catch {
    return null;
  }
}

const KIND_NAME = { photos: 'Your photo post', story: 'Your story' };
const snippet = (post) => (post.caption ? `“${post.caption.slice(0, 60)}${post.caption.length > 60 ? '…' : ''}”` : KIND_NAME[post.kind] || 'Your Reel');
const clock = (iso) => new Date(iso).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });

function markMissed(post, { queue, notify, log, now }, tag, extra = {}) {
  const hours = Math.round((now - new Date(post.publishAt).getTime()) / 3_600_000);
  const late = hours >= 1 ? `${hours}h` : 'over an hour';
  queue.update(post, { status: 'missed', error: `Missed its ${clock(post.publishAt)} slot by ${late} (Mac off or asleep). Post now, pick a new time, or remove it.`, ...extra }, `missed by ${late}`);
  log(`${tag} ⏰ missed its slot by ${late} — waiting for you`);
  notify('Missed a post', `${snippet(post)} missed its ${clock(post.publishAt)} slot. Open Queue to post now or reschedule.`);
}

async function markPublished(post, { queue, ig, log, notify }, tag, { mediaId = null, note }) {
  queue.update(post, { status: 'published', mediaId, publishedAt: new Date().toISOString(), error: null, prevContainerId: null }, note);
  log(`${tag} ✅ published`);
  notify('Posted ✅', `${snippet(post)} is live on Instagram.`);
  try {
    // Stories never show up in the feed list, so don't guess one from it.
    const m = mediaId ? await ig.media(mediaId) : post.kind === 'story' ? null : await findLiveMedia(ig, new Date(post.publishAt).getTime());
    queue.update(post, { permalink: m?.permalink || null, mediaId: mediaId || m?.id || null });
  } catch {}
}

async function step(post, ctx) {
  const { queue, ig, files, windowMs, lateLimitMs, notify, log, now } = ctx;
  const due = new Date(post.publishAt).getTime();
  const tooLate = now - due > lateLimitMs && !post.allowLate;
  const tag = `[${post.id}]`;
  const rev = post.rev || 0;
  // Edited, retried or removed (e.g. in the web app) while we were waiting on Meta?
  const edited = () => {
    const live = queue.get(post.id);
    return !live || (live.rev || 0) !== rev;
  };
  const changed = (expectStatus) => edited() || queue.get(post.id).status !== expectStatus;

  try {
    // ⏰ Way past its time and never uploaded? Don't post it by surprise — ask first.
    if (post.status === 'queued' && tooLate) return markMissed(post, ctx, tag);

    // 0. Before re-uploading a retried/edited post, make sure its OLD container didn't go live.
    if (post.status === 'queued' && post.prevContainerId && due - now <= windowMs) {
      const { code } = await ig.status(post.prevContainerId);
      if (changed('queued')) return;
      if (code === 'PUBLISHED') {
        return markPublished(post, ctx, tag, { note: 'the earlier upload had already gone live — not posting again' });
      }
      queue.update(post, { prevContainerId: null });
    }

    // 1. Upload early so Instagram finishes processing before the post time.
    if (post.status === 'queued' && due - now <= windowMs && isMulti(post)) {
      if ((await stageMulti(post, ctx, tag, changed)) === 'stop') return;
    } else if (post.status === 'queued' && due - now <= windowMs) {
      let share = null;
      if (ig.uploadMode === 'url' && !ig.dryRun) {
        if (!files) throw new Error('url upload mode needs a FileShare');
        share = await files.share(post.file);
        log(`${tag} staging — Instagram is downloading the original file`);
      } else {
        log(`${tag} staging — uploading original file to Instagram`);
      }
      try {
        const containerId = await ig.stage({ file: post.file, videoUrl: share?.url, caption: post.caption, coverOffsetMs: post.coverOffsetMs });
        if (changed('queued')) {
          if (share) await files.unshare(share.token);
          log(`${tag} changed during upload — discarding that upload`);
          return;
        }
        queue.update(post, { status: 'staged', containerId, shareToken: share?.token || null, stagedAt: new Date(now).toISOString(), error: null }, `staged ${containerId}`);
      } catch (err) {
        if (share) await files.unshare(share.token);
        throw err;
      }
    }

    // 2. Wait for Meta's processing to finish.
    if (post.status === 'staged') {
      const { code, detail } = await stagedStatus(post, ctx);
      if (changed('staged')) return log(`${tag} changed while checking Instagram — skipping`);
      const release = async () => {
        const tokens = tokensOf(post);
        if (files) for (const t of tokens) await files.unshare(t);
        if (tokens.length) queue.update(post, { shareToken: null, shareTokens: null });
      };
      // Back to the queue for a fresh upload. Story frames already live are kept (and skipped).
      const fresh = { status: 'queued', containerId: null, children: null };
      if (code === 'FINISHED') {
        await release();
        queue.update(post, { status: 'ready', attempts: 0, error: null }, 'Instagram finished processing');
      } else if (code === 'ERROR') {
        await release();
        // In link mode a dropped tunnel looks exactly like a bad file. Give it one fresh try.
        if ((ig.uploadMode === 'url' || isMulti(post)) && !post.stageRetried) {
          return queue.update(post, { ...fresh, stageRetried: true }, `processing ERROR (${detail || 'no detail'}) — retrying once`);
        }
        queue.update(post, { status: 'failed', error: `Instagram couldn't process the ${what(post)}${detail ? ': ' + detail : ''}` }, 'processing ERROR');
        return notify('Post failed', `${snippet(post)}: Instagram couldn't process the ${what(post)}.`);
      } else if (code === 'EXPIRED') {
        await release();
        return queue.update(post, fresh, 'container expired — will re-stage');
      } else if (code === 'PUBLISHED') {
        await release();
        return markPublished(post, ctx, tag, { note: 'Meta reports it already published' });
      } else if (now - new Date(post.stagedAt).getTime() > STUCK_MIN * 60_000) {
        await release();
        // Counted separately from `attempts`, which a successful upload resets.
        const stuck = (post.stuckCount || 0) + 1;
        if (stuck >= MAX_STUCK) {
          queue.update(post, { status: 'failed', stuckCount: stuck, containerId: null, children: null, error: `Instagram was still processing after ${STUCK_MIN} min, ${stuck} times in a row` }, 'stuck — giving up');
          return notify('Post failed', `${snippet(post)}: Instagram never finished processing it.`);
        }
        return queue.update(post, { ...fresh, stuckCount: stuck }, `stuck in ${code} for ${STUCK_MIN}+ min — re-staging`);
      } else if (files && tokensOf(post).some((t) => !files.has(t))) {
        // App restarted or tunnel died mid-download: the link is dead. Start over rather than wait for ERROR.
        if (files) for (const t of tokensOf(post)) await files.unshare(t);
        return queue.update(post, { ...fresh, shareToken: null, shareTokens: null }, 'file link lost — re-staging');
      }
    }

    // 3. Fire at the scheduled time.
    if (post.status === 'ready' && now >= due) {
      if (tooLate) return markMissed(post, ctx, tag); // keeps containerId, so "Post now" is instant
      // A story spends one post of the daily quota per frame.
      const need = post.kind === 'story' ? Math.max(1, (post.frames || []).filter((f) => !f.published).length) : 1;
      const { used, total } = await ig.quota();
      if (used + need > total) return log(`${tag} holding — ${total} posts/24h API limit reached`);
      if (changed('ready')) return log(`${tag} changed just before posting — skipping`);
      if (post.kind === 'story') return await publishStory(post, ctx, tag, due);

      let mediaId;
      try {
        mediaId = await ig.publish(post.containerId); // single attempt — see NEVER DOUBLE-POST above
      } catch (err) {
        // Did it actually go live? Ask Meta before deciding anything.
        let code = null;
        try {
          ({ code } = await ig.status(post.containerId));
        } catch {}
        if (code === 'PUBLISHED') return markPublished(post, ctx, tag, { note: 'publish reply was lost, but Meta confirms it is live' });
        if (code === 'EXPIRED') return queue.update(post, { status: 'queued', containerId: null, children: null }, 'container expired before posting — will re-stage');
        throw err; // FINISHED (not live) or unknown: safe to try the SAME container again
      }
      if (changed('ready')) log(`${tag} was edited while posting — the earlier version went live`);
      const lateBy = Math.round((Date.now() - due) / 1000);
      return markPublished(post, ctx, tag, { mediaId, note: `published ${mediaId} (${lateBy}s after target)` });
    }

    if (['queued', 'staged'].includes(post.status) && now - due > 15 * 60_000 && !post.lateWarned) {
      queue.update(post, { lateWarned: true }, 'running 15+ min late');
      log(`${tag} ⚠️ 15+ min late and still ${post.status}`);
    }
  } catch (err) {
    if (edited()) return log(`${tag} error after the post was changed — ignoring: ${err.message}`);
    const attempts = (post.attempts || 0) + 1;
    if (err.transient && attempts < MAX_ATTEMPTS) {
      queue.update(post, { attempts, error: `Retrying (${attempts}/${MAX_ATTEMPTS - 1}): ${err.message}` }, `transient error: ${err.message}`);
      log(`${tag} ↻ ${err.message} — will retry`);
    } else {
      // Keep containerId: if this was a publish, Retry will check whether it secretly went live.
      queue.update(post, { status: 'failed', attempts, error: err.message, shareToken: null, shareTokens: null }, `error: ${err.message}`);
      log(`${tag} ❌ ${err.message}`);
      notify('Post failed', `${snippet(post)}: ${err.message}`);
    }
  }
}

// ---- Photos and stories ---------------------------------------------------------------------

const frameList = (post) => (post.imageFiles || []).map((_, i) => ({ id: null, published: false, mediaId: null, ...(post.frames?.[i] || {}) }));
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// queued → staged for a photo post or story. Returns 'stop' when the post must not go further this tick.
async function stageMulti(post, ctx, tag, changed) {
  const { queue, ig, files, log, now } = ctx;
  const paths = post.imageFiles || [];
  if (!paths.length) throw new Error('This post has no photos.');
  const needLink = !ig.dryRun;
  if (needLink && !files) throw new Error('Photos go to Instagram by temporary link, and no link server is set up.');
  const story = post.kind === 'story';

  let frames = null;
  if (story) {
    // 🛑 NEVER DOUBLE-POST: before re-staging a frame, ask Meta whether its old container went live.
    frames = frameList(post);
    let found = 0;
    for (const f of frames) {
      if (f.published || !f.id) continue;
      const { code } = await ig.status(f.id);
      if (code === 'PUBLISHED') { f.published = true; found++; }
    }
    if (changed('queued')) return 'stop';
    if (found) queue.update(post, { frames }, `${plural(found, 'frame')} had already gone live — not posting ${found === 1 ? 'it' : 'them'} again`);
    if (frames.every((f) => f.published)) {
      await markPublished(post, ctx, tag, { mediaId: frames.find((f) => f.mediaId)?.mediaId || null, note: 'every frame had already gone live — not posting again' });
      return 'stop';
    }
  }

  const todo = story ? frames.flatMap((f, i) => (f.published ? [] : [i])) : paths.map((_, i) => i);
  const tokens = [];
  const urls = {};
  try {
    if (needLink) {
      for (const i of todo) { const s = await files.share(paths[i]); tokens.push(s.token); urls[i] = s.url; }
    }
    log(`${tag} staging — Instagram is downloading ${plural(todo.length, story ? 'frame' : 'photo')}`);
    let patch; let note;
    if (story) {
      for (const i of todo) frames[i] = { id: await ig.stageStory({ imageUrl: urls[i] }), published: false, mediaId: null };
      patch = { frames, containerId: null };
      note = `staged ${plural(todo.length, 'story frame')} ${todo.map((i) => frames[i].id).join(', ')}`;
    } else if (paths.length === 1) {
      patch = { containerId: await ig.stagePhoto({ imageUrl: urls[0], caption: post.caption }), children: null };
      note = `staged photo ${patch.containerId}`;
    } else {
      const children = [];
      for (const i of todo) children.push(await ig.stageItem({ imageUrl: urls[i] }));
      patch = { children, containerId: await ig.stageCarousel({ children, caption: post.caption }) };
      note = `staged carousel ${patch.containerId} (${plural(children.length, 'item')})`;
    }
    if (changed('queued')) {
      for (const t of tokens) await files.unshare(t);
      log(`${tag} changed during upload — discarding that upload`);
      return 'stop';
    }
    queue.update(post, { status: 'staged', ...patch, shareToken: null, shareTokens: tokens, stagedAt: new Date(now).toISOString(), error: null }, note);
  } catch (err) {
    for (const t of tokens) await files.unshare(t);
    throw err;
  }
}

// Meta's processing status for a staged post. A story is FINISHED only when every frame not yet
// live is; ERROR or EXPIRED on any one frame counts for the whole story.
async function stagedStatus(post, { ig, queue }) {
  if (post.kind !== 'story') return ig.status(post.containerId);
  const frames = frameList(post);
  const seen = [];
  for (const f of frames) {
    if (f.published) continue;
    const s = await ig.status(f.id);
    if (s.code === 'PUBLISHED') { f.published = true; continue; }
    if (s.code === 'ERROR') return s;
    seen.push(s);
  }
  if (frames.some((f, i) => f.published && !post.frames?.[i]?.published)) queue.update(post, { frames }, 'a frame was already live — it will not be posted again');
  if (!seen.length) return { code: 'PUBLISHED' };
  return seen.find((s) => s.code === 'EXPIRED') || seen.find((s) => s.code !== 'FINISHED') || { code: 'FINISHED' };
}

// Publishes a story's frames in order, one publish per frame, recording each the moment it is live.
async function publishStory(post, ctx, tag, due) {
  const { queue, ig } = ctx;
  const n = post.frames.length;
  const setFrame = (i, patch, msg) => queue.update(post, { frames: post.frames.map((f, k) => (k === i ? { ...f, ...patch } : f)) }, msg);
  for (let i = 0; i < n; i++) {
    const f = post.frames[i];
    if (f.published) continue;
    let mediaId;
    try {
      mediaId = await ig.publish(f.id); // single attempt — see NEVER DOUBLE-POST above
    } catch (err) {
      let code = null;
      try {
        ({ code } = await ig.status(f.id));
      } catch {}
      if (code === 'PUBLISHED') { setFrame(i, { published: true, mediaId: null }, `frame ${i + 1}/${n}: publish reply was lost, but Meta confirms it is live`); continue; }
      if (code === 'EXPIRED') return queue.update(post, { status: 'queued', containerId: null }, `frame ${i + 1}/${n} expired before posting — will re-stage the frames not yet live`);
      throw err; // frames already live stay recorded; the next try resumes at this frame
    }
    setFrame(i, { published: true, mediaId }, `frame ${i + 1}/${n} live (${mediaId})`);
  }
  const lateBy = Math.round((Date.now() - due) / 1000);
  return markPublished(post, ctx, tag, { mediaId: post.frames.find((f) => f.mediaId)?.mediaId || null, note: `story published — ${plural(n, 'frame')} (${lateBy}s after target)` });
}
