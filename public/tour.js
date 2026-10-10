// The demo tour: a walk through the real screens, one feature at a time (same idea as Growth's).
// Each stop opens its screen, waits for the element marked [data-tour="…"] (a marker, not a style
// class, so restyling never breaks it), dims everything else and puts a card beside it.
// A stop whose element never shows (e.g. hidden on a phone) is skipped in the direction you were going.

const tourFirstPost = () => {
  const all = [...(S.allPosts || S.posts)].filter(upcoming).sort((a, b) => a.publishAt.localeCompare(b.publishAt));
  return all.find((p) => p.kind === 'reel' && p.platforms?.length >= 3) || all[0];
};
// A measured clip that was also posted through the phone app, so "two routes" has something to show.
const tourComparison = () => {
  const q = S.quality.filter((x) => x.route === 'queue' && !x.benchmarkId);
  return q.find((x) => S.quality.some((y) => y.route === 'app' && y.original === x.original)) || q[0];
};
// The composer with Harbor Coffee's 4K HDR pour-over clip (unless you're filtered to another account).
async function tourComposer() {
  if (location.hash === '#/new' && C.upload?.name === 'pour-over-60.mov') return;
  await openInComposer('pour-over-60.mov');
  if (!curBrand() && brands().some((b) => b.id === 'harbor')) { C.brand = 'harbor'; render(); }
}
const tourHash = (h) => () => { if (location.hash !== h) location.hash = h; };

const TOUR = [
  { go: tourHash('#/dashboard'), target: 'kpis', title: 'Your week at a glance',
    body: 'What goes out next, how much is scheduled this week, what needs you, and how close posted videos stayed to the original.' },
  { go: tourHash('#/dashboard'), target: 'attention', title: 'Nothing slips through',
    body: 'A missed slot or a failed upload lands here with the fix one click away: Post now, Reschedule or Retry.' },
  { go: tourHash('#/dashboard'), target: 'accounts', title: 'Five accounts, one studio',
    body: 'A creator, a coffee shop, a church, a band and a nonprofit. Switch between them here, or see every account at once.' },
  { go: tourHash('#/calendar'), target: 'calendar', title: 'Two weeks, planned',
    body: 'Every post for every account, colour-coded by status. Click any post to open it.' },
  { go: () => { const p = tourFirstPost(); if (p) tourHash(`#/post/${p.id}`)(); }, target: 'destinations', title: 'One post, every platform',
    body: 'Each platform gets the format it wants: a Reel, a Short, a TikTok, a Page video. Each one shows its own status.' },
  { go: () => { const p = tourFirstPost(); if (p) tourHash(`#/post/${p.id}`)(); }, target: 'history', title: 'What happened, step by step',
    body: 'Who scheduled it, what Queue checked and fixed, and when it was handed to each platform.' },
  { go: tourComposer, target: 'preview', title: 'See it before it posts',
    body: 'Preview the post on each platform, with the app’s buttons and safe zones on top, so nothing hides under a caption.' },
  { go: tourComposer, target: 'versions', title: 'One source, tailored versions',
    body: 'Queue checks the file against each platform’s rules and fixes only what it has to. This is a 4K HDR clip: YouTube keeps the original, the others get one careful version.' },
  { go: () => { const q = tourComparison(); tourHash(q ? `#/quality/${q.id}` : '#/quality')(); }, target: 'lab', title: 'Proof, not promises',
    body: 'Your original next to what Instagram actually serves, scored with VMAF frame by frame. The worst moment is marked.' },
  { go: () => { const q = tourComparison(); tourHash(q ? `#/quality/${q.id}` : '#/quality')(); }, target: 'routes', title: 'Same clip, two routes',
    body: 'The same video posted through the Instagram app and through Queue, each compared with the original.' },
  { target: 'demo', title: 'That’s the tour',
    body: 'Click DEMO anytime for the welcome card or to take the tour again. Everything here is yours to click, and nothing posts anywhere.' },
];

const TOUR_PAD = 6;
const tourNarrow = () => matchMedia('(max-width: 760px)').matches;
let tourStep = null; let tourDir = 1; let tourRun = 0; let tourTimer = null;
const tourVisible = (n) => { if (!n) return false; const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(n).visibility !== 'hidden'; };
const tourFind = (t) => [...document.querySelectorAll(`[data-tour="${t}"]`)].find(tourVisible) || null;
const tourSleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startTour() {
  $('#modalRoot')?.replaceChildren(); // the welcome card, if it's open
  closeMenu();
  tourStep = 0; tourDir = 1;
  document.addEventListener('keydown', tourKeys, true);
  window.addEventListener('resize', tourFollow);
  $('#content')?.addEventListener('scroll', tourFollow);
  tourTimer = setInterval(tourFollow, 400); // the app re-renders on its own; keep the spotlight on the live element
  tourShow();
}
function endTour() {
  tourStep = null; tourRun++;
  clearInterval(tourTimer);
  document.removeEventListener('keydown', tourKeys, true);
  window.removeEventListener('resize', tourFollow);
  $('#content')?.removeEventListener('scroll', tourFollow);
  $('#tourRoot')?.remove();
}
function tourGo(d) {
  if (tourStep == null) return;
  tourDir = d;
  const n = tourStep + d;
  if (n >= TOUR.length) return endTour();
  if (n >= 0) { tourStep = n; tourShow(); }
}
function tourKeys(e) {
  if (tourStep == null) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return endTour(); }
  if (e.key === 'ArrowRight') { e.preventDefault(); return tourGo(1); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); return tourGo(-1); }
  if (e.key === 'Tab') { // keep focus inside the card
    const f = [...($('#tourRoot .tour-card')?.querySelectorAll('button') || [])];
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    e.preventDefault();
    f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
  }
}

