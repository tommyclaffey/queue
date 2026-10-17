# figma-sync — refresh the Queue Figma file from the app

**Rule: the code is the source of truth. Figma follows it.** These scripts recapture every screen of the
running app and rebuild it in the Queue Figma file (`cl7vaIltbmIwCmaFvgxVGf`) as editable layers, with colours
bound to the Queue variables. Nothing here ships with the app.

## How it works
1. **Capture** (`capture.mjs`, via `capall.sh`): headless Chrome walks the app's DOM and records every box,
   text run, icon and image with exact positions → `cap/<prefix>-<id>.json` + a PNG.
   `capall.sh <screens.json> <prefix> <base-url> <W> <H> <light|dark> [mobile]`
   - Desktop: 1440 × 1024 · Phone: 402 × 786 (the Figma phone frame adds the 54 pt status bar and 34 pt home strip)
   - `screens-L.json` = desktop screens, `screens-M.json` = phone screens (id, Figma name, setup JS)
2. **Compare** (`ndiff.py`): pixel-diffs the new capture against the last one → `njobs.json`, the screens that changed.
3. **Images** (`prepimg.mjs` → `upimg.mjs`): uploads any new photos once; hashes live in `img/map.json`.
4. **Pack + upload** (`pack.mjs` → `upsvg.mjs`): each capture is compacted and uploaded as an SVG text payload
   (`QDATA:<id>:<base64>`) via the Figma MCP `upload_assets` URLs.
5. **Build** (`builder.js`): runs inside Figma. Upload it first as its own payload (`pack`-style SVG text node on a
   temporary page), then run it with the AsyncFunction constructor; delete the temporary page when the refresh is done. `swapgen.py` + `swapbody.js` generate the "replace in place" calls: same frame, same name,
   same position, so prototype links into it keep working.
6. **Wire** (`wire.js`): sidebar and tab-bar links plus ~40 button rules → prototype clicks and flows.
7. **Lo-fi** (`lofi-regen.js`): clones the light hi-fi frame into the Wireframes page in greyscale tokens.

## Run it
- Serve two frozen copies of the app: desktop on :4402, phone layout on :4403 (`npm run demo` with `DEMO_PORT`).
- `serve.mjs` is a small CORS file server, only needed for debugging.
- The demo's posts are timed relative to now, so dashboards drift during the day. That's data, not design.

## Mockups (06 · Mockups page)
- `mockall.py` captures the 12 main screens at all 4 device sizes, light + dark → `mock/<Device>-<theme>-<NN>.png` (calls `mockshot.mjs`, headless Chrome at 3x for iPhone, 2x otherwise).
- `upmock.mjs` uploads them via `upload_assets` URLs and saves hashes to `mock/hashes.json`. Frames in Figma are point-size with PNG export at 3x / 2x, so exports hit the native pixel sizes.
- `upto.mjs` replaces the image in existing mockup frames: get `upload_assets` URLs with `nodeIds` (the frames), list `{file, node}` pairs in a jobs JSON, then `JOBS=jobs.json node upto.mjs 0 <urls...>`. Uploads 8 at a time with retries. `mockall.py` accepts `STAMP=<file>` to skip shots newer than it, and `PORT=` runs several captures in parallel.

## Tidy checks (Oct 17)
- `pillaudit.mjs <base> <screens.json> <W> <H> [mobile]` — headless check of the running app. `MODE=stack` lists labels squeezed to one or two words per line; default mode saves 4× crops of every pill to /tmp/pills.
- `pillcenter.js` — run in Figma after every rebuild (set `const PAGE` first). Centres every pill's content, centres each item in a pill row, lines counts up with their labels, puts wrapped labels back on one line, and optically centres circles and short-number badges by their rendered ink (`absoluteRenderBounds`), because digits like 1 sit off-centre in a centred text box. Safe to re-run.
- Captures and mockups hide `.demo-tag`, `.demo-note` and the welcome card's "Live demo" label (rule: no demo labels in prototypes or mockups).
- Mockups follow the Oct 14 rule: width 1440, density = export width ÷ 1440 (13" @1.78, 16" @2.4, 5K @3.56). 5K images go into Figma as two halves.
