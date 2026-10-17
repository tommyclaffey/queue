// Runs inside Figma as an AsyncFunction(figma, P). P = { dataId, pageId, x, y, name, mode }
const errs = [];
const dataNode = await figma.getNodeByIdAsync(P.dataId);
const tnode = dataNode.type === 'TEXT' ? dataNode : dataNode.findOne((n) => n.type === 'TEXT');
const raw = tnode.characters;
const b64 = raw.slice(raw.indexOf(':', 6) + 1);
const bin = atob(b64);
let str = '';
for (let i = 0; i < bin.length;) {
  const c = bin.charCodeAt(i);
  if (c < 128) { str += String.fromCharCode(c); i++; }
  else if (c < 224) { str += String.fromCharCode(((c & 31) << 6) | (bin.charCodeAt(i + 1) & 63)); i += 2; }
  else if (c < 240) { str += String.fromCharCode(((c & 15) << 12) | ((bin.charCodeAt(i + 1) & 63) << 6) | (bin.charCodeAt(i + 2) & 63)); i += 3; }
  else { const cp = ((c & 7) << 18) | ((bin.charCodeAt(i + 1) & 63) << 12) | ((bin.charCodeAt(i + 2) & 63) << 6) | (bin.charCodeAt(i + 3) & 63); const v = cp - 0x10000; str += String.fromCharCode(0xD800 + (v >> 10), 0xDC00 + (v & 1023)); i += 4; }
}
const D = JSON.parse(str);
const page = await figma.getNodeByIdAsync(P.pageId);
await figma.setCurrentPageAsync(page);

