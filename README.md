# uncut

Schedule Instagram Reels **without wrecking the video quality.**

## The idea

Instagram re-encodes every upload, whatever tool you post from. What wrecks quality is
**feeding it a bad file**: 4K, HDR, high bitrate, the wrong codec, or a file some
scheduler already compressed before it got to Instagram. So uncut:

1. **Checks** the file against Meta's Reels spec
2. **Fixes it the least destructive way:** lossless rewrap < audio-only fix < one clean re-encode
   (iPhone HDR is first converted to standard colour with Apple's `avconvert`)
3. **Delivers the original bytes**, with no middleman compressing them:
   - `IG_LOGIN=instagram`: Meta downloads the file from a short-lived Cloudflare tunnel on this Mac (random 256-bit link, closed once Meta has the file)
   - `IG_LOGIN=facebook`: resumable upload straight to `rupload.facebook.com`
4. **Stages it early** (upload + Meta processing, up to 2h ahead) and publishes at the chosen time

Instagram's API has **no drafts and no native scheduling**. Staging early and then publishing is how
we get the same result.

## Setup

```bash
brew install ffmpeg cloudflared
cp .env.example .env         # blank token = dry run
npm start                    # → http://localhost:4400
npm run doctor               # checks your Meta connection
```

Meta account setup, click by click: vault note **"(C) Uncut — Meta Setup Guide"**.

## Commands

```bash
node bin/uncut.js check <video>
node bin/uncut.js add <video> --at "2026-10-02 18:30" --caption "..." [--cover 2.5]
node bin/uncut.js list | remove <id> | retry <id>
node bin/uncut.js run                               # scheduler without the web app
node bin/uncut.js doctor [--tunnel]
node bin/uncut.js compare <original> <posted-file>  # VMAF / SSIM / PSNR
node bin/uncut.js compare <original> --latest       # vs. your newest Instagram post
node bin/uncut.js compare <original> --post <id>    # vs. a post uncut made
```

Only one scheduler runs at a time (`data/scheduler.lock`). While it runs, the Mac won't idle-sleep
(`caffeinate`), but closing the lid still sleeps it.

## Reliability

| Situation | Behaviour |
|---|---|
| Network drop, Meta 5xx, rate limit | Retried with backoff within the call, then across ticks (5 tries), then `failed` |
| Bad token, missing permission | `failed` at once, with Meta's message |
| Container `EXPIRED` (24h) | Re-staged |
| Stuck `IN_PROGRESS` > 60 min | Re-staged |
| Temp link lost (app restarted mid-download) | Re-staged |
| `ERROR` in link mode | One automatic re-stage (a dropped tunnel looks like a bad file), then `failed` |
| Daily quota reached | Held in `ready`, not failed |
| Instagram-login token | Refreshed weekly, saved to `data/token.json` (mode 600). A new `.env` token wins |

## Tests

```bash
npm test     # 45 tests, ~40s
```

- `test/mock-meta.js` is a strict fake of Meta's Graph + rupload APIs, built from Meta's docs. It checks
  headers, params and byte counts, and can simulate outages, socket drops, expiry and processing errors
- Preflight tests run on real ffmpeg-generated files, including 4K, 10-bit, HLG HDR, PCM audio, 5.1 and MKV
- Proves: the uploaded or downloaded bytes are identical to the file on disk, and a remux leaves the video packets untouched

**Not yet verified against the real Instagram API.** The first live post will confirm the mock matches reality.

## Limits (Meta docs, Sept 2026)

- 50 or 100 API posts per rolling 24h (the docs disagree; the live `quota_total` is used)
- Reels: 3s–15min, ≤ 300 MB, H.264/HEVC, 8-bit 4:2:0, 23–60 fps, AAC ≤ 48 kHz
- The API can't add Instagram library music, filters or stickers
- `media_url` (used by `compare`) is withheld for Reels with licensed music
- Posting to accounts you don't own needs Meta App Review

## Layout

```
bin/uncut.js      CLI entry
src/config.js     .env → ready objects
src/specs.js      Instagram Reels spec
src/probe.js      ffprobe + moov-atom check
src/preflight.js  spec check → least-destructive fix plan
src/conform.js    remux / audio / re-encode / HDR→SDR
src/instagram.js  Meta API client (both logins, retries)
src/fileshare.js  temporary public links via Cloudflare tunnel
src/worker.js     scheduler state machine
src/queue.js      JSON schedule, safe across processes
src/token.js      token renewal
src/lock.js       single-scheduler lock
src/quality.js    VMAF comparison
src/server.js     localhost web app + API
public/index.html the UI
```
