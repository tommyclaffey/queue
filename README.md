# Queue — social media scheduler

Schedule Instagram Reels, photo carousels and stories **without wrecking the quality.**

## The idea

Instagram re-encodes every upload, whatever tool you post from. What wrecks quality is
**feeding it a bad file**: 4K, HDR, high bitrate, the wrong codec, or a file some
scheduler already compressed before it got to Instagram. So Queue:

1. **Checks** the file against Meta's Reels spec
2. **Fixes it the least destructive way:** lossless rewrap < audio-only fix < one clean re-encode
   (iPhone HDR is first converted to standard colour with Apple's `avconvert`; on Linux, ffmpeg
   tone-maps it in the same single encode, if its build has the `zscale` filter)
3. **Delivers the original bytes**, with no middleman compressing them:
   - `IG_LOGIN=instagram`: Meta downloads the file from a short-lived Cloudflare tunnel on this Mac (random 256-bit link, closed once Meta has the file)
   - `IG_LOGIN=facebook`: resumable upload straight to `rupload.facebook.com`
4. **Stages it early** (upload + Meta processing, up to 2h ahead) and publishes at the chosen time

Instagram's API has **no drafts and no native scheduling**. Staging early and then publishing is how
we get the same result.

## Photos and stories

- **Upload** JPEG, PNG or HEIC (recognised by the file's bytes, not its name). Queue keeps the original and
  makes the Instagram-ready JPEG at once: **sRGB · up to 1080 wide · a legal shape** (4:5 to 1.91:1), so the
  check and the preview are real. macOS uses `sips` (ColorSync); Linux uses ffmpeg (Display P3 → sRGB is a
  real conversion; HEIC needs ffmpeg 7.1+)
- **One photo** → one image post. **2–10 photos** → a carousel, every photo cut to the **first photo's shape**
  (Instagram shows them all at that shape anyway). **Story** → 1–10 frames, each cut to 9:16
- Each photo is resized **once, from your original**, never twice
- Photos reach Instagram **only by temporary link** (`image_url`; there's no direct upload for images), so
  local Queue needs `cloudflared` even with Facebook login. Hosted Queue serves the links itself
- Carousel: each item is staged, then the carousel container; published once Meta reports it `FINISHED`.
  Story: one container per frame, published **in order** at post time, one publish per frame

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
- Mac-only extras are off: Apple's HDR converter (HDR clips are tone-mapped with ffmpeg's `zscale` if the
  build has it, otherwise a clear "export standard colour" message), notifications, start at login
- Photos are prepared with ffmpeg instead of `sips`. The Dockerfile's Debian ffmpeg (5.1) can't read HEIC:
  those get a clear "export as JPEG" message

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


### Public demo (its own link)

The demo is a made-up social media studio, **Northline Social**, running five made-up accounts so
it shows everyone Queue is for: a creator (Jess Rivera), a business (Harbor Coffee), a church
(Grace City), a band (The Low Tides) and a nonprofit (Riverside Arts). Switch between them from the
account card in the sidebar. A made-up team: profile photos, roles, who scheduled each post, and
team activity. Team photos are from
Unsplash (`demo/assets/credits.json`).

`DEMO_PUBLIC=1 npm run demo` serves it to everyone on `$PORT`. Nothing can post (there is no
Instagram client in demo mode), and anything that costs real CPU or disk is off: uploads,
re-encodes and quality measuring. It puts itself back to the starting state every
`DEMO_RESET_HOURS` (default 3). On Railway it runs from `Dockerfile.demo`, which downloads the
sample media from the `demo-v1` GitHub release.

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

**Storage:** Queue keeps its own copies of videos and photos in `media/`. `node bin/queue.js storage [--clear]`
(or **Clear** in the web app) deletes copies of posted Reels, carousels and stories, and uploads never scheduled. It never
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
| Carousel or story photo can't be processed | One automatic re-stage (photos always use a link), then `failed` with Meta's reason |
| Story stops midway (error, lost reply, Mac asleep) | Each frame is recorded the moment it's live. Retry / Post now resumes at the next frame; a live frame is **never re-posted or re-uploaded** |
| Story frame expires before posting | Only the frames not yet live are re-staged |
| Carousel/story links | Kept open while Meta is fetching (every photo's link), closed once it has them |

## Tests

```bash
npm test     # 143 tests, ~80s
```

- `test/mock-meta.js` is a strict fake of Meta's Graph + rupload APIs, built from Meta's docs. It checks
  headers, params and byte counts, and can simulate outages, socket drops, expiry and processing errors
- Preflight tests run on real ffmpeg-generated files, including 4K, 10-bit, HLG HDR, PCM audio, 5.1 and MKV
- Photo tests run both engines (`sips` and ffmpeg), including a Display P3 red that must come out sRGB red and a
  tiled iPhone-style HEIC. The ffmpeg HDR tone-map test is skipped when ffmpeg has no `zscale`
- Proves: the uploaded or downloaded bytes are identical to the file on disk, and a remux leaves the video packets untouched

**Not yet verified against the real Instagram API.** The first live post will confirm the mock matches reality.

## Limits (Meta docs, Sept 2026)

- 50 or 100 API posts per rolling 24h (the docs disagree; the live `quota_total` is used)
- Reels: 3s–15min, ≤ 300 MB, H.264/HEVC, 8-bit 4:2:0, 23–60 fps, AAC ≤ 48 kHz
- Photos: JPEG only, by public link, 320–1440 px wide, 4:5 to 1.91:1, ≤ 8 MB. Carousels 2–10 items. Stories take
  no caption; every story frame counts as one post against the daily limit
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
src/conform.js    remux / audio / re-encode / HDR→SDR (avconvert, or ffmpeg zscale tone-map)
src/photo.js      photos → JPEG · sRGB · Instagram shape (sips, or ffmpeg); type by magic bytes
src/instagram.js  Meta API client (both logins, retries)
src/fileshare.js  temporary public links (videos and photos) via Cloudflare tunnel
src/worker.js     scheduler state machine: Reels, photos/carousels, stories
src/queue.js      JSON schedule, safe across processes
src/token.js      token renewal
src/lock.js       single-scheduler lock
src/notify.js     macOS notifications
src/storage.js    media copy report + cleanup (videos and photos)
src/autostart.js  LaunchAgent (start at login)
src/range.js      crash-proof HTTP range/file streaming
src/quality.js    VMAF comparison + per-moment timeline
src/demo.js       builds the demo account (npm run demo)
src/server.js     localhost web app + API
public/index.html the UI shell
public/app.js     core UI: dashboard, queue, calendar, library, accounts, settings
public/pages.js   post detail, Quality Lab, onboarding, composer (video, photos, story — real and demo)
```