// colour tokens: Queue collection, chosen mode (Apple Light by default)
const COL = 'VariableCollectionId:19:13';
const MODE = P.mode || '39:0';
const coll = await figma.variables.getVariableCollectionByIdAsync(COL);
const vars = (await figma.variables.getLocalVariablesAsync('COLOR')).filter((v) => v.variableCollectionId === COL);
const hex2 = (n) => Math.round(n * 255).toString(16).padStart(2, '0');
const key = (c) => hex2(c.r) + hex2(c.g) + hex2(c.b) + hex2(c.a == null ? 1 : c.a);
const tokens = {};
for (const v of vars) {
  let val = v.valuesByMode[MODE];
  for (let g = 0; val && val.type === 'VARIABLE_ALIAS' && g < 5; g++) { const t = await figma.variables.getVariableByIdAsync(val.id); val = t.valuesByMode[Object.keys(t.valuesByMode)[0]]; }
  if (val && 'r' in val) { const k = key(val); if (!tokens[k] || /^(text|surface|bg|border|brand|status)/.test(v.name)) tokens[k] = tokens[k] || v; }
}
const col = (h) => { const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255, a = h.length > 6 ? parseInt(h.slice(6, 8), 16) / 255 : 1; return { r, g, b, a }; };
const paint = (h, scope) => {
  const c = col(h);
  let p = { type: 'SOLID', color: { r: c.r, g: c.g, b: c.b }, opacity: c.a };
  const v = tokens[h.length > 6 ? h : h + 'ff'];
  if (v) { try { p = figma.variables.setBoundVariableForPaint(p, 'color', v); } catch (e) {} }
  return p;
};
const grad = (g) => {
  const a = ((Math.round(g.angle / 90) * 90) % 360 + 360) % 360;
  const T = { 90: [[1, 0, 0], [0, 1, 0]], 180: [[0, 1, 0], [-1, 0, 1]], 0: [[0, -1, 1], [1, 0, 0]], 270: [[-1, 0, 1], [0, -1, 1]] }[a];
  return { type: 'GRADIENT_LINEAR', gradientTransform: T, gradientStops: g.stops.map((s) => { const c = col(s.c); return { position: Math.min(1, Math.max(0, s.p)), color: { r: c.r, g: c.g, b: c.b, a: c.a } }; }) };
};
const fx = (sh) => sh.map((s) => { const c = col(s.c); const e = { type: s.i ? 'INNER_SHADOW' : 'DROP_SHADOW', color: { r: c.r, g: c.g, b: c.b, a: c.a }, offset: { x: s.x, y: s.y }, radius: s.b, spread: s.s, visible: true, blendMode: 'NORMAL' }; if (!s.i) e.showShadowBehindNode = false; return e; });
const radii = (n, r) => { if (!r) return; const [a, b, c, d] = r; if (a === b && b === c && c === d) n.cornerRadius = a; else { n.topLeftRadius = a; n.topRightRadius = b; n.bottomRightRadius = c; n.bottomLeftRadius = d; } };
const strokes = (n, bw, bc) => {
  if (!bw) return;
  const c = bc.find(Boolean); if (!c) return;
  n.strokes = [paint(c)]; n.strokeAlign = 'INSIDE';
  if (bw.every((w) => w === bw[0])) n.strokeWeight = bw[0];
  else { n.strokeTopWeight = bw[0]; n.strokeRightWeight = bw[1]; n.strokeBottomWeight = bw[2]; n.strokeLeftWeight = bw[3]; }
};
const fonts = {};
const font = async (ff, fw, it) => {
  let style = fw + (it ? ' Italic' : '');
  const k = ff + '|' + style;
  if (!(k in fonts)) { try { await figma.loadFontAsync({ family: ff, style }); fonts[k] = { family: ff, style }; } catch (e) { const f = { family: ff, style: fw }; try { await figma.loadFontAsync(f); fonts[k] = f; } catch (e2) { await figma.loadFontAsync({ family: 'Geist', style: 'Regular' }); fonts[k] = { family: 'Geist', style: 'Regular' }; } } }
  return fonts[k];
};
const logos = {};
const logo = async (k) => { if (!(k in logos)) logos[k] = await figma.getNodeByIdAsync(D.logos[k]); return logos[k]; };
const made = [];
let root = null;
for (let i = 0; i < D.nodes.length; i++) {
  const d = D.nodes[i];
  const parent = d.p < 0 ? page : made[d.p];
  if (!parent) { made[i] = null; continue; }
  let n = null;
  try {
    if (d.t === 'F') {
      n = figma.createFrame();
      n.name = d.n || 'frame';
      n.resize(Math.max(0.01, d.w), Math.max(0.01, d.h));
      n.fills = d.gr ? [grad(d.gr)] : d.bg ? [paint(d.bg)] : [];
      radii(n, d.rad); strokes(n, d.bw, d.bc || []);
      if (d.sh) {
        // A spread shadow around an empty box (e.g. the tour spotlight) draws nothing in Figma: use outside strokes instead.
        const empty = !d.bg && !d.gr && !d.bw;
        const spreads = empty ? d.sh.filter((x) => !x.i && x.s > 0 && !x.b) : [];
        if (spreads.length) {
          const big = spreads.reduce((a, x) => (x.s > a.s ? x : a));
          const ring = spreads.find((x) => x !== big);
          { const S = 3000, w = d.w, h = d.h; for (const [x, y, rw, rh] of [[-S, -S, 2 * S + w, S], [-S, h, 2 * S + w, S], [-S, 0, S, h], [w, 0, S, h]]) { const sr = figma.createRectangle(); sr.name = 'scrim'; sr.resize(rw, rh); sr.fills = [paint(big.c)]; n.appendChild(sr); sr.x = x; sr.y = y; } }
          if (ring) { const rf = figma.createFrame(); rf.name = 'ring'; rf.resize(Math.max(0.01, d.w), Math.max(0.01, d.h)); rf.fills = []; radii(rf, d.rad); rf.strokes = [paint(ring.c)]; rf.strokeAlign = 'OUTSIDE'; rf.strokeWeight = ring.s; n.appendChild(rf); rf.x = 0; rf.y = 0; }
          const rest = d.sh.filter((x) => !spreads.includes(x)); if (rest.length) n.effects = fx(rest);
        } else n.effects = fx(d.sh);
      }
      n.clipsContent = !!d.clip;
      if (d.op != null) n.opacity = d.op;
      if (d.bb) n.effects = [...n.effects, { type: 'BACKGROUND_BLUR', blurType: 'NORMAL', radius: d.bb, visible: true }];
      if (d.sy || d.sx) { n.clipsContent = true; n.overflowDirection = d.sy && d.sx ? 'BOTH' : d.sy ? 'VERTICAL' : 'HORIZONTAL'; }
    } else if (d.t === 'T') {
      n = figma.createText();
      n.fontName = await font(d.st.ff, d.st.fw, d.st.it);
      n.characters = d.s;
      n.fontSize = d.st.fs;
      if (d.st.lh) n.lineHeight = { unit: 'PIXELS', value: d.st.lh };
      if (d.st.ls) n.letterSpacing = { unit: 'PIXELS', value: d.st.ls };
      n.fills = [paint(d.st.c)];
      if (d.st.up) n.textCase = 'UPPER';
      if (d.st.ul) n.textDecoration = 'UNDERLINE';
      const al = { center: 'CENTER', right: 'RIGHT', end: 'RIGHT', justify: 'JUSTIFIED' }[d.st.al]; if (al) n.textAlignHorizontal = al;
      if (d.tr) { n.textAutoResize = 'NONE'; n.resize(Math.max(1, d.w), Math.max(1, d.h)); n.textTruncation = 'ENDING'; n.maxLines = 1; }
      else if (d.cl) { n.resize(Math.max(1, d.w + 1), Math.max(1, d.h)); n.textAutoResize = 'HEIGHT'; n.textTruncation = 'ENDING'; n.maxLines = d.cl; }
      else if (d.ml) { n.resize(Math.max(1, d.w + 2), Math.max(1, d.h)); n.textAutoResize = 'HEIGHT'; }
      else n.textAutoResize = 'WIDTH_AND_HEIGHT';
      n.name = d.s.slice(0, 40);
    } else if (d.t === 'I') {
      n = figma.createRectangle();
      n.name = d.n || 'image';
      n.resize(Math.max(0.01, d.w), Math.max(0.01, d.h));
      const h = D.hashes[d.k];
      n.fills = h ? [{ type: 'IMAGE', imageHash: h, scaleMode: d.fit === 'contain' ? 'FIT' : 'FILL' }] : [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.92 } }];
      radii(n, d.rad); strokes(n, d.bw, d.bc ? [d.bc] : []);
      if (d.op != null) n.opacity = d.op;
    } else if (d.t === 'S') {
      n = figma.createNodeFromSvg(D.svgs[d.k]);
      n.name = d.n || 'icon';
      n.clipsContent = false;
      if (Math.abs(n.width - d.w) > 0.5 || Math.abs(n.height - d.h) > 0.5) n.resize(Math.max(0.01, d.w), Math.max(0.01, d.h));
    } else if (d.t === 'L') {
      const c = await logo(d.k);
      if (c) {
        n = c.createInstance();
        const s = Math.min(d.w / n.width, d.h / n.height);
        n.rescale(s);
        n.name = 'Logo/' + d.k;
        parent.appendChild(n);
        n.x = d.x + (d.w - n.width) / 2; n.y = d.y + (d.h - n.height) / 2;
        made[i] = null; continue;
      }
    }
    if (n) {
      parent.appendChild(n);
      if (d.p < 0) { n.x = P.x; n.y = P.y; n.name = P.name; root = n; }
      else { n.x = d.x; n.y = d.y; }
    }
  } catch (e) { errs.push(i + ' ' + d.t + ' ' + String(e).slice(0, 120)); }
  made[i] = n && n.type === 'FRAME' && d.t === 'F' ? n : null;
}
if (root) { try { root.setExplicitVariableModeForCollection(coll, MODE); } catch (e) { errs.push('mode ' + String(e).slice(0, 80)); } }
return { id: root && root.id, nodes: D.nodes.length, errs: errs.slice(0, 15), errCount: errs.length };
