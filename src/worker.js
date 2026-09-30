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
const STAGE_MAX_MIN = 23 * 60; // containers expire at 24h — leave an hour of margin
export const MAX_ATTEMPTS = 6;
export const MAX_STUCK = 3;
const STUCK_MIN = 60; // Meta usually processes in minutes. An hour means something's wrong.

export async function tick(queue, ig, { files = null, stageWindowMin = 120, log = console.log, now = Date.now() } = {}) {
  if (tick.running) return; // a slow upload must not overlap the next tick
  tick.running = true;
  try {
    // Close any temporary link whose post is no longer waiting on Meta (failed, edited from
    // the CLI, removed…). Only 'staged' posts need their link.
    if (files) await files.retainOnly(new Set(queue.posts.filter((p) => p.status === 'staged' && p.shareToken).map((p) => p.shareToken)));

    const windowMs = Math.min(stageWindowMin, STAGE_MAX_MIN) * 60_000;
    // Earliest first, so a backlog publishes in order.
    const posts = [...queue.posts].sort((a, b) => a.publishAt.localeCompare(b.publishAt));
    for (const post of posts) await step(post, queue, ig, files, windowMs, log, now);
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

async function markPublished(post, queue, ig, log, tag, { mediaId = null, note }) {
  queue.update(post, { status: 'published', mediaId, publishedAt: new Date().toISOString(), error: null, prevContainerId: null }, note);
  log(`${tag} ✅ published`);
  try {
    const m = mediaId ? await ig.media(mediaId) : await findLiveMedia(ig, new Date(post.publishAt).getTime());
    queue.update(post, { permalink: m?.permalink || null, mediaId: mediaId || m?.id || null });
  } catch {}
}

async function step(post, queue, ig, files, windowMs, log, now) {
  const due = new Date(post.publishAt).getTime();
  const tag = `[${post.id}]`;
  const rev = post.rev || 0;
  // Edited, retried or removed (e.g. in the web app) while we were waiting on Meta?
  const edited = () => {
    const live = queue.get(post.id);
    return !live || (live.rev || 0) !== rev;
  };
  const changed = (expectStatus) => edited() || queue.get(post.id).status !== expectStatus;

  try {
    // 0. Before re-uploading a retried/edited post, make sure its OLD container didn't go live.
    if (post.status === 'queued' && post.prevContainerId && due - now <= windowMs) {
      const { code } = await ig.status(post.prevContainerId);
      if (changed('queued')) return;
      if (code === 'PUBLISHED') {
        return markPublished(post, queue, ig, log, tag, { note: 'the earlier upload had already gone live — not posting again' });
      }
      queue.update(post, { prevContainerId: null });
    }

    // 1. Upload early so Instagram finishes processing before the post time.
    if (post.status === 'queued' && due - now <= windowMs) {
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
      const { code, detail } = await ig.status(post.containerId);
      if (changed('staged')) return log(`${tag} changed while checking Instagram — skipping`);
      const release = async () => {
        if (post.shareToken && files) await files.unshare(post.shareToken);
        if (post.shareToken) queue.update(post, { shareToken: null });
      };
      if (code === 'FINISHED') {
        await release();
        queue.update(post, { status: 'ready', attempts: 0, error: null }, 'Instagram finished processing');
      } else if (code === 'ERROR') {
        await release();
        // In link mode a dropped tunnel looks exactly like a bad file. Give it one fresh try.
        if (ig.uploadMode === 'url' && !post.stageRetried) {
          return queue.update(post, { status: 'queued', containerId: null, stageRetried: true }, `processing ERROR (${detail || 'no detail'}) — retrying once`);
        }
        return queue.update(post, { status: 'failed', error: `Instagram couldn't process the video${detail ? ': ' + detail : ''}` }, 'processing ERROR');
      } else if (code === 'EXPIRED') {
        await release();
        return queue.update(post, { status: 'queued', containerId: null }, 'container expired — will re-stage');
      } else if (code === 'PUBLISHED') {
        await release();
        return markPublished(post, queue, ig, log, tag, { note: 'Meta reports it already published' });
      } else if (now - new Date(post.stagedAt).getTime() > STUCK_MIN * 60_000) {
        await release();
        // Counted separately from `attempts`, which a successful upload resets.
        const stuck = (post.stuckCount || 0) + 1;
        if (stuck >= MAX_STUCK) return queue.update(post, { status: 'failed', stuckCount: stuck, containerId: null, error: `Instagram was still processing after ${STUCK_MIN} min, ${stuck} times in a row` }, 'stuck — giving up');
        return queue.update(post, { status: 'queued', containerId: null, stuckCount: stuck }, `stuck in ${code} for ${STUCK_MIN}+ min — re-staging`);
      } else if (post.shareToken && files && !files.has(post.shareToken)) {
        // App restarted or tunnel died mid-download: the link is dead. Start over rather than wait for ERROR.
        return queue.update(post, { status: 'queued', containerId: null, shareToken: null }, 'file link lost — re-staging');
      }
    }

    // 3. Fire at the scheduled time.
    if (post.status === 'ready' && now >= due) {
      const { used, total } = await ig.quota();
      if (used >= total) return log(`${tag} holding — ${total} posts/24h API limit reached`);
      if (changed('ready')) return log(`${tag} changed just before posting — skipping`);

      let mediaId;
      try {
        mediaId = await ig.publish(post.containerId); // single attempt — see NEVER DOUBLE-POST above
      } catch (err) {
        // Did it actually go live? Ask Meta before deciding anything.
        let code = null;
        try {
          ({ code } = await ig.status(post.containerId));
        } catch {}
        if (code === 'PUBLISHED') return markPublished(post, queue, ig, log, tag, { note: 'publish reply was lost, but Meta confirms it is live' });
        if (code === 'EXPIRED') return queue.update(post, { status: 'queued', containerId: null }, 'container expired before posting — will re-stage');
        throw err; // FINISHED (not live) or unknown: safe to try the SAME container again
      }
      if (changed('ready')) log(`${tag} was edited while posting — the earlier version went live`);
      const lateBy = Math.round((Date.now() - due) / 1000);
      return markPublished(post, queue, ig, log, tag, { mediaId, note: `published ${mediaId} (${lateBy}s after target)` });
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
      queue.update(post, { status: 'failed', attempts, error: err.message, shareToken: null }, `error: ${err.message}`);
      log(`${tag} ❌ ${err.message}`);
    }
  }
}
