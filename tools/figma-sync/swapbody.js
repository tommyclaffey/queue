const page = await figma.getNodeByIdAsync(PAGE); await figma.setCurrentPageAsync(page);
const bn = await figma.getNodeByIdAsync(BUILDER);
const raw = (bn.type === 'TEXT' ? bn : bn.findOne(n => n.type === 'TEXT')).characters;
const bin = atob(raw.split(':')[2]); let src = ''; for (let i = 0; i < bin.length;) { const c = bin.charCodeAt(i); if (c < 128) { src += String.fromCharCode(c); i++; } else if (c < 224) { src += String.fromCharCode(((c & 31) << 6) | (bin.charCodeAt(i + 1) & 63)); i += 2; } else { src += String.fromCharCode(((c & 15) << 12) | ((bin.charCodeAt(i + 1) & 63) << 6) | (bin.charCodeAt(i + 2) & 63)); i += 3; } }
const build = new (Object.getPrototypeOf(async function () {}).constructor)('figma', 'P', src);
const coll = await figma.variables.getVariableCollectionByIdAsync('VariableCollectionId:19:13');
const secs = page.children.filter(n => n.type === 'SECTION' && /^(📱 )?[1-6] ·/.test(n.name));
const find = (mob, code) => { for (const s of secs.filter(s => s.name.startsWith('📱') === !!mob)) { const f = s.children.find(n => n.type === 'FRAME' && n.name.startsWith(code + ' ')); if (f) return f; } return null; };
const out = [], errs = [];
for (const [data, mob, code] of JOBS) {
  const f = find(mob, code); if (!f) { errs.push('no frame ' + (mob ? 'M ' : 'D ') + code); continue; }
  const r = await build(figma, { dataId: data, pageId: PAGE, x: 40000, y: 0, name: 'App', mode: MODE });
  if (r.errCount) errs.push(code + ' ' + r.errs.join(' | '));
  const app = await figma.getNodeByIdAsync(r.id);
  if (mob) { const old = f.children.find(n => n.name === 'App'); const idx = f.children.indexOf(old); old.remove(); f.insertChild(idx, app); app.x = 0; app.y = 54; }
  else { for (const k of [...f.children]) k.remove(); for (const k of [...app.children]) { const x = k.x, y = k.y; f.appendChild(k); k.x = x; k.y = y; } f.fills = app.fills; app.remove(); try { f.setExplicitVariableModeForCollection(coll, MODE); } catch (e) {} }
  // dropdown chevrons: the captured one collapses to a speck, so draw a clean 9 x 4.5 stroke in the text colour, centred in its slot
  for (const s of f.findAll(n => n.type === 'FRAME' && /select/.test(n.name))) {
    const ic = s.children.find(c => c.name === 'icon' && c.type === 'FRAME'); if (!ic) continue;
    const t = s.children.find(c => c.type === 'TEXT'); const col = t && Array.isArray(t.fills) && t.fills[0] && t.fills[0].color ? t.fills[0].color : { r: .43, g: .43, b: .45 };
    if (t) { await figma.loadFontAsync(t.fontName); t.textTruncation = 'DISABLED'; t.maxLines = null; t.textAutoResize = 'WIDTH_AND_HEIGHT'; t.y = (s.height - t.height) / 2; }
    for (const k of [...ic.children]) k.remove();
    const v = figma.createVector(); v.name = 'Chevron'; v.vectorPaths = [{ windingRule: 'NONE', data: 'M 0 0 L 4.5 4.5 L 9 0' }];
    v.strokes = [{ type: 'SOLID', color: col }]; v.strokeWeight = 1.6; v.strokeCap = 'ROUND'; v.strokeJoin = 'ROUND'; v.fills = [];
    ic.appendChild(v); ic.resize(12, 12); v.x = (12 - v.width) / 2; v.y = (12 - v.height) / 2; ic.fills = []; ic.clipsContent = false; ic.y = Math.round((s.height - 12) / 2 * 2) / 2;
  }
  out.push((mob ? 'M ' : 'D ') + code);
}
return { done: out, errs };
