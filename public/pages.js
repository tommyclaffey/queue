/* Queue — pages that sit on top of app.js: post detail, Quality Lab, onboarding.
   Shares app.js's globals (el, api, S, VIEWS…). All user content via textContent. */
'use strict';

// ---------------------------------------------------------------- timeline wording
// Turns the scheduler's raw log lines into a title + one line of detail for people.
function timelineEntry(msg, p) {
  const m = (re) => re.exec(msg);
  let x;
  if (msg === 'queued') { const who = member(p.by); return ['Scheduled', who ? `By ${who.name} · ${who.title}` : 'From the web app']; }
  if ((x = m(/^prepared: (.+)$/))) return ['Checked & prepared', x[1] === 'none' ? 'No fixes needed — shipped untouched' : PLAN_TEXT[x[1]] ? `${PLAN_TEXT[x[1]][0]} — ${PLAN_TEXT[x[1]][1].toLowerCase()}` : x[1]];
  if (msg.startsWith('staged')) return ['Sent to Instagram', p.meta ? `Instagram downloaded the prepared file (${fmtBytes(p.meta.bytes)}) from a temporary link` : 'Uploaded ahead of time so it is processed on time'];
  if (msg === 'Instagram finished processing') return ['Processed by Instagram', 'Temporary link closed · ready to go live'];
  if ((x = m(/^published \S+ \((-?\d+)s after target\)$/))) { const sec = Math.max(0, +x[1]); return ['Posted', sec < 120 ? `${sec} seconds after the set time` : `On your OK — ${sec < 7200 ? `${Math.round(sec / 60)} minutes` : sec < 172800 ? `${Math.round(sec / 3600)} hours` : `${Math.round(sec / 86400)} days`} after the set time`]; }
  if ((x = m(/^quality measured: VMAF ([\d.]+)$/))) return ['Quality measured', `VMAF ${x[1]} vs. your original`];
  if ((x = m(/^missed by (.+)$/))) return ['Missed its time', `${x[1]} late — the Mac was off or asleep`];
  if ((x = m(/^error: (.+)$/))) return ['Failed', x[1]];
  if ((x = m(/^transient error: (.+)$/))) return ['Temporary problem', `Retrying: ${x[1]}`];
  if (msg === 'edited') return ['Edited', 'Will re-send with the new details'];
  if (msg === 'retry requested') return ['Retry requested', 'Back in the queue'];
  if (msg === 'post now requested') return ['Post now requested', 'Goes live within a minute'];
  return [friendly(msg), ''];
}
const DEST = { posted: ['✓ Posted', 'posted'], published: ['✓ Posted', 'posted'], drafts: ['In drafts', 'missed'], queued: ['○ Scheduled', 'scheduled'], scheduled: ['○ Scheduled', 'scheduled'], staged: ['↑ Sending', 'sending'], ready: ['● Ready', 'ready'], missed: ['! Missed', 'missed'], failed: ['× Failed', 'failed'] };
const VERDICT_SCALE = [[0, ''], [70, 'noticeable'], [85, 'good'], [93, 'identical']];
const fmtClock = (s) => fmtDur(s ?? 0);

// ================================================================ POST DETAIL
VIEWS.post = async (c, id) => {
  const p = (S.allPosts || S.posts).find((x) => x.id === id); // a link to another account's post still opens
  if (!p) { topbar('Post not found'); c.append(el('div', { class: 'card empty' }, el('div', { class: 'h3' }, 'That post is gone'), el('div', {}, 'It may have been removed.'), el('div', { style: 'margin-top:14px' }, btn('Back to Queue', 'primary', () => (location.hash = '#/queue'))))); return; }
  const s = statusOf(p);
  const plats = platformsOf(p);
  const comps = comparisonsFor(p.id);
  const main = comps.find((q) => q.platform === 'instagram' && q.route === 'queue') || comps.find((q) => q.route === 'queue');
  const title = (postTitle(p)).split(/[.!?\n]/)[0].slice(0, 60);

  const actions = [];
  if (p.source) actions.push(btn('Duplicate', 'ghost', () => openInComposer(p.source)));
  if (s === 'posted') {
    if (!p.images) actions.push(btn(main ? 'Measure again' : 'Measure quality', 'secondary', (e) => measurePost(p, e.currentTarget)));
    if (p.permalink) actions.push(el('a', { class: 'btn primary', href: p.permalink, target: '_blank', rel: 'noopener' }, 'View on Instagram', icon('external')));
  } else {
    if (s === 'missed') actions.push(btn('Post now', 'primary', () => missedDecision(p)));
    if (s === 'failed') actions.push(btn('Retry', 'primary', () => retry(p)));
    if (upcoming(p)) actions.push(btn('Post now', 'secondary', () => postNowExisting(p)));
    if (!p.images) actions.push(btn('Edit', s === 'missed' || s === 'failed' ? 'secondary' : 'primary', () => editPost(p)));
    actions.push(moreBtn(() => [['Remove from schedule', () => removePost(p), { danger: true }]]));
  }
  topbar(title, `${plats.length} platform${plats.length === 1 ? '' : 's'} · ${new Date(p.publishAt).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} · ${fmtTime(new Date(p.publishAt))}`, actions);

  // ---- left: the post itself
  const media = p.images?.length ? carousel(p.images, 'detail-media') : (() => { const v = el('video', { class: 'detail-media', src: p.media ? `/media/${encodeURIComponent(p.media)}` : '', muted: true, autoplay: true, loop: true, playsInline: true }); v.muted = true; return v; })();
  const by = member(p.by);
  const left = el('div', { class: 'stack', style: 'gap:10px' }, el('div', { class: 'detail-frame' }, media), el('div', {}, pill(s)),
    by ? el('div', { class: 'row by-line', style: 'gap:8px' }, avatarEl(by, 'av-sm'), el('div', { class: 'small' }, el('span', { class: 'muted' }, 'Scheduled by '), el('b', { style: 'font-weight:600' }, by.name))) : null,
    brandOf(p) ? el('div', { class: 'row by-line', style: 'gap:8px' }, avatarEl(brandOf(p), 'av-sm'), el('div', { class: 'small' }, el('span', { class: 'muted' }, 'For '), el('b', { style: 'font-weight:600' }, brandOf(p).name), el('span', { class: 'muted' }, ` · @${brandOf(p).handle}`))) : null, p.permalink ? el('a', { class: 'small faint link', href: p.permalink, target: '_blank', rel: 'noopener' }, p.permalink.replace(/^https?:\/\/(www\.)?/, '').slice(0, 34) + '…') : el('div', { class: 'small faint' }, postMeta(p)));

  // ---- middle: destinations + what happened
  const dests = el('div', { class: 'card flush' }, el('div', { class: 'row', style: 'padding:16px 18px 6px' }, el('h2', { class: 'h3' }, 'Destinations')));
  for (const d of (isDemo() && p.destinations?.length ? p.destinations : [{ platform: 'instagram', format: p.kind === 'story' ? 'Story' : p.images?.length > 1 ? 'Carousel' : p.images?.length ? 'Photo' : 'Reel', status: s === 'posted' ? 'posted' : p.status }])) {
    const [txt, cls] = d.status === s ? [`${GLYPH[s]} ${STATUS[s]}`, s] : DEST[d.status] || DEST.queued;
    const v = d.vmaf ?? vmafOf(p, d.platform);
    const when = d.status === 'posted' || d.status === 'published' ? `posted ${fmtTime(new Date(p.publishedAt || p.publishAt))}` : d.status === 'drafts' ? 'sent to drafts' : fmtWhen(p.publishAt);
    dests.append(el('div', { class: 'dest-row' }, badge(d.platform), el('div', { class: 'who' }, el('b', {}, PNAME[d.platform] || d.platform), el('div', { class: 'small faint' }, `${d.format || ''} · ${when}`)), el('span', { class: `pill ${cls}` }, txt), v != null ? el('span', { class: 'mono small' }, `VMAF ${v}`) : null, d.status === 'posted' && p.permalink ? el('a', { class: 'small link', href: p.permalink, target: '_blank', rel: 'noopener' }, 'View ↗') : null));
  }
  const tl = el('div', { class: 'timeline' });
  let log = [];
  try { log = (await api(`/api/queue/${p.id}/log`)).log; } catch {}
  for (const l of log) {
    const [t, sub] = timelineEntry(l.msg, p);
    if (/^file link:/.test(l.msg)) continue;
    tl.append(el('div', { class: 'tl' }, el('div', { class: 'tl-dot' + (/Failed|Missed/.test(t) ? ' warn' : '') }), el('div', { style: 'flex:1;min-width:0' }, el('div', { class: 'row', style: 'align-items:baseline' }, el('b', { style: 'flex:1;font-weight:500' }, t), el('span', { class: 'small faint' }, new Date(l.at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))), sub ? el('div', { class: 'small muted' }, sub) : null)));
  }
  const middle = el('div', { class: 'stack', style: 'gap:16px' }, dests, el('div', { class: 'card' }, el('h2', { class: 'h3', style: 'margin-bottom:12px' }, 'What happened'), tl));

  // ---- right: quality
  const right = el('div', { class: 'stack', style: 'gap:16px' });
  if (main) {
    const r = main.result;
    right.append(el('div', { class: 'card stack', style: 'gap:12px' }, el('h2', { class: 'h3' }, 'Quality report'),
      el('div', { class: 'row', style: 'align-items:baseline;gap:8px' }, el('span', { class: 'display' }, String(r.vmaf)), el('span', { class: 'small muted' }, 'VMAF / 100')),
      el('div', { class: 'verdict' + (r.vmaf >= 93 ? ' good' : '') }, r.verdict),
      scaleBar(r.vmaf),
      el('div', {}, ...[['SSIM', r.ssim], ['PSNR', r.psnr != null ? `${r.psnr} dB` : '—'], ['Worst moment', r.vmafWorst != null ? `${r.vmafWorst} at ${fmtClock(r.worstAt)}` : '—']].map(([k, v]) => el('div', { class: 'kv' }, el('span', { class: 'k' }, k), el('span', { class: 'mono small' }, String(v)))))));
    right.append(el('div', { class: 'card stack', style: 'gap:8px' }, el('h2', { class: 'h3' }, `Original → what ${PNAME[main.platform]} serves`),
      ...[['Resolution', r.original.resolution, r.posted.resolution], ['Bitrate', r.original.mbps != null ? `${r.original.mbps} Mbps` : '—', r.posted.mbps != null ? `${r.posted.mbps} Mbps` : '—'], ['File size', `${r.original.mb} MB`, `${r.posted.mb} MB`]].map(([k, a, b]) => el('div', { class: 'kv' }, el('span', { class: 'k small' }, k), el('span', { class: 'mono small' }, `${a} → ${b}`))),
      el('div', { style: 'margin-top:6px' }, btn('Open side-by-side in Quality Lab', 'secondary', () => (location.hash = `#/quality/${main.id}`)))));
  } else if (s === 'posted' && !p.images) {
    right.append(el('div', { class: 'card stack', style: 'gap:10px' }, el('h2', { class: 'h3' }, 'Quality report'), el('div', { class: 'small muted' }, 'Not measured yet. Queue downloads what Instagram serves and scores it against your original with VMAF — the same 0–100 measure Netflix uses.'), el('div', {}, btn('Measure quality', 'primary', (e) => measurePost(p, e.currentTarget)))));
  } else if (p.meta) {
    const m = p.meta;
    right.append(el('div', { class: 'card stack', style: 'gap:10px' }, el('h2', { class: 'h3' }, 'Quality check'),
      el('div', { class: 'verdict' + (p.fix === 'none' ? ' good' : '') }, el('b', { style: 'font-weight:600;display:block' }, p.fix && PLAN_TEXT[p.fix] ? PLAN_TEXT[p.fix][0] : 'Checked'), el('div', { class: 'small', style: 'opacity:.85' }, p.fix && PLAN_TEXT[p.fix] ? PLAN_TEXT[p.fix][1] : '')),
      ...[['Original', p.source ? shortName(p.source) : '—'], ['Resolution', `${m.width}×${m.height}${m.hdr ? ' · HDR' : ''}`], ['Length', fmtDur(m.durationSec)], ['Prepared file', fmtBytes(m.bytes)]].map(([k, v]) => el('div', { class: 'kv' }, el('span', { class: 'k small' }, k), el('span', { class: 'mono small' }, v))),
      el('div', { class: 'small faint' }, 'After it posts, Queue can measure exactly how much quality Instagram kept.')));
  }
  if (s === 'missed') right.prepend(el('div', { class: 'card stack attn-card', style: 'gap:10px' }, el('div', { class: 'row' }, pill('missed'), el('b', { style: 'font-weight:600' }, 'This post missed its time')), el('div', { class: 'small muted' }, `Your Mac was off or asleep, so nothing was posted. Posts more than ${lateLimit()} late always wait for you.`), el('div', { class: 'row' }, btn('Post now', 'primary small', () => missedDecision(p)), btn('Reschedule', 'ghost small', () => missedDecision(p, 'later')))));
  if (s === 'failed') right.prepend(el('div', { class: 'card stack attn-card bad', style: 'gap:10px' }, el('div', { class: 'row' }, pill('failed'), el('b', { style: 'font-weight:600' }, 'This post failed')), el('div', { class: 'small muted' }, p.error || ''), el('div', {}, btn('Retry', 'primary small', () => retry(p)))));

  c.append(el('div', { class: 'detail' }, left, middle, right));
};
function scaleBar(v) {
  return el('div', { class: 'scale' }, el('div', { class: 'bar' }, el('span', { style: `width:${Math.min(100, v)}%` })), el('div', { class: 'scale-ticks' }, ...VERDICT_SCALE.map(([n, l]) => el('span', { class: v >= n && (VERDICT_SCALE.find(([m]) => m > n)?.[0] ?? 101) > v ? 'on' : '' }, n === 93 ? '93+' : String(n), l ? ` ${l}` : ''))));
}
async function measurePost(p, button) {
  const label = button?.textContent;
  if (button) { button.disabled = true; button.textContent = 'Measuring…'; }
  try { const { comparison } = await api(`/api/quality/${p.id}/measure`, { method: 'POST' }); toast(`VMAF ${comparison.result.vmaf} — ${comparison.result.verdict}`); await load(); render(); }
  catch (e) { toast(e.message, true); if (button) { button.disabled = false; button.textContent = label; } }
}
// Simple image carousel: click left/right half to move.
function carousel(images, cls, src = imgUrl) {
  let i = 0;
  const img = el('img', { class: cls, src: src(images[0]), alt: '' });
  const count = el('span', { class: 'cnt' }, `1/${images.length}`);
  const dots = el('div', { class: 'dots' }, ...images.map((_, k) => el('i', { class: k === 0 ? 'on' : '' })));
  const go = (d) => { i = (i + d + images.length) % images.length; img.src = src(images[i]); count.textContent = `${i + 1}/${images.length}`; [...dots.children].forEach((n, k) => n.classList.toggle('on', k === i)); };
  const wrap = el('div', { class: 'carousel', on: { click: (e) => go(e.offsetX < e.currentTarget.clientWidth / 2 ? -1 : 1) } }, img, images.length > 1 ? count : null, images.length > 1 ? dots : null);
  return wrap;
}

