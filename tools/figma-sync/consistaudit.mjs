import { spawn } from 'node:child_process'; import fs from 'node:fs';
const [,, base, W, H, mobile, screensFile] = process.argv;
const screens = JSON.parse(fs.readFileSync(screensFile));
const port = 9493; const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/qcs${port}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws; for (let i = 0; i < 80; i++) { try { const pg = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'); if (pg) { ws = new WebSocket(pg.webSocketDebuggerUrl); break; } } catch {} await sleep(250); }
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pend = new Map(); ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); pend.get(m.id)?.(m.result ?? m.error); });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }))?.result?.value;
await send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: 1, mobile: mobile === '1' });
await send('Page.navigate', { url: base + '/#/dashboard' }); await sleep(1500);
await ev(`localStorage.setItem('queue-welcome-v1','1'); localStorage.setItem('queue-theme','light'); sessionStorage.setItem('queue-phone-ok','1'); localStorage.setItem('queue-preview-ui','on');`);
const SEL = ['.btn', '.btn.small', '.pill', '.chip', '.fchip', '.role-tag', '.you-tag', '.hl-label', '.tabs .n', '.nav a .count', '.dpill', 'select.input', 'input.input', '.ptabs button', '.seg button', '.pbadge', '.av-sm', '.av-md', '.card'];
const agg = {};
for (const [sid, name, setup] of screens) {
  await send('Page.navigate', { url: base + '/#/dashboard' }); await sleep(900);
  await ev(`(async () => { const w=(ms)=>new Promise(r=>setTimeout(r,ms)); ${setup} })()`); await sleep(1400);
  const res = await ev(`(() => { const SEL = ${JSON.stringify(SEL)}; const out = {};
    for (const s of SEL) for (const el of document.querySelectorAll(s)) { const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue; if (el.closest('.phone.device')) continue; const cs = getComputedStyle(el);
      const k = s === '.card' ? (cs.paddingTop + ' r' + cs.borderTopLeftRadius) : (Math.round(r.height) + 'h r' + Math.round(parseFloat(cs.borderTopLeftRadius)) + ' ' + cs.fontSize + ' ' + cs.fontWeight);
      (out[s] ||= {})[k] = (out[s][k] || 0) + 1; } return out; })()`);
  for (const [s, m] of Object.entries(res || {})) for (const [k, n] of Object.entries(m)) { ((agg[s] ||= {})[k] ||= { n: 0, screens: new Set() }).n += n; agg[s][k].screens.add(name.split(' ')[0]); }
}
for (const [s, m] of Object.entries(agg)) { const ks = Object.entries(m); console.log((ks.length > 1 ? '⚠ ' : '  ') + s); for (const [k, v] of ks.sort((a, b) => b[1].n - a[1].n)) console.log('     ', k, '×' + v.n, [...v.screens].slice(0, 8).join(' ')); }
ws.close(); chrome.kill(); process.exit(0);
