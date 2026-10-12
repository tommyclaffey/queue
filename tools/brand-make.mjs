import fs from 'node:fs'; import { spawn } from 'node:child_process';
const OUT = process.env.HOME + '/Coding/queue/brand';
const INK = '#1D1D1F', PAPER = '#FFFFFF', LIME = '#C6F432';
const lockSrc = fs.readFileSync('src/lockup-ink.svg', 'utf8'), wordSrc = fs.readFileSync('src/wordmark-ink.svg', 'utf8');
const lockText = lockSrc.split('<path d="').map((x) => x.split('"')[0]).filter((d) => d.length > 1000)[0];
const wordText = wordSrc.split('<path d="').map((x) => x.split('"')[0]).filter((d) => d.length > 1000)[0];
// Mark A, "Q corner": square bottom-right corner, softened play triangle (26-unit grid)
const inner = (tile, play) => `<path d="M8 0H18A8 8 0 0 1 26 8V26H8A8 8 0 0 1 0 18V8A8 8 0 0 1 8 0Z" fill="${tile}"/><path d="M11 10V16L16 13Z" fill="${play}" stroke="${play}" stroke-width="1.6" stroke-linejoin="round"/>`;
const mark = (tile, play) => `<svg width="104" height="104" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">${inner(tile, play)}</svg>\n`;
const icon = (bg, tile, play) => `<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="1024" height="1024" fill="${bg}"/><g transform="translate(204.8 204.8) scale(23.6308)">${inner(tile, play)}</g></svg>\n`;
const lockup = (tile, play, text) => `<svg width="570" height="117" viewBox="0 0 570 117" fill="none" xmlns="http://www.w3.org/2000/svg"><g transform="translate(0 2.34387) scale(4)">${inner(tile, play)}</g><path d="${lockText}" fill="${text}"/></svg>\n`;
// Primary lockup (Oct 11): the lime app-icon tile (rounded like an app icon, 22.37% radius) with the mark at 60%, next to the wordmark
const tile = (x, y, size) => `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${(size * 0.2237).toFixed(2)}" fill="${LIME}"/><g transform="translate(${x + size * 0.2} ${y + size * 0.2}) scale(${(size * 0.6 / 26).toFixed(4)})">${inner(INK, PAPER)}</g>`;
const primary = (text) => `<svg width="570" height="117" viewBox="0 0 570 117" fill="none" xmlns="http://www.w3.org/2000/svg">${tile(0, 2.34387, 104)}<path d="${lockText}" fill="${text}"/></svg>\n`;
const iconTile = () => `<svg width="104" height="104" viewBox="0 0 104 104" fill="none" xmlns="http://www.w3.org/2000/svg">${tile(0, 0, 104)}</svg>\n`;
const wordmark = (text) => `<svg width="430" height="117" viewBox="0 0 430 117" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="${wordText}" fill="${text}"/></svg>\n`;
const S = {
  'queue-lockup-primary': primary(INK),
  'queue-lockup-primary-paper': primary(PAPER),
  'queue-icon': iconTile(),
  'queue-lockup-ink': lockup(INK, PAPER, INK),
  'queue-lockup-paper': lockup(PAPER, INK, PAPER),
  'queue-lockup-lime': lockup(LIME, INK, PAPER),
  'queue-wordmark-ink': wordmark(INK),
  'queue-wordmark-paper': wordmark(PAPER),
  'queue-mark-ink': mark(INK, PAPER), 'queue-mark-paper': mark(PAPER, INK), 'queue-mark-lime': mark(LIME, INK),
  'queue-app-icon-lime': icon(LIME, INK, PAPER), 'queue-app-icon-ink': icon(INK, LIME, INK),
};
for (const [k, v] of Object.entries(S)) fs.writeFileSync(`${OUT}/svg/${k}.svg`, v);
const uri = (s) => 'data:image/svg+xml;base64,' + Buffer.from(s).toString('base64');
const img = (k, w, h) => `<html><body style="margin:0;background:transparent"><img src="${uri(S[k])}" style="display:block;width:${w}px;height:${h}px"></body></html>`;
const jobs = [];
for (const k of ['queue-lockup-primary', 'queue-lockup-primary-paper', 'queue-lockup-ink', 'queue-lockup-paper', 'queue-lockup-lime']) { jobs.push([img(k, 1140, 234), 1140, 234, `png/${k}@2x.png`]); jobs.push([img(k, 2280, 468), 2280, 468, `png/${k}@4x.png`]); }
for (const k of ['queue-wordmark-ink', 'queue-wordmark-paper']) jobs.push([img(k, 1720, 468), 1720, 468, `png/${k}@4x.png`]);
for (const k of ['queue-icon', 'queue-mark-ink', 'queue-mark-paper', 'queue-mark-lime']) { jobs.push([img(k, 512, 512), 512, 512, `png/${k}-512.png`]); jobs.push([img(k, 1024, 1024), 1024, 1024, `png/${k}-1024.png`]); }
for (const [n, s] of [['icon-1024', 1024], ['icon-512', 512], ['icon-192', 192], ['apple-touch-icon-180', 180], ['favicon-32', 32], ['favicon-16', 16]]) jobs.push([img('queue-app-icon-lime', s, s), s, s, `app-icon/${n}.png`]);
jobs.push([img('queue-app-icon-ink', 1024, 1024), 1024, 1024, 'app-icon/icon-ink-1024.png']);
jobs.push([img('queue-app-icon-lime', 1080, 1080), 1080, 1080, 'social/avatar-1080.png']);
const FONT = `<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;600&family=Geist+Mono:wght@500&display=block" rel="stylesheet">`;
const banner = (w, h, lockW, title, sub, center) => `<html><head>${FONT}</head><body style="margin:0;width:${w}px;height:${h}px;background:#000;display:flex;flex-direction:column;justify-content:center;${center ? 'align-items:center;text-align:center;' : ''}padding:0 ${Math.round(w * 0.07)}px;box-sizing:border-box;gap:${Math.round(h * 0.07)}px;font-family:Geist">
<img src="${uri(S['queue-lockup-primary-paper'])}" style="width:${lockW}px;height:auto;display:block">
<div style="color:#fff;font-weight:600;font-size:${Math.round(h * 0.13)}px;line-height:1.08;letter-spacing:-0.035em;max-width:${Math.round(w * 0.8)}px">${title}</div>
<div style="display:flex;gap:12px;align-items:center"><span style="font-family:'Geist Mono';font-weight:500;font-size:${Math.round(h * 0.036)}px;letter-spacing:.12em;text-transform:uppercase;background:#C6F432;color:#1D1D1F;padding:4px 12px;border-radius:999px">${sub}</span></div></body></html>`;
jobs.push([banner(1200, 630, 300, 'Post on time.<br>Keep the quality.', 'Social media scheduler'), 1200, 630, 'social/link-preview-1200x630.png']);
jobs.push([banner(1500, 500, 260, 'Post on time. Keep the quality.', 'Social media scheduler', true), 1500, 500, 'social/header-1500x500.png']);
// render with headless Chrome
const port = 9466;
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, '--user-data-dir=/tmp/qbrand/profile', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws; for (let i = 0; i < 60; i++) { try { const pg = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'); if (pg) { ws = new WebSocket(pg.webSocketDebuggerUrl); break; } } catch {} await sleep(250); }
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pend = new Map(); ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); pend.get(m.id)?.(m.result); });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
for (const [html, w, h, out] of jobs) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  fs.writeFileSync('/tmp/qbrand/page.html', html);
  await send('Page.navigate', { url: 'file:///tmp/qbrand/page.html' }); await sleep(out.startsWith('social/link') || out.startsWith('social/header') ? 2500 : 500);
  await send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true });
  const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
  fs.writeFileSync(`${OUT}/${out}`, Buffer.from(data, 'base64'));
}
ws.close(); chrome.kill(); console.log('rendered', jobs.length);
