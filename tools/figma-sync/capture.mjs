// Capture a live Queue screen as a flat list of visual nodes for rebuilding in Figma.
// usage: node capture.mjs <base-url> <out.json> <width> <height> <theme> <setupJS> [mobile]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const [,, base, out, W, H, theme, setup = '', mobile = ''] = process.argv;
const port = +(process.env.PORT || 9455);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, '--user-data-dir=/tmp/qfig/profile' + (process.env.PORT || ''), `--window-size=${W},${H}`, '--hide-scrollbars', '--font-render-hinting=none', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws; for (let i = 0; i < 60; i++) { try { const pg = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'); if (pg) { ws = new WebSocket(pg.webSocketDebuggerUrl); break; } } catch {} await sleep(250); }
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pend = new Map(); const errs = [];
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); pend.get(m.id)?.(m.result ?? m.error); });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r?.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval failed'); return r?.result?.value; };
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: 1, mobile: !!mobile });
if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true });
await send('Page.navigate', { url: base + '/#/dashboard' }); await sleep(1800);
await ev(`localStorage.setItem('queue-welcome-v1','1'); localStorage.setItem('queue-theme','${theme}'); localStorage.removeItem('queue-brand'); sessionStorage.setItem('queue-phone-ok','1'); localStorage.setItem('queue-preview-ui','on'); localStorage.removeItem('queue-preview-safe');`);
await send('Page.reload'); await sleep(2600);
if (setup) { await ev(`(async () => { ${setup} })()`); await sleep(2600); }
// settle: freeze videos at 0.8s, blur focus, stop animations, scroll to top
await ev(`(async () => {
  document.activeElement?.blur?.();
  const st = document.createElement('style'); st.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important} .demo-tag,.demo-note,.demo-only,.welcome-card .hl-label{display:none!important}'; document.head.append(st);
  for (const v of document.querySelectorAll('video')) { try { v.pause(); v.currentTime = 0.8; } catch {} }
  for (const s of document.querySelectorAll('#content, .content')) s.scrollTop = 0;
  await new Promise(r => setTimeout(r, 900));
})()`);

