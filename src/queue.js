// The schedule. A JSON file for the prototype — swap for SQLite/Postgres later.
//
// Safe to use from the web app and the CLI at the same time: every read picks up
// changes made on disk by the other process, every write is atomic (temp file + rename).
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';

export class Queue {
  #posts = [];
  #mtime = 0;

  constructor(path) {
    this.path = path;
    mkdirSync(dirname(path), { recursive: true });
    this.#load();
  }

  #load() {
    if (!existsSync(this.path)) return;
    const mtime = statSync(this.path).mtimeMs;
    if (mtime === this.#mtime) return;
    this.#posts = JSON.parse(readFileSync(this.path, 'utf8'));
    this.#mtime = mtime;
  }

  get posts() {
    this.#load();
    return this.#posts;
  }

  get(id) {
    return this.posts.find((p) => p.id === id) || null;
  }

  save() {
    const tmp = this.path + '.tmp';
    writeFileSync(tmp, JSON.stringify(this.#posts, null, 2));
    // Record OUR file's mtime before the rename, so a write by the other process that lands
    // right after ours still looks "changed" and gets picked up.
    const mine = statSync(tmp).mtimeMs;
    renameSync(tmp, this.path);
    this.#mtime = mine;
  }

  add({ file, caption = '', publishAt, coverOffsetMs = null, platform = 'instagram_reels' }) {
    this.#load();
    const post = {
      id: randomUUID().slice(0, 8),
      platform,
      file,
      caption,
      coverOffsetMs,
      publishAt: new Date(publishAt).toISOString(),
      status: 'queued',
      containerId: null,
      mediaId: null,
      permalink: null,
      attempts: 0,
      error: null,
      log: [{ at: new Date().toISOString(), msg: 'queued' }],
    };
    this.#posts.push(post);
    this.save();
    return post;
  }

  // Patches by id against the freshest copy on disk, then mirrors onto the caller's object.
  update(post, patch, msg) {
    this.#load();
    const live = this.#posts.find((p) => p.id === post.id) || post;
    Object.assign(live, patch);
    if (msg) (live.log ||= []).push({ at: new Date().toISOString(), msg });
    if (live !== post) Object.assign(post, live);
    this.save();
    return live;
  }

  // Caption and cover are baked into the uploaded container, so editing a staged
  // post sends it back to 'queued' and it gets re-uploaded.
  edit(id, { caption, publishAt, coverOffsetMs }) {
    const post = this.get(id);
    if (!post) return null;
    if (!['queued', 'staged', 'ready', 'failed'].includes(post.status)) throw new Error('Already published.');
    // rev lets the scheduler notice "this post changed while I was uploading it" and discard that upload.
    const patch = {
      status: 'queued', containerId: null, shareToken: null, attempts: 0, stuckCount: 0, stageRetried: false,
      error: null, lateWarned: false, rev: (post.rev || 0) + 1,
      prevContainerId: post.containerId || post.prevContainerId || null, // checked before re-uploading
    };
    if (caption !== undefined) patch.caption = caption;
    if (publishAt !== undefined) patch.publishAt = new Date(publishAt).toISOString();
    if (coverOffsetMs !== undefined) patch.coverOffsetMs = coverOffsetMs;
    return this.update(post, patch, 'edited');
  }

  retry(id) {
    const post = this.get(id);
    if (!post || post.status !== 'failed') return null;
    return this.update(post, {
      status: 'queued', containerId: null, shareToken: null, attempts: 0, stuckCount: 0, stageRetried: false,
      error: null, lateWarned: false, rev: (post.rev || 0) + 1,
      prevContainerId: post.containerId || post.prevContainerId || null, // checked before re-uploading
    }, 'retry requested');
  }

  remove(id) {
    this.#load();
    const before = this.#posts.length;
    this.#posts = this.#posts.filter((p) => p.id !== id);
    if (this.#posts.length === before) return false;
    this.save();
    return true;
  }
}
