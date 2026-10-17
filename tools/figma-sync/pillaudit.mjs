// pillaudit.mjs <base> <screens.json> <W> <H> [mobile] — finds pills, badges and outlined labels whose content is
// off-centre or wraps. Prints one JSON line per problem: { screen, cls, text, dx, dy, wrap }.
// A "pill" = a small element (≤ 44 px tall) with text inside and either a rounded background or a border.
import { spawn } from 'node:child_process'; import fs from 'node:fs';
const [,, base, screensFile, W, H, mobile = ''] = process.argv;
const screens = JSON.parse(fs.readFileSync(screensFile, 'utf8'));
const port = +(process.env.PORT || 9491);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/qaudit${port}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws; for (let i = 0; i < 80; i++) { try { const pg = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'); if (pg) { ws = new WebSocket(pg.webSocketDebuggerUrl); break; } } catch {} await sleep(250); }
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pend = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); pend.get(m.id)?.(m.result ?? m.error); });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }))?.result?.value;
await send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: 1, mobile: !!mobile });
await send('Page.navigate', { url: base + '/#/dashboard' }); await sleep(1500);
await ev(`localStorage.setItem('queue-welcome-v1','1'); localStorage.setItem('queue-theme','light'); sessionStorage.setItem('queue-phone-ok','1'); localStorage.setItem('queue-preview-ui','on');`);
const MEASURE = `(() => {
  const out = [];
  const opaque = (c) => c && c !== 'transparent' && !/rgba\\([^)]*,\\s*0\\)$/.test(c);
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height || r.height > 44 || r.width > 420) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
    const rad = parseFloat(cs.borderTopLeftRadius) || 0, bw = parseFloat(cs.borderTopWidth) || 0;
    const pillish = (opaque(cs.backgroundColor) && rad >= Math.min(r.height / 2 - 1, 8)) || (bw > 0 && rad >= 4);
    if (!pillish) continue;
    const txt = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
    const deep = el.textContent.trim(); if (!deep || deep.length > 48) continue;
    if (el.querySelector('input, textarea, select, img, video')) continue;
    // content bounds: every text run and every child element
    const rects = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let lines = new Set(); let n;
    while ((n = walker.nextNode())) { if (!n.textContent.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(n); for (const q of rg.getClientRects()) { if (q.width) { rects.push(q); lines.add(Math.round(q.top)); } } }
    for (const c of el.children) { const q = c.getBoundingClientRect(); if (q.width && q.height) rects.push(q); }
    if (!rects.length) continue;
    const L = Math.min(...rects.map((q) => q.left)), R = Math.max(...rects.map((q) => q.right)), T = Math.min(...rects.map((q) => q.top)), B = Math.max(...rects.map((q) => q.bottom));
    const pl = parseFloat(cs.paddingLeft) + bw, pr = parseFloat(cs.paddingRight) + bw;
    const boxCx = r.left + pl + (r.width - pl - pr) / 2, boxCy = r.top + r.height / 2;
    const dx = +((L + R) / 2 - boxCx).toFixed(1), dy = +((T + B) / 2 - boxCy).toFixed(1);
    const centredIntent = cs.justifyContent === 'center' || cs.textAlign === 'center' || cs.display.includes('inline') || cs.display === 'grid';
    const wrap = lines.size > 1;
    const overflow = R > r.right + 0.5 || L < r.left - 0.5 || B > r.bottom + 0.5 || T < r.top - 0.5;
    const cls = el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : '');
    out.push({ cls, text: deep.slice(0, 30), dx, dy, wrap, overflow, centredIntent, h: Math.round(r.height), x: r.left + scrollX, y: r.top, w: r.width, hh: r.height, rad, bw, inView: r.top >= 0 && r.bottom <= innerHeight });
  }
  return out;
})()`;
const STACK = `(() => { const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if ([...el.childNodes].every((n) => n.nodeType !== 3 || !n.textContent.trim())) continue;
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const t = el.textContent.trim(); const words = t.split(/\s+/).filter(Boolean); if (words.length < 2 || t.length > 60) continue;
    const rg = document.createRange(); rg.selectNodeContents(el); const tops = new Set([...rg.getClientRects()].filter((q) => q.width).map((q) => Math.round(q.top)));
    const lines = tops.size; if (lines < 2) continue;
    if (words.length / lines <= 1.6) { const r = el.getBoundingClientRect(); out.push({ cls: el.tagName.toLowerCase() + '.' + String(el.className).trim().split(/\s+/).join('.'), text: t.slice(0, 40), lines, w: Math.round(r.width) }); }
  } return out; })()`;
const all = []; fs.mkdirSync('/tmp/pills', { recursive: true });
for (const [sid, name, setup] of screens) {
  await send('Page.navigate', { url: base + '/#/dashboard' }); await sleep(1200);
  if (setup) await ev(`(async () => { const w=(ms)=>new Promise(r=>setTimeout(r,ms)); ${setup} })()`);
  await sleep(1800);
  if (process.env.MODE === 'stack') { for (const x of ((await ev(STACK)) || [])) all.push({ screen: sid + ' ' + name.slice(0, 28), ...x }); continue; }
  const res = (await ev(MEASURE)) || [];
  const seen = new Set();
  for (const x of res) {
    const key = x.cls + '|' + x.text.replace(/\\d+/g, '#');
    if (seen.has(key) || !x.inView) continue; seen.add(key);
    const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: x.x - 3, y: x.y - 3, width: x.w + 6, height: x.hh + 6, scale: 4 } });
    const f = `/tmp/pills/${sid}-${seen.size}.png`; fs.writeFileSync(f, Buffer.from(shot.data, 'base64'));
    all.push({ screen: sid + ' ' + name.slice(0, 28), file: f, ...x });
  }
}
fs.writeFileSync(process.env.OUT || '/tmp/pillaudit.json', JSON.stringify(all, null, 1));
console.log('pills', all.length);
ws.close(); chrome.kill(); process.exit(0);
