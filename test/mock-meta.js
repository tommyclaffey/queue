// A fake Meta Graph API + rupload server, built from Meta's documented contract.
// Lets the REAL InstagramClient code run end-to-end with no Instagram account.
// It is strict on purpose: wrong headers, wrong params, wrong byte counts = errors.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

export const GOOD_TOKEN = 'good-token';

export function startMockMeta({ version = 'v25.0', userId = '1784', processingPolls = 1 } = {}) {
  const state = {
    containers: new Map(), // id → { params, bytes, sha, polls, forced }
    media: new Map(),
    published: 0,
    quotaTotal: 100,
    requests: [],
    refreshed: 0,
    selfHost: null,
    // Test knobs
    failNext: 0, // respond 500 to the next N requests
    dropNext: 0, // kill the socket on the next N requests (simulates wifi drop)
    forceStatus: null, // make every container report this status_code
    rejectPublishWith: null, // { code, message, status } for a permanent publish error
    ruploadFailNext: 0, // upload server says 'busy, retriable'
    dropAfterPublish: 0, // publish succeeds on Meta's side, but the reply never arrives
  };
  let seq = 0;

  const err = (res, status, code, message, extra = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message, type: 'OAuthException', code, ...extra } }));
  };
  const ok = (res, body) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const readBody = async (req) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    return Buffer.concat(chunks);
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    state.requests.push(`${req.method} ${url.pathname}`);

    if (state.dropNext > 0) {
      state.dropNext--;
      return req.socket.destroy();
    }
    if (state.failNext > 0) {
      state.failNext--;
      return err(res, 500, 2, 'An unexpected error has occurred. Please retry your request later.', { is_transient: true });
    }

    const parts = url.pathname.split('/').filter(Boolean);

    // ---- rupload: POST /ig-api-upload/{ver}/{container-id}
    if (parts[0] === 'ig-api-upload') {
      // The live upload server uses a different error shape (verified Sept 30 with a fake token).
      const rerr = (status, type, message, retriable = false) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ debug_info: { retriable, type, message } }));
      };
      if (state.ruploadFailNext > 0) {
        state.ruploadFailNext--;
        return rerr(503, 'ServiceUnavailable', 'Upload service busy', true);
      }
      if (req.headers.authorization !== `OAuth ${GOOD_TOKEN}`) return rerr(400, 'NotAuthorizedError', 'User not authorized to perform this request');
      if (parts[1] !== version) return rerr(400, 'InvalidRequest', 'Unsupported version');
      const c = state.containers.get(parts[2]);
      if (!c) return rerr(400, 'InvalidRequest', 'Invalid container id');
      if (req.headers.offset !== '0') return rerr(400, 'InvalidRequest', 'offset header required');
      const body = await readBody(req);
      if (Number(req.headers.file_size) !== body.length)
        return rerr(400, 'InvalidRequest', `file_size ${req.headers.file_size} != received ${body.length}`);
      c.bytes = body.length;
      c.sha = createHash('sha256').update(body).digest('hex');
      return ok(res, { success: true, message: 'Upload successful.' });
    }

    // ---- Token refresh (unversioned, Instagram-login host)
    if (parts[0] === 'refresh_access_token') {
      if (url.searchParams.get('grant_type') !== 'ig_refresh_token') return err(res, 400, 100, 'bad grant_type');
      if (url.searchParams.get('access_token') !== GOOD_TOKEN) return err(res, 400, 190, 'Invalid OAuth access token.');
      state.refreshed++;
      return ok(res, { access_token: GOOD_TOKEN, token_type: 'bearer', expires_in: 5184000 });
    }

    // ---- Graph API
    if (parts[0] !== version) return err(res, 400, 2635, `Unsupported API version ${parts[0]}`);
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${GOOD_TOKEN}`) return err(res, 401, 190, 'Invalid OAuth access token - Cannot parse access token'); // matches live Meta (verified)

    const [, id, edge] = parts;
    const body = req.method === 'POST' ? new URLSearchParams((await readBody(req)).toString()) : null;

    // POST /{ig-user-id}/media  → create container
    if (req.method === 'POST' && edge === 'media') {
      if (id !== userId && id !== 'me') return err(res, 400, 100, 'Unsupported post request. Object does not exist');
      if ((body.get('caption') || '').length > 2200) return err(res, 400, 100, 'Caption too long');
      const type = body.get('media_type') || 'IMAGE';
      const isItem = body.get('is_carousel_item') === 'true';
      // Carousel: lists existing carousel items. Done processing when every item is.
      if (type === 'CAROUSEL') {
        const kids = (body.get('children') || '').split(',').filter(Boolean);
        if (kids.length < 2 || kids.length > 10) return err(res, 400, 100, 'Carousels need 2 to 10 children');
        for (const k of kids) if (!state.containers.get(k)?.isItem) return err(res, 400, 100, `Invalid child ${k}: not a carousel item`);
        const cid = `c${++seq}`;
        state.containers.set(cid, { params: Object.fromEntries(body), kind: 'carousel', children: kids, bytes: 1, polls: 0, status: 'IN_PROGRESS' });
        return ok(res, { id: cid });
      }
      // Photos, carousel videos and story frames: always fetched from a public URL.
      if (type === 'IMAGE' || type === 'VIDEO' || type === 'STORIES') {
        const src = body.get('image_url') || body.get('video_url');
        if (type === 'IMAGE' && !body.get('image_url')) return err(res, 400, 100, 'image_url is required');
        if (type === 'VIDEO' && !isItem) return err(res, 400, 100, 'media_type VIDEO is only for carousel items. Use REELS.');
        if (!src) return err(res, 400, 100, 'Need image_url or video_url');
        const cid = `c${++seq}`;
        const image = !!body.get('image_url');
        const c = { params: Object.fromEntries(body), kind: type === 'STORIES' ? 'story' : 'item', isItem, image, bytes: 0, polls: 0, status: 'IN_PROGRESS' };
        state.containers.set(cid, c);
        c.fetching = fetch(src).then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const buf = Buffer.from(await r.arrayBuffer());
          // Like Meta: photos must be JPEG.
          if (image && !(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) { c.status = 'ERROR'; c.error = 'The image format is not supported. Only JPEG images are supported.'; return; }
          c.bytes = buf.length;
          c.sha = createHash('sha256').update(buf).digest('hex');
        }).catch((e) => { c.status = 'ERROR'; c.error = `Failed to download media (${e.message})`; });
        return ok(res, { id: cid });
      }
      if (type !== 'REELS') return err(res, 400, 100, `Unsupported media_type ${type}`);
      const videoUrl = body.get('video_url');
      if (!videoUrl && body.get('upload_type') !== 'resumable') return err(res, 400, 100, 'Need video_url or upload_type=resumable');
      const cid = `c${++seq}`;
      const c = { params: Object.fromEntries(body), bytes: 0, polls: 0, status: 'IN_PROGRESS' };
      state.containers.set(cid, c);
      if (videoUrl) {
        // Like Meta: download the file from the URL in the background.
        c.fetching = fetch(videoUrl).then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const buf = Buffer.from(await r.arrayBuffer());
          c.bytes = buf.length;
          c.sha = createHash('sha256').update(buf).digest('hex');
        }).catch((e) => {
          c.status = 'ERROR';
          c.error = `Failed to download video from video_url (${e.message})`;
        });
        return ok(res, { id: cid });
      }
      return ok(res, { id: cid, uri: `${state.selfHost}/ig-api-upload/${version}/${cid}` });
    }

    // POST /{ig-user-id}/media_publish
    if (req.method === 'POST' && edge === 'media_publish') {
      if (state.rejectPublishWith) {
        const r = state.rejectPublishWith;
        return err(res, r.status || 400, r.code, r.message);
      }
      const c = state.containers.get(body.get('creation_id'));
      if (!c) return err(res, 400, 100, 'Invalid creation_id');
      if (c.isItem) return err(res, 400, 100, 'Carousel items cannot be published on their own. Publish the carousel.');
      if (c.status !== 'FINISHED') return err(res, 400, 9007, 'Media ID is not available', { error_subcode: 2207027 });
      c.status = 'PUBLISHED';
      const mid = `m${++seq}`;
      state.media.set(mid, { container: body.get('creation_id'), timestamp: new Date().toISOString() });
      state.published++;
      if (state.dropAfterPublish > 0) {
        state.dropAfterPublish--;
        return req.socket.destroy(); // live on Instagram, but we never hear back
      }
      return ok(res, { id: mid });
    }

    // GET /{ig-user-id}/media → recent posts, newest first
    if (req.method === 'GET' && edge === 'media') {
      const data = [...state.media.entries()].reverse().map(([mid, m]) => ({
        id: mid, media_type: 'VIDEO', timestamp: m.timestamp,
        permalink: `https://www.instagram.com/reel/${mid}/`, media_url: `https://cdn.example/${mid}.mp4`,
      }));
      return ok(res, { data });
    }

    // GET /{ig-user-id}/content_publishing_limit
    if (req.method === 'GET' && edge === 'content_publishing_limit')
      return ok(res, { data: [{ quota_usage: state.published, config: { quota_total: state.quotaTotal, quota_duration: 86400 } }] });

    if (req.method === 'GET' && !edge) {
      // Container status
      const c = state.containers.get(id);
      if (c?.kind === 'carousel') {
        // Polling the carousel moves its items along too (Meta processes them in parallel).
        const kids = [];
        for (const k of c.children) {
          const ch = state.containers.get(k);
          if (ch.fetching) await ch.fetching;
          if (ch.status === 'IN_PROGRESS' && ch.bytes && ++ch.polls > processingPolls) ch.status = 'FINISHED';
          kids.push(ch);
        }
        const bad = kids.find((k) => k.status === 'ERROR');
        if (bad) return ok(res, { status_code: 'ERROR', status: `A carousel item failed: ${bad.error}`, id });
        if (c.status === 'IN_PROGRESS' && kids.every((k) => k.status === 'FINISHED')) c.status = 'FINISHED';
        return ok(res, { status_code: c.status, id });
      }
      if (c) {
        if (c.fetching) await c.fetching;
        if (c.status === 'ERROR') return ok(res, { status_code: 'ERROR', status: c.error, id });
        if (!c.bytes) return ok(res, { status_code: 'IN_PROGRESS', id });
        if (state.forceStatus) return ok(res, { status_code: state.forceStatus, status: state.forceStatus === 'ERROR' ? 'Error: video format not supported' : undefined, id });
        if (c.status === 'IN_PROGRESS' && ++c.polls > processingPolls) c.status = 'FINISHED';
        return ok(res, { status_code: c.status, id });
      }
      // Media
      if (state.media.has(id))
        return ok(res, { id, media_type: 'VIDEO', permalink: `https://www.instagram.com/reel/${id}/`, media_url: `https://cdn.example/${id}.mp4` });
      // Account
      if (id === userId || id === 'me') return ok(res, { id: userId, user_id: userId, username: 'tommy.test', account_type: 'MEDIA_CREATOR' });
    }

    err(res, 400, 100, `Unknown route ${req.method} ${url.pathname}`);
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const host = `http://127.0.0.1:${server.address().port}`;
      state.selfHost = host;
      resolve({ host, state, userId, close: () => new Promise((r) => server.close(r)) });
    });
  });
}