async function tourShow() {
  const run = ++tourRun; const stop = TOUR[tourStep];
  let root = $('#tourRoot');
  if (!root) { root = el('div', { id: 'tourRoot', class: 'tour', 'aria-live': 'polite' }); document.body.append(root); }
  root.classList.add('waiting');
  try { await stop.go?.(); } catch {}
  let target = null;
  for (let i = 0; i < 60 && run === tourRun; i++) { target = tourFind(stop.target); if (target) break; await tourSleep(60); }
  if (run !== tourRun) return;
  if (!target) { // not on this screen size: skip it, in the direction you were going
    const n = tourStep + tourDir;
    if (n < 0 || n >= TOUR.length) return endTour();
    tourStep = n; return tourShow();
  }
  await tourSleep(120); // let the screen settle (the app scrolls to the top after a route change)
  if (run !== tourRun) return;
  tourFind(stop.target)?.scrollIntoView({ block: tourNarrow() ? 'start' : 'center', behavior: 'instant' });
  const last = tourStep === TOUR.length - 1;
  const next = btn(last ? 'Finish' : 'Next', 'primary', () => tourGo(1));
  root.replaceChildren(
    el('div', { class: 'tour-block' }), // blocks clicks on the page behind; the hole is only visual
    el('div', { class: 'tour-spot', 'aria-hidden': 'true' }),
    el('div', { class: 'tour-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tourTitle', 'aria-describedby': 'tourBody' },
      el('div', { class: 'label tour-count' }, `Step ${tourStep + 1} of ${TOUR.length}`),
      el('h2', { class: 'h3', id: 'tourTitle' }, stop.title),
      el('p', { class: 'small tour-body', id: 'tourBody' }, stop.body),
      el('div', { class: 'tour-dots', 'aria-hidden': 'true' }, ...TOUR.map((_, i) => el('i', { class: i === tourStep ? 'on' : i < tourStep ? 'done' : '' }))),
      el('div', { class: 'tour-foot' }, el('button', { type: 'button', class: 'tour-end small', on: { click: endTour } }, 'End tour'), tourStep > 0 ? btn('Back', 'ghost', () => tourGo(-1)) : null, next)));
  tourFollow();
  root.classList.remove('waiting');
  next.focus({ preventScroll: true });
}

// Spotlight on the element; the card below it if it fits, else above, else beside, else in a corner.
function tourFollow() {
  const root = $('#tourRoot'); if (!root || tourStep == null) return;
  const t = tourFind(TOUR[tourStep].target); const spot = root.querySelector('.tour-spot'); const card = root.querySelector('.tour-card');
  if (!t || !spot || !card) return;
  const vw = innerWidth, vh = innerHeight, r = t.getBoundingClientRect();
  const box = { top: Math.max(4, r.top - TOUR_PAD), left: Math.max(4, r.left - TOUR_PAD) };
  box.width = Math.min(vw - 4, r.right + TOUR_PAD) - box.left; box.height = Math.min(vh - 4, r.bottom + TOUR_PAD) - box.top;
  Object.assign(spot.style, { top: `${box.top}px`, left: `${box.left}px`, width: `${box.width}px`, height: `${box.height}px` });
  if (tourNarrow()) { card.style.top = card.style.left = ''; return; } // docked at the bottom by CSS
  const W = card.offsetWidth, H = card.offsetHeight, G = 12;
  const clampX = (x) => Math.min(Math.max(G, x), vw - W - G), clampY = (y) => Math.min(Math.max(G, y), vh - H - G);
  const spots = [
    [box.top + box.height + G + H <= vh, () => [clampX(box.left), box.top + box.height + G]],
    [box.top - G - H >= 0, () => [clampX(box.left), box.top - G - H]],
    [box.left + box.width + G + W <= vw, () => [box.left + box.width + G, clampY(box.top)]],
    [box.left - G - W >= 0, () => [box.left - G - W, clampY(box.top)]],
  ];
  const [x, y] = (spots.find(([fits]) => fits)?.[1] || (() => [vw - W - 24, vh - H - 24]))();
  card.style.left = `${x}px`; card.style.top = `${y}px`;
}
