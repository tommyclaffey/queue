// rebuild.js — run inside Figma (use_figma). Prepend: const PAGE = '39:12' (desktop) or '288:64' (phone), THEME = 'Light'|'Dark', MODE = '39:0' (light) or '39:1' (dark), BUILDER = '<id>', JOBS = [[dataId, mob, code], ...];
// Rebuilds each screen from its capture payload, then the whole clean-up pass in one go:
// lime logo colours, current brand-logo images, clean dropdown chevrons, and centring (pills, rows, counts, circles by ink).
const page = await figma.getNodeByIdAsync(PAGE); await figma.setCurrentPageAsync(page);
const bn = await figma.getNodeByIdAsync(BUILDER); const raw = (bn.type === 'TEXT' ? bn : bn.findOne(n => n.type === 'TEXT')).characters;
const bin = atob(raw.split(':')[2]); let src = ''; for (let i = 0; i < bin.length;) { const c = bin.charCodeAt(i); if (c < 128) { src += String.fromCharCode(c); i++; } else if (c < 224) { src += String.fromCharCode(((c & 31) << 6) | (bin.charCodeAt(i + 1) & 63)); i += 2; } else { src += String.fromCharCode(((c & 15) << 12) | ((bin.charCodeAt(i + 1) & 63) << 6) | (bin.charCodeAt(i + 2) & 63)); i += 3; } }
const build = new (Object.getPrototypeOf(async function () {}).constructor)('figma', 'P', src);
const coll = await figma.variables.getVariableCollectionByIdAsync('VariableCollectionId:19:13');
const secs = page.children.filter(n => n.type === 'SECTION' && /^(📱 )?[1-6] ·/.test(n.name) && (typeof THEME === 'undefined' || n.name.endsWith(' · ' + THEME))); // light + dark share a page (Oct 17): pass THEME
const find = (mob, code) => { for (const s of secs.filter(s => s.name.startsWith('📱') === !!mob)) { const f = s.children.find(n => n.type === 'FRAME' && n.name.startsWith(code + ' ')); if (f) return f; } return null; };
const done = [], errs = [], frames = [];
for (const [data, mob, code] of JOBS) {
  const f = find(mob, code); if (!f) { errs.push('no frame ' + code); continue; }
  const r = await build(figma, { dataId: data, pageId: PAGE, x: 40000, y: 0, name: 'App', mode: MODE }); if (r.errCount) errs.push(code + ' ' + r.errs.join(' | '));
  const app = await figma.getNodeByIdAsync(r.id);
  if (mob) { const old = f.children.find(n => n.name === 'App'); const idx = f.children.indexOf(old); old.remove(); f.insertChild(idx, app); app.x = 0; app.y = 54; }
  else { for (const k of [...f.children]) k.remove(); for (const k of [...app.children]) { const x = k.x, y = k.y; f.appendChild(k); k.x = x; k.y = y; } f.fills = app.fills; app.remove(); try { f.setExplicitVariableModeForCollection(coll, MODE); } catch (e) {} }
  frames.push(f); done.push((mob ? 'M ' : 'D ') + code);
}
const LIME = { r: 0xC6 / 255, g: 0xF4 / 255, b: 0x32 / 255 }, INK = { r: 0x1D / 255, g: 0x1D / 255, b: 0x1F / 255 };
let logos = 0, chev = 0;
for (const f of frames) {
  for (const lg of f.findAll(x => x.type === 'FRAME' && /^\.logo/.test(x.name))) { const ic = lg.children.find(c => c.type === 'FRAME' && c.children.length === 2 && c.children.every(v => v.type === 'VECTOR')); if (!ic) continue; ic.fills = []; ic.children[0].fills = [{ type: 'SOLID', color: LIME }]; ic.children[1].fills = [{ type: 'SOLID', color: INK }]; if (ic.children[1].strokes.length) ic.children[1].strokes = [{ type: 'SOLID', color: INK }]; logos++; }
  for (const s of f.findAll(x => x.type === 'FRAME' && /select/.test(x.name))) { const ic = s.children.find(c => c.name === 'icon' && c.type === 'FRAME'); if (!ic) continue; const t = s.children.find(c => c.type === 'TEXT'); const col = t && Array.isArray(t.fills) && t.fills[0] && t.fills[0].color ? t.fills[0].color : { r: .43, g: .43, b: .45 }; for (const k of [...ic.children]) k.remove(); const v = figma.createVector(); v.name = 'Chevron'; v.vectorPaths = [{ windingRule: 'NONE', data: 'M 0 0 L 4.5 4.5 L 9 0' }]; v.strokes = [{ type: 'SOLID', color: col }]; v.strokeWeight = 1.6; v.strokeCap = 'ROUND'; v.strokeJoin = 'ROUND'; v.fills = []; ic.appendChild(v); ic.resize(12, 12); v.x = (12 - v.width) / 2; v.y = (12 - v.height) / 2; ic.fills = []; ic.clipsContent = false; ic.y = Math.round((s.height - 12) / 2 * 2) / 2; chev++; }
}
const rad = (f) => typeof f.cornerRadius === 'number' ? f.cornerRadius : (f.topLeftRadius || 0);
const isPill = (f) => f.type === 'FRAME' && f.height <= 44 && f.width <= 420 && ((Array.isArray(f.fills) && f.fills.some(p => p.visible !== false && p.type === 'SOLID' && (p.opacity ?? 1) > 0.02) && rad(f) >= Math.min(f.height / 2 - 1, 8)) || (Array.isArray(f.strokes) && f.strokes.length > 0 && typeof f.strokeWeight === 'number' && f.strokeWeight > 0 && rad(f) >= 4));
const inInstance = (n) => { let p = n.parent; while (p && p.type !== 'PAGE') { if (p.type === 'INSTANCE' || p.type === 'COMPONENT' || p.type === 'COMPONENT_SET') return true; p = p.parent; } return false; };
const SKIP = /input|search|select|textarea|→|nav|story-input|\.seg$|\.seg\./;
let moved = 0, inked = 0;
for (const fr of frames) {
  const pills = fr.findAll(n => isPill(n) && !SKIP.test(n.name) && !!n.findOne(c => c.type === 'TEXT') && !inInstance(n));
  for (const p of pills) { const kids = p.children.filter(c => c.visible && !/^hotspot/.test(c.name)); if (!kids.length || kids.length > 4) continue;
    for (const t of p.findAll(c => c.type === 'TEXT')) { const fs = typeof t.fontSize === 'number' ? t.fontSize : 12; if (t.height > fs * 1.9) { for (const seg of t.getStyledTextSegments(['fontName'])) await figma.loadFontAsync(seg.fontName); t.textAutoResize = 'WIDTH_AND_HEIGHT'; if (kids.length === 1 && t.width > p.width - 8) p.resize(Math.ceil(t.width + 20), p.height); } }
    const pb = p.absoluteBoundingBox; let L = 1e9, R = -1e9, T = 1e9, B = -1e9; for (const k of kids) { const b = k.absoluteBoundingBox; if (!b) continue; L = Math.min(L, b.x); R = Math.max(R, b.x + b.width); T = Math.min(T, b.y); B = Math.max(B, b.y + b.height); }
    if (R - L > p.width + 1 || B - T > p.height + 1) continue;
    const dx = Math.round(((L + R) / 2 - (pb.x + pb.width / 2)) * 2) / 2, dy = Math.round(((T + B) / 2 - (pb.y + pb.height / 2)) * 2) / 2;
    if (Math.abs(dx) >= 0.5 || Math.abs(dy) >= 0.5) { for (const k of kids) { k.x -= dx; k.y -= dy; } moved++; } }
  for (const p of pills) { const kids = p.children.filter(c => c.visible && !/^hotspot/.test(c.name)); if (kids.length < 2 || kids.length > 4) continue; const top = Math.max(...kids.map(k => k.y)), bot = Math.min(...kids.map(k => k.y + k.height)); if (top >= bot) continue;
    for (const k of kids) { if (k.type === 'FRAME' && k.children.length === 1 && k.children[0].type === 'TEXT') { const t = k.children[0]; t.y = Math.round((k.height - t.height) / 2 * 2) / 2; } k.y = Math.round((p.height - k.height) / 2 * 2) / 2; } }
  for (const c of fr.findAll(n => n.type === 'FRAME' && /^\.(n|count)(\.|$)/.test(n.name) && !inInstance(n))) { if (c.parent && /^\.tab([ .]|$)/.test(c.parent.name)) continue; if (!c.parent || c.parent.height > 60) continue; /* only counts in a row next to their label: a step number in a flattened page must not jump to the page's first text */ const lab = c.parent && c.parent.children.find(k => k.type === 'TEXT' && k.visible); if (!lab) continue; c.y = Math.round((lab.y + lab.height / 2 - c.height / 2) * 2) / 2; }
  const shortTextIn = (f) => { const k = f.children.filter(c => c.visible); return k.length === 1 && k[0].type === 'TEXT' && k[0].characters.trim().length <= 4 ? k[0] : null; };
  const isCircle = (f) => f.type === 'FRAME' && Math.abs(f.width - f.height) <= 1 && f.width <= 64 && rad(f) >= f.width / 2 - 1 && ((Array.isArray(f.fills) && f.fills.some(p => p.visible !== false && (p.opacity ?? 1) > 0.02)) || (Array.isArray(f.strokes) && f.strokes.length > 0));
  const isBadge = (f) => f.type === 'FRAME' && f.width <= 40 && f.height <= 40 && rad(f) >= 3 && Array.isArray(f.fills) && f.fills.some(p => p.visible !== false && (p.opacity ?? 1) > 0.02);
  for (const f of fr.findAll(n => n.type === 'FRAME' && !inInstance(n) && (isCircle(n) || isPill(n) || isBadge(n)))) { const t = shortTextIn(f); if (!t) continue; const ink = t.absoluteRenderBounds, box = f.absoluteBoundingBox; if (!ink || !box || !ink.width) continue; const dx = Math.round(((box.x + box.width / 2) - (ink.x + ink.width / 2)) * 4) / 4, dy = Math.round(((box.y + box.height / 2) - (ink.y + ink.height / 2)) * 4) / 4; if (Math.abs(dx) < 0.25 && Math.abs(dy) < 0.25) continue; t.x += dx; t.y += dy; inked++; }
}
return { done, errs, logos, chev, moved, inked };