// ================================================================ QUALITY LAB
let labMode = 'side';
VIEWS.quality = async (c, compId) => {
  const comps = [...S.quality].sort((a, b) => b.at.localeCompare(a.at));
  const postOf = (q) => S.posts.find((p) => p.id === q.postId);
  const label = (q) => q.label ? `${shortName(q.original)} · ${q.label}` : `${postOf(q)?.caption?.split(/[.!?\n]/)[0].slice(0, 32) || shortName(q.original)} · ${q.route === 'app' ? `${PNAME[q.platform]} app` : q.platform === 'instagram' ? 'via Queue' : PNAME[q.platform]}`;
  const sel = comps.find((q) => q.id === compId) || comps.find((q) => q.route === 'queue') || comps[0];
  topbar('Quality Lab', 'Compare your original with what Instagram actually serves', [
    sel ? btn('Export report', 'secondary', () => exportReport(sel, postOf(sel))) : null,
    btn('New comparison', 'primary', newComparison)].filter(Boolean));
  c.append(labTabs('quality'));
  if (!sel) return qualityEmpty(c);
  const r = sel.result;

  // ---- selectors
  const originals = [...new Set(comps.map((q) => q.original))];
  const origSel = el('select', { class: 'input', on: { change: (e) => { const q = comps.find((x) => x.original === e.target.value && x.route === 'queue') || comps.find((x) => x.original === e.target.value); location.hash = `#/quality/${q.id}`; } } }, ...originals.map((o) => el('option', { value: o, selected: o === sel.original }, `${shortName(o)} — your file`)));
  const withSel = el('select', { class: 'input', on: { change: (e) => (location.hash = `#/quality/${e.target.value}`) } }, ...comps.filter((q) => q.original === sel.original).map((q) => el('option', { value: q.id, selected: q.id === sel.id }, label(q))));
  const pickers = el('div', { class: 'lab-pick' }, el('label', { class: 'field' }, el('span', {}, 'Original'), origSel), el('span', { class: 'small faint', style: 'padding-bottom:10px' }, 'vs'), el('label', { class: 'field' }, el('span', {}, 'Compared with'), withSel));

  // ---- viewer
  const A = el('video', { src: `/media/${encodeURIComponent(sel.original)}`, muted: true, playsInline: true, preload: 'auto' });
  const B = el('video', { src: `/quality-media/${encodeURIComponent(sel.served)}`, muted: true, playsInline: true, preload: 'auto' });
  A.muted = B.muted = true;
  const servedName = sel.label ? `Via ${sel.label}` : sel.route === 'app' ? `Via ${PNAME[sel.platform]} app` : `On ${PNAME[sel.platform]}`;
  const stage = el('div', { class: 'lab-stage' });
  const head = el('h2', { class: 'h3', style: 'flex:1' }, `Frame ${fmtClock(r.worstAt)} — the worst moment`);
  const modes = el('div', { class: 'seg' }, ...[['side', 'Side by side'], ['slider', 'Slider'], ['diff', 'Difference']].map(([k, l]) => el('button', { class: labMode === k ? 'on' : '', on: { click: () => { labMode = k; layout(); [...modes.children].forEach((b, i) => b.classList.toggle('on', ['side', 'slider', 'diff'][i] === k)); } } }, l)));
  const range = el('input', { type: 'range', min: 0, max: 100, value: 50, class: 'lab-range', 'aria-label': 'Slider position' });
  range.addEventListener('input', () => stage.style.setProperty('--cut', `${range.value}%`));
  function layout() {
    stage.className = `lab-stage ${labMode}`;
    stage.style.setProperty('--cut', `${range.value}%`);
    const capA = el('div', { class: 'lab-cap' }, el('div', { class: 'label' }, 'Original'), el('div', { class: 'small muted' }, `${r.original.resolution} · ${r.original.mbps ?? '—'} Mbps`));
    const capB = el('div', { class: 'lab-cap' }, el('div', { class: 'label' }, servedName), el('div', { class: 'small muted' }, `${r.posted.resolution} · ${r.posted.mbps ?? '—'} Mbps`));
    if (labMode === 'side') stage.replaceChildren(el('div', { class: 'lab-col' }, capA, el('div', { class: 'lab-frame' }, A)), el('div', { class: 'lab-col' }, capB, el('div', { class: 'lab-frame' }, B)));
    else stage.replaceChildren(el('div', { class: 'lab-col wide' }, el('div', { class: 'row', style: 'justify-content:space-between' }, capA, capB), el('div', { class: 'lab-frame stack-frame' }, A, B, labMode === 'slider' ? el('div', { class: 'lab-split' }) : null), labMode === 'slider' ? range : el('div', { class: 'small faint', style: 'text-align:center' }, 'Bright areas are where the platform changed your pixels. Black means identical.')));
  }
  layout();

  // ---- frame chart
  const series = r.series || [];
  const dur = series.length ? series[series.length - 1].t + (series[1] ? series[1].t - series[0].t : 0) : 1;
  const lo = Math.min(...series.map((x) => x.vmaf), 90) - 4;
  const chart = el('div', { class: 'lab-chart' }, ...series.map((x) => el('i', { style: `height:${Math.max(8, ((x.vmaf - lo) / (100 - lo)) * 100)}%`, class: r.worstAt != null && x.t <= r.worstAt && r.worstAt < x.t + (series[1] ? series[1].t - series[0].t : dur) ? 'worst' : '', title: `${fmtClock(x.t)} · VMAF ${x.vmaf}` })));
  const head2 = el('div', { class: 'lab-play' });
  chart.append(head2);
  const seek = (t) => { A.currentTime = t; B.currentTime = t; };
  chart.addEventListener('click', (e) => { const rect = chart.getBoundingClientRect(); seek(((e.clientX - rect.left) / rect.width) * dur); });
  const playBtn = btn('Play', 'secondary small', () => { if (A.paused) { A.play(); B.play(); playBtn.textContent = 'Pause'; } else { A.pause(); B.pause(); playBtn.textContent = 'Play'; } });
  A.addEventListener('timeupdate', () => { head2.style.left = `${Math.min(100, (A.currentTime / dur) * 100)}%`; head.textContent = A.paused && Math.abs(A.currentTime - (r.worstAt ?? 0)) < 0.05 ? `Frame ${fmtClock(r.worstAt)} — the worst moment` : `Frame ${fmtClock(A.currentTime)}`; if (Math.abs(B.currentTime - A.currentTime) > 0.15) B.currentTime = A.currentTime; });
  A.addEventListener('ended', () => { B.pause(); playBtn.textContent = 'Play'; });
  A.addEventListener('loadedmetadata', () => seek(r.worstAt || 0), { once: true });
  B.addEventListener('loadedmetadata', () => { B.currentTime = r.worstAt || 0; }, { once: true });

  const viewer = el('div', { class: 'card stack', style: 'gap:14px' }, el('div', { class: 'row' }, head, modes), stage,
    el('div', { class: 'stack', style: 'gap:6px' }, chart, el('div', { class: 'row small faint' }, playBtn, el('span', {}, '0:00'), el('span', { style: 'flex:1;text-align:center' }, r.worstAt != null ? `▲ worst: ${fmtClock(r.worstAt)} · VMAF ${r.vmafWorst}` : ''), el('span', {}, fmtClock(dur)))));

  // ---- right column
  const score = el('div', { class: 'card stack', style: 'gap:10px' }, el('h2', { class: 'h3' }, 'Score'),
    el('div', { class: 'row', style: 'align-items:baseline;gap:8px' }, el('span', { class: 'display' }, String(r.vmaf)), el('span', { class: 'small muted' }, 'VMAF')),
    el('div', { style: 'font-weight:500' }, r.verdict), scaleBar(r.vmaf),
    ...[['SSIM', r.ssim], ['PSNR', r.psnr != null ? `${r.psnr} dB` : '—'], ['Worst moment', r.vmafWorst != null ? `${r.vmafWorst} at ${fmtClock(r.worstAt)}` : '—']].map(([k, v]) => el('div', { class: 'kv' }, el('span', { class: 'k' }, k), el('span', { class: 'mono small' }, String(v)))));
  const side = el('div', { class: 'stack', style: 'gap:16px' }, score);
  const sameApp = comps.find((q) => q.original === sel.original && q.route === 'app');
  const sameQ = comps.find((q) => q.original === sel.original && q.route === 'queue' && q.platform === (sameApp?.platform || 'instagram'));
  if (sameApp && sameQ) {
    const a = sameApp.result.vmaf, b = sameQ.result.vmaf;
    const word = (v) => (v >= 93 ? 'identical' : v >= 85 ? 'good' : v >= 70 ? 'noticeable' : 'heavy loss');
    const row = (k, v, strong) => el('div', { class: 'stack', style: 'gap:4px' }, el('div', { class: 'row' }, el('span', { class: 'small', style: 'flex:1' }, k), el('b', { class: 'mono small' }, String(v))), el('div', { class: 'bar' + (strong ? '' : ' soft') }, el('span', { style: `width:${v}%` })));
    side.append(el('div', { class: 'card stack', style: 'gap:10px' }, el('h2', { class: 'h3' }, 'Same clip, two routes'), row(`${PNAME[sameApp.platform]} app`, a), row('Through Queue', b, true),
      el('div', { class: 'inset small', style: 'font-weight:500' }, word(a) === word(b) ? (b - a >= 0 ? `+${(b - a).toFixed(1)} VMAF — closer to your original` : `${(b - a).toFixed(1)} VMAF — the app route kept more this time`) : `${b - a >= 0 ? '+' : ''}${(b - a).toFixed(1)} VMAF — from "${word(a)}" to "${word(b)}"`),
      el('div', { class: 'small faint' }, 'The same clip posted both ways, each compared with the original.')));
  }
  const past = el('div', { class: 'card stack', style: 'gap:2px' }, el('h2', { class: 'h3', style: 'margin-bottom:6px' }, 'Past comparisons'));
  for (const q of comps.slice(0, 10)) past.append(el('button', { class: 'past' + (q.id === sel.id ? ' on' : ''), on: { click: () => (location.hash = `#/quality/${q.id}`) } }, el('span', { style: 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, label(q)), el('b', { class: 'mono small' }, String(q.result.vmaf))));
  side.append(past);

  c.append(el('div', { class: 'lab' }, el('div', { class: 'stack', style: 'gap:16px;min-width:0' }, pickers, viewer), side));
};
function qualityEmpty(c) {
  const posted = S.posts.filter((p) => statusOf(p) === 'posted' && !p.images);
  c.append(el('div', { class: 'card stack', style: 'gap:10px' }, el('h2', { class: 'h3' }, 'How it works'),
    el('div', { class: 'muted' }, 'After a post goes live, Queue downloads the version Instagram serves and scores it against your original with VMAF — the same 0–100 measure Netflix uses. 93+ looks identical to most people.'),
    el('div', { class: 'small faint' }, 'Results show here side by side, frame by frame, with the worst moment marked.')));
  const list = el('div', { class: 'card flush', style: 'margin-top:16px' }, el('div', { class: 'row', style: 'padding:16px 18px' }, el('h2', { class: 'h3' }, 'Posted, ready to measure')));
  if (!posted.length) list.append(el('div', { class: 'empty' }, el('div', { class: 'h3' }, 'Nothing posted yet'), el('div', {}, 'Once a post goes live you can measure it here.')));
  for (const p of posted) list.append(el('div', { class: 'upnext-row' }, thumb(p), el('div', { class: 'cap' }, postTitle(p)), el('span', { class: 'small muted' }, fmtWhen(p.publishAt)), btn('Measure', 'secondary small', (e) => measurePost(p, e.currentTarget))));
  c.append(list);
}
function newComparison() {
  const posted = S.posts.filter((p) => statusOf(p) === 'posted' && !p.images);
  modal((m, close) => {
    m.append(el('h2', { class: 'h2' }, 'New comparison'), el('div', { class: 'muted small' }, "Pick a post. Queue downloads what Instagram serves and measures it against your original. Takes about a minute."));
    const list = el('div', { class: 'stack', style: 'gap:6px;max-height:340px;overflow:auto' });
    if (!posted.length) list.append(el('div', { class: 'small muted' }, 'Nothing has posted yet.'));
    for (const p of posted) list.append(el('div', { class: 'upnext-row', style: 'border:0;padding:6px 0' }, thumb(p), el('div', { class: 'cap' }, postTitle(p)), vmafOf(p) != null ? el('span', { class: 'mono small faint' }, `VMAF ${vmafOf(p)}`) : null, btn(vmafOf(p) != null ? 'Measure again' : 'Measure', 'secondary small', async (e) => { await measurePost(p, e.currentTarget); close(); location.hash = '#/quality'; })));
    m.append(list, el('div', { class: 'foot' }, btn('Close', 'ghost', close)));
  });
}
function exportReport(q, p) {
  const r = q.result;
  const text = [`Queue quality report`, `Post: ${p?.caption || q.original}`, `Original: ${q.original} (${r.original.resolution}, ${r.original.mbps} Mbps, ${r.original.mb} MB)`, `Compared with: ${q.route === 'app' ? `${PNAME[q.platform]} app` : PNAME[q.platform]} (${r.posted.resolution}, ${r.posted.mbps} Mbps, ${r.posted.mb} MB)`, `Measured: ${new Date(q.at).toLocaleString()}`, '', `VMAF ${r.vmaf} — ${r.verdict}`, `SSIM ${r.ssim} · PSNR ${r.psnr} dB`, `Worst moment: VMAF ${r.vmafWorst} at ${fmtClock(r.worstAt)}`, '', 'Per-moment VMAF:', ...(r.series || []).map((x) => `${fmtClock(x.t)}\t${x.vmaf}`)].join('\n');
  const a = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/plain' })), download: `queue-quality-${q.id}.txt` });
  document.body.append(a); a.click(); a.remove();
}

// ================================================================ ONBOARDING
VIEWS.welcome = (c) => {
  $('#topbar').replaceChildren();
  const st = S.status;
  const app = S.quality.find((q) => q.route === 'app'); const ours = app && S.quality.find((q) => q.original === app.original && q.route === 'queue' && q.platform === app.platform);
  const [lo, hi, real] = app && ours ? [app.result.vmaf, ours.result.vmaf, true] : [71, 95, false];
  const poster = isDemo() ? el('img', { src: imgUrl('worship.jpg'), alt: '' }) : el('div', { class: 'poster-fallback' });
  const frame = (cls) => { const f = el('div', { class: 'wel-frame ' + cls }, poster.cloneNode(true)); return f; };
  const step = (n, t, d, on) => el('div', { class: 'wel-step' + (on ? ' on' : '') }, el('span', { class: 'n' }, String(n)), el('div', {}, el('b', {}, t), el('div', { class: 'small muted' }, d)));
  const connected = isDemo() || (st && !st.dryRun && st.account);
  c.append(el('div', { class: 'welcome' },
    el('div', { class: 'wel-left' },
      el('a', { class: 'logo', href: '#/dashboard' }, el('span', { class: 'logo-mark', html: '<svg viewBox="0 0 24 24" width="12" height="12"><path d="M7 4.5v15l12-7.5z" fill="currentColor"/></svg>' }), el('span', { class: 'logo-word' }, 'Queue')),
      el('h1', { class: 'wel-h' }, 'Post Reels without losing quality.'),
      el('p', { class: 'muted' }, "Queue checks every video against Instagram's spec, fixes only what needs fixing, hands Instagram your original file — then posts it on time."),
      el('div', { class: 'stack', style: 'gap:14px' }, step(1, 'Connect Instagram', 'Creator or Business account. About 2 minutes.', true), step(2, 'Run the setup check', 'We test the connection, publishing permission and video tools.'), step(3, 'Schedule a test Reel', 'Low-stakes first post to prove it end to end.')),
      el('div', { class: 'stack', style: 'gap:8px;align-items:flex-start' }, btn(connected ? 'Continue to setup check' : 'Connect Instagram', 'primary', () => (connected ? (location.hash = '#/setup') : connectHelp('instagram'))), connected ? null : btn('Use a Facebook Page login instead', 'ghost', () => connectHelp('facebook'))),
      el('div', { class: 'small faint' }, '🔒 Your login key stays on this Mac. Queue never sees your password.'),
      el('a', { class: 'small link', href: '#/dashboard' }, 'Skip for now →')),
    el('div', { class: 'wel-right' },
      el('div', { class: 'wel-compare' },
        el('div', { class: 'stack', style: 'gap:10px;align-items:center' }, el('div', { class: 'label' }, real ? 'Instagram app' : 'Typical scheduler'), frame('soft'), el('div', { class: 'small muted' }, 'Compressed twice'), el('div', { class: 'wel-score bad' }, `VMAF ${Math.round(lo)}`)),
        el('div', { class: 'stack', style: 'gap:10px;align-items:center' }, el('div', { class: 'label' }, 'Queue'), frame(''), el('div', { class: 'small muted' }, 'Original file, one clean pass'), el('div', { class: 'wel-score' }, `VMAF ${Math.round(hi)}`))),
      el('div', { class: 'small faint', style: 'text-align:center' }, real ? 'Measured on one of your own clips, posted both ways.' : 'Illustrative — real scores come from your own quality test.'))));
};
function connectHelp(kind) { connectLogin = kind === 'facebook' ? 'facebook' : 'instagram'; location.hash = '#/connect'; }

// ================================================================ CONNECT INSTAGRAM
// Paste the key from Meta's dashboard; Queue checks it with Instagram, saves it, and goes live.
let connectLogin = 'instagram';
VIEWS.connect = async (c) => {
  const st = S.status;
  topbar('Connect Instagram', 'One-time setup · about 20 minutes');
  if (isDemo()) { c.append(el('div', { class: 'card empty' }, el('div', { class: 'h3' }, 'This is the demo account'), el('div', {}, 'To connect your real Instagram, run Queue with npm start and open localhost:4400.'))); return; }
  if (st && !st.dryRun && st.account) {
    c.append(el('div', { class: 'card stack', style: 'gap:12px;max-width:620px' },
      el('div', { class: 'row' }, el('span', { class: 'pbadge', style: 'width:40px;height:40px', html: svgLogo('instagram') }), el('div', { style: 'flex:1' }, el('h2', { class: 'h3' }, `Connected as @${st.account}`), el('div', { class: 'small muted' }, `${st.login === 'facebook' ? 'Facebook Page login' : 'Instagram login'} · ${st.tokenDaysLeft != null ? `key good for ${st.tokenDaysLeft} more days, renews itself` : 'key renews itself'}`)), el('span', { class: 'pill posted' }, '✓ Live')),
      el('div', { class: 'row' }, btn('Run the setup check', 'primary', () => (location.hash = '#/setup')), btn('Disconnect', 'ghost danger', disconnectIg))));
    return;
  }
  // Online Queue: one click instead of pasting a key.
  const q = routeQuery();
  if (st?.hosted) {
    const oc = st.oneClick || {};
    const box = el('div', { class: 'card stack', style: 'gap:12px;max-width:1080px;margin-bottom:20px' });
    if (q.get('error')) box.append(el('div', { class: 'issue error' }, q.get('error')));
    if (oc.instagram) {
      box.append(el('div', { class: 'row', style: 'gap:14px' }, el('span', { class: 'pbadge', style: 'width:40px;height:40px', html: svgLogo('instagram') }), el('div', { style: 'flex:1' }, el('h2', { class: 'h3' }, 'Connect with Instagram'), el('div', { class: 'small muted' }, 'Log in to Instagram and tap Allow. Queue saves the key and renews it for you.')), el('a', { class: 'btn primary', href: '/api/connect/start/instagram' }, 'Connect with Instagram')));
    } else {
      box.append(el('h2', { class: 'h3' }, 'One-click connect isn’t switched on yet'),
        el('div', { class: 'small muted' }, 'Once it is, connecting is a single "Connect with Instagram" button. About 5 minutes, once:'),
        el('ol', { class: 'steps-list small' },
          el('li', {}, 'In your Meta app: Instagram → API setup with Instagram login → Business login settings.'),
          el('li', {}, 'Under OAuth redirect URIs, add: ', el('code', { class: 'cmd' }, oc.redirectUri || '(this Queue’s address)/api/connect/callback/instagram')),
          el('li', {}, 'Copy the Instagram app ID and Instagram app secret from that page into Railway → queue → Variables as INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET.')),
        el('div', { class: 'small faint' }, 'Until then, paste a key below — it works the same.'));
    }
    c.append(box);
  }
  const step = (n, title, body) => el('div', { class: 'cstep' }, el('span', { class: 'n' }, String(n)), el('div', { class: 'stack', style: 'gap:4px' }, el('b', {}, title), ...body));
  const link = (href, label) => el('a', { class: 'link', href, target: '_blank', rel: 'noopener' }, label, ' ↗');
  const steps = el('div', { class: 'card stack', style: 'gap:18px' }, el('h2', { class: 'h3' }, 'Before you paste'),
    step(1, 'Make your Instagram a Creator account', [el('div', { class: 'small muted' }, 'On your phone: Instagram → Settings → Account type and tools → Switch to professional account → Creator. (2 min)')]),
    step(2, 'Create a Meta app', [el('div', { class: 'small muted' }, 'Log in with your own Facebook account, then Create app → "Other" → "Business". Name it anything, like "Queue". (5 min)'), el('div', { class: 'small' }, link('https://developers.facebook.com/apps', 'developers.facebook.com/apps'))]),
    step(3, 'Generate your key', [el('div', { class: 'small muted' }, connectLogin === 'facebook'
      ? 'In the app: add "Instagram" with Facebook Login, link the Facebook Page your Instagram is connected to, then generate a Page access token. Copy the token and your Instagram user ID.'
      : 'In the app: add the "Instagram" product → "API setup with Instagram login" → "Generate token" next to your account. Log in with Instagram and copy the token. (5 min)')]),
    step(4, 'Paste it here', [el('div', { class: 'small muted' }, 'Queue checks it with Instagram before saving anything. The key stays on this Mac.')]),
    el('div', { class: 'small faint' }, 'Full walkthrough with screenshots: the "Meta Setup Guide" note in your vault.'));

  const seg = el('div', { class: 'seg' }, ...[['instagram', 'Instagram login (recommended)'], ['facebook', 'Facebook Page login']].map(([k, l]) => el('button', { type: 'button', class: connectLogin === k ? 'on' : '', on: { click: () => { connectLogin = k; render(); } } }, l)));
  const token = el('textarea', { class: 'input mono', rows: 4, placeholder: 'Paste the access token (a long code starting with IG… or EA…)', spellcheck: 'false', autocomplete: 'off', style: 'min-height:96px;font-size:12px;word-break:break-all' });
  const uid = el('input', { class: 'input mono', inputmode: 'numeric', placeholder: connectLogin === 'facebook' ? 'Required, e.g. 17841400000000000' : 'Optional: Queue finds it from the key', autocomplete: 'off' });
  const err = el('div', { class: 'small', style: 'color:var(--danger)' });
  const go = btn('Connect', 'primary', async () => {
    err.textContent = ''; go.disabled = true; go.textContent = 'Checking with Instagram…';
    try {
      const r = await api('/api/connect', json('POST', { login: connectLogin, token: token.value, userId: uid.value }));
      token.value = '';
      toast(`Connected as @${r.account}`);
      await load();
      if (r.needsCloudflared) toast('One more thing: run "brew install cloudflared" in Terminal (Instagram login sends videos by temporary link).', true);
      location.hash = '#/setup';
    } catch (e) { err.textContent = e.message; go.disabled = false; go.textContent = 'Connect'; }
  });
  const form = el('div', { class: 'card stack', style: 'gap:14px' }, el('h2', { class: 'h3' }, 'Your key'),
    el('div', { class: 'field' }, el('span', {}, 'How you log in'), seg),
    el('label', { class: 'field' }, el('span', {}, 'Access token'), token),
    el('label', { class: 'field' }, el('span', {}, 'Instagram user ID'), uid),
    err, el('div', { class: 'row' }, go, el('span', { class: 'small faint' }, 'Saved to .env on this Mac. Never sent anywhere but Instagram.')));
  c.append(el('div', { class: 'connect-grid' }, steps, form));
  token.focus();
};
function disconnectIg() {
  modal((m, close) => {
    m.append(el('h2', { class: 'h2' }, 'Disconnect Instagram?'), el('div', { class: 'muted' }, 'Queue goes back to dry run: nothing will post until you connect again. Your scheduled posts stay in the queue.'),
      el('div', { class: 'foot' }, btn('Cancel', 'ghost', close), btn('Disconnect', 'primary', async () => { try { await api('/api/disconnect', { method: 'POST' }); close(); toast('Disconnected — back to dry run'); await load(); render(); } catch (e) { toast(e.message, true); } })));
  });
}
VIEWS.setup = async (c) => {
  $('#topbar').replaceChildren();
  const [st, cfg] = await Promise.all([api('/api/status'), api('/api/config')]);
  S.status = st;
  const connected = !st.dryRun && st.account;
  const demo = isDemo();
  const rows = [
    [connected ? 'ok' : 'no', connected ? `Connected as @${st.account}` : 'Not connected yet', connected ? `${demo ? S.extras.account.kind : 'Professional'} account · Instagram Login` : 'Queue is in dry run until a login key is in .env', connected ? null : btn('How to connect', 'secondary small', () => connectHelp('instagram'))],
    [connected ? 'ok' : 'off', connected ? 'Publishing allowed' : 'Publishing', connected ? (demo ? '3 of 50 posts used in the last 24h' : 'Instagram allows up to 50 posts a day') : 'Checked once you connect'],
    [st.ffmpeg ? 'ok' : 'no', st.ffmpeg ? 'Video tools ready' : 'Video tools missing', st.ffmpeg ? 'Quality checker + Apple HDR converter found' : 'Run: brew install ffmpeg'],
    [st.cloudflared || st.uploadMode !== 'url' ? 'ok' : 'no', st.uploadMode === 'url' ? 'Temporary file link works' : 'Direct upload', st.uploadMode === 'url' ? (st.cloudflared ? 'Opens for each upload and closes right after' : 'Run: brew install cloudflared') : 'Files go straight to Meta'],
    [cfg.notify ? 'ok' : 'warn', cfg.notify ? 'Notifications are on' : 'Notifications are off', cfg.notify ? 'Posted, failed and missed alerts on this Mac' : 'Turn them on in Settings → Notifications', cfg.notify ? null : btn('Turn on', 'secondary small', async () => { S.config = await api('/api/config', json('PATCH', { notify: true })); render(); })],
    [cfg.autostart ? 'ok' : 'off', 'Start at login', cfg.autostart ? 'On — Queue runs in the background' : 'Off — Queue only runs while this window is open', el('code', { class: 'cmd' }, `node bin/queue.js autostart ${cfg.autostart ? 'off' : 'on'}`)],
    [connected ? 'ok' : 'off', 'Login key renews itself', connected ? (st.tokenDaysLeft != null ? `Good for ${st.tokenDaysLeft} more days · renewed weekly` : 'Renewed automatically') : 'Checked once you connect'],
  ];
  const G = { ok: '✓', no: '!', warn: '!', off: '○' };
  const stepper = el('div', { class: 'stepper' }, ...[['Connect', connected ? 'done' : 'on'], ['Setup check', connected ? 'on' : ''], ['First post', '']].map(([t, s], i) => el('div', { class: `st ${s}` }, el('span', { class: 'n' }, s === 'done' ? '✓' : String(i + 1)), t)));
  c.append(el('div', { class: 'setup' }, stepper,
    el('div', { style: 'text-align:center' }, el('h1', { class: 'h1' }, 'Checking your setup'), el('div', { class: 'muted' }, `${rows.length} checks. Each problem comes with one fix.`)),
    el('div', { class: 'card flush' }, ...rows.map(([s, t, d, ctrl]) => el('div', { class: 'check-row big' }, el('span', { class: `g2 ${s}` }, G[s]), el('div', { style: 'flex:1' }, el('b', { style: 'font-weight:500' }, t), el('div', { class: 'small muted' }, d)), ctrl || null))),
    el('div', { class: 'row', style: 'justify-content:center;gap:12px' }, btn('Skip for now', 'ghost', () => (location.hash = '#/dashboard')), btn('Schedule a test post →', 'primary', () => (location.hash = '#/new')))));
};

// ================================================================ NEW POST (composer)
// Video, Photos (one photo or a carousel) and Story are real everywhere, Instagram only. The demo
// can also send them to several platforms, using its sample photos.
Object.assign(C, { format: 'video', dests: null, capTab: 'all', captions: {}, photos: [], crop: 'per', frames: [], remind: false });
const VIDEO_DESTS = ['instagram', 'youtubeshorts', 'tiktok', 'facebook', 'linkedin', 'threads', 'x'];
const FORMAT_OF = { instagram: 'Reel', youtubeshorts: 'Short', tiktok: 'Video', facebook: 'Reel', linkedin: 'Video', threads: 'Video', x: 'Video' };
const usualLabel = () => (C.time ? fmtTime(new Date(`2000-01-01T${C.time}`)) : '6:30 PM');
function deliveryOf(p) {
  if (p === 'youtubeshorts') return ['YouTube schedules it', 'native'];
  if (p === 'facebook') return ['Facebook schedules it', 'native'];
  if (p === 'tiktok') return ['Sent to your TikTok drafts', 'drafts'];
  if (p === 'x') return ['Pay per post · video capped at 1280px', 'off'];
  return [`Queue posts at ${usualLabel()}`, ''];
}
const canUse = (p) => ['connected', 'drafts', 'dryrun'].includes(accountState(p));
function ensureDests() { if (!C.dests) C.dests = new Set(isDemo() ? VIDEO_DESTS.filter(canUse) : ['instagram']); }
const fmtSeg = () => el('div', { class: 'seg' }, ...[['video', 'Video'], ['photos', 'Photos'], ['story', 'Story'], ['text', 'Text']].map(([k, l]) => {
  const ok = k !== 'text';
  return el('button', { class: C.format === k ? 'on' : '', disabled: !ok, title: ok ? '' : 'Coming soon', on: { click: () => { C.format = k; C.dests = null; render(); } } }, l);
}));
const cancelBtn = () => btn('Cancel', 'ghost', () => { resetComposer(); location.hash = '#/dashboard'; });
const dateTimeCard = (note) => {
  if (!C.date) { const d = new Date(Date.now() + 3600e3); d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0); C.date = toDateInput(d); C.time = toTimeInput(d); }
  const date = el('input', { class: 'input', type: 'date', value: C.date, min: toDateInput(new Date()), on: { change: (e) => (C.date = e.target.value) } });
  const time = el('input', { class: 'input', type: 'time', value: C.time, on: { change: (e) => { C.time = e.target.value; render(); } } });
  const quick = el('div', { class: 'quick' }, el('span', { class: 'small muted' }, 'Quick:'), ...usualTimes().map(([v, l]) => el('button', { type: 'button', class: C.time === v ? 'on' : '', on: { click: () => { C.time = v; render(); } } }, l)));
  return el('div', { class: 'card stack', style: 'gap:10px' }, el('h2', { class: 'h3' }, 'When'), el('div', { class: 'row', style: 'gap:12px' }, el('label', { class: 'field', style: 'flex:1' }, el('span', {}, 'Date'), date), el('label', { class: 'field', style: 'flex:1' }, el('span', {}, 'Time'), time)), quick, el('div', { class: 'small faint' }, note || tz));
};
const toggleBtn = (on, onClick, disabled) => el('button', { class: 'toggle' + (on ? ' on' : ''), disabled: !!disabled, 'aria-pressed': String(on), on: onClick ? { click: onClick } : null });

