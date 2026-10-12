const page = await figma.getNodeByIdAsync(PAGE); await figma.setCurrentPageAsync(page);
const secs = page.children.filter(n => n.type === 'SECTION' && /^(📱 )?[1-6] ·/.test(n.name));
const G = { D: {}, M: {} };
for (const s of secs) for (const f of s.children.filter(n => n.type === 'FRAME')) { const code = f.name.match(/^(\d\.\d)/); if (code) G[s.name.startsWith('📱') ? 'M' : 'D'][code[1]] = f; }
const ROUTES = { D: { dashboard: '2.1', new: '3.1', calendar: '2.2', queue: '4.1', library: '5.1', quality: '5.2', accounts: '6.1', settings: '6.2' }, M: { dashboard: '2.1', new: '3.1', calendar: '2.6', queue: '4.1', library: '5.1', quality: '5.2', accounts: '6.1', settings: '6.2' } };
const tr = { type: 'DISSOLVE', easing: { type: 'EASE_OUT' }, duration: 0.2 };
const R = (dest) => [{ trigger: { type: 'ON_CLICK' }, actions: [{ type: 'NODE', destinationId: dest.id, navigation: 'NAVIGATE', transition: tr, preserveScrollPosition: false, resetScrollPosition: true }] }];
const plan = new Map(); // node -> dest
const miss = [];
// clickable ancestor: first frame up from text that has fill/stroke or is a link, and is at least minW wide
const hitOf = (t, root, minW, nm, direct) => { if (direct && t.parent && t.parent.type === 'FRAME' && t.parent !== root) { const p = t.parent; if (p.children.filter(c => c.type === 'TEXT').length === 1 && p.children.length <= 2) return p; const nmH = 'hotspot · ' + t.characters.trim(); let h = p.children.find(c => c.name === nmH); if (!h) { h = figma.createFrame(); h.name = nmH; h.fills = []; p.appendChild(h); h.resize(t.width + 20, Math.max(t.height + 12, 28)); h.x = Math.max(0, t.x - 10); h.y = Math.max(0, t.y + t.height / 2 - h.height / 2); } return h; } let n = t.parent; while (n && n !== root) { if (n.type === 'FRAME' && (nm ? nm.test(n.name) : n.width >= minW && (n.fills.length || n.strokes.length || /→|^link/.test(n.name)))) return n; n = n.parent; } return null; };
const RULES = [
  // [group, from codes ('*' = all), text regex, to code, {nth:'first'|'last'|'all', minW}]
  ['B', ['1.1'], /^Continue to setup check$/, '1.2'],
  ['B', ['1.2'], /^Schedule a test post/, '3.1'],
  ['B', ['1.3'], /^Take the tour$/, '1.4'],
  ['B', ['1.4'], /^Next$/, '2.1'],
  ['B', '*', /^Demo$/, '1.3'],
  ['B', '*', /^New post$/, '3.1'],
  ['D', '*', /^Northline Social$/, '2.4', { minW: 30 }],
  ['D', ['1.3', '2.1', '2.4', '2.5'], /^Open calendar$/, '2.2'],
  ['M', ['1.3', '2.1', '2.4', '2.5'], /^Open calendar$/, '2.6'],
  ['B', ['1.3', '2.1', '2.4', '2.5'], /^Run quality test$/, '5.2'],
  ['B', ['1.3', '2.1', '2.4', '2.5', '4.1'], /^Post now$/, '4.3', { nth: 'first' }],
  ['D', ['1.3', '2.1', '2.4', '2.5', '4.1'], /^● Ready$|^○ Scheduled$/, '4.2', { nth: 'all', minW: 500 }],
  ['M', ['1.3', '2.1', '2.4', '2.5', '4.1'], /^● Ready$|^○ Scheduled$/, '4.2', { nth: 'all', minW: 300 }],
  ['B', ['2.2', '2.6'], /^Week$/, '2.3', { nth: 'first', direct: true }], ['B', ['2.3', '2.6'], /^Month$/, '2.2', { nth: 'first', direct: true }], ['B', ['2.2', '2.3'], /^List$/, '2.6', { nth: 'first', direct: true }],
  ['B', ['2.4'], /Coffee|Rivera|Riverside|Grace|Low Tide/, '2.5', { minW: 120 }],
  ['M', ['2.7'], /^Library$/, '5.1', { minW: 200 }], ['M', ['2.7'], /^Quality$/, '5.2', { minW: 200 }],
  ['M', ['2.7'], /^Accounts$/, '6.1', { minW: 200 }], ['M', ['2.7'], /^Settings$/, '6.2', { minW: 200 }],
  ['M', ['2.7'], /^Take the tour$/, '1.4', { minW: 200 }], ['M', ['2.7'], /^Welcome card$/, '1.3', { minW: 200 }],
  ['M', ['2.7'], /^Close$/, '2.1'],
  ['B', ['3.1'], /^Choose file$/, '3.2'], ['B', ['3.1'], /^Pick from Library$/, '3.2'],
  ['B', ['3.1', '3.2', '3.3', '3.4', '3.5'], /^Video$/, '3.2', { nth: 'first' }],
  ['B', ['3.1', '3.2', '3.3', '3.4', '3.5'], /^Photos$/, '3.3', { nth: 'first' }],
  ['B', ['3.1', '3.2', '3.3', '3.4', '3.5'], /^Story$/, '3.4', { nth: 'first' }],
  ['B', ['3.2'], /^Schedule to \d platforms$/, '3.5'],
  ['B', ['3.3', '3.4', '3.5'], /^Schedule to \d platforms$/, '4.1'],
  ['B', ['3.2', '3.3', '3.4', '3.5'], /^Post now$/, '4.4', { nth: 'first' }],
  ['B', ['4.2'], /^Post now$/, '4.4'], ['B', ['4.2'], /^Edit$/, '3.2'],
  ['B', ['4.3'], /^Post now$/, '4.4', { nth: 'last' }], ['B', ['4.3'], /^Cancel$/, '4.1'],
  ['B', ['5.2'], /^Benchmark$/, '5.3'], ['B', ['5.3'], /^Compare$/, '5.2'],
];
// clear old reactions
for (const g of ['D', 'M']) for (const f of Object.values(G[g])) for (const n of [f, ...f.findAll(n => 'reactions' in n && n.reactions.length)]) if (n.reactions && n.reactions.length) await n.setReactionsAsync([]);
// 1. nav links
let nav = 0;
for (const g of ['D', 'M']) for (const f of Object.values(G[g])) for (const n of f.findAll(n => n.type === 'FRAME' && / →([a-z]+)$/.test(n.name))) {
  const r = n.name.match(/ →([a-z]+)$/)[1]; const code = ROUTES[g][r]; const dest = code && G[g][code];
  if (dest && dest !== f) { plan.set(n, dest); nav++; }
}
// 2. rules (rules override nav)
// phone hotspots: More tab + account button were captured without a box
let hs = 0;
for (const f of Object.values(G.M)) {
  const tb = f.findOne(n => n.type === 'FRAME' && n.name.startsWith('#tabbar'));
  if (tb) { let h = tb.children.find(n => n.name === 'hotspot · More'); const q = tb.children.find(n => / →queue$/.test(n.name));
    if (!h && q) { h = figma.createFrame(); h.name = 'hotspot · More'; h.fills = []; tb.appendChild(h); h.resize(78, q.height); h.x = q.x + 78; h.y = q.y; }
    if (h && f !== G.M['2.7']) { plan.set(h, G.M['2.7']); hs++; } }
  const nmF = f.findOne(n => n.type === 'FRAME' && n.name === '.m-acct-name');
  if (nmF) { const bar = nmF.parent; let h = bar.children.find(n => n.name === 'hotspot · Account');
    if (!h) { h = figma.createFrame(); h.name = 'hotspot · Account'; h.fills = []; bar.appendChild(h); h.resize(nmF.x + nmF.width + 20 - 8, Math.max(36, nmF.height + 16)); h.x = 8; h.y = nmF.y + nmF.height / 2 - h.height / 2; }
    if (f !== G.M['2.4']) { plan.set(h, G.M['2.4']); hs++; } }
}
let rule = 0;
for (const [grp, froms, re, to, o = {}] of RULES) for (const g of grp === 'B' ? ['D', 'M'] : [grp]) {
  const dest = G[g][to]; if (!dest) { miss.push(g + ' no dest ' + to); continue; }
  const codes = froms === '*' ? Object.keys(G[g]) : froms;
  for (const c of codes) {
    const f = G[g][c]; if (!f || f === dest) continue;
    const ts = f.findAll(n => n.type === 'TEXT' && re.test(n.characters.trim()));
    if (!ts.length) { if (froms !== '*') miss.push(`${g} ${c} ${re}`); continue; }
    const pick = o.nth === 'all' ? ts : o.nth === 'last' ? [ts[ts.length - 1]] : [ts[0]];
    for (const t of pick) { const h = hitOf(t, f, o.minW || 0, o.nm, o.direct); if (h) { plan.set(h, dest); rule++; } else miss.push(`${g} ${c} no hit ${re}`); }
  }
}
for (const [n, dest] of plan) await n.setReactionsAsync(R(dest));
// flows
const flows = [['1 · Full journey (from onboarding)', G.D['1.1']], ['2 · Daily use (dashboard)', G.D['2.1']], ['3 · Create a post', G.D['3.1']], ['📱 1 · Full journey — phone', G.M['1.1']], ['📱 2 · Daily use — phone', G.M['2.1']], ['📱 3 · Create a post — phone', G.M['3.1']]].filter(x => x[1]).map(([name, f]) => ({ nodeId: f.id, name }));
page.flowStartingPoints = flows;
return { hs, nav, rule, total: plan.size, miss, flows: flows.length, D: Object.keys(G.D).length, M: Object.keys(G.M).length };
