# uncut

Schedule Instagram Reels **without wrecking the video quality.**

## The idea

Instagram re-encodes every upload, whatever tool you post from. What wrecks quality is
**feeding it a bad file**: 4K, HDR, high bitrate, the wrong codec, or a file some
scheduler already compressed before it got to Instagram. So uncut does two things:

1. **Preflight**: checks the file against Meta's Reels spec and makes the *least
   destructive* fix (a lossless rewrap < an audio-only fix < one clean re-encode)
2. **Stage, then publish**: uploads your file **byte-for-byte** to Meta ahead of time
   (resumable upload, no middleman host), waits for Instagram to finish processing, then
   publishes at the time you picked

Instagram's API has **no drafts and no native scheduling**. Uploading and processing ahead
of time is how you get the same result.

## Setup

```bash
brew install ffmpeg
cp .env.example .env     # leave the token blank = dry run
```

## Use

```bash
node bin/uncut.js check media/reel.mov
node bin/uncut.js add media/reel.mov --at "2026-10-02 18:30" --caption "..."
node bin/uncut.js list
node bin/uncut.js run      # the scheduler. Must stay running (and the Mac awake).
```

## Going live: what you need from Meta

1. An Instagram **Business or Creator** account
2. A Meta developer app with the Instagram API product and the `instagram_content_publish` permission
3. Your IG user ID plus a long-lived access token → `.env`

If you only post to your own accounts, you don't need Meta App Review (you're an admin/tester of your
own app). Posting for *other people's* accounts (i.e. clients) needs App Review.

## Limits (Meta docs, Sept 2026)

- 100 API-published posts per account per rolling 24h
- Containers expire 24h after upload → staging happens ≤ 23h before post time
- Reels: 3s–15min, ≤ 300 MB, H.264/HEVC, 8-bit 4:2:0, 23–60 fps, AAC ≤ 48 kHz
- **The API can't** add music from Instagram's library, filters, or stickers. Bake audio into the file. (Trial Reels *are* supported via `trial_params`.)

## Not built yet

- A UI (this is a CLI)
- Hosting the worker in the cloud so the Mac can sleep
- TikTok and YouTube (see the vault note for why they're different)
