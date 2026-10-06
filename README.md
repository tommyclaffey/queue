# Queue — social media scheduler

Schedule Instagram Reels **without wrecking the video quality.**

## The idea

Instagram re-encodes every upload, whatever tool you post from. What wrecks quality is
**feeding it a bad file**: 4K, HDR, high bitrate, the wrong codec, or a file some
scheduler already compressed before it got to Instagram. So Queue:

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

Meta account setup, click by click: vault note **"(C) Queue — Meta Setup Guide"**.

## Run it on a server (Railway)

So the Mac doesn't have to be on at post time. `HOSTED=1` switches on what a public server needs:

- **Password sign-in** (`QUEUE_PASSWORD`, 12+ characters, required: the app won't start without it).
  30-day HttpOnly session; 10 wrong passwords lock that address out for 15 minutes
- **Instagram's video links are served by the app itself** at `/v/<256-bit token>/…`, so no tunnel is needed
- **Data, videos and the saved login on a volume** at `DATA_DIR` (`/data` in the Dockerfile)
- Mac-only extras are off: Apple's HDR converter (HDR clips get a clear "export standard colour" message), notifications, start at login

```bash
railway init --name queue        # needs a paid plan (Hobby)
railway add --service queue
railway volume add --mount-path /data
railway variables --set QUEUE_PASSWORD='…'
railway domain                   # gives the public https address
railway up --detach
```
Then open the address, sign in, and connect Instagram on the Connect page.

## Demo account

```bash
npm run demo                 # → http://localhost:4401
```

A separate, fully populated account for showing Queue off: 17 sample videos (Ken Burns clips made from
Unsplash photos), ~18 posts in every state (scheduled, sending, ready, posted, missed, failed), five
"connected" platforms, photo carousels and stories, and **real VMAF scores**: each posted clip is
re-encoded the way the platform would serve it, then measured with the same code as `compare`.

- Lives in `demo/` (git-ignored). Never touches your real queue, media or login, and never posts anything
- First run takes a few minutes (renders the videos, measures quality). After that it starts instantly
- Dates are refreshed on every start, so "Today" is always today
- The real app stays honest: Instagram only, everything else "Coming soon"

## Commands

```bash
node bin/queue.js check <video>
node bin/queue.js add <video> --at "2026-10-02 18:30" --caption "..." [--cover 2.5]
node bin/queue.js list | remove <id> | retry <id> | post-now <id>
node bin/queue.js autostart on | off | status
node bin/queue.js storage [--clear]
node bin/queue.js run                               # scheduler without the web app
node bin/queue.js doctor [--tunnel]
node bin/queue.js compare <original> <posted-file>  # VMAF / SSIM / PSNR
node bin/queue.js compare <original> --latest       # vs. your newest Instagram post
node bin/queue.js compare <original> --post <id>    # vs. a post Queue made
```

**Security:** the web app only answers `localhost`. Changes need an `X-Queue` header and a local `Origin`,
which blocks other websites (CSRF and DNS rebinding). Temporary-link keys never reach the browser.
The link server serves only shared files, closes links when they're no longer needed (3h max), and
can't be crashed by malformed requests.

**Missed posts:** if the Mac was off or asleep at post time, a post more than the missed-post limit (default
120 min, Settings page) late becomes **missed** and waits for **Post now** or a new time, instead of going out by surprise.

**Notifications** (macOS): posted, failed, missed. On/off in Settings.

**Settings** are edited in the app and saved to `data/settings.json`, which wins over `.env`, which wins
over the defaults. Changes apply immediately — no restart.

**Autostart** (off by default): `node bin/queue.js autostart on` installs a LaunchAgent that starts
Queue at login and restarts it after a crash. `autostart off` removes it. Log: `data/queue.log`.

**Storage:** Queue keeps its own copies of videos in `media/`. `node bin/queue.js storage [--clear]`
(or **Clear** in the web app) deletes copies of posted Reels and uploads never scheduled. It never
touches anything still waiting to post, or your originals.

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
| Publish reply lost (posted, but no answer) | Asks Meta for the container's status. If `PUBLISHED`, it's recorded as posted and **never re-posted** |
| Retry/edit after an unclear failure | Checks the old container first, so a post that secretly went live isn't posted twice |
| Container expires while waiting to post | Re-staged |
| Stuck 3 times in a row | `failed` (no endless re-uploads) |
| Instagram-login token | Refreshed weekly, saved to `data/token.json` (mode 600). A new `.env` token wins |

## Tests

```bash
npm test     # 104 tests, ~60s
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
bin/queue.js      CLI entry
src/config.js     .env → ready objects
src/settings.js   app settings (data/settings.json) over .env over defaults
src/specs.js      Instagram Reels spec
src/probe.js      ffprobe + moov-atom check
src/preflight.js  spec check → least-destructive fix plan
src/conform.js    remux / audio / re-encode / HDR→SDR
src/photo.js      photos → JPEG · sRGB · Instagram shape (sips); for carousels and stories
src/instagram.js  Meta API client (both logins, retries)
src/fileshare.js  temporary public links via Cloudflare tunnel
src/worker.js     scheduler state machine
src/queue.js      JSON schedule, safe across processes
src/token.js      token renewal
src/lock.js       single-scheduler lock
src/notify.js     macOS notifications
src/storage.js    media copy report + cleanup
src/autostart.js  LaunchAgent (start at login)
src/range.js      crash-proof HTTP range/file streaming
src/quality.js    VMAF comparison + per-moment timeline
src/demo.js       builds the demo account (npm run demo)
src/server.js     localhost web app + API
public/index.html the UI shell
public/app.js     core UI: dashboard, queue, calendar, library, accounts, settings
public/pages.js   post detail, Quality Lab, onboarding, composer (video, photos, story)
```
