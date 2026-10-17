// pillcenter.js — run inside Figma (use_figma) after every rebuild. Set PAGE first, e.g. const PAGE = '39:12';
// Captured text boxes land ~2 px low inside pills (browser vs Figma font metrics). This centres the content of every
// pill, badge, count, chip and outlined label on the page, both ways, and puts wrapped labels back on one line.
// Safe to re-run: it measures first and only moves what is off by half a pixel or more. Skips component instances.
const page = await figma.getNodeByIdAsync(PAGE); await figma.setCurrentPageAsync(page);
const rad = (f) => typeof f.cornerRadius === 'number' ? f.cornerRadius : (f.topLeftRadius || 0);
const isPill = (f) => f.type === 'FRAME' && f.height <= 44 && f.width <= 420 && ((Array.isArray(f.fills) && f.fills.some(p => p.visible !== false && p.type === 'SOLID' && (p.opacity ?? 1) > 0.02) && rad(f) >= Math.min(f.height / 2 - 1, 8)) || (Array.isArray(f.strokes) && f.strokes.length > 0 && typeof f.strokeWeight === 'number' && f.strokeWeight > 0 && rad(f) >= 4));
const inInstance = (n) => { let p = n.parent; while (p && p.type !== 'PAGE') { if (p.type === 'INSTANCE' || p.type === 'COMPONENT' || p.type === 'COMPONENT_SET') return true; p = p.parent; } return false; };
const SKIP = /input|search|select|textarea|→|nav|story-input|\.seg$|\.seg\./;
const pills = page.findAll(n => isPill(n) && !SKIP.test(n.name) && !!n.findOne(c => c.type === 'TEXT') && !inInstance(n));
let moved = 0, unwrapped = 0, skipped = 0, widened = 0;
for (const p of pills) {
  const kids = p.children.filter(c => c.visible && !/^hotspot/.test(c.name));
  if (!kids.length || kids.length > 4) { skipped++; continue; }
  for (const t of p.findAll(c => c.type === 'TEXT')) {
    const fs = typeof t.fontSize === 'number' ? t.fontSize : 12;
    if (t.height > fs * 1.9) {
      for (const seg of t.getStyledTextSegments(['fontName'])) await figma.loadFontAsync(seg.fontName);
      t.textAutoResize = 'WIDTH_AND_HEIGHT'; unwrapped++;
      if (kids.length === 1 && t.width > p.width - 8) { p.resize(Math.ceil(t.width + 20), p.height); widened++; }
    }
  }
  const pb = p.absoluteBoundingBox; let L = 1e9, R = -1e9, T = 1e9, B = -1e9;
  for (const k of kids) { const b = k.absoluteBoundingBox; if (!b) continue; L = Math.min(L, b.x); R = Math.max(R, b.x + b.width); T = Math.min(T, b.y); B = Math.max(B, b.y + b.height); }
  if (R - L > p.width + 1 || B - T > p.height + 1) { skipped++; continue; }
  const dx = Math.round(((L + R) / 2 - (pb.x + pb.width / 2)) * 2) / 2, dy = Math.round(((T + B) / 2 - (pb.y + pb.height / 2)) * 2) / 2;
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
  for (const k of kids) { k.x -= dx; k.y -= dy; }
  moved++;
}
// 2. like CSS align-items:center: when a pill's items sit in one row, centre each one on the pill's middle,
//    and centre a lone text inside its own small wrapper (counts like "28" were captured 2 px high)
let rowFixed = 0;
for (const p of pills) {
  const kids = p.children.filter(c => c.visible && !/^hotspot/.test(c.name));
  if (kids.length < 2 || kids.length > 4) continue;
  const top = Math.max(...kids.map(k => k.y)), bot = Math.min(...kids.map(k => k.y + k.height));
  if (top >= bot) continue; // stacked, not a row
  for (const k of kids) {
    if (k.type === 'FRAME' && k.children.length === 1 && k.children[0].type === 'TEXT') { const t = k.children[0]; t.y = Math.round((k.height - t.height) / 2 * 2) / 2; }
    k.y = Math.round((p.height - k.height) / 2 * 2) / 2;
  }
  rowFixed++;
}
// 3. counts next to a label (tabs "All 81", sidebar "Queue 2"): the count's middle lines up with the label's middle
let countsAligned = 0;
for (const c of page.findAll(n => n.type === 'FRAME' && /^\.(n|count)(\.|$)/.test(n.name) && !inInstance(n))) {
  if (c.parent && /^\.tab([ .]|$)/.test(c.parent.name)) continue; if (!c.parent || c.parent.height > 60) continue; /* only counts in a row next to their label: a step number in a flattened page must not jump to the page's first text */ // phone tab bar badge sits on the icon's corner, not beside a label
  const lab = c.parent && c.parent.children.find(k => k.type === 'TEXT' && k.visible); if (!lab) continue;
  c.y = Math.round((lab.y + lab.height / 2 - c.height / 2) * 2) / 2; countsAligned++;
}
// 4. optical centring (rule Oct 17): circles, and pills holding a short number or symbol ("11", "2", "✓"), centre the
//    rendered ink, not the text box — digits like 1 carry uneven spacing in the font, so a centred box still looks off
let inked = 0;
const shortTextIn = (f) => { const k = f.children.filter(c => c.visible); return k.length === 1 && k[0].type === 'TEXT' && k[0].characters.trim().length <= 4 ? k[0] : null; };
const isCircle = (f) => f.type === 'FRAME' && Math.abs(f.width - f.height) <= 1 && f.width <= 64 && rad(f) >= f.width / 2 - 1 && ((Array.isArray(f.fills) && f.fills.some(p => p.visible !== false && (p.opacity ?? 1) > 0.02)) || (Array.isArray(f.strokes) && f.strokes.length > 0));
const isBadge = (f) => f.type === 'FRAME' && f.width <= 40 && f.height <= 40 && rad(f) >= 3 && Array.isArray(f.fills) && f.fills.some(p => p.visible !== false && (p.opacity ?? 1) > 0.02); // small rounded squares like photo-order numbers
for (const f of page.findAll(n => n.type === 'FRAME' && !inInstance(n) && (isCircle(n) || isPill(n) || isBadge(n)))) {
  const t = shortTextIn(f); if (!t) continue;
  const ink = t.absoluteRenderBounds, box = f.absoluteBoundingBox; if (!ink || !box || !ink.width) continue;
  const dx = Math.round(((box.x + box.width / 2) - (ink.x + ink.width / 2)) * 4) / 4, dy = Math.round(((box.y + box.height / 2) - (ink.y + ink.height / 2)) * 4) / 4;
  if (Math.abs(dx) < 0.25 && Math.abs(dy) < 0.25) continue;
  t.x += dx; t.y += dy; inked++;
}
return { pills: pills.length, moved, rowFixed, countsAligned, inked, unwrapped, widened, skipped };
