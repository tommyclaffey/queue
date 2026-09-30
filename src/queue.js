// The schedule. A JSON file for the prototype — swap for SQLite/Postgres later.
//
// Post lifecycle:
//   queued ──(inside stage window)──▶ staged ──(Meta says FINISHED)──▶ ready ──(publish time)──▶ published
//                                        │
//                                        └── ERROR ▶ failed      EXPIRED ▶ back to queued
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';

export class Queue {
  constructor(path) {
    this.path = path;
    mkdirSync(dirname(path), { recursive: true });
    this.posts = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
  }

  save() {
    writeFileSync(this.path, JSON.stringify(this.posts, null, 2));
  }

  add({ file, caption, publishAt, platform = 'instagram_reels' }) {
    const post = {
      id: randomUUID().slice(0, 8),
      platform,
      file,
      caption,
      publishAt: new Date(publishAt).toISOString(),
      status: 'queued',
      containerId: null,
      mediaId: null,
      error: null,
      log: [{ at: new Date().toISOString(), msg: 'queued' }],
    };
    this.posts.push(post);
    this.save();
    return post;
  }

  update(post, patch, msg) {
    Object.assign(post, patch);
    if (msg) post.log.push({ at: new Date().toISOString(), msg });
    this.save();
  }

  remove(id) {
    const before = this.posts.length;
    this.posts = this.posts.filter((p) => p.id !== id);
    this.save();
    return this.posts.length < before;
  }
}
