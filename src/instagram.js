// Instagram Content Publishing API — Reels via RESUMABLE upload.
// Why resumable: the file goes straight from this machine to Meta, byte-for-byte.
// No public URL, no third-party host, no middleman compressing it.
//
// Flow (Meta docs, Sept 2026):
//   1. POST {graph}/{ver}/{ig-user-id}/media  media_type=REELS upload_type=resumable
//   2. POST rupload.facebook.com/ig-api-upload/{ver}/{container-id}   (raw file bytes)
//   3. GET  {graph}/{ver}/{container-id}?fields=status_code  → IN_PROGRESS | FINISHED | ERROR | EXPIRED | PUBLISHED
//   4. POST {graph}/{ver}/{ig-user-id}/media_publish  creation_id={container-id}
//
// Meta has TWO ways to connect an account, on two different hosts:
//   IG_LOGIN=facebook  → graph.facebook.com   (Instagram linked to a Facebook Page)
//   IG_LOGIN=instagram → graph.instagram.com  (Instagram-only login, no Page needed)
//
// Upload method depends on the login (Meta docs: resumable is "only for apps that have
// implemented Facebook Login for Business"):
//   facebook  → resumable: bytes POSTed straight from this Mac to rupload.facebook.com
//   instagram → video_url: Meta downloads the file from a temporary link (see fileshare.js)
// Either way Meta receives the ORIGINAL bytes — nothing re-compresses them in between.
//
// ⚠️ There is NO scheduling or drafts parameter in this API. Steps 1–3 are our
// "draft": the Reel sits uploaded and processed on Meta's side. Step 4 is the
// "schedule": our worker fires it at the chosen time. Containers expire after 24h.
import { readFileSync, statSync } from 'node:fs';

const HOSTS = {
  facebook: 'https://graph.facebook.com',
  instagram: 'https://graph.instagram.com',
};

// Meta error codes that mean "try again later", not "this will never work".
// 1/2 = temporary API issue, 4/17/32/613 = rate limited, 341 = app limit, 9007 = media not ready.
const TRANSIENT_CODES = new Set([1, 2, 4, 17, 32, 341, 613, 9007]);