VIEWS.new = (c) => {
  if (C.format === 'photos') return isDemo() ? photosComposer(c) : realPhotosComposer(c);
  if (C.format === 'story') return isDemo() ? storyComposer(c) : realStoryComposer(c);
  C.format = 'video';
  if (!C.upload) return uploadStep(c);
  return videoComposer(c);
};

// ---------------------------------------------------------------- step 1: choose
function uploadStep(c) {
  topbar('New post', 'Step 1 of 2 · Choose what to post', [brandPick(), fmtSeg(), cancelBtn()]);
  const input = el('input', { type: 'file', accept: 'video/*', class: 'hidden', on: { change: (e) => e.target.files[0] && doUpload(e.target.files[0]) } });
  const status = el('div', { class: 'muted' }, 'MP4 or MOV · 3 s – 15 min · up to 300 MB · 9:16 looks best');
  const dz = el('div', { class: 'dropzone', role: 'button', tabindex: 0, on: { click: () => input.click(), keydown: (e) => { if (e.key === 'Enter') input.click(); } } },
    el('div', { class: 'bubble', html: svgIcon('upload') }), el('div', { class: 'h2' }, 'Drop a video'), status,
    el('div', { class: 'row', style: 'gap:10px;margin-top:6px' }, btn('Choose file', 'primary', (e) => { e.stopPropagation(); input.click(); }), btn('Pick from Library', 'secondary', (e) => { e.stopPropagation(); libraryPicker(); })), input);
  for (const t of ['dragenter', 'dragover']) dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.add('over'); });
  for (const t of ['dragleave', 'drop']) dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.remove('over'); });
  dz.addEventListener('drop', (e) => e.dataTransfer.files[0] && doUpload(e.dataTransfer.files[0]));
  const multi = isDemo();
  const how = el('div', { class: 'grid', style: 'grid-template-columns:repeat(3,minmax(0,1fr));margin-top:16px' }, ...[
    ['1', 'We check it', multi ? "Every file compared with each platform's own spec — resolution, codec, colour, bitrate, length." : "Every property compared with Instagram's Reels spec — resolution, codec, colour, bitrate, length."],
    ['2', "We fix only what's needed", 'Cheapest safe fix first: lossless rewrap → audio-only fix → one clean encode. Never more than one.'],
    multi ? ['3', 'Each platform gets the best it accepts', 'YouTube keeps your 4K HDR original. Others get one careful version each — never a second round of compression from us.'] : ['3', 'Instagram gets your file', 'No third-party compression in between. Instagram receives exactly the file Queue prepared.'],
  ].map(([n, t, d]) => el('div', { class: 'card stack', style: 'gap:6px' }, el('div', { class: 'label' }, `Step ${n}`), el('h3', { class: 'h3' }, t), el('div', { class: 'small muted' }, d))));
  const recent = el('div');
  c.append(dz, how, recent);
  api('/api/media').then(({ items }) => {
    const list = items.filter((i) => !i.fixedCopy && i.type !== 'photo').slice(0, 8);
    if (!list.length) return;
    recent.replaceChildren(el('div', { class: 'card stack', style: 'gap:14px;margin-top:16px' }, el('div', { class: 'row' }, el('h2', { class: 'h3', style: 'flex:1' }, 'Recent uploads'), el('a', { class: 'link small', href: '#/library' }, 'Open Library →')),
      el('div', { class: 'pick-row' }, ...list.map((it) => { const st = libState(it); return el('button', { class: 'pick', type: 'button', title: shortName(it.name), on: { click: () => openInComposer(it.name) } }, el('video', { muted: true, playsInline: true, preload: 'metadata', src: `/media/${encodeURIComponent(it.name)}#t=0.8` }), el('span', { class: 'small' }, shortName(it.name)), el('span', { class: 'small', style: `color:var(--${st.key === 'fix' ? 'warning' : 'text-tertiary'})` }, st.key === 'ready' ? 'Checked ✓' : st.key === 'fix' ? 'Needs a fix' : st.key === 'posted' ? 'Posted' : 'Scheduled')); }))));
  }).catch(() => {});
  async function doUpload(file) {
    status.textContent = `Uploading and checking ${file.name}…`;
    try { C.upload = await api(`/api/upload?name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file }); C.coverMs = null; render(); }
    catch (e) { status.textContent = e.message; toast(e.message, true); }
  }
}
function libraryPicker() {
  modal(async (m, close) => {
    m.classList.add('wide');
    m.append(el('div', { class: 'row' }, el('h2', { class: 'h2', style: 'flex:1' }, 'Pick from Library'), btn('Close', 'ghost', close)));
    const grid = el('div', { class: 'pick-row' }, el('div', { class: 'small muted' }, 'Loading…'));
    m.append(grid);
    try {
      const { items } = await api('/api/media');
      const list = items.filter((i) => !i.fixedCopy && i.type !== 'photo');
      grid.replaceChildren(...(list.length ? list.map((it) => el('button', { class: 'pick', type: 'button', on: { click: () => { close(); openInComposer(it.name); } } }, el('video', { muted: true, playsInline: true, preload: 'metadata', src: `/media/${encodeURIComponent(it.name)}#t=0.8` }), el('span', { class: 'small' }, shortName(it.name)), el('span', { class: 'small faint' }, it.meta ? `${resLabel(it.meta)} · ${fmtDur(it.meta.durationSec)}` : fmtBytes(it.bytes)))) : [el('div', { class: 'small muted' }, 'Your Library is empty. Upload a video first.')]));
    } catch (e) { grid.replaceChildren(el('div', { class: 'small muted' }, e.message)); }
  });
}

