// One tick of the scheduler. Runs every 30 seconds.
//
//   queued ──(inside stage window)──▶ staged ──(Meta: FINISHED)──▶ ready ──(post time)──▶ published
//     ▲                                  │
//     └──────── EXPIRED (24h) ───────────┘            ERROR / permanent API error ──▶ failed
//
// Transient problems (wifi drop, Meta hiccup, rate limit) don't fail the post.
// They're retried on later ticks, up to MAX_ATTEMPTS, then it fails loudly.
const STAGE_MAX_MIN = 23 * 60; // containers expire at 24h — leave an hour of margin
export const MAX_ATTEMPTS = 6;

const STUCK_MIN = 60; // Meta usually processes in minutes. An hour means something's wrong.

export async function tick(queue, ig, { files = null, stageWindowMin = 120, log = console.log, now = Date.now() } = {}) {
  if (tick.running) return; // a slow upload must not overlap the next tick
  tick.running = true;
  try {
    const windowMs = Math.min(stageWindowMin, STAGE_MAX_MIN) * 60_000;
    // Earliest first, so a backlog publishes in order.
    const posts = [...queue.posts].sort((a, b) => a.publishAt.localeCompare(b.publishAt));
    for (const post of posts) await step(post, queue, ig, files, windowMs, log, now);
  } finally {
    tick.running = false;
  }
}

async function step(post, queue, ig, files, windowMs, log, now) {
  const due = new Date(post.publishAt).getTime();
  const tag = `[${post.id}]`;
  const rev = post.rev || 0;
  // True if the post was edited, retried or removed (e.g. in the web app) while we were awaiting Meta.
  const changed = (expectStatus) => {
    const live = queue.get(post.id);
    return !live || (live.rev || 0) !== rev || live.status !== expectStatus;
  };
  try {
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
        // Edited or removed in the web app while uploading? Throw this upload away.
        if (changed('queued')) {
          if (share) await files.unshare(share.token);
          log(`${tag} changed during upload — discarding that upload`);
          return;
        }
        queue.update(post, { status: 'staged', containerId, shareToken: share?.token || null, stagedAt: new Date(now).toISOString(), attempts: 0, error: null }, `staged ${containerId}`);
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
        queue.update(post, { status: 'ready' }, 'Instagram finished processing');
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
        return queue.update(post, { status: 'published' }, 'already published');
      } else if (now - new Date(post.stagedAt).getTime() > STUCK_MIN * 60_000) {
        await release();
        const attempts = (post.attempts || 0) + 1;
        if (attempts >= MAX_ATTEMPTS) return queue.update(post, { status: 'failed', attempts, error: `Instagram was still processing after ${STUCK_MIN} min, ${attempts} times` }, 'stuck — giving up');
        return queue.update(post, { status: 'queued', containerId: null, attempts }, `stuck in ${code} for ${STUCK_MIN}+ min — re-staging`);
      } else if (post.shareToken && files && !files.has(post.shareToken)) {
        // App restarted mid-download: the old link is dead. Start over rather than wait for ERROR.
        return queue.update(post, { status: 'queued', containerId: null, shareToken: null }, 'file link lost on restart — re-staging');
      }
    }

    // 3. Fire at the scheduled time.
    if (post.status === 'ready' && now >= due) {
      const { used, total } = await ig.quota();
      if (used >= total) return log(`${tag} holding — ${total} posts/24h API limit reached`);
      if (changed('ready')) return log(`${tag} changed just before posting — skipping`);

      const mediaId = await ig.publish(post.containerId);
      // Posted is posted: record it even if someone edited in the last second.
      if (changed('ready')) log(`${tag} was edited while posting — the earlier version went live`);
      const lateBy = Math.round((Date.now() - due) / 1000);
      queue.update(post, { status: 'published', mediaId, publishedAt: new Date().toISOString(), error: null }, `published ${mediaId} (${lateBy}s after target)`);
      log(`${tag} ✅ published`);

      // Nice-to-have: the link to the live post. Never fail a published post over this.
      try {
        const m = await ig.media(mediaId);
        queue.update(post, { permalink: m.permalink || null });
      } catch {}
    }

    if (['queued', 'staged'].includes(post.status) && now - due > 15 * 60_000 && !post.lateWarned) {
      queue.update(post, { lateWarned: true }, 'running 15+ min late');
      log(`${tag} ⚠️ 15+ min late and still ${post.status}`);
    }
  } catch (err) {
    const attempts = (post.attempts || 0) + 1;
    if (err.transient && attempts < MAX_ATTEMPTS) {
      queue.update(post, { attempts, error: `Retrying (${attempts}/${MAX_ATTEMPTS - 1}): ${err.message}` }, `transient error: ${err.message}`);
      log(`${tag} ↻ ${err.message} — will retry`);
    } else {
      queue.update(post, { status: 'failed', attempts, error: err.message }, `error: ${err.message}`);
      log(`${tag} ❌ ${err.message}`);
    }
  }
}