export class InstagramError extends Error {
  constructor(message, { status, code, subcode, transient }) {
    super(message);
    this.status = status;
    this.code = code;
    this.subcode = subcode;
    this.transient = transient;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class InstagramClient {
  constructor({
    userId,
    token,
    version = 'v25.0',
    login = 'facebook',
    dryRun = false,
    graphHost, // override for tests
    ruploadHost = 'https://rupload.facebook.com',
    retries = 3,
    retryDelayMs = 2000,
    uploadMode, // 'resumable' | 'url' — defaults from the login type
  }) {
    this.userId = userId || (login === 'instagram' ? 'me' : undefined);
    this.token = token;
    this.version = version;
    this.login = login;
    this.dryRun = dryRun || !token;
    this.graph = `${graphHost || HOSTS[login] || HOSTS.facebook}/${version}`;
    this.rupload = ruploadHost;
    this.ruploadOverridden = ruploadHost !== 'https://rupload.facebook.com';
    this.tokenHost = graphHost || HOSTS.instagram;
    this.retries = retries;
    this.retryDelayMs = retryDelayMs;
    this.uploadMode = uploadMode || (login === 'instagram' ? 'url' : 'resumable');
  }

  // One HTTP call, retried with backoff on network errors, 5xx, and Meta's transient codes.
  async #call(url, { method = 'GET', body, headers = {}, retry = true } = {}) {
    let lastErr;
    const tries = retry ? this.retries : 0;
    for (let attempt = 0; attempt <= tries; attempt++) {
      if (attempt) await sleep(this.retryDelayMs * 2 ** (attempt - 1));
      let res;
      try {
        res = await fetch(url, {
          method,
          headers: { Authorization: `Bearer ${this.token}`, ...headers },
          body,
          signal: AbortSignal.timeout(10 * 60_000), // big uploads on slow wifi
        });
      } catch (err) {
        lastErr = new InstagramError(`Network error: ${err.cause?.code || err.message}`, { transient: true });
        continue;
      }
      const json = await res.json().catch(() => ({}));
      if (res.ok && !json.error && !json.debug_info) return json;

      // Graph API errors: { error: { message, code, error_subcode, is_transient } }
      // Upload server (rupload) errors — verified against the live server Sept 30:
      //   { debug_info: { retriable: false, type: "NotAuthorizedError", message: "…" } }
      const e = json.error || {};
      const d = json.debug_info || {};
      const message = e.error_user_msg || e.message || d.message || `HTTP ${res.status}`;
      const code = e.code ?? d.type;
      const transient = typeof d.retriable === 'boolean'
        ? d.retriable
        : res.status >= 500 || res.status === 429 || e.is_transient === true || TRANSIENT_CODES.has(e.code);
      lastErr = new InstagramError(
        `Instagram API ${res.status}: ${message} (${code != null ? 'code ' + code : 'no code'}${e.error_subcode ? '/' + e.error_subcode : ''})`,
        { status: res.status, code, subcode: e.error_subcode, transient },
      );
      if (!transient) throw lastErr;
    }
    throw lastErr;
  }

  // Who am I connected as? Used by `queue doctor` and the web app header.
  async account() {
    if (this.dryRun) return { id: 'dry', username: 'dry-run' };
    const fields = this.login === 'instagram' ? 'user_id,username,account_type' : 'id,username';
    return this.#call(`${this.graph}/${this.userId}?fields=${fields}`);
  }

  // Steps 1 + 2. Returns the container id.
  // resumable mode: pass `file`. url mode: pass `videoUrl` (a link Meta can download from).
  async stage({ file, videoUrl, caption, coverOffsetMs, shareToFeed = true }) {
    if (this.dryRun) return `dry_container_${Date.now()}`;

    const params = new URLSearchParams({
      media_type: 'REELS',
      caption: caption || '',
      share_to_feed: String(shareToFeed),
    });
    if (coverOffsetMs != null) params.set('thumb_offset', String(Math.round(coverOffsetMs)));

    if (this.uploadMode === 'url') {
      if (!videoUrl) throw new Error('url upload mode needs a videoUrl');
      params.set('video_url', videoUrl);
      const { id } = await this.#call(`${this.graph}/${this.userId}/media`, { method: 'POST', body: params });
      return id;
    }

    params.set('upload_type', 'resumable');
    const created = await this.#call(`${this.graph}/${this.userId}/media`, { method: 'POST', body: params });
    // Meta returns the exact upload URI; fall back to the documented pattern.
    const uri = created.uri && !this.ruploadOverridden
      ? created.uri
      : `${this.rupload}/ig-api-upload/${this.version}/${created.id}`;

    await this.#call(uri, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${this.token}`,
        offset: '0',
        file_size: String(statSync(file).size),
      },
      body: readFileSync(file),
    });
    return created.id;
  }

  // ---- Photo carousels and stories (Meta docs). Photos can ONLY be sent as a public link
  // (image_url): there is no direct upload for images, so these always use a temporary link.

  // One item of a carousel: a JPEG photo or a video. Returns the item's container id.
  async stageItem({ imageUrl, videoUrl }) {
    if (this.dryRun) return `dry_item_${Date.now()}`;
    if (!imageUrl === !videoUrl) throw new Error('A carousel item needs exactly one of imageUrl or videoUrl');
    const params = new URLSearchParams({ is_carousel_item: 'true' });
    if (imageUrl) params.set('image_url', imageUrl);
    else { params.set('media_type', 'VIDEO'); params.set('video_url', videoUrl); }
    const { id } = await this.#call(`${this.graph}/${this.userId}/media`, { method: 'POST', body: params });
    return id;
  }

  // The carousel itself: lists 2–10 item ids, in order. The caption lives here, not on the items.
  // Publish THIS id once every item reports FINISHED.
  async stageCarousel({ children, caption }) {
    if (this.dryRun) return `dry_carousel_${Date.now()}`;
    if (!Array.isArray(children) || children.length < 2 || children.length > 10) throw new Error('A carousel needs 2 to 10 items');
    const params = new URLSearchParams({ media_type: 'CAROUSEL', children: children.join(','), caption: caption || '' });
    const { id } = await this.#call(`${this.graph}/${this.userId}/media`, { method: 'POST', body: params });
    return id;
  }

  // A single feed photo (not part of a carousel). The caption lives on it; publish its id.
  async stagePhoto({ imageUrl, caption }) {
    if (this.dryRun) return `dry_photo_${Date.now()}`;
    if (!imageUrl) throw new Error('A photo needs an imageUrl');
    const params = new URLSearchParams({ image_url: imageUrl, caption: caption || '' });
    const { id } = await this.#call(`${this.graph}/${this.userId}/media`, { method: 'POST', body: params });
    return id;
  }

  // One story frame (photo or video). Stories take no caption; each frame is published on its own.
  async stageStory({ imageUrl, videoUrl }) {
    if (this.dryRun) return `dry_story_${Date.now()}`;
    if (!imageUrl === !videoUrl) throw new Error('A story frame needs exactly one of imageUrl or videoUrl');
    const params = new URLSearchParams({ media_type: 'STORIES' });
    params.set(imageUrl ? 'image_url' : 'video_url', imageUrl || videoUrl);
    const { id } = await this.#call(`${this.graph}/${this.userId}/media`, { method: 'POST', body: params });
    return id;
  }

  // Step 3.
  async status(containerId) {
    if (this.dryRun) return { code: 'FINISHED' };
    const json = await this.#call(`${this.graph}/${containerId}?fields=status_code,status`);
    return { code: json.status_code, detail: json.status };
  }

  // Step 4. Returns the live media id.
  async publish(containerId) {
    if (this.dryRun) return `dry_media_${Date.now()}`;
    // ONE attempt only. If the reply is lost, the worker asks Meta whether it went live
    // instead of blindly trying again.
    const { id } = await this.#call(`${this.graph}/${this.userId}/media_publish`, {
      method: 'POST',
      body: new URLSearchParams({ creation_id: containerId }),
      retry: false,
    });
    return id;
  }

  // Link to the live post, plus the video URL (used to measure quality after posting).
  async media(mediaId) {
    if (this.dryRun) return { permalink: null, media_url: null };
    return this.#call(`${this.graph}/${mediaId}?fields=permalink,media_url,media_type`);
  }

  // Your most recent posts — including ones made from the Instagram app, for side-by-side quality tests.
  async recentMedia(limit = 10) {
    if (this.dryRun) return [];
    const { data } = await this.#call(`${this.graph}/${this.userId}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=${limit}`);
    return data || [];
  }

  // Instagram-login tokens last 60 days. Refreshing (allowed once the token is 24h+ old)
  // returns a fresh 60-day token. Facebook-login Page tokens don't expire, so no-op there.
  async refreshToken() {
    if (this.dryRun || this.login !== 'instagram') return null;
    const json = await this.#call(`${this.tokenHost}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(this.token)}`);
    this.token = json.access_token;
    return { token: json.access_token, expiresInSec: json.expires_in };
  }

  // Meta caps API-published posts per rolling 24h. Docs say 100 in one place, 50 in another —
  // so we trust the live number Meta returns (config.quota_total).
  async quota() {
    if (this.dryRun) return { used: 0, total: 50 };
    const { data } = await this.#call(`${this.graph}/${this.userId}/content_publishing_limit?fields=quota_usage,config`);
    return { used: data?.[0]?.quota_usage ?? 0, total: data?.[0]?.config?.quota_total ?? 50 };
  }
}
