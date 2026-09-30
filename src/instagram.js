// Instagram Content Publishing API — Reels via RESUMABLE upload.
// Why resumable: the file goes straight from this machine to Meta, byte-for-byte.
// No public URL, no third-party host, no middleman compressing it.
//
// Flow (Meta docs, Sept 2026):
//   1. POST graph.facebook.com/{ver}/{ig-user-id}/media  media_type=REELS upload_type=resumable
//   2. POST rupload.facebook.com/ig-api-upload/{ver}/{container-id}   (raw file bytes)
//   3. GET  {container-id}?fields=status_code   → IN_PROGRESS | FINISHED | ERROR | EXPIRED | PUBLISHED
//   4. POST {ig-user-id}/media_publish  creation_id={container-id}
//
// ⚠️ There is NO scheduling or drafts parameter in this API. Steps 1–3 are our
// "draft": the Reel sits uploaded and processed on Meta's side. Step 4 is the
// "schedule": our worker fires it at the chosen time. Containers expire after 24h.
import { readFileSync, statSync } from 'node:fs';

export class InstagramClient {
  constructor({ userId, token, version = 'v25.0', dryRun = false }) {
    this.userId = userId;
    this.token = token;
    this.version = version;
    this.dryRun = dryRun || !token;
    this.graph = `https://graph.facebook.com/${version}`;
  }

  async #call(url, { method = 'GET', body, headers = {} } = {}) {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, ...headers },
      body,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
      const e = json.error || {};
      throw new Error(`Instagram API ${res.status}: ${e.message || 'unknown'} (code ${e.code ?? '?'})`);
    }
    return json;
  }

  // Steps 1 + 2. Returns the container id.
  async stage({ file, caption, coverOffsetMs, shareToFeed = true }) {
    if (this.dryRun) return `dry_container_${Date.now()}`;

    const params = new URLSearchParams({
      media_type: 'REELS',
      upload_type: 'resumable',
      caption: caption || '',
      share_to_feed: String(shareToFeed),
    });
    if (coverOffsetMs != null) params.set('thumb_offset', String(coverOffsetMs));

    const { id } = await this.#call(`${this.graph}/${this.userId}/media`, {
      method: 'POST',
      body: params,
    });

    const bytes = readFileSync(file);
    await this.#call(`https://rupload.facebook.com/ig-api-upload/${this.version}/${id}`, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${this.token}`,
        offset: '0',
        file_size: String(statSync(file).size),
      },
      body: bytes,
    });
    return id;
  }

  // Step 3.
  async status(containerId) {
    if (this.dryRun) return 'FINISHED';
    const { status_code } = await this.#call(`${this.graph}/${containerId}?fields=status_code,status`);
    return status_code;
  }

  // Step 4. Returns the live media id.
  async publish(containerId) {
    if (this.dryRun) return `dry_media_${Date.now()}`;
    const { id } = await this.#call(`${this.graph}/${this.userId}/media_publish`, {
      method: 'POST',
      body: new URLSearchParams({ creation_id: containerId }),
    });
    return id;
  }

  // Meta caps accounts at 100 API-published posts per rolling 24h.
  async quotaUsed() {
    if (this.dryRun) return 0;
    const { data } = await this.#call(`${this.graph}/${this.userId}/content_publishing_limit?fields=quota_usage`);
    return data?.[0]?.quota_usage ?? 0;
  }
}
