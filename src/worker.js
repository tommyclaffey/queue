// One tick of the scheduler. `uncut run` calls this every 30 seconds.
const STAGE_MAX_MIN = 23 * 60; // containers expire at 24h — leave an hour of margin

export async function tick(queue, ig, { stageWindowMin = 120, log = console.log } = {}) {
  const now = Date.now();
  const windowMs = Math.min(stageWindowMin, STAGE_MAX_MIN) * 60_000;

  for (const post of queue.posts) {
    const due = new Date(post.publishAt).getTime();
    try {
      // 1. Upload early so Instagram finishes processing before the post time.
      if (post.status === 'queued' && due - now <= windowMs) {
        log(`[${post.id}] staging — uploading original file to Instagram`);
        const containerId = await ig.stage({ file: post.file, caption: post.caption });
        queue.update(post, { status: 'staged', containerId, stagedAt: new Date().toISOString() }, `staged ${containerId}`);
      }

      // 2. Wait for Meta's processing to finish.
      if (post.status === 'staged') {
        const code = await ig.status(post.containerId);
        if (code === 'FINISHED') queue.update(post, { status: 'ready' }, 'Instagram finished processing');
        else if (code === 'ERROR') queue.update(post, { status: 'failed', error: 'Instagram rejected the file during processing' }, 'processing ERROR');
        else if (code === 'EXPIRED') queue.update(post, { status: 'queued', containerId: null }, 'container expired — will re-stage');
      }

      // 3. Fire at the scheduled time.
      if (post.status === 'ready' && now >= due) {
        const used = await ig.quotaUsed();
        if (used >= 100) {
          log(`[${post.id}] holding — 100 posts/24h API limit reached`);
          continue;
        }
        const mediaId = await ig.publish(post.containerId);
        const lateBy = Math.round((Date.now() - due) / 1000);
        queue.update(post, { status: 'published', mediaId, publishedAt: new Date().toISOString() }, `published ${mediaId} (${lateBy}s after target)`);
        log(`[${post.id}] ✅ published`);
      }

      // Past due and still not ready? Say so loudly rather than silently posting late.
      if (['queued', 'staged'].includes(post.status) && now - due > 15 * 60_000) {
        log(`[${post.id}] ⚠️ 15+ min late and still ${post.status}`);
      }
    } catch (err) {
      queue.update(post, { status: 'failed', error: err.message }, `error: ${err.message}`);
      log(`[${post.id}] ❌ ${err.message}`);
    }
  }
}