// ---------------------------------------------------------------- step 2: video
function videoComposer(c) {
  ensureDests();
  const up = C.upload; const v = up.info.video || {};
  const hdr = ['arib-std-b67', 'smpte2084'].includes(v.colorTransfer);
  const on = [...C.dests];
  const multi = isDemo();
  const label = multi ? `Schedule to ${on.length} platform${on.length === 1 ? '' : 's'}` : 'Schedule Reel';
  const schedBtn = btn(label, 'primary', scheduleVideo, { disabled: up.result.needsTrim || !on.length });
  topbar('New post', el('span', { class: 'mono small' }, `${shortName(up.name)} · ${fmtDur(up.info.durationSec)} · ${v.width}×${v.height}${hdr ? ' · HDR' : ''}`), [brandPick(), fmtSeg(), cancelBtn(), postNowBtn(destNames(on.length ? on : ['instagram']), scheduleVideo, { disabled: up.result.needsTrim || !on.length }), schedBtn]);

  const grid = el('div', { class: 'composer' });
  // preview column
  const phoneWrap = el('div');
  const label2 = el('div', { class: 'small muted', style: 'font-weight:500' });
  const note = el('div', { class: 'preview-note' });
  const ptabs = el('div', { class: 'ptabs' });
  const video = el('video', { src: `/media/${encodeURIComponent(up.name)}`, muted: true, autoplay: true, loop: true, playsInline: true });
  video.muted = true;
  const shown = PREVIEW_ORDER.filter((p) => !multi || C.dests.has(p) || p === 'instagram');
  if (!shown.includes(C.platform)) C.platform = shown[0];
  const capFor = (p) => (p === 'youtubeshorts' && C.captions.youtubeshorts) || (p !== 'instagram' && C.captions[p]) || C.caption;
  const drawPreview = () => {
    ptabs.replaceChildren(...shown.map((p) => el('button', { class: C.platform === p ? 'on' : '', title: PREVIEW_LABEL[p], 'aria-label': `Preview as ${PREVIEW_LABEL[p]}`, 'aria-pressed': String(C.platform === p), html: svgLogo(p), on: { click: () => { C.platform = p; drawPreview(); } } })));
    label2.textContent = PREVIEW_LABEL[C.platform]; note.textContent = PREVIEW_NOTE[C.platform];
    phoneWrap.replaceChildren(phone(C.platform, video, capFor(C.platform)));
  };
  drawPreview();
  const coverLbl = el('span', { class: 'small muted', style: 'flex:1' }, C.coverMs == null ? 'Cover: Instagram picks' : `Cover: ${(C.coverMs / 1000).toFixed(1)}s`);
  const coverRow = el('div', { class: 'row' }, coverLbl, btn('Use this frame', 'secondary small', () => { C.coverMs = Math.round(video.currentTime * 1000); coverLbl.textContent = `Cover: ${video.currentTime.toFixed(1)}s`; toast('Cover frame set'); }));
  const playRow = el('div', { class: 'row small muted', style: 'gap:8px;margin-top:8px' }, btn('Pause', 'secondary small', (e) => { if (video.paused) { video.play(); e.target.textContent = 'Pause'; } else { video.pause(); e.target.textContent = 'Play'; } }), el('span', {}, 'Pause on the frame you want as the cover.'));
  grid.append(el('div', { class: 'stack', style: 'gap:10px' }, el('div', { class: 'label' }, 'Preview as'), ptabs, previewToggles(drawPreview), label2, phoneWrap, note, el('div', { class: 'card', style: 'padding:12px' }, coverRow, playRow)));

  // destinations + caption + when
  const avail = multi ? VIDEO_DESTS : ['instagram', 'youtubeshorts', 'tiktok', 'facebook', 'linkedin'];
  const dests = el('div', { class: 'card flush' }, el('div', { class: 'row', style: 'padding:14px 18px' }, el('h2', { class: 'h3', style: 'flex:1' }, 'Destinations'), el('span', { class: 'small faint' }, multi ? `${on.length} of ${VIDEO_DESTS.length} on` : '1 of 5 available')));
  for (const p of avail) {
    const ok = canUse(p);
    const isOn = C.dests.has(p);
    const handle = multi ? S.extras.platforms[p === 'youtubeshorts' ? 'youtube' : p]?.handle || 'Not connected' : p === 'instagram' ? handle0() : PLATFORMS.find((x) => x.id === (p === 'youtubeshorts' ? 'youtube' : p))?.delivery;
    const [dtxt, dcls] = deliveryOf(p);
    const right = !multi && p !== 'instagram' ? el('span', { class: 'pill soon' }, 'Coming soon') : el('span', { class: `pill dpill ${dcls === 'native' ? 'posted' : dcls === 'drafts' ? 'missed' : 'queue'}` }, el('i', { class: 'ddot', 'aria-hidden': 'true' }), dtxt);
    dests.append(el('div', { class: 'dest-row' + (ok ? '' : ' off') }, toggleBtn(isOn, ok && (multi || p === 'instagram') ? () => { isOn ? C.dests.delete(p) : C.dests.add(p); render(); } : null, !ok || (!multi && p !== 'instagram')), badge(p), el('div', { class: 'who' }, el('b', {}, PNAME[p]), el('div', { class: 'small faint' }, handle)), el('span', { class: 'chip' }, FORMAT_OF[p]), right));
  }
  const capCard = captionCard(multi, drawPreview);
  grid.append(el('div', { class: 'stack' }, dests, capCard, dateTimeCard(multi ? `${tz} · same time everywhere · Queue hands each file over early so it's processed on time.` : `${tz} · Queue hands the video to Instagram ${mins(S.config?.stageWindowMin ?? 120)} early so it's processed on time.`)));
  // right column
  grid.append(multi ? tailoredPanel(up, on) : qualityPanel(up));
  c.append(grid);
}
const handle0 = () => handle();
function captionCard(multi, onChange) {
  const tabs = multi ? [['all', 'All platforms'], ...(C.dests.has('youtubeshorts') ? [['youtubeshorts', 'YouTube · title']] : []), ...(C.dests.has('tiktok') ? [['tiktok', 'TikTok']] : []), ...(C.dests.has('linkedin') ? [['linkedin', 'LinkedIn']] : [])] : [['all', '']];
  if (!tabs.some(([k]) => k === C.capTab)) C.capTab = 'all';
  const key = C.capTab;
  const cap = el('textarea', { class: 'input', maxlength: key === 'linkedin' ? 3000 : key === 'youtubeshorts' ? 100 : 2200, placeholder: key === 'all' ? 'Write a caption…' : key === 'youtubeshorts' ? 'YouTube needs a title (up to 100 characters)…' : `Optional: a ${PNAME[key]}-only caption. Empty = use "All platforms".` });
  cap.value = key === 'all' ? C.caption : C.captions[key] || '';
  const counters = el('div', { class: 'row small faint mono', style: 'gap:14px;flex-wrap:wrap' });
  const count = () => {
    const t = C.caption; const tags = (t.match(/#[\p{L}\p{N}_]+/gu) || []).length;
    const bits = [el('span', { class: 'counter' + (t.length > 2200 ? ' over' : '') }, `${t.length.toLocaleString()} chars`)];
    if (multi) {
      bits.push(el('span', {}, 'IG 2,200'), C.dests.has('tiktok') ? el('span', {}, 'TikTok 2,200') : null, C.dests.has('linkedin') ? el('span', {}, 'LinkedIn 3,000') : null);
      if (C.dests.has('youtubeshorts') && !C.captions.youtubeshorts) bits.push(el('span', { style: 'color:var(--warning)' }, 'YT title needed'));
    } else bits.push(el('span', { class: 'counter' + (tags > 30 ? ' over' : '') }, `${tags} / 30 hashtags`));
    counters.replaceChildren(...bits.filter(Boolean));
  };
  cap.addEventListener('input', () => { if (key === 'all') C.caption = cap.value; else C.captions[key] = cap.value; count(); const capEl = document.querySelector('.phone [data-cap]'); if (capEl) capEl.textContent = previewCaption(C.platform, (C.platform !== 'instagram' && C.captions[C.platform]) || C.caption); });
  count();
  const head = el('div', { class: 'row' }, el('h2', { class: 'h3', style: 'flex:1' }, 'Caption'), multi ? el('div', { class: 'seg small-seg' }, ...tabs.map(([k, l]) => el('button', { class: k === key ? 'on' : '', on: { click: () => { C.capTab = k; render(); } } }, l))) : null);
  return el('div', { class: 'card stack', style: 'gap:10px' }, head, cap, counters);
}
function tailoredPanel(up, on) {
  const v = up.info.video || {}; const hdr = ['arib-std-b67', 'smpte2084'].includes(v.colorTransfer);
  const mbps = v.bitrate ? (v.bitrate / 1e6).toFixed(0) : '—';
  const plan = up.result.plan;
  const ytOriginal = on.includes('youtubeshorts') && Math.max(v.width, v.height) <= 3840 && ['h264', 'hevc'].includes(v.codec);
  const igRes = `${Math.min(1080, v.width)}×${Math.round(Math.min(1080, v.width) * v.height / v.width)}`;
  const rows = [];
  if (on.includes('youtubeshorts')) rows.push(['youtubeshorts', `${v.width}×${v.height} · ${hdr ? 'HDR' : 'SDR'}`, ytOriginal ? 'Original, untouched' : 'One clean encode', ytOriginal ? 'success' : '']);
  const shared = on.filter((p) => !['youtubeshorts', 'x'].includes(p));
  shared.forEach((p, i) => rows.push([p, `${igRes} · SDR`, i === 0 ? (plan === 'none' ? 'Original, untouched' : `${PLAN_TEXT[plan][0]}`) : `Shares the ${PNAME[shared[0]]} version`, i === 0 && plan === 'none' ? 'success' : '']));
  const files = 1 + (shared.length && plan !== 'none' && plan !== 'remux' ? 1 : 0);
  const nat = on.filter((p) => ['youtubeshorts', 'facebook'].includes(p)).map((p) => PNAME[p].replace(' Shorts', ''));
  const atQ = on.filter((p) => ['instagram', 'linkedin', 'threads'].includes(p)).map((p) => PNAME[p]);
  const det = el('details', { class: 'qdetails' }, el('summary', { class: 'small' }, 'Full quality check'), qualityPanel(up));
  return el('div', { class: 'card stack', style: 'gap:12px' }, el('h2', { class: 'h3' }, 'One source, tailored versions'),
    el('div', { class: 'inset' }, el('span', { class: 'hl-label' }, 'Original file'), el('div', { class: 'mono small' }, `${v.width}×${v.height} · ${hdr ? 'HDR (HLG)' : 'SDR'} · ${mbps} Mbps`)),
    el('div', {}, ...rows.map(([p, spec, what, col]) => el('div', { class: 'tv-row' }, badge(p), el('div', {}, el('div', { class: 'mono small' }, spec), el('div', { class: 'small', style: col ? `color:var(--${col})` : '' }, what))))),
    up.result.needsTrim ? el('div', { class: 'issue error' }, 'Needs a trim: platforms accept 3 seconds to 15 minutes.') : el('div', { class: 'boxed small' }, `${files} file${files === 1 ? '' : 's'} total. Every platform gets at most one encode from your original.`),
    el('div', { class: 'stack', style: 'gap:4px' }, el('div', { class: 'label' }, 'Delivery'),
      nat.length ? el('div', { class: 'small', style: 'color:var(--success)' }, `• ${nat.join(' & ')} schedule${nat.length === 1 ? 's' : ''} ${nat.length === 1 ? 'itself' : 'themselves'} — safe even if your Mac is off`) : null,
      atQ.length ? el('div', { class: 'small muted' }, `• ${atQ.join(' & ')} post from Queue at ${usualLabel()}`) : null,
      on.includes('tiktok') ? el('div', { class: 'small', style: 'color:var(--warning)' }, '• TikTok lands in your drafts — tap Post in the app') : null),
    det);
}
// ---- Post now: skip the schedule. Every composer has it next to Schedule, behind one confirm.
function takePostNow() { const n = !!C.postNow; C.postNow = false; return n; }
const doneToast = (post, now) => (now ? 'Posting now. It goes live as soon as it\u2019s ready, usually within a minute.' : `Scheduled for ${fmtWhen(post.publishAt)}`);
function confirmPostNow(where, run) {
  modal((m, close) => {
    m.append(el('h2', { class: 'h2' }, 'Post now?'),
      el('div', { class: 'small muted' }, `It skips the schedule and goes live on ${where} as soon as it\u2019s ready, usually within a minute. A post can\u2019t be taken back from Queue.`),
      el('div', { class: 'foot' }, btn('Cancel', 'ghost', close), btn('Post now', 'primary', () => { close(); run(); })));
  });
}
function postNowBtn(where, fn, opts = {}) {
  return btn('Post now', 'secondary', () => confirmPostNow(where, () => { C.postNow = true; fn(); }), { title: 'Skip the schedule and post as soon as it\u2019s ready', ...opts });
}
const destNames = (list) => { const n = list.map((p) => PNAME[p] || p); return n.length <= 2 ? n.join(' and ') : `${n.slice(0, -1).join(', ')} and ${n.at(-1)}`; };

async function scheduleVideo() {
  if (C.busy) return;
  const now = takePostNow(); // "Post now" skips the date: it goes out as soon as it's ready
  const when = now ? new Date() : fromInputs(C.date, C.time);
  if (!now && (!when || when < Date.now())) return toast('Pick a post time in the future', true);
  if (C.caption.length > 2200) return toast('Caption is over 2,200 characters', true);
  C.busy = true;
  const up = C.upload; const v = up.info.video || {}; const hdr = ['arib-std-b67', 'smpte2084'].includes(v.colorTransfer);
  const on = [...C.dests]; const multi = isDemo();
  const plan = up.result.plan;
  const steps = multi
    ? [[`Checked against each platform's spec`, `${on.length} destination${on.length === 1 ? '' : 's'}`], ...(on.includes('youtubeshorts') ? [['YouTube: your original, untouched', hdr ? 'No encode needed — 4K HDR is supported' : 'No encode needed']] : []), ...(plan === 'hdr' ? [['HDR → standard colour', "Apple's converter"]] : []), [plan === 'none' ? 'Shipping your original' : `Encoding the ${Math.min(1080, v.width)}-wide version`, `Shared by ${on.filter((p) => !['youtubeshorts', 'x'].includes(p)).map((p) => PNAME[p]).join(', ') || 'Instagram'}`, true], ['Re-checking every version', "Each must pass its platform's rules"], ['Handing off', [on.some((p) => ['youtubeshorts', 'facebook'].includes(p)) ? 'YouTube & Facebook schedule natively' : null, on.includes('tiktok') ? 'TikTok → drafts' : null].filter(Boolean).join(' · ') || (now ? 'Posting now' : `Scheduling for ${fmtWhen(when.toISOString())}`)]]
    : [["Checked against Instagram's spec", ''], [PLAN_TEXT[plan][0], PLAN_TEXT[plan][1], plan !== 'none'], ['Re-checking the result', ''], [now ? 'Posting now' : `Scheduling for ${fmtWhen(when.toISOString())}`, '']];
  let idx = 0; let pct = 0; let timer;
  const list = el('div', { class: 'stack', style: 'gap:14px' });
  const draw = () => list.replaceChildren(...steps.map(([t, sub, bar], i) => { const st = i < idx ? 'done' : i === idx ? 'active' : 'next'; return el('div', { class: `step ${st}` }, el('div', { class: 'mark' }, st === 'done' ? '✓' : ''), el('div', { style: 'flex:1' }, el('div', { style: st === 'next' ? '' : 'font-weight:500' }, t), sub ? el('div', { class: 'small muted' }, sub) : null, bar && st === 'active' ? el('div', { class: 'stack', style: 'gap:4px;margin-top:6px' }, el('div', { class: 'bar' }, el('span', { style: `width:${pct}%` })), el('div', { class: 'mono small' }, `${pct}%`)) : null)); }));
  draw();
  const close = modal((m) => {
    m.append(el('h2', { class: 'h2' }, multi ? `Preparing for ${on.length} platform${on.length === 1 ? '' : 's'}` : 'Preparing your Reel'), el('div', { class: 'small muted mono' }, `${shortName(up.name)} · ${v.width}×${v.height}${hdr ? ' HDR' : ''} · ${fmtDur(up.info.durationSec)}`), list, el('div', { class: 'inset small muted' }, 'Your original is never changed. Queue works on a copy.'));
  });
  // Walk the checklist while the server does the real work.
  timer = setInterval(() => { const barStep = steps.findIndex((s) => s[2]); if (idx === barStep && pct < 92) pct = Math.min(92, pct + 7); else if (idx < steps.length - 2) idx++; draw(); }, 450);
  try {
    const r = await api('/api/schedule', json('POST', { name: up.name, at: when.toISOString(), caption: C.caption, coverOffsetMs: C.coverMs, platforms: on, brand: postingAs()?.id, now }));
    clearInterval(timer); idx = steps.length; pct = 100; draw();
    await new Promise((res) => setTimeout(res, 650));
    close(); resetComposer(); toast(doneToast(r.post, now));
    await load(); location.hash = `#/post/${r.post.id}`;
  } catch (e) { clearInterval(timer); close(); toast(e.message, true); }
  finally { C.busy = false; }
}

// ---------------------------------------------------------------- photos (demo)
const PHOTO_DESTS = [
  ['instagram', (n) => `Carousel ${n}/10`, 10], ['tiktok', (n) => `Photo post ${n}/35`, 35], ['linkedin', (n) => `Multi-image ${n}/20`, 20],
  ['facebook', () => 'Multi-photo', 80], ['threads', (n) => `Carousel ${n}/20`, 20], ['x', () => 'First 4 photos only', 4],
];
function photoPicker(target, max) {
  modal((m, close) => {
    m.classList.add('wide');
    const chosen = new Set(target);
    const grid = el('div', { class: 'photo-pick' });
    const draw = () => grid.replaceChildren(...(S.extras?.photos || []).map((n) => el('button', { class: 'ph' + (chosen.has(n) ? ' on' : ''), type: 'button', on: { click: () => { chosen.has(n) ? chosen.delete(n) : chosen.size < max && chosen.add(n); draw(); } } }, el('img', { src: imgUrl(n), alt: '' }), chosen.has(n) ? el('span', { class: 'num' }, String([...chosen].indexOf(n) + 1)) : null)));
    draw();
    m.append(el('div', { class: 'row' }, el('h2', { class: 'h2', style: 'flex:1' }, 'Add photos'), el('span', { class: 'small faint' }, `Up to ${max}`)), grid,
      el('div', { class: 'foot' }, btn('Cancel', 'ghost', close), btn('Use photos', 'primary', () => { target.splice(0, target.length, ...chosen); close(); render(); })));
  });
}
// Demo: the sample photos. Real app: the Instagram-ready JPEG Queue made from each upload.
const previewOf = (n) => n.replace(/\.[^.]+$/, '') + '.photo.jpg';
const photoSrc = (n) => (isDemo() ? imgUrl(n) : `/media/${encodeURIComponent(previewOf(n))}`);
function stripTiles(list, labelFor, onAdd, busy = 0) {
  const strip = el('div', { class: 'strip' });
  list.forEach((n, i) => {
    const tile = el('div', { class: 'tile', draggable: 'true' }, el('img', { src: photoSrc(n), alt: '' }), el('span', { class: 'num' }, labelFor(i)), el('button', { class: 'x', type: 'button', 'aria-label': 'Remove', on: { click: () => { list.splice(i, 1); render(); } } }, '×'));
    tile.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/x-queue-tile', String(i)));
    tile.addEventListener('dragover', (e) => e.preventDefault());
    tile.addEventListener('drop', (e) => { e.preventDefault(); const raw = e.dataTransfer.getData('text/x-queue-tile'); if (raw === '') return; const from = Number(raw); if (Number.isNaN(from) || from === i) return; const [x] = list.splice(from, 1); list.splice(i, 0, x); render(); });
    strip.append(tile);
  });
  for (let k = 0; k < busy; k++) strip.append(el('div', { class: 'tile busy', 'aria-label': 'Uploading' }, '…'));
  strip.append(el('button', { class: 'tile add', type: 'button', 'aria-label': 'Add photos', on: { click: onAdd } }, '+'));
  return strip;
}
function photosComposer(c) {
  if (!C.photos.length && S.extras?.photos?.length) C.photos.push(...['worship.jpg', 'runner.jpg', 'mic.jpg', 'latte.jpg', 'pourover.jpg', 'trail.jpg'].filter((n) => S.extras.photos.includes(n)));
  if (!C.dests) C.dests = new Set(['instagram', 'tiktok', 'linkedin', 'facebook']);
  const on = PHOTO_DESTS.map(([p]) => p).filter((p) => C.dests.has(p) && canUse(p));
  const n = C.photos.length;
  topbar('New post', el('span', { class: 'mono small' }, `${n} photo${n === 1 ? '' : 's'} · carousel · 1600×2400 originals`), [brandPick(), fmtSeg(), cancelBtn(), postNowBtn(destNames(on), () => scheduleDemo('photos', C.photos, on), { disabled: !n || !on.length }), btn(`Schedule to ${on.length} platform${on.length === 1 ? '' : 's'}`, 'primary', () => scheduleDemo('photos', C.photos, on), { disabled: !n || !on.length })]);
  if (!['instagram', 'tiktok', 'linkedin', 'facebook'].includes(C.platform)) C.platform = 'instagram';
  const ptabs = el('div', { class: 'ptabs' }, ...['instagram', 'tiktok', 'linkedin', 'facebook'].map((p) => el('button', { class: C.platform === p ? 'on' : '', html: svgLogo(p), title: PNAME[p], 'aria-label': `Preview as ${PNAME[p]}`, 'aria-pressed': String(C.platform === p), on: { click: () => { C.platform = p; render(); } } })));
  const col1 = el('div', { class: 'stack', style: 'gap:10px' }, el('div', { class: 'label' }, 'Preview as'), ptabs, uiToggle(render), photoPhone(C.platform, C.photos), el('div', { class: 'preview-note' }, { instagram: "Instagram crops every photo to the first photo's shape. Queue sets 4:5 for the tallest look.", tiktok: 'TikTok shows photos full-screen at 9:16. Queue fits each one with a soft blurred fill.', linkedin: 'LinkedIn shows a grid in the feed, then the full photos when tapped.', facebook: 'Facebook keeps more pixels than Instagram — up to 2048 wide.' }[C.platform]));
  const crop = el('div', { class: 'seg small-seg' }, ...[['per', 'Per platform'], ['45', '4:5'], ['11', '1:1'], ['916', '9:16']].map(([k, l]) => el('button', { class: C.crop === k ? 'on' : '', on: { click: () => { C.crop = k; render(); } } }, l)));
  const photosCard = el('div', { class: 'card stack', style: 'gap:10px' }, el('div', { class: 'row' }, el('h2', { class: 'h3', style: 'flex:1' }, 'Photos'), el('span', { class: 'small faint' }, 'Crop'), crop), stripTiles(C.photos, (i) => (i === 0 ? 'Cover' : String(i + 1)), () => photoPicker(C.photos, 35)), el('div', { class: 'small faint' }, 'Drag to reorder · the first photo is the cover everywhere'));
  const dests = el('div', { class: 'card flush' }, el('div', { class: 'row', style: 'padding:14px 18px' }, el('h2', { class: 'h3', style: 'flex:1' }, 'Destinations'), el('span', { class: 'small faint' }, `${on.length} of ${PHOTO_DESTS.length} on`)));
  for (const [p, fmt, max] of PHOTO_DESTS) {
    const ok = canUse(p); const isOn = C.dests.has(p) && ok;
    const [dtxt, dcls] = p === 'x' ? ['Pay per post', 'off'] : deliveryOf(p);
    dests.append(el('div', { class: 'dest-row' + (ok ? '' : ' off') }, toggleBtn(isOn, ok ? () => { C.dests.has(p) ? C.dests.delete(p) : C.dests.add(p); render(); } : null, !ok), badge(p), el('div', { class: 'who' }, el('b', {}, PNAME[p]), el('div', { class: 'small faint' }, S.extras.platforms[p]?.handle || 'Not connected')), el('span', { class: 'chip' + (n > max ? ' warn' : '') }, fmt(n)), el('span', { class: `pill ${dcls === 'native' ? 'posted' : dcls === 'drafts' ? 'missed' : ''}` }, dtxt)));
  }
  dests.append(el('div', { class: 'dest-row off' }, el('span', { class: 'pill failed' }, 'Not possible'), badge('youtube'), el('div', { class: 'who' }, el('b', {}, 'YouTube'), el('div', { class: 'small faint' }, S.extras.platforms.youtube?.handle || '')), el('span', { class: 'chip' }, 'No photo posts'), el('span', { class: 'pill soon' }, 'No API for photos')));
  const capCard = el('div', { class: 'card stack', style: 'gap:10px' }, el('h2', { class: 'h3' }, 'Caption'), (() => { const t = el('textarea', { class: 'input', placeholder: 'Write a caption…', maxlength: 2200 }); t.value = C.caption; t.addEventListener('input', () => (C.caption = t.value)); return t; })());
  const sized = el('div', { class: 'card stack', style: 'gap:12px' }, el('h2', { class: 'h3' }, 'Sized once per platform'),
    el('div', { class: 'inset' }, el('div', { class: 'label' }, 'Your photos'), el('div', { class: 'mono small' }, `${n} × 1600×2400 · JPEG · sRGB`)),
    el('div', {}, ...[['instagram', '1080×1350 · JPEG · sRGB', '4:5, one high-quality resize', ''], ['linkedin', '1600×2400 · JPEG', 'Near-original — LinkedIn takes up to 36 MP', 'success'], ['tiktok', '1080×1920 · JPEG', 'Fitted to 9:16 with a blurred fill', ''], ['facebook', '1600×2000 · JPEG', 'Facebook keeps more pixels than Instagram', 'success']].filter(([p]) => on.includes(p)).map(([p, spec, what, col]) => el('div', { class: 'tv-row' }, badge(p), el('div', {}, el('div', { class: 'mono small' }, spec), el('div', { class: 'small', style: col ? `color:var(--${col})` : '' }, what))))),
    n > 10 && on.includes('instagram') ? el('div', { class: 'issue' }, `Instagram takes 10 photos per carousel. Only the first 10 go there; the others still go everywhere else.`) : el('div', { class: 'boxed small' }, 'Every photo is resized once, from your original, for each platform.'));
  c.append(el('div', { class: 'composer' }, col1, el('div', { class: 'stack' }, photosCard, dests, capCard), el('div', { class: 'stack' }, sized, dateTimeCard(`${tz} · Queue posts every platform at the same time`))));
}
function photoPhone(platform, images) {
  const ph = el('div', { class: 'phone' + (platform === 'linkedin' ? ' light' : '') });
  if (!images.length) { ph.append(el('div', { class: 'ph-empty' }, 'Add photos to preview')); return ph; }
  if (!previewUI) { ph.className = 'phone clean'; ph.append(el('div', { style: 'position:absolute;inset:0' }, carousel(images, 'fill', photoSrc))); return ph; }
  const me = previewName();
  const av = el('img', { class: 'av', src: previewAvatar() || photoSrc(images[0]), alt: '' });
  if (platform === 'instagram' || platform === 'facebook' || platform === 'linkedin') {
    const ratio = platform === 'instagram' ? '4 / 5' : platform === 'facebook' ? '4 / 5' : '2 / 3';
    ph.append(el('div', { class: 'ph-feed' }, el('div', { class: 'urow', style: `padding:10px 12px;color:${platform === 'linkedin' ? '#191919' : '#fff'}` }, av, me), el('div', { style: `aspect-ratio:${ratio};position:relative;overflow:hidden` }, carousel(images, 'fill', photoSrc)), el('div', { class: 'small', style: `padding:10px 12px;color:${platform === 'linkedin' ? '#191919' : '#fff'};font-size:12px` }, previewCaption(platform, C.caption))));
  } else {
    ph.append(el('div', { style: 'position:absolute;inset:0' }, el('img', { class: 'blurfill', src: photoSrc(images[0]), alt: '' }), carousel(images, 'contain', photoSrc)), el('div', { class: 'ui' }, el('div', { class: 'capblock', style: 'bottom:56px' }, el('b', {}, `@${me}`), el('div', {}, previewCaption('tiktok', C.caption)))));
  }
  return ph;
}

// ---------------------------------------------------------------- story (demo)
function storyComposer(c) {
  if (!C.frames.length && S.extras?.photos?.length) C.frames.push(...['drums.jpg', 'concert.jpg', 'youth.jpg'].filter((n) => S.extras.photos.includes(n)));
  if (!C.dests) C.dests = new Set(['instagram', 'facebook']);
  const on = ['instagram', 'facebook'].filter((p) => C.dests.has(p));
  const n = C.frames.length;
  topbar('New post', el('span', { class: 'mono small' }, `${n} frame${n === 1 ? '' : 's'} · ${n * 5}s total · 9:16`), [brandPick(), fmtSeg(), cancelBtn(), postNowBtn(destNames(on), () => scheduleDemo('story', C.frames, on), { disabled: !n || !on.length }), btn(`Schedule to ${on.length} platform${on.length === 1 ? '' : 's'}`, 'primary', () => scheduleDemo('story', C.frames, on), { disabled: !n || !on.length })]);
  if (!['instagram', 'facebook'].includes(C.platform)) C.platform = 'instagram';
  const ptabs = el('div', { class: 'ptabs' }, ...['instagram', 'facebook'].map((p) => el('button', { class: C.platform === p ? 'on' : '', html: svgLogo(p), title: PNAME[p], 'aria-label': `Preview as ${PNAME[p]}`, 'aria-pressed': String(C.platform === p), on: { click: () => { C.platform = p; render(); } } })));
  const col1 = el('div', { class: 'stack', style: 'gap:10px' }, el('div', { class: 'label' }, 'Preview as'), ptabs, previewToggles(render), storyPhone(C.frames), el('div', { class: 'preview-note' }, 'Tap the preview to step through frames. The top and bottom 14% sit under the story bar and reply box.'));
  const frames = el('div', { class: 'card stack', style: 'gap:10px' }, el('h2', { class: 'h3' }, 'Frames'), stripTiles(C.frames, () => '5s Photo', () => photoPicker(C.frames, 10)), el('div', { class: 'small faint' }, 'Each photo shows for 5 seconds. Frames post in order, one after another.'));
  const dests = el('div', { class: 'card flush' }, el('div', { class: 'row', style: 'padding:14px 18px' }, el('h2', { class: 'h3', style: 'flex:1' }, 'Destinations'), el('span', { class: 'small faint' }, '2 possible')));
  for (const [p, fmt] of [['instagram', 'Story'], ['facebook', 'Page story']]) dests.append(el('div', { class: 'dest-row' }, toggleBtn(C.dests.has(p), () => { C.dests.has(p) ? C.dests.delete(p) : C.dests.add(p); render(); }), badge(p), el('div', { class: 'who' }, el('b', {}, PNAME[p]), el('div', { class: 'small faint' }, S.extras.platforms[p]?.handle)), el('span', { class: 'chip' }, fmt), el('span', { class: 'pill' }, `Queue posts at ${usualLabel()}`)));
  for (const [p, why] of [['tiktok', 'No API — reminder instead'], ['youtube', 'YouTube has no stories'], ['linkedin', 'LinkedIn has no stories']]) dests.append(el('div', { class: 'dest-row off' }, el('span', { class: 'pill failed' }, 'Not possible'), badge(p), el('div', { class: 'who' }, el('b', {}, PNAME[p]), el('div', { class: 'small faint' }, S.extras.platforms[p]?.handle || '')), el('span', { class: 'chip' }, 'Story'), el('span', { class: 'pill soon' }, why)));
  const stickers = el('div', { class: 'card stack', style: 'gap:10px' }, el('h2', { class: 'h3' }, "Stickers can't be added by any app"), el('div', { class: 'small muted' }, "Links, polls, music and mentions aren't available through Instagram's or Facebook's API."),
    el('div', { class: 'inset row', style: 'align-items:flex-start' }, el('div', { style: 'flex:1' }, el('b', { style: 'font-weight:500' }, 'Remind me instead'), el('div', { class: 'small muted' }, `At ${usualLabel()} Queue notifies you with the file saved to Photos, ready to post by hand with stickers — and for TikTok.`)), toggleBtn(C.remind, () => { C.remind = !C.remind; render(); })));
  const check = el('div', { class: 'card stack', style: 'gap:10px' }, el('h2', { class: 'h3' }, 'Story check'),
    ...C.frames.map((f, i) => el('div', { class: 'tv-row', style: 'grid-template-columns:1fr auto' }, el('div', {}, el('b', { style: 'font-weight:500' }, `Frame ${i + 1}`), el('div', { class: 'small', style: 'color:var(--success)' }, 'Fitted to 9:16, one resize')), el('span', { class: 'mono small faint' }, '1600×2400 photo'))),
    el('div', { class: 'inset small muted stack', style: 'gap:6px' }, el('div', { class: 'label' }, 'Delivery'), el('div', {}, `• Neither platform can schedule stories natively — Queue posts them at ${usualLabel()}.`), el('div', {}, '• Instagram holds uploaded frames for 24 hours, so Queue uploads early and posts on time.')));
  c.append(el('div', { class: 'composer' }, col1, el('div', { class: 'stack' }, frames, dests, stickers), el('div', { class: 'stack' }, check, dateTimeCard())));
}
function storyPhone(frames) {
  const ph = el('div', { class: 'phone' });
  if (!frames.length) { ph.append(el('div', { class: 'ph-empty' }, 'Add frames to preview')); return ph; }
  let i = 0;
  const img = el('img', { class: 'story-img', src: photoSrc(frames[0]), alt: '' });
  const bars = el('div', { class: 'story-bars' }, ...frames.map((_, k) => el('i', { class: k === 0 ? 'on' : '' })));
  const me = previewName();
  if (!previewUI) ph.append(img); else ph.append(img, el('div', { class: 'shade-t' }), bars, el('div', { class: 'story-head' }, el('img', { class: 'av', src: previewAvatar() || photoSrc(frames[0]), alt: '' }), el('b', {}, me), el('span', { class: 'faint-w' }, 'Scheduled')));
  if (previewSafe) ph.append(safeOverlay('story'));
  ph.addEventListener('click', () => { i = (i + 1) % frames.length; img.src = photoSrc(frames[i]); [...bars.children].forEach((b, k) => b.classList.toggle('on', k <= i)); });
  return ph;
}
async function scheduleDemo(kind, images, platforms) {
  const now = takePostNow(); // "Post now" skips the date: it goes out as soon as it's ready
  const when = now ? new Date() : fromInputs(C.date, C.time);
  if (!now && (!when || when < Date.now())) return toast('Pick a post time in the future', true);
  try {
    const { post } = await api('/api/demo/post', json('POST', { kind, images, caption: C.caption, at: when.toISOString(), platforms, brand: postingAs()?.id, now }));
    resetComposer(); toast(doneToast(post, now)); await load(); location.hash = `#/post/${post.id}`;
  } catch (e) { toast(e.message, true); }
}

// ---------------------------------------------------------------- photos & story (real app)
// Instagram only. Photos are uploaded like videos (JPEG / PNG / HEIC); Queue makes the Instagram-ready
// JPEG at once for the check and the preview, and the final crop (carousel shape, or 9:16 for a
// story) when you schedule. They reach Instagram by temporary link, so local Queue needs cloudflared.
const PHOTO_ACCEPT = 'image/jpeg,image/png,image/heic,image/heif,.heic,.heif,.jpg,.jpeg,.png';
async function addPhotoFiles(list, fileList, max) {
  const files = [...(fileList || [])].filter((f) => /^image\//.test(f.type) || /\.(heic|heif|jpe?g|png)$/i.test(f.name));
  if (!files.length) return toast('Choose JPEG, PNG or HEIC photos', true);
  const room = Math.max(0, max - list.length - (C.uploading || 0));
  if (files.length > room) toast(room ? `Up to ${max}: adding the first ${room}` : `That's the maximum of ${max}`, true);
  const redraw = () => { if (currentRoute() === 'new') render(); };
  for (const f of files.slice(0, room)) {
    C.uploading = (C.uploading || 0) + 1; redraw();
    try {
      const up = await api(`/api/upload?name=${encodeURIComponent(f.name)}`, { method: 'POST', body: f });
      if (up.kind !== 'photo') throw new Error(`${f.name} isn't a photo`);
      list.push(up.name); (C.photoInfo ||= {})[up.name] = up;
    } catch (e) { toast(`${f.name}: ${e.message}`, true); }
    finally { C.uploading--; redraw(); }
  }
}
function libraryPhotoPicker(target, max) {
  modal(async (m, close) => {
    m.classList.add('wide');
    const chosen = new Set(target);
    const grid = el('div', { class: 'photo-pick' }, el('div', { class: 'small muted' }, 'Loading…'));
    m.append(el('div', { class: 'row' }, el('h2', { class: 'h2', style: 'flex:1' }, 'Photos in your Library'), el('span', { class: 'small faint' }, `Up to ${max}`)), grid,
      el('div', { class: 'foot' }, btn('Cancel', 'ghost', close), btn('Use photos', 'primary', () => { target.splice(0, target.length, ...chosen); close(); render(); })));
    try {
      const photos = (await api('/api/media')).items.filter((i) => i.type === 'photo' && !i.fixedCopy);
      const draw = () => grid.replaceChildren(...(photos.length ? photos.map((it) => el('button', { class: 'ph' + (chosen.has(it.name) ? ' on' : ''), type: 'button', 'aria-pressed': String(chosen.has(it.name)), title: shortName(it.name), on: { click: () => { chosen.has(it.name) ? chosen.delete(it.name) : chosen.size < max && chosen.add(it.name); draw(); } } }, el('img', { src: photoSrc(it.name), alt: shortName(it.name) }), chosen.has(it.name) ? el('span', { class: 'num' }, String([...chosen].indexOf(it.name) + 1)) : null)) : [el('div', { class: 'small muted' }, 'No photos in your Library yet. Upload some first.')]));
      draw();
    } catch (e) { grid.replaceChildren(el('div', { class: 'small muted' }, e.message)); }
  });
}
// The photo strip: tiles (drag to reorder, × to remove), + to add, and files dropped anywhere on the card.
function photoDropCard(title, list, max, labelFor, hint) {
  const input = el('input', { type: 'file', accept: PHOTO_ACCEPT, multiple: true, class: 'hidden', on: { change: (e) => { addPhotoFiles(list, e.target.files, max); e.target.value = ''; } } });
  const card = el('div', { class: 'card stack photo-drop', style: 'gap:10px' },
    el('div', { class: 'row' }, el('h2', { class: 'h3', style: 'flex:1' }, title), el('span', { class: 'small faint' }, `${list.length}/${max}`), btn('From Library', 'ghost small', () => libraryPhotoPicker(list, max))),
    stripTiles(list, labelFor, () => input.click(), C.uploading || 0),
    el('div', { class: 'small faint' }, hint), input);
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  card.addEventListener('dragover', (e) => { if (hasFiles(e)) { e.preventDefault(); card.classList.add('over'); } });
  card.addEventListener('dragleave', () => card.classList.remove('over'));
  card.addEventListener('drop', (e) => { card.classList.remove('over'); if (e.dataTransfer?.files?.length) { e.preventDefault(); addPhotoFiles(list, e.dataTransfer.files, max); } });
  return card;
}
// Instagram is the one real destination; the rest are honest "Coming soon" rows.
function realDests(chip) {
  const dests = el('div', { class: 'card flush' }, el('div', { class: 'row', style: 'padding:14px 18px' }, el('h2', { class: 'h3', style: 'flex:1' }, 'Destinations'), el('span', { class: 'small faint' }, '1 available')));
  dests.append(el('div', { class: 'dest-row' + (canUse('instagram') ? '' : ' off') }, toggleBtn(true, null, true), badge('instagram'), el('div', { class: 'who' }, el('b', {}, 'Instagram'), el('div', { class: 'small faint' }, handle0())), chip, el('span', { class: 'pill' }, `Queue posts at ${usualLabel()}`)));
  for (const p of ['facebook', 'tiktok', 'linkedin']) dests.append(el('div', { class: 'dest-row off' }, toggleBtn(false, null, true), badge(p), el('div', { class: 'who' }, el('b', {}, PNAME[p]), el('div', { class: 'small faint' }, PLATFORMS.find((x) => x.id === p)?.delivery || '')), el('span', { class: 'pill soon' }, 'Coming soon')));
  return dests;
}
// What stands between these photos and Instagram, if anything.
function linkNotes() {
  const st = S.status || {};
  if (st.dryRun) return [el('div', { class: 'boxed small' }, 'Dry run: nothing is sent to Instagram until you connect an account.')];
  if (!st.cloudflared) return [el('div', { class: 'issue error' }, 'Photos reach Instagram by temporary link. Run: brew install cloudflared')];
  return [];
}
function photoChecks(list, extra) {
  return list.map((n, i) => {
    const up = C.photoInfo?.[n]; const issues = (up?.check?.issues || []).filter((x) => !/^Cropped to/.test(x.msg) || i === 0 || C.format === 'story');
    const msg = extra(i) || (issues.length ? issues.map((x) => x.msg).join(' · ') : 'Already right for Instagram');
    return el('div', { class: 'tv-row', style: 'grid-template-columns:auto 1fr' }, el('img', { src: photoSrc(n), alt: '', style: 'width:36px;height:45px;object-fit:cover;border-radius:6px' }),
      el('div', {}, el('b', { style: 'font-weight:500' }, C.format === 'story' ? `Frame ${i + 1}` : i === 0 ? 'Cover' : `Photo ${i + 1}`), el('div', { class: 'small muted' }, msg)));
  });
}
const shapeText = (a) => (Math.abs(a - 0.8) < 0.01 ? '4:5' : Math.abs(a - 1) < 0.01 ? '1:1' : `${a.toFixed(2)}:1`);
function realPhotosComposer(c) {
  const n = C.photos.length; const busy = C.uploading || 0;
  const label = n > 1 ? 'Schedule carousel' : 'Schedule photo';
  topbar('New post', el('span', { class: 'mono small' }, n ? `${n} photo${n === 1 ? '' : 's'} · ${n > 1 ? 'carousel' : 'single photo'}` : 'Photos · up to 10'), [brandPick(), fmtSeg(), cancelBtn(), postNowBtn('Instagram', () => scheduleReal('photos', C.photos), { disabled: !n || n > 10 || busy > 0 }), btn(busy ? 'Uploading…' : label, 'primary', () => scheduleReal('photos', C.photos), { disabled: !n || n > 10 || busy > 0 })]);
  C.platform = 'instagram';
  const col1 = el('div', { class: 'stack', style: 'gap:10px' }, el('div', { class: 'label' }, 'Preview'), uiToggle(render), photoPhone('instagram', C.photos), el('div', { class: 'preview-note' }, "Instagram shows every photo at the first photo's shape. Queue cuts each one to it, once, from your original."));
  const photos = photoDropCard('Photos', C.photos, 10, (i) => (i === 0 ? 'Cover' : String(i + 1)), 'Drop JPEG, PNG or HEIC here · drag to reorder · the first photo is the cover');
  const capCard = el('div', { class: 'card stack', style: 'gap:10px' }, el('h2', { class: 'h3' }, 'Caption'), (() => { const t = el('textarea', { class: 'input', placeholder: 'Write a caption…', maxlength: 2200 }); t.value = C.caption; t.addEventListener('input', () => { C.caption = t.value; const capEl = document.querySelector('.phone .small'); if (capEl) capEl.textContent = previewCaption('instagram', C.caption); }); return t; })());
  const shape = C.photoInfo?.[C.photos[0]]?.check?.aspect;
  const check = el('div', { class: 'card stack', style: 'gap:10px' }, el('h2', { class: 'h3' }, 'Photo check'),
    ...(n ? photoChecks(C.photos, (i) => (i > 0 && shape ? `Cut to the cover's shape (${shapeText(shape)}) when you schedule` : null)) : [el('div', { class: 'small muted' }, 'Add photos to check them.')]),
    el('div', { class: 'boxed small' }, 'JPEG · sRGB · up to 1080 wide. Each photo is resized once, from your original.'), ...linkNotes());
  c.append(el('div', { class: 'composer' }, col1, el('div', { class: 'stack' }, photos, realDests(el('span', { class: 'chip' + (n > 10 ? ' warn' : '') }, n > 1 ? `Carousel ${n}/10` : 'Photo')), capCard), el('div', { class: 'stack' }, check, dateTimeCard(`${tz} · Queue hands the photos to Instagram ${mins(S.config?.stageWindowMin ?? 120)} early so they're processed on time.`))));
}
function realStoryComposer(c) {
  const n = C.frames.length; const busy = C.uploading || 0;
  topbar('New post', el('span', { class: 'mono small' }, n ? `${n} frame${n === 1 ? '' : 's'} · ${n * 5}s total · 9:16` : 'Story · up to 10 frames'), [brandPick(), fmtSeg(), cancelBtn(), postNowBtn('Instagram', () => scheduleReal('story', C.frames), { disabled: !n || n > 10 || busy > 0 }), btn(busy ? 'Uploading…' : 'Schedule story', 'primary', () => scheduleReal('story', C.frames), { disabled: !n || n > 10 || busy > 0 })]);
  const col1 = el('div', { class: 'stack', style: 'gap:10px' }, el('div', { class: 'label' }, 'Preview'), previewToggles(render), storyPhone(C.frames), el('div', { class: 'preview-note' }, 'Tap the preview to step through frames. The top and bottom 14% sit under the story bar and reply box.'));
  const frames = photoDropCard('Frames', C.frames, 10, () => '5s Photo', 'Drop JPEG, PNG or HEIC here · each photo shows for 5 seconds · frames post in order');
  const stickers = el('div', { class: 'card stack', style: 'gap:10px' }, el('h2', { class: 'h3' }, "Stickers can't be added by any app"), el('div', { class: 'small muted' }, "Links, polls, music and mentions aren't available through Instagram's API. Stories take no caption."));
  const check = el('div', { class: 'card stack', style: 'gap:10px' }, el('h2', { class: 'h3' }, 'Story check'),
    ...(n ? photoChecks(C.frames, () => 'Cut to 9:16 (1080×1920) when you schedule') : [el('div', { class: 'small muted' }, 'Add frames to check them.')]),
    el('div', { class: 'inset small muted stack', style: 'gap:6px' }, el('div', { class: 'label' }, 'Delivery'), el('div', {}, `• Instagram can't schedule stories itself — Queue posts the frames at ${usualLabel()}, one after another.`), el('div', {}, '• Frames are handed over early and kept for up to 24 hours, so they go out on time.')), ...linkNotes());
  c.append(el('div', { class: 'composer' }, col1, el('div', { class: 'stack' }, frames, realDests(el('span', { class: 'chip' }, 'Story')), stickers), el('div', { class: 'stack' }, check, dateTimeCard())));
}
async function scheduleReal(kind, images) {
  if (C.busy) return;
  const now = takePostNow(); // "Post now" skips the date: it goes out as soon as it's ready
  const when = now ? new Date() : fromInputs(C.date, C.time);
  if (!now && (!when || when < Date.now())) return toast('Pick a post time in the future', true);
  if (kind === 'photos' && C.caption.length > 2200) return toast('Caption is over 2,200 characters', true);
  C.busy = true;
  toast(kind === 'story' ? 'Preparing your frames…' : 'Preparing your photos…');
  try {
    const { post } = await api('/api/schedule', json('POST', { kind, images, caption: kind === 'story' ? '' : C.caption, at: when.toISOString(), now }));
    resetComposer(); toast(doneToast(post, now)); await load(); location.hash = `#/post/${post.id}`;
  } catch (e) { toast(e.message, true); }
  finally { C.busy = false; }
}

// ================================================================ BENCHMARK
// The same clips, posted through every route, scored the same way. Turns into a claim you can publish.
const ROUTE_SUGGESTIONS = ['Queue', 'Instagram app', 'Buffer', 'Later', 'Metricool', 'Hootsuite', 'Planoly', 'Sprout Social'];
const labTabs = (on) => el('div', { class: 'tabs' }, ...[['quality', 'Compare'], ['benchmark', 'Benchmark']].map(([k, l]) => el('button', { class: on === k ? 'on' : '', on: { click: () => (location.hash = `#/${k}`) } }, l)));
let benchSel = null;

// Averages per route, over only the clips that EVERY route has measured — so no route
// looks better just because it skipped a hard clip.
function benchStats(entries) {
  // Group route names case-insensitively, keeping the first spelling seen.
  const canon = new Map(); entries = entries.map((e) => { const k = e.label.toLowerCase(); if (!canon.has(k)) canon.set(k, e.label); return { ...e, label: canon.get(k) }; });
  const clips = [...new Set(entries.map((e) => e.original))];
  const routes = [...new Set(entries.map((e) => e.label))];
  const cell = (r, c) => entries.filter((e) => e.label === r && e.original === c).sort((a, b) => b.at.localeCompare(a.at))[0] || null;
  const complete = clips.filter((c) => routes.every((r) => cell(r, c)));
  const avg = (r) => (complete.length ? complete.reduce((a, c) => a + cell(r, c).result.vmaf, 0) / complete.length : null);
  const ranked = routes.map((r) => ({ route: r, avg: avg(r) })).sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));
  return { clips, routes, cell, complete, ranked };
}
function benchClaim(st) {
  const q = st.ranked.find((x) => /^queue$/i.test(x.route));
  const others = st.ranked.filter((x) => x !== q);
  const otherSchedulers = others.filter((x) => !/instagram app/i.test(x.route)).length;
  const gaps = [];
  if (!q) gaps.push('a "Queue" route');
  if (st.complete.length < 3) gaps.push(`${3 - st.complete.length} more clip${3 - st.complete.length === 1 ? '' : 's'} measured on every route`);
  if (otherSchedulers < 3) gaps.push(`${3 - otherSchedulers} more scheduler${3 - otherSchedulers === 1 ? '' : 's'}`);
  if (!q || !others.length || !st.complete.length) return { text: null, gaps };
  const best = others[0];
  const d = q.avg - best.avg;
  // Under 1 VMAF point is within measurement noise and invisible to viewers: call it a tie.
  const n = `${st.complete.length} clip${st.complete.length === 1 ? '' : 's'}`;
  const beat = others.filter((x) => q.avg - x.avg >= 1);
  const text = d >= 1
    ? `Across ${n} and ${others.length} other route${others.length === 1 ? '' : 's'}, Queue averaged VMAF ${q.avg.toFixed(1)} — ${d.toFixed(1)} points above the next-best route (${best.route}, ${best.avg.toFixed(1)}).`
    : d > -1
      ? `Across ${n}, Queue matched the best other route (${best.route}): VMAF ${q.avg.toFixed(1)} vs ${best.avg.toFixed(1)}, within a point.${beat.length ? ` It beat ${beat.map((x) => `${x.route} (+${(q.avg - x.avg).toFixed(1)})`).join(', ')}.` : ''}`
      : `Across ${n}, ${best.route} scored higher than Queue (VMAF ${best.avg.toFixed(1)} vs ${q.avg.toFixed(1)}).`;
  return { text, gaps, win: d >= 1 };
}
function benchMethod(b, st, entries) {
  const metaOf = (c) => entries.find((e) => e.original === c)?.result.original;
  return [
    `Method — ${b.name}`,
    `Each clip was posted through every route to the same Instagram account. Queue then downloaded the version Instagram serves and compared it with the original file using VMAF (Netflix's 0–100 perceptual score), plus SSIM and PSNR. Both versions are scaled to the same 1080-wide frame first, so the score reflects compression damage, not size.`,
    '', 'Clips:', ...st.clips.map((c) => { const m = metaOf(c); return `• ${shortName(c)} — ${m ? `${m.resolution}, ${m.mbps} Mbps, ${m.mb} MB` : ''}`; }),
    '', 'Routes:', ...st.routes.map((r) => `• ${r}`),
    '', `Averages use only clips measured on every route (${st.complete.length} of ${st.clips.length}).`,
    entries.length ? `Measured ${new Date(Math.min(...entries.map((e) => +new Date(e.at)))).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} – ${new Date(Math.max(...entries.map((e) => +new Date(e.at)))).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}.` : 'No results yet.',
    b.note ? `\nNote: ${b.note}` : '',
  ].join('\n');
}
const copyText = async (t, what) => { try { await navigator.clipboard.writeText(t); toast(`${what} copied`); } catch { toast("Couldn't copy", true); } };

VIEWS.benchmark = async (c) => {
  const { benchmarks } = await api('/api/benchmarks');
  const b = benchmarks.find((x) => x.id === benchSel) || benchmarks[benchmarks.length - 1];
  if (b) benchSel = b.id;
  const pick = benchmarks.length > 1 ? el('select', { class: 'input select-sm', on: { change: (e) => { benchSel = e.target.value; render(); } } }, ...benchmarks.map((x) => el('option', { value: x.id, selected: x.id === b.id }, x.name))) : null;
  topbar('Benchmark', 'The same clips through every route, measured the same way', [pick, btn('New benchmark', b ? 'secondary' : 'primary', newBenchmark), b ? btn('Add result', 'primary', () => addBenchResult(b)) : null].filter(Boolean));
  c.append(labTabs('benchmark'));
  if (!b) {
    c.append(el('div', { class: 'card stack', style: 'gap:14px;max-width:760px' }, el('h2', { class: 'h3' }, 'How a benchmark works'),
      el('ol', { class: 'steps-list' }, ...[
        'Pick 3–5 clips that stress quality differently: iPhone 4K HDR, clean 1080p, fast motion, a dark scene, on-screen text.',
        'Post every clip through every route to a test Instagram account: Queue, the Instagram app, and 3–5 other schedulers.',
        'Here, add each post as a result. Queue downloads what Instagram serves and scores it against your original.',
        'Queue writes the claim and the method for you, using only clips every route was measured on.',
      ].map((t) => el('li', {}, t))),
      el('div', {}, btn('Start a benchmark', 'primary', newBenchmark))));
    return;
  }
  const entries = S.quality.filter((q) => q.benchmarkId === b.id);
  const st = benchStats(entries);
  const claim = benchClaim(st);

  // ---- claim
  const ready = claim.text && !claim.gaps.length;
  const claimCard = el('div', { class: 'card stack claim' + (ready && claim.win ? ' ready' : ''), style: 'gap:10px' },
    el('div', { class: 'row' }, el('h2', { class: 'h3', style: 'flex:1' }, 'The claim'), el('span', { class: `pill ${ready && claim.win ? 'posted' : 'missed'}` }, !ready ? 'Not enough data yet' : claim.win ? '✓ Ready to publish' : 'No lead to claim')),
    el('div', { class: 'claim-text' }, claim.text || 'Add results to see what you can claim.'),
    claim.gaps.length ? el('div', { class: 'small muted' }, `Before you publish it, add ${claim.gaps.join(', ')}.`) : el('div', { class: 'small muted' }, claim.win ? 'Publish it with the method below, so anyone can check it.' : "Don't claim \"higher quality than other schedulers\" from this. Claim only what Queue beat, or what only Queue does (HDR, fixing files that break the rules)."),
    b.note ? el('div', { class: 'small', style: 'color:var(--warning)' }, b.note) : null,
    el('div', { class: 'row' }, btn('Copy claim', 'secondary small', () => copyText(claim.text, 'Claim'), { disabled: !claim.text }), btn('Copy method', 'ghost small', () => copyText(benchMethod(b, st, entries), 'Method'), { disabled: !entries.length })));

  // ---- chart: average VMAF per route (zero baseline, one series, Queue emphasised)
  const chart = el('div', { class: 'card stack', style: 'gap:12px' }, el('div', { class: 'row' }, el('h2', { class: 'h3', style: 'flex:1' }, 'Average quality by route'), el('span', { class: 'small faint' }, st.complete.length ? `VMAF · ${st.complete.length} clip${st.complete.length === 1 ? '' : 's'} measured on every route` : 'VMAF')));
  if (!st.complete.length) chart.append(el('div', { class: 'small muted' }, entries.length ? 'No clip has been measured on every route yet. Fill the gaps in the table below.' : 'No results yet.'));
  else {
    const rows = el('div', { class: 'hbars', role: 'list' });
    for (const r of st.ranked) {
      const isQ = /^queue$/i.test(r.route);
      rows.append(el('div', { class: 'hbar-row', role: 'listitem', title: `${r.route}: VMAF ${r.avg.toFixed(1)} average` },
        el('span', { class: 'hbar-label' + (isQ ? ' strong' : '') }, r.route),
        el('div', { class: 'hbar-track' }, el('div', { class: 'hbar' + (isQ ? ' us' : ''), style: `width:${r.avg}%` })),
        el('span', { class: 'hbar-val mono' }, r.avg.toFixed(1))));
    }
    chart.append(rows, el('div', { class: 'hbar-row axis' }, el('span'), el('div', { class: 'hbar-ticks small faint' }, ...[[0, '0'], [70, '70 noticeable'], [85, '85 good'], [100, '100']].map(([n, l]) => el('span', { style: `left:${n}%` }, l))), el('span')));
  }

  // ---- table: routes × clips
  const table = el('table', { class: 'table bench' });
  const head = el('tr', {}, el('th', {}, 'Route'), ...st.clips.map((cl) => { const m = entries.find((e) => e.original === cl)?.result.original; return el('th', { title: shortName(cl) }, el('div', { class: 'bench-clip' }, el('video', { muted: true, playsInline: true, preload: 'metadata', src: `/media/${encodeURIComponent(cl)}#t=0.8` }), el('span', {}, shortName(cl)), m ? el('span', { class: 'faint' }, m.resolution) : null)); }), el('th', {}, 'Average'));
  const tbody = el('tbody');
  for (const r of st.ranked) {
    const best = (cl) => Math.max(...st.routes.map((x) => st.cell(x, cl)?.result.vmaf ?? -1));
    tbody.append(el('tr', { class: /^queue$/i.test(r.route) ? 'us' : '' }, el('td', { class: 'strong' }, r.route),
      ...st.clips.map((cl) => {
        const e = st.cell(r.route, cl);
        if (!e) return el('td', {}, el('button', { class: 'cell-add', type: 'button', title: `Add ${r.route} for ${shortName(cl)}`, on: { click: () => addBenchResult(b, { clip: cl, route: r.route }) } }, '+ Add'));
        const del = el('button', { class: 'cell-x', type: 'button', 'aria-label': 'Remove result', on: { click: (ev) => { ev.stopPropagation(); removeBenchEntry(b, e); } } }, '×');
        return el('td', { class: 'cell clickable' + (e.result.vmaf === best(cl) ? ' best' : ''), title: `${e.result.verdict} · open side by side`, on: { click: () => (location.hash = `#/quality/${e.id}`) } }, el('span', { class: 'mono' }, String(e.result.vmaf)), del);
      }),
      el('td', { class: 'mono' + (r.avg != null && r.avg === st.ranked[0].avg ? ' strong' : '') }, r.avg != null ? r.avg.toFixed(1) : '—')));
  }
  table.append(el('thead', {}, head), tbody);
  const tableCard = el('div', { class: 'card flush' }, el('div', { class: 'row', style: 'padding:16px 18px' }, el('h2', { class: 'h3', style: 'flex:1' }, 'Every result'), el('span', { class: 'small faint' }, 'Bold = best on that clip · click a score to see it side by side')), entries.length ? el('div', { style: 'overflow-x:auto' }, table) : el('div', { class: 'empty' }, el('div', { class: 'h3' }, 'No results yet'), el('div', {}, 'Post a clip through a route, then add it here.'), el('div', { style: 'margin-top:14px' }, btn('Add result', 'primary', () => addBenchResult(b)))));

  const method = el('div', { class: 'card stack', style: 'gap:8px' }, el('h2', { class: 'h3' }, 'Method'), el('pre', { class: 'method' }, benchMethod(b, st, entries)),
    el('div', { class: 'small faint' }, 'HDR originals: VMAF compares pixel values, so a correctly tone-mapped SDR version can score lower than one that just looks washed out. For HDR clips, judge with your eyes in the side-by-side view as well as the number.'),
    el('div', {}, btn('Delete benchmark', 'ghost small danger', () => deleteBenchmark(b))));
  c.append(el('div', { class: 'bench-grid' }, el('div', { class: 'stack', style: 'gap:16px;min-width:0' }, claimCard, chart, tableCard), el('div', { class: 'stack', style: 'gap:16px' }, method)));
};
function newBenchmark() {
  modal((m, close) => {
    const name = el('input', { class: 'input', placeholder: 'e.g. Launch benchmark', maxlength: 60 });
    const err = el('div', { class: 'small', style: 'color:var(--danger)' });
    const go = async () => { try { const { benchmark } = await api('/api/benchmarks', json('POST', { name: name.value })); benchSel = benchmark.id; close(); render(); } catch (e) { err.textContent = e.message; } };
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    m.append(el('h2', { class: 'h2' }, 'New benchmark'), el('label', { class: 'field' }, el('span', {}, 'Name'), name), err, el('div', { class: 'foot' }, btn('Cancel', 'ghost', close), btn('Create', 'primary', go)));
    name.focus();
  });
}
function deleteBenchmark(b) {
  modal((m, close) => {
    m.append(el('h2', { class: 'h2' }, `Delete "${b.name}"?`), el('div', { class: 'muted' }, 'Its results and the downloaded copies are removed. Your originals and posts are not touched.'),
      el('div', { class: 'foot' }, btn('Cancel', 'ghost', close), btn('Delete', 'primary', async () => { try { await api(`/api/benchmarks/${b.id}`, { method: 'DELETE' }); benchSel = null; close(); await load(); render(); } catch (e) { toast(e.message, true); } })));
  });
}
async function removeBenchEntry(b, e) {
  try { await api(`/api/benchmarks/${b.id}/entries/${e.id}`, { method: 'DELETE' }); toast('Result removed'); await load(); render(); } catch (err) { toast(err.message, true); }
}
function addBenchResult(b, preset = {}) {
  modal(async (m, close) => {
    m.classList.add('wide');
    const known = [...new Set(S.quality.filter((q) => q.benchmarkId === b.id).map((q) => q.label))];
    const list = el('datalist', { id: 'routeList' }, ...[...new Set([...known, ...ROUTE_SUGGESTIONS])].map((r) => el('option', { value: r })));
    const route = el('input', { class: 'input', list: 'routeList', placeholder: 'e.g. Instagram app, Buffer, Queue', value: preset.route || '', maxlength: 40 });
    const clipSel = el('select', { class: 'input' }, el('option', { value: '' }, 'Loading your Library…'));
    let source = 'instagram'; let mediaId = null; let file = null;
    const srcSeg = el('div', { class: 'seg' });
    const srcBody = el('div');
    const err = el('div', { class: 'small', style: 'color:var(--danger)' });
    const go = btn('Measure', 'primary', submit);
    m.append(el('div', { class: 'row' }, el('h2', { class: 'h2', style: 'flex:1' }, 'Add a result'), el('span', { class: 'small faint' }, b.name)),
      el('div', { class: 'row', style: 'gap:12px;align-items:flex-start' }, el('label', { class: 'field', style: 'flex:1' }, el('span', {}, 'Original clip'), clipSel), el('label', { class: 'field', style: 'flex:1' }, el('span', {}, 'Route it was posted through'), route, list)),
      el('div', { class: 'field' }, el('span', {}, 'What Instagram served'), srcSeg), srcBody, err, el('div', { class: 'foot' }, el('span', { class: 'small faint', style: 'flex:1' }, 'Measuring takes about a minute.'), btn('Cancel', 'ghost', close), go));
    const drawSrc = () => { srcSeg.replaceChildren(...[['instagram', 'Pick from Instagram'], ['file', 'Upload the file']].map(([k, l]) => el('button', { class: source === k ? 'on' : '', on: { click: () => { source = k; drawSrc(); } } }, l))); fillSrc(); };
    async function fillSrc() {
      if (source === 'file') {
        const input = el('input', { type: 'file', accept: 'video/*', class: 'input', on: { change: (e) => { file = e.target.files[0] || null; } } });
        srcBody.replaceChildren(el('div', { class: 'stack', style: 'gap:6px' }, input, el('div', { class: 'small faint' }, 'Use this when Instagram won\'t hand the file over (Reels with licensed music). Save the posted video to your Mac, then upload it here.')));
        return;
      }
      srcBody.replaceChildren(el('div', { class: 'small muted' }, 'Loading your recent posts…'));
      try {
        const r = await api('/api/instagram/recent');
        if (!r.media.length) { srcBody.replaceChildren(el('div', { class: 'inset small muted' }, r.reason === 'demo' ? 'The demo has no Instagram account to pull from. Use "Upload the file" to try it.' : r.reason === 'dryrun' ? 'Connect Instagram first (Meta Setup Guide), or upload the file.' : 'No videos on the account yet.')); return; }
        const grid = el('div', { class: 'ig-pick' }, ...r.media.map((x) => el('button', { class: 'ig-item' + (mediaId === x.id ? ' on' : ''), type: 'button', on: { click: (e) => { mediaId = x.id; grid.querySelectorAll('.ig-item').forEach((n) => n.classList.remove('on')); e.currentTarget.classList.add('on'); } } }, x.thumbnail_url ? el('img', { src: x.thumbnail_url, alt: '', referrerpolicy: 'no-referrer' }) : el('div', { class: 'ig-ph' }), el('span', { class: 'small' }, (x.caption || '(no caption)').slice(0, 40)), el('span', { class: 'small faint' }, new Date(x.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })))));
        srcBody.replaceChildren(grid);
      } catch (e) { srcBody.replaceChildren(el('div', { class: 'small', style: 'color:var(--danger)' }, e.message)); }
    }
    async function submit() {
      err.textContent = '';
      if (!clipSel.value) return (err.textContent = 'Pick the original clip.');
      if (!route.value.trim()) return (err.textContent = 'Name the route.');
      if (source === 'instagram' && !mediaId) return (err.textContent = 'Pick the post on Instagram.');
      if (source === 'file' && !file) return (err.textContent = 'Choose the downloaded file.');
      go.disabled = true; go.textContent = 'Measuring…';
      try {
        if (source === 'instagram') await api(`/api/benchmarks/${b.id}/entries`, json('POST', { clip: clipSel.value, route: route.value, mediaId }));
        else await api(`/api/benchmarks/${b.id}/entries?clip=${encodeURIComponent(clipSel.value)}&route=${encodeURIComponent(route.value)}`, { method: 'POST', body: file });
        close(); toast('Result added'); await load(); render();
      } catch (e) { err.textContent = e.message; go.disabled = false; go.textContent = 'Measure'; }
    }
    drawSrc();
    try {
      const { items } = await api('/api/media');
      const originals = items.filter((i) => !i.fixedCopy && i.type !== 'photo');
      clipSel.replaceChildren(el('option', { value: '' }, originals.length ? 'Choose a clip…' : 'Your Library is empty'), ...originals.map((i) => el('option', { value: i.name, selected: i.name === preset.clip }, `${shortName(i.name)}${i.meta ? ` · ${resLabel(i.meta)}` : ''}`)));
    } catch (e) { err.textContent = e.message; }
  });
}
