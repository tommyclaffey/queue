// prevaudit.mjs <base> <W> <H> <mobile> — measures every device preview: column gaps, device size, controls
import { spawn } from 'node:child_process'; import fs from 'node:fs';
const [,, base, W, H, mobile] = process.argv;
const L = Object.fromEntries(JSON.parse(fs.readFileSync('/tmp/qfig/screens-L2.json')).map(r => [r[0], r[2]]));
const port = 9496; const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/qpa${port}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws; for (let i = 0; i < 80; i++) { try { const pg = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'); if (pg) { ws = new WebSocket(pg.webSocketDebuggerUrl); break; } } catch {} await sleep(250); }
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pend = new Map(); ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); pend.get(m.id)?.(m.result ?? m.error); });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }))?.result?.value;
await send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: 1, mobile: mobile === '1' });
await send('Page.navigate', { url: base + '/#/dashboard' }); await sleep(1500);
await ev(`localStorage.setItem('queue-welcome-v1','1'); localStorage.setItem('queue-theme','light'); sessionStorage.setItem('queue-phone-ok','1'); localStorage.setItem('queue-preview-ui','on');`);
const MEAS = `(() => { const out = [];
  for (const dev of document.querySelectorAll('.phone.device')) {
    const r = dev.getBoundingClientRect(); if (!r.width) continue;
    let col = dev; while (col && !(col.classList.contains('stack'))) col = col.parentElement;
    const kids = col ? [...col.children].filter(k => k.getBoundingClientRect().height > 0) : [];
    const gaps = []; for (let i = 1; i < kids.length; i++) { const a = kids[i-1].getBoundingClientRect(), b = kids[i].getBoundingClientRect(); gaps.push(Math.round(b.top - a.bottom)); }
    const names = kids.map(k => (k.className && typeof k.className === 'string' ? k.className.split(' ')[0] : k.tagName.toLowerCase()) || k.tagName.toLowerCase());
    const ptabs = col && col.querySelector('.ptabs'); const pb = ptabs && ptabs.querySelector('button');
    out.push({ colClass: col ? col.className : null, dev: Math.round(r.width) + 'x' + Math.round(r.height), names: names.join(' | '), gaps: gaps.join(','), ptabGap: ptabs ? getComputedStyle(ptabs).gap : '-', ptabBtn: pb ? Math.round(pb.getBoundingClientRect().width) + 'x' + Math.round(pb.getBoundingClientRect().height) : '-', toggles: col ? col.querySelectorAll('.preview-toggle').length : 0, note: col ? !!col.querySelector('.preview-note') : false });
  } return out; })()`;
const scen = [['3.2 video', L['07']], ['3.3 photos', L['08']], ['3.4 story', L['09']], ['3.5 preparing', L['10']], ['4.2 post detail', L['12']], ['4.4 posted', L['22']]];
for (const [name, setup] of scen) {
  await send('Page.navigate', { url: base + '/#/dashboard' }); await sleep(900);
  await ev(`(async () => { const w=(ms)=>new Promise(r=>setTimeout(r,ms)); ${setup} })()`); await sleep(1500);
  const tabs = (await ev(`[...document.querySelectorAll('.ptabs button')].map(b => b.getAttribute('aria-label') || b.title)`)) || [null];
  for (let t = 0; t < Math.max(tabs.length, 1); t++) {
    if (tabs[t]) { await ev(`document.querySelectorAll('.ptabs button')[${t}].click()`); await sleep(600); }
    const m = (await ev(MEAS)) || [];
    for (const x of m) console.log(JSON.stringify({ screen: name, tab: tabs[t] ? tabs[t].replace('Preview as ', '') : '-', ...x }));
    if (!m.length) console.log(JSON.stringify({ screen: name, tab: tabs[t] || '-', none: true }));
  }
}
ws.close(); chrome.kill(); process.exit(0);
