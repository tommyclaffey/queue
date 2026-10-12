const page = await figma.getNodeByIdAsync('3:2'); await figma.setCurrentPageAsync(page);
const hi = await figma.getNodeByIdAsync('39:12'); await hi.loadAsync();
const all = await figma.variables.getLocalVariablesAsync('COLOR');
const W = {}; for (const v of all) if (v.variableCollectionId === 'VariableCollectionId:3:4') W[v.name] = v;
const qcoll = await figma.variables.getVariableCollectionByIdAsync('VariableCollectionId:19:13');
const P = (name, opacity) => figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 }, opacity: opacity ?? 1 }, 'color', W[name]);
const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b, sat = (c) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
const boxTone = (c) => sat(c) > 0.25 ? 'bg/muted' : lum(c) > 0.985 ? 'bg/canvas' : lum(c) > 0.94 ? 'bg/subtle' : lum(c) > 0.8 ? 'bg/muted' : lum(c) > 0.45 ? 'bg/placeholder' : 'bg/strong';
const inkTone = (c) => lum(c) > 0.8 ? 'ink/inverse' : sat(c) > 0.25 ? 'ink/secondary' : lum(c) < 0.25 ? 'ink/primary' : lum(c) < 0.6 ? 'ink/secondary' : 'ink/tertiary';
const lofi = async (root) => {
  for (const l of root.findAll(n => n.type === 'INSTANCE' && n.name.startsWith('Logo/'))) { const e = figma.createEllipse(); const s = Math.min(l.width, l.height); e.resize(s, s); e.fills = [P('bg/placeholder')]; const par = l.parent; par.insertChild(par.children.indexOf(l), e); e.x = l.x + (l.width - s) / 2; e.y = l.y + (l.height - s) / 2; e.name = 'logo placeholder'; l.remove(); }
  for (const n of [root, ...root.findAll(() => true)]) {
    if ('reactions' in n && n.reactions.length) await n.setReactionsAsync([]);
    if ('effects' in n && n.effects.length) n.effects = [];
    if (n.type === 'TEXT') { const f = n.fills[0]; if (f && f.type === 'SOLID') n.fills = [P(inkTone(f.color), f.opacity)]; continue; }
    const isVec = ['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'LINE', 'POLYGON'].includes(n.type);
    if ('fills' in n && Array.isArray(n.fills) && n.fills.length && n.name !== 'logo placeholder') n.fills = n.fills.map(f => f.visible === false ? f : f.type === 'IMAGE' ? P('bg/placeholder') : f.type === 'SOLID' ? (isVec ? P(lum(f.color) > 0.8 ? 'ink/inverse' : 'ink/tertiary', f.opacity) : P(boxTone(f.color), f.opacity)) : P('bg/placeholder'));
    if ('strokes' in n && Array.isArray(n.strokes) && n.strokes.length) n.strokes = n.strokes.map(s => s.type === 'SOLID' ? (isVec ? P(lum(s.color) > 0.8 ? 'ink/inverse' : 'ink/tertiary', s.opacity) : P('line/default', s.opacity)) : s);
    if (/scrim/i.test(n.name) && 'fills' in n && n.fills.length && n.width > 300) n.fills = n.fills.map(p => ({ ...p, opacity: 0.35 }));
  }
};
const pick = (pg, mob, code) => { for (const s of pg.children.filter(s => s.type === 'SECTION' && /^(📱 )?[1-6] ·/.test(s.name) && s.name.startsWith('📱') === mob)) { const f = s.children.find(n => n.type === 'FRAME' && n.name.startsWith(code + ' ')); if (f) return f; } return null; };
const out = [], errs = [];
for (const code of CODES) {
  const src = pick(hi, MOB, code), t = pick(page, MOB, code);
  if (!src || !t) { errs.push(code + (src ? '' : ' no src') + (t ? '' : ' no target')); continue; }
  const c = src.clone();
  if (MOB) { const par = t.parent; par.insertChild(par.children.indexOf(t), c); c.x = t.x; c.y = t.y; c.name = t.name; try { c.setExplicitVariableModeForCollection(qcoll, '39:0'); } catch (e) {} await lofi(c); c.fills = [P('bg/canvas')]; t.remove(); out.push(code + ' ' + c.id); }
  else { t.parent.appendChild(c); c.x = 60000; try { c.setExplicitVariableModeForCollection(qcoll, '39:0'); } catch (e) {} await lofi(c); for (const k of [...t.children]) k.remove(); for (const k of [...c.children]) { const x = k.x, y = k.y; t.appendChild(k); k.x = x; k.y = y; } c.remove(); t.fills = [P('bg/canvas')]; try { t.setExplicitVariableModeForCollection(qcoll, '39:0'); } catch (e) {} out.push(code + ' ' + t.id); }
}
return { out, errs };
