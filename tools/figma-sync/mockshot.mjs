// mockshot.mjs <base> <out.png> <W> <H> <dsf> <theme> <setupJS> [mobile] — native-resolution screenshot for 06 · Mockups
import { spawn } from 'node:child_process'; import fs from 'node:fs';
const [,, base, out, W, H, dsf, theme, setup = '', mobile = ''] = process.argv;
const port = +(process.env.PORT || 9471);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, '--user-data-dir=/tmp/qfig/mockprofile' + (process.env.PORT || ''), '--hide-scrollbars', '--font-render-hinting=none', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws; for (let i = 0; i < 80; i++) { try { const pg = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'); if (pg) { ws = new WebSocket(pg.webSocketDebuggerUrl); break; } } catch {} await sleep(250); }
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pend = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); pend.get(m.id)?.(m.result ?? m.error); });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = (expression) => send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
await send('Emulation.setDeviceMetricsOverride', { width: Math.round(+W), height: Math.ceil(+H), deviceScaleFactor: +dsf, mobile: !!mobile });
if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true });
await send('Page.navigate', { url: base + '/#/dashboard' }); await sleep(1800);
await ev(`localStorage.setItem('queue-welcome-v1','1'); localStorage.setItem('queue-theme','${theme}'); localStorage.removeItem('queue-brand'); sessionStorage.setItem('queue-phone-ok','1'); localStorage.setItem('queue-preview-ui','on'); localStorage.removeItem('queue-preview-safe');`);
await send('Page.reload'); await sleep(2800);
if (setup) { await ev(`(async () => { const w=(ms)=>new Promise(r=>setTimeout(r,ms)); ${setup} })()`); await sleep(2800); }
await ev(`(async () => { document.activeElement?.blur?.(); const st = document.createElement('style'); st.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important} .demo-tag,.demo-note,.welcome-card .hl-label{display:none!important}'; document.head.append(st);
  for (const v of document.querySelectorAll('video')) { try { v.pause(); v.currentTime = 0.8; } catch {} } for (const s of document.querySelectorAll('#content, .content')) s.scrollTop = 0; await new Promise(r => setTimeout(r, 1200)); })()`);
const r = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: +W, height: +H, scale: 1 } });
fs.writeFileSync(out, Buffer.from(r.data, 'base64'));
console.log(out, fs.statSync(out).size);
ws.close(); chrome.kill(); process.exit(0);
