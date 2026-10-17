// postfix.js — run inside Figma after rebuild.js, once per page (prepend: const PAGE = '39:12' | '288:64' | '3:2').
// The Oct 17 alignment fixes, in the order they have to run:
// 1. small labelled controls (≤ 40 px: buttons, nav items, toggles, badges): every item centred on the row, like align-items: center
// 2. truncated text whose box is shorter than its line height takes the full line box, so it sits on the same baseline as its neighbours
// 3. calendar event pills (.ev): time + title centred
// 4. short numbers in circles and badges centred by their ink (digits like 1 sit off-centre in a centred text box)
// 5. bare counts on a heading line ("Unscheduled 0") centred on the heading
const page = await figma.getNodeByIdAsync(PAGE); await figma.setCurrentPageAsync(page);
const inInst = (n) => { let p = n.parent; while (p && p.type !== 'PAGE') { if (p.type === 'INSTANCE' || p.type === 'COMPONENT' || p.type === 'COMPONENT_SET') return true; p = p.parent; } return false; };
const rad = (f) => typeof f.cornerRadius === 'number' ? f.cornerRadius : (f.topLeftRadius || 0);
const filled = (f) => Array.isArray(f.fills) && f.fills.some(p => p.visible !== false && p.type === 'SOLID' && (p.opacity ?? 1) > 0.02);
const stroked = (f) => Array.isArray(f.strokes) && f.strokes.length > 0 && typeof f.strokeWeight === 'number' && f.strokeWeight > 0;
const mid = (H, h) => Math.round((H - h) / 2 * 2) / 2;
const lhOf = (t) => t.lineHeight && t.lineHeight.unit === 'PIXELS' ? t.lineHeight.value : 0;
const load = async (t) => { for (const s of t.getStyledTextSegments(['fontName'])) await figma.loadFontAsync(s.fontName); };
const SKIPN = /input|textarea|search|select|story-input/;
const r = { controls: 0, lineBoxes: 0, ev: 0, inked: 0, counts: 0 };
// 2 first, so 1 and 3 centre the full line boxes
for (const t of page.findAll(n => n.type === 'TEXT' && n.visible && !inInst(n))) {
  const lh = lhOf(t); if (!lh || t.height >= lh - 0.5) continue;
  const p = t.parent; if (!p || p.type !== 'FRAME' || p.height > 40 || lh > p.height + 0.5) continue;
  await load(t); t.resize(t.width, lh); t.y = mid(p.height, lh); r.lineBoxes++;
}
// 1
for (const f of page.findAll(n => n.type === 'FRAME' && n.height <= 40 && n.width <= 500 && (filled(n) || stroked(n)) && !SKIPN.test(n.name) && !inInst(n))) {
  const kids = f.children.filter(c => c.visible && !/^hotspot/.test(c.name)); if (!kids.length || kids.length > 4) continue;
  if (!kids.some(k => k.type === 'TEXT' || (k.type === 'FRAME' && k.findOne(c => c.type === 'TEXT')))) continue;
  if (kids.length > 1) { const top = Math.max(...kids.map(k => k.y)), bot = Math.min(...kids.map(k => k.y + k.height)); if (top >= bot) continue; }
  let ch = false;
  for (const k of kids) { if (k.height > f.height) continue; const y = mid(f.height, k.height); if (Math.abs(k.y - y) >= 0.5) { k.y = y; ch = true; } if (k.type === 'FRAME' && k.children.length === 1 && k.children[0].type === 'TEXT') { const t = k.children[0]; const ty = mid(k.height, t.height); if (Math.abs(t.y - ty) >= 0.5) { t.y = ty; ch = true; } } }
  if (ch) r.controls++;
}
// 3
for (const e of page.findAll(n => n.type === 'FRAME' && /^\.ev(\.|$| )/.test(n.name) && !inInst(n))) {
  for (const k of e.children.filter(c => c.visible)) { k.y = mid(e.height, k.height); if (k.type === 'FRAME') for (const t of k.children.filter(c => c.type === 'TEXT')) { const lh = lhOf(t); if (lh && t.height < lh - 0.5) { await load(t); t.resize(t.width, Math.min(lh, k.height)); } t.y = mid(k.height, t.height); } }
  r.ev++;
}
// 4
const isCircle = (f) => Math.abs(f.width - f.height) <= 1 && f.width <= 64 && rad(f) >= f.width / 2 - 1 && (filled(f) || stroked(f));
const isBadge = (f) => f.width <= 40 && f.height <= 40 && rad(f) >= 3 && filled(f);
for (const f of page.findAll(n => n.type === 'FRAME' && !inInst(n) && (isCircle(n) || isBadge(n)))) {
  const k = f.children.filter(c => c.visible); if (k.length !== 1 || k[0].type !== 'TEXT' || k[0].characters.trim().length > 4) continue;
  const t = k[0], ink = t.absoluteRenderBounds, box = f.absoluteBoundingBox; if (!ink || !ink.width) continue;
  const dx = Math.round(((box.x + box.width / 2) - (ink.x + ink.width / 2)) * 4) / 4, dy = Math.round(((box.y + box.height / 2) - (ink.y + ink.height / 2)) * 4) / 4;
  if (Math.abs(dx) < 0.25 && Math.abs(dy) < 0.25) continue; t.x += dx; t.y += dy; r.inked++;
}
// 5
for (const t of page.findAll(x => x.type === 'TEXT' && x.visible && /^\d{1,4}$/.test(x.characters.trim()) && x.parent && x.parent.type === 'FRAME' && x.parent.height > 40 && !inInst(x))) {
  const sib = t.parent.children.filter(k => k !== t && k.type === 'TEXT' && k.visible && k.height > t.height && k.y < t.y + t.height && k.y + k.height > t.y && k.height < 40);
  if (sib.length !== 1) continue; const y = Math.round((sib[0].y + sib[0].height / 2 - t.height / 2) * 2) / 2; if (Math.abs(t.y - y) >= 0.5) { t.y = y; r.counts++; }
}
return r;