const data = await ev(`(() => {
  const nodes = []; const images = {}; const svgs = {};
  const px = (v) => parseFloat(v) || 0;
  const parseColor = (s) => {
    if (!s || s === 'transparent') return null;
    let m = s.match(/^rgba?\\(([^)]+)\\)/);
    if (m) { const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); const a = p.length > 3 ? p[3] : 1; if (a === 0) return null; return [p[0] / 255, p[1] / 255, p[2] / 255, a]; }
    m = s.match(/^color\\(srgb ([^)]+)\\)/);
    if (m) { const p = m[1].split(/[ /]+/).filter(Boolean).map(Number); const a = p.length > 3 ? p[3] : 1; if (a === 0) return null; return [p[0], p[1], p[2], a]; }
    return null;
  };
  const r4 = (n) => Math.round(n * 100) / 100;
  const radius = (cs, w, h) => ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'].map((k) => { const v = cs[k]; if (v.endsWith('%')) return Math.min(w, h) * parseFloat(v) / 100; return Math.min(px(v), Math.min(w, h) / 2); });
  const shadows = (s) => {
    if (!s || s === 'none') return null;
    const parts = s.split(/,(?![^(]*\\))/); const outp = [];
    for (const raw of parts) {
      const inset = /inset/.test(raw); const cm = raw.match(/(rgba?\\([^)]*\\)|color\\([^)]*\\))/); const col = cm ? parseColor(cm[1]) : null; if (!col) continue;
      const nums = raw.replace(cm[1], '').replace('inset', '').trim().split(/\\s+/).map(px);
      outp.push({ inset, c: col, x: nums[0] || 0, y: nums[1] || 0, b: nums[2] || 0, s: nums[3] || 0 });
    }
    return outp.length ? outp : null;
  };
  const gradient = (s) => {
    const m = s.match(/linear-gradient\\((.*)\\)$/); if (!m) return null;
    const parts = m[1].split(/,(?![^(]*\\))/).map((x) => x.trim());
    let angle = 180; if (/^(to |\\d|-)/.test(parts[0])) { const d = parts.shift(); if (/deg/.test(d)) angle = parseFloat(d); else angle = { 'to top': 0, 'to right': 90, 'to bottom': 180, 'to left': 270 }[d] ?? 180; }
    const stops = parts.map((p, i, a) => { const cm = p.match(/(rgba?\\([^)]*\\)|color\\([^)]*\\))/); const c = cm ? parseColor(cm[1]) || [0, 0, 0, 0] : [0, 0, 0, 0]; const pm = p.replace(cm ? cm[1] : '', '').match(/([\\d.]+)%/); return { c, p: pm ? parseFloat(pm[1]) / 100 : i / Math.max(1, a.length - 1) }; });
    return { angle, stops };
  };
  const visible = (el, cs) => cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0;
  const weight = (w) => ({ 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' }[Math.round(parseInt(w) / 100) * 100] || 'Regular');
  const family = (f) => /mono/i.test(f) ? 'Geist Mono' : 'Geist';
  const linkOf = (el) => {
    const a = el.closest('a[href^="#/"]'); if (a === el) return a.getAttribute('href').slice(2);
    if (el.dataset.qlink) return el.dataset.qlink;
    return null;
  };
  const textStyle = (cs) => ({ ff: family(cs.fontFamily), fw: weight(cs.fontWeight), fs: px(cs.fontSize), lh: cs.lineHeight === 'normal' ? null : px(cs.lineHeight), ls: cs.letterSpacing === 'normal' ? 0 : px(cs.letterSpacing), c: parseColor(cs.color) || [0, 0, 0, 1], up: cs.textTransform === 'uppercase' ? 1 : 0, it: cs.fontStyle === 'italic' ? 1 : 0, ul: /underline/.test(cs.textDecorationLine) ? 1 : 0, al: cs.textAlign });
  function addText(text, rects, cs, parentIdx, parentRect, el, node) {
    // Inline text that wraps and starts mid-line: split it into one text node per line, so lines don't overlap.
    const rs0 = [...rects].filter((r) => r.width > 0.5 && r.height > 0.5);
    if (node && rs0.length > 1) {
      const tops = [...new Set(rs0.map((r) => Math.round(r.top)))];
      const minL = Math.min(...rs0.map((r) => r.left));
      if (tops.length > 1 && (cs.display === 'inline' || rs0[0].left - minL > 1)) {
        const str = node.textContent; const rg = document.createRange(); let start = 0, cur = null;
        const flush = (end) => { if (end <= start) return; const r2 = document.createRange(); r2.setStart(node, start); r2.setEnd(node, end); addText(str.slice(start, end), r2.getClientRects(), cs, parentIdx, parentRect, el, null); };
        for (let i = 0; i < str.length; i++) { rg.setStart(node, i); rg.setEnd(node, i + 1); const r = rg.getClientRects()[0]; if (!r) continue; const t = Math.round(r.top); if (cur === null) cur = t; else if (Math.abs(t - cur) > 2) { flush(i); start = i; cur = t; } }
        flush(str.length); return;
      }
    }
    const t = text.replace(/\\s+/g, ' ');
    if (!t.trim()) return;
    const rs = [...rects].filter((r) => r.width > 0.5 && r.height > 0.5);
    if (!rs.length) return;
    const L = Math.min(...rs.map((r) => r.left)), T = Math.min(...rs.map((r) => r.top)), R = Math.max(...rs.map((r) => r.right)), B = Math.max(...rs.map((r) => r.bottom));
    const st = textStyle(cs);
    const lines = new Set(rs.map((r) => Math.round(r.top))).size;
    const ecs = getComputedStyle(el);
    const trunc = ecs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1;
    const clamp = parseInt(ecs.webkitLineClamp) || 0;
    let w = R - L;
    if (trunc) { const er = el.getBoundingClientRect(); w = Math.min(w, er.right - L - px(ecs.paddingRight)); }
    nodes.push({ t: 'T', p: parentIdx, x: r4(L - parentRect.left), y: r4(T - parentRect.top), w: r4(Math.max(1, w)), h: r4(B - T), s: lines > 1 || trunc || clamp ? t.trim() : t.trim(), st, ml: lines > 1 ? 1 : 0, tr: trunc ? 1 : 0, cl: clamp });
  }
  function walk(el, parentIdx, parentRect, clipRect) {
    const cs = getComputedStyle(el);
    if (!visible(el, cs)) return;
    if (el.id === 'phoneGate' || el.classList.contains('skip')) return;
    const r = el.getBoundingClientRect();
    if (r.width < 0.5 && r.height < 0.5 && !el.children.length) return;
    const tag = el.tagName.toLowerCase();
    const bg = parseColor(cs.backgroundColor);
    const bgi = cs.backgroundImage !== 'none' ? cs.backgroundImage : null;
    const bw = [px(cs.borderTopWidth), px(cs.borderRightWidth), px(cs.borderBottomWidth), px(cs.borderLeftWidth)];
    const bcols = [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor].map(parseColor);
    const hasBorder = bw.some((b, i) => b > 0 && bcols[i] && cs[['borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle'][i]] !== 'none');
    const sh = shadows(cs.boxShadow);
    const bbm = /blur\\(([\\d.]+)px/.exec(cs.backdropFilter || ''); // backdrop-filter blur → Figma background blur
    const clip = (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') && tag !== 'body' && tag !== 'html';
    const scrollY = /auto|scroll/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 2;
    const scrollX = /auto|scroll/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 2;
    const op = parseFloat(cs.opacity);
    const link = linkOf(el);
    const isImg = tag === 'img' || tag === 'video';
    const bgUrl = !isImg && bgi && /url\\(/.test(bgi) ? bgi.match(/url\\("?([^")]+)"?\\)/)[1] : null;
    const isSvg = tag === 'svg';
    const name = (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.') : '') || tag;
    if (isSvg) {
      const clone = el.cloneNode(true);
      const col = cs.color;
      clone.setAttribute('width', r.width); clone.setAttribute('height', r.height);
      let s = clone.outerHTML.replace(/currentColor/g, col);
      if (!/xmlns=/.test(s)) s = s.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      let key = Object.keys(svgs).find((k) => svgs[k] === s);
      if (!key) { key = 'k' + Object.keys(svgs).length; svgs[key] = s; }
      nodes.push({ t: 'S', p: parentIdx, x: r4(r.left - parentRect.left), y: r4(r.top - parentRect.top), w: r4(r.width), h: r4(r.height), k: key, n: 'icon' });
      return;
    }
    if (isImg) {
      let key, src;
      if (tag === 'img') { src = el.currentSrc || el.src; }
      else if (tag === 'video') { src = 'video:' + (el.currentSrc || el.src).replace(/#.*/, '') + '@' + (el.currentTime || 0.8).toFixed(2); }
      else { src = ''; }
      const brand = src.match(/\\/brand\\/([a-z-]+)\\.svg/);
      const rad = radius(cs, r.width, r.height);
      const fit = tag === 'img' || tag === 'video' ? cs.objectFit : (cs.backgroundSize === 'contain' ? 'contain' : 'cover');
      if (brand) nodes.push({ t: 'L', p: parentIdx, x: r4(r.left - parentRect.left), y: r4(r.top - parentRect.top), w: r4(r.width), h: r4(r.height), k: brand[1], n: 'logo ' + brand[1] });
      else { images[src] = 1; nodes.push({ t: 'I', p: parentIdx, x: r4(r.left - parentRect.left), y: r4(r.top - parentRect.top), w: r4(r.width), h: r4(r.height), k: src, rad, fit, op: op < 1 ? op : undefined, bw: hasBorder ? bw : undefined, bc: hasBorder ? bcols.find(Boolean) : undefined, n: tag === 'video' ? 'video frame' : 'image' }); }
      if (tag === 'img' || tag === 'video') return;
    }
    const grad = bgi && /linear-gradient/.test(bgi) ? gradient(bgi) : null;
    const isControl = tag === 'input' || tag === 'textarea' || tag === 'select';
    const before = getComputedStyle(el, '::before'), after = getComputedStyle(el, '::after');
    const pseudos = [before, after].filter((p) => p.content !== 'none' && p.display !== 'none' && (parseColor(p.backgroundColor) || p.borderTopWidth !== '0px') && p.position === 'absolute');
    const makeFrame = bgUrl || bg || grad || hasBorder || sh || (clip && el !== document.body) || op < 1 || link || scrollY || scrollX || isControl || pseudos.length || ['button', 'a'].includes(tag) && (bg || hasBorder);
    let myIdx = parentIdx, myRect = parentRect;
    if (makeFrame && !isImg) {
      myIdx = nodes.length; myRect = r;
      nodes.push({ t: 'F', p: parentIdx, x: r4(r.left - parentRect.left), y: r4(r.top - parentRect.top), w: r4(r.width), h: r4(r.height), n: name, bg: bg || undefined, gr: grad || undefined, rad: radius(cs, r.width, r.height), bw: hasBorder ? bw : undefined, bc: hasBorder ? bcols : undefined, sh: sh || undefined, clip: clip ? 1 : undefined, sy: scrollY ? 1 : undefined, sx: scrollX ? 1 : undefined, op: op < 1 ? op : undefined, bb: bbm ? +bbm[1] : undefined, link: link || undefined });
      for (const p of pseudos) {
        const pw = px(p.width), ph = px(p.height);
        const pl = p.left !== 'auto' ? px(p.left) : r.width - px(p.right) - pw; const pt = p.top !== 'auto' ? px(p.top) : r.height - px(p.bottom) - ph;
        nodes.push({ t: 'F', p: myIdx, x: pl, y: pt, w: pw, h: ph, n: 'pseudo', bg: parseColor(p.backgroundColor) || undefined, rad: radius(p, pw, ph), sh: shadows(p.boxShadow) || undefined });
      }
    }
    if (bgUrl && myIdx !== parentIdx) {
      const sz = cs.backgroundSize.split(' '); const sw = sz[0].endsWith('px') ? px(sz[0]) : (sz[0] === 'contain' || sz[0] === 'cover' || sz[0] === 'auto') ? null : null;
      const sh = sz[1] && sz[1].endsWith('px') ? px(sz[1]) : sw;
      const iw = sw || r.width, ih = sh || r.height;
      const pos = cs.backgroundPosition.split(/ (?![^(]*\\))/);
      const at = (v, room) => { if (!v) return room / 2; let m = v.match(/^calc\\(100% - ([\\d.]+)px\\)$/); if (m) return room - +m[1]; m = v.match(/^([\\d.]+)%$/); if (m) return room * +m[1] / 100; return px(v); };
      if (bgUrl.startsWith('data:image/svg')) nodes.push({ t: 'I', p: myIdx, x: r4(at(pos[0], r.width - iw)), y: r4(at(pos[1], r.height - ih)), w: r4(iw), h: r4(ih), k: bgUrl, n: 'background icon' });
      else { images[bgUrl] = 1; nodes.push({ t: 'I', p: myIdx, x: 0, y: 0, w: r4(r.width), h: r4(r.height), k: bgUrl, rad: radius(cs, r.width, r.height), fit: 'cover', n: 'background image' }); }
    }
    if (isControl) {
      const val = tag === 'select' ? (el.selectedOptions[0]?.text || '') : el.value;
      const ph = tag === 'select' ? '' : el.placeholder;
      const text = val || ph;
      if (text && el.type !== 'checkbox' && el.type !== 'file' && el.type !== 'hidden') {
        const st = textStyle(cs); if (!val) st.c = parseColor(getComputedStyle(el, '::placeholder').color) || st.c;
        const left = px(cs.paddingLeft) + px(cs.borderLeftWidth), top = tag === 'textarea' ? px(cs.paddingTop) + px(cs.borderTopWidth) : (r.height - (st.lh || st.fs * 1.3)) / 2;
        nodes.push({ t: 'T', p: myIdx, x: r4(left), y: r4(top), w: r4(r.width - left - px(cs.paddingRight) - (tag === 'select' ? 18 : 0)), h: r4(st.lh || st.fs * 1.3), s: text.replace(/\\s+/g, ' '), st, ml: tag === 'textarea' ? 1 : 0, tr: tag !== 'textarea' ? 1 : 0, cl: 0 });
      }
      return;
    }
    const kids = tag === 'details' && !el.open ? [...el.children].filter((k) => k.tagName === 'SUMMARY') : el.childNodes;
    for (const child of kids) {
      if (child.nodeType === 3) {
        if (!child.textContent.trim()) continue;
        const range = document.createRange(); range.selectNodeContents(child);
        addText(child.textContent, range.getClientRects(), cs, myIdx, myRect, el, child);
      } else if (child.nodeType === 1) walk(child, myIdx, myRect, clipRect);
    }
  }
  const W = window.innerWidth, H = window.innerHeight;
  const root = { left: 0, top: 0 };
  nodes.push({ t: 'F', p: -1, x: 0, y: 0, w: W, h: H, n: 'screen', bg: parseColor(getComputedStyle(document.body).backgroundColor) || [1, 1, 1, 1], rad: [0, 0, 0, 0], clip: 1 });
  walk(document.body, 0, root);
  return { w: W, h: H, nodes, images: Object.keys(images), svgs, hash: location.hash, title: document.querySelector('.topbar h1, .topbar .title, #topbar')?.textContent?.slice(0, 60) };
})()`);
const { data: png } = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(out.replace(/\.json$/, '.png'), Buffer.from(png, 'base64'));
fs.writeFileSync(out, JSON.stringify(data));
console.log(out, 'nodes', data.nodes.length, 'images', data.images.length, 'svgs', Object.keys(data.svgs).length, 'bytes', JSON.stringify(data).length, errs.length ? 'ERR ' + errs.join(' | ').slice(0, 300) : '');
ws.close(); chrome.kill();
