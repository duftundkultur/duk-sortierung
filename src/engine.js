// Sortier-Motor: reine Funktion, kein Shopify-Zugriff.
// Eingabe: Produkte einer Kollektion (in der aktuellen Reihenfolge) + Regel der Marke.
// Ausgabe: Zielreihenfolge + Begründung je Produkt + Hinweise für den Bericht.
//
// Ablauf
//   1. Regelordnung je Muster (A Serien, B Typ-Blöcke, C A–Z) – Blöcke, im Block nach Duftname
//   2. Allgemeine Regeln (Teil 1, entschieden 11.10.2026) darüber:
//      Pin mit Ablaufdatum → Neu (Tag „neu“) → Saison → Regelplatz → … → Ausverkauft ans Ende
//      Ausverkauft schlägt Neu und Pin. Nicht sichtbare Produkte bleiben am Ende ihres Blocks.

import { makeParser, compareText, clean, isFragrance, isDiscovery, FRAGRANCE_TYPES } from './titles.js';
import { SETTINGS, TYPE_ORDER } from './rules.js';

const STATUS_RANK = { ACTIVE: 0, UNLISTED: 2, DRAFT: 4, ARCHIVED: 5 };

/* ------------------------------------------------------------------------------------------- */
/* Hilfen                                                                                       */
/* ------------------------------------------------------------------------------------------- */

const typeRank = (type) => { const i = TYPE_ORDER.indexOf(type); return i < 0 ? TYPE_ORDER.length : i; };

function visRank(p, settings) {
  if (p.status !== 'ACTIVE') return STATUS_RANK[p.status] ?? 6;
  if (!p.published) return 3;
  if (settings.imageRule && p.image && !goodImage(p.image, settings)) return 1;
  if (settings.imageRule && !p.image) return 1;
  return 0;
}
const goodImage = (img, settings) => img && img.w > 0 && img.h > 0 && Math.abs(img.w / img.h - settings.imageRatio) <= settings.imageTolerance;

function sizeRank(parsed) {
  if (parsed.large) return [1, parsed.size || 0];
  if (parsed.mini) return [2, -(parsed.size || 0)];
  return [0, 0];
}

// Saisonfenster „MM-DD“ bis „MM-DD“, auch über den Jahreswechsel (11-01 … 01-06)
export function seasonActive(win, today) {
  if (!win) return false;
  const md = today.slice(5, 10);
  return win.from <= win.to ? md >= win.from && md <= win.to : md >= win.from || md <= win.to;
}

/* ------------------------------------------------------------------------------------------- */
/* Blöcke                                                                                       */
/* ------------------------------------------------------------------------------------------- */

// Blockangabe in der Regeldatei: 'Duftkerze' | ['Eau de Parfum', 'Extrait de Parfum'] | { types, mini, series, title, … }
function normBlock(spec, i) {
  if (typeof spec === 'string') spec = { types: [spec] };
  else if (Array.isArray(spec)) spec = { types: spec };
  const b = {
    i,
    label: spec.label || null,
    types: spec.types ? new Set(spec.types) : null,
    typeList: spec.types || [],
    mini: spec.mini,
    series: spec.series ? [].concat(spec.series) : null,
    title: spec.title ? new RegExp(spec.title, 'i') : null,
    discovery: spec.discovery,
    fragrance: spec.fragrance,
    notInSeries: spec.notInSeries,
    any: spec.any,
    lead: spec.lead || [],
    order: spec.order || 'scent', // scent | type | title | live
    typeOrder: spec.typeOrder || null,
    max: spec.max || null,
  };
  if (!b.label) {
    b.label = b.series ? `Serie ${b.series.join('/')}` : b.discovery ? 'Discovery Sets' : b.typeList.length ? b.typeList.join(' + ') : b.fragrance ? 'Düfte' : 'Weitere';
    if (b.mini === true) b.label += ' (klein)';
    if (b.title) b.label += ` „${spec.title}“`;
  }
  return b;
}

function matches(b, p, ctx) {
  let score = 0;
  if (b.types) { if (!b.types.has(p.type)) return -1; score += 1; }
  if (b.mini !== undefined) { if (Boolean(p.parsed.mini) !== b.mini) return -1; score += 1; }
  if (b.series) { if (!p.series.some((s) => b.series.includes(s))) return -1; score += 2; }
  if (b.title) { if (!b.title.test(p.title.replace(/\u00ad/g, ''))) return -1; score += 2; }
  if (b.discovery !== undefined) { if (isDiscovery(p.type, p.title) !== b.discovery) return -1; score += 1; }
  if (b.fragrance) { if (!isFragrance(p.type)) return -1; }
  if (b.notInSeries) { if (p.series.some((s) => ctx.brandSeries.has(s))) return -1; score += 1; }
  if (!b.types && !b.series && !b.title && b.discovery === undefined && !b.fragrance && !b.any) return -1;
  return score;
}

// Zugpferd (lead): Duftname gleich oder beginnt mit dem Namen aus der Regel („Forêts“, „Bois Impérial“)
function leadIndex(p, lead) {
  const s = clean(p.parsed.scent).toLowerCase();
  const i = lead.findIndex((l) => s === l || s.startsWith(`${l} `));
  return i < 0 ? lead.length : i;
}

// Klassiker: Duftnamen der Produkte mit Tag „klassiker“ (aus der Kollektion selbst und aus opts.classics, damit z. B.
// das Raumspray Baies auch dann zählt, wenn nur die Kerze Baies das Tag trägt). „Aramara“ passt zu „Aramara Stile“.
function classicKeys(list, parse) {
  return [...new Set(list.map((x) => clean(parse(x.title, x.type).scent).toLowerCase()).filter((k) => k.length >= 3))];
}
function isClassic(p, keys) {
  const s = clean(p.parsed.scent).toLowerCase();
  if (s.length < 3) return false;
  return keys.some((k) => s === k || s.startsWith(`${k} `) || k.startsWith(`${s} `));
}

function blockComparator(b, settings) {
  const lead = b.lead.map((s) => clean(s).toLowerCase());
  const leadRank = (p) => leadIndex(p, lead);
  const inTypes = (t) => { const i = b.typeList.indexOf(t); return i < 0 ? b.typeList.length : i; };
  const typeOrderRank = (t) => { if (!b.typeOrder) return 0; const i = b.typeOrder.indexOf(t); return i < 0 ? b.typeOrder.length : i; };
  const conc = (t) => { if (b.typeList.length > 1) return inTypes(t); const i = FRAGRANCE_TYPES.indexOf(t); return i < 0 ? FRAGRANCE_TYPES.length + typeRank(t) : i; };
  return (x, y) => {
    const keys = [
      [x.vis, y.vis],
      [x.isDS ? 0 : 1, y.isDS ? 0 : 1],
      [typeOrderRank(x.type), typeOrderRank(y.type)],
      [leadRank(x), leadRank(y)],
      [x.classic ? 0 : 1, y.classic ? 0 : 1], // Klassiker nach dem Zugpferd vorne im Block
      [x.seriesRank || 0, y.seriesRank || 0],
    ];
    if (b.order === 'live') keys.push([x.idx, y.idx]);
    keys.push([x.parsed.refill ? 1 : 0, y.parsed.refill ? 1 : 0]); // im Block erst die Produkte, dann ihre Füllungen
    if (b.order === 'type') keys.push([inTypes(x.type), inTypes(y.type)]);
    for (const [a, c] of keys) if (a !== c) return a - c;
    if (b.order === 'title') return compareText(x.title, y.title) || x.idx - y.idx;
    const s = compareText(x.parsed.scent, y.parsed.scent); if (s) return s;
    const la = x.parsed.line ? 1 : 0, lb = y.parsed.line ? 1 : 0; if (la !== lb) return la - lb;
    if (x.parsed.line !== y.parsed.line) return compareText(x.parsed.line, y.parsed.line);
    const ca = conc(x.type), cb = conc(y.type); if (ca !== cb) return ca - cb;
    const [sa, va] = sizeRank(x.parsed), [sb, vb] = sizeRank(y.parsed); if (sa !== sb) return sa - sb; if (va !== vb) return va - vb;
    return compareText(x.title, y.title) || x.idx - y.idx;
  };
}

/* ------------------------------------------------------------------------------------------- */
/* Muster                                                                                       */
/* ------------------------------------------------------------------------------------------- */

function blocksFor(rule, products) {
  const p = rule.pattern || 'C';
  if (p === 'B') {
    const specs = rule.blocks || [];
    const hasDS = specs.some((s) => (typeof s === 'string' ? s === 'Discovery Set' : Array.isArray(s) ? s.includes('Discovery Set') : s.discovery || (s.types || []).includes('Discovery Set')));
    const withLead = (s) => { const o = typeof s === 'string' ? { types: [s] } : Array.isArray(s) ? { types: s } : s; return rule.lead && !o.lead ? { ...o, lead: rule.lead } : o; };
    return [...(hasDS ? [] : [{ discovery: true }]), ...specs.map(withLead)];
  }
  if (p === 'L') return [{ any: true, order: 'live', label: 'Reihenfolge wie bisher' }]; // Platzhalter, bis die Marke eine Regel hat
  if (p === 'A') {
    return [
      { discovery: true, notInSeries: true, label: 'Discovery Sets der Marke' },
      ...(rule.series || []).map((s) => ({ series: s, label: `Serie ${s}`, lead: rule.lead, ...(rule.seriesBlock || {}) })),
      { fragrance: true, label: 'Düfte ohne Serie' },
      { any: true, label: 'Weitere Produkte' },
    ];
  }
  // C: Discovery Sets → Bestseller (höchstens drei) → Düfte A–Z (Konzentrationen beisammen) → übrige Arten je Block
  const others = [...new Set(products.filter((x) => !isFragrance(x.type) && !isDiscovery(x.type, x.title)).map((x) => x.type))]
    .sort((a, b) => typeRank(a) - typeRank(b) || compareText(a, b));
  return [
    { discovery: true },
    { fragrance: true, label: 'Düfte', lead: rule.lead },
    ...others.map((t) => ({ types: [t], lead: rule.lead })),
  ];
}

/* ------------------------------------------------------------------------------------------- */
/* Hauptfunktion                                                                                */
/* ------------------------------------------------------------------------------------------- */

export function sortCollection(input, rule = {}, opts = {}) {
  const settings = { ...SETTINGS, ...(opts.settings || {}) };
  const today = opts.today || new Date().toISOString().slice(0, 10);
  const kind = opts.kind || 'brand';
  const notes = [];
  const note = (p, kindOf, msg) => notes.push({ id: p?.id ?? null, title: p?.title ?? '', kind: kindOf, msg });

  const extra = opts.classics || [];
  const parse = makeParser([...new Set([...input, ...extra].map((x) => x.type))]);
  const products = input.map((x, idx) => {
    const tags = new Set((x.tags || []).map((t) => String(t).toLowerCase()));
    const parsed = parse(x.title, x.type);
    return { ...x, idx, tags, parsed, series: x.series || [], isDS: isDiscovery(x.type, x.title), visible: x.status === 'ACTIVE' && x.published !== false };
  });
  const keys = classicKeys([...products.filter((p) => p.tags.has(settings.classicTag)), ...extra], parse);
  for (const p of products) p.classic = !p.isDS && isClassic(p, keys);
  for (const p of products) p.vis = visRank(p, settings);
  const byTitle = new Map(products.map((p) => [compareKey(p.title), p]));
  const brandSeries = new Set(rule.series || []);
  const ctx = { brandSeries };

  // 1. Refills, die hinter ihrem Mutterprodukt stehen
  const refillMode = (p) => {
    const r = rule.refills;
    if (!r) return 'block';
    if (typeof r === 'string') return r;
    return r[p.type] || r.default || 'block';
  };
  const attachedTo = new Map(); // parentId → [refill]
  const attached = new Set();
  for (const p of products) {
    if (!p.parsed.refill || refillMode(p) !== 'after-parent') continue;
    const parent = byTitle.get(compareKey(p.parsed.parentTitle));
    if (parent && parent !== p) {
      if (!attachedTo.has(parent.id)) attachedTo.set(parent.id, []);
      attachedTo.get(parent.id).push(p);
      attached.add(p.id);
    } else if (p.visible) note(p, 'refill-ohne-mutter', `Kein Mutterprodukt „${p.parsed.parentTitle}“ in der Kollektion – steht im eigenen Block`);
  }

  // Muster A: Extrait, Haarparfum, Travel Size ohne eigene Serie gehören zur Serie des gleichnamigen Dufts (BDK)
  if (rule.pattern === 'A') {
    const seriesByScent = new Map();
    for (const p of products) {
      if (!isFragrance(p.type)) continue;
      const s = p.series.find((x) => brandSeries.has(x));
      if (s && !seriesByScent.has(scentKey(p))) seriesByScent.set(scentKey(p), s);
    }
    for (const p of products) {
      if (!isFragrance(p.type) || p.series.some((x) => brandSeries.has(x))) continue;
      const s = seriesByScent.get(scentKey(p));
      if (s) p.series = [...p.series, s];
    }
  }

  // Muster C mit seriesLast: Düfte der Hauptlinie zuerst, kleine Serien danach als Block (Héritage Berbère: Oasis, Obvious: High Standards)
  if (rule.pattern === 'C' && rule.seriesLast) {
    const order = [...new Set(products.flatMap((p) => p.series))].sort();
    for (const p of products) p.seriesRank = p.series.length ? 1 + order.indexOf(p.series[0]) : 0;
  }

  // 2. Blöcke zuordnen (spezifischster Treffer gewinnt, bei Gleichstand der erste)
  const blocks = blocksFor(rule, products).map(normBlock);
  const rest = { i: blocks.length, label: 'Ohne Regel', lead: [], typeList: [], order: 'scent', typeOrder: null, unplaced: true };
  const members = new Map(blocks.map((b) => [b, []]));
  members.set(rest, []);
  for (const p of products) {
    if (attached.has(p.id)) continue;
    let best = null; let bestScore = -1;
    for (const b of blocks) { const s = matches(b, p, ctx); if (s > bestScore) { best = b; bestScore = s; } }
    if (!best) { members.get(rest).push(p); if (p.visible) note(p, 'ohne-regel', `Produktart „${p.type}“ hat in der Regel keinen Block – steht am Ende`); continue; }
    members.get(best).push(p);
  }

  // 3. Muster C: bis zu drei Bestseller nach den Discovery Sets
  let bestsellerBlock = null;
  if ((rule.pattern || 'C') === 'C') {
    bestsellerBlock = { i: 0.5, label: 'Bestseller', lead: [], typeList: [], order: 'scent', typeOrder: null };
    const cands = [];
    for (const b of blocks) {
      if (b.discovery) continue;
      const list = members.get(b).slice().sort(blockComparator(b, settings));
      for (const p of list) if (p.bestseller && p.visible && p.available) cands.push(p);
    }
    const max = rule.bestsellerMax ?? settings.bestsellerMax;
    const take = cands.slice(0, max);
    if (cands.length > max) note(null, 'bestseller-zu-viele', `${cands.length} Bestseller, vorne stehen nur ${max}: ${take.map((p) => p.title).join(', ')}`);
    for (const b of blocks) members.set(b, members.get(b).filter((p) => !take.includes(p)));
    members.set(bestsellerBlock, take);
  }

  // 4. Regelordnung: Blöcke in Folge, im Block sortiert, Refills hinter ihr Mutterprodukt
  const ordered = [...blocks, ...(bestsellerBlock ? [bestsellerBlock] : []), rest].sort((a, b) => a.i - b.i);
  const ruleOrder = [];
  const group = new Map();
  for (const b of ordered) {
    const list = members.get(b) || [];
    if (!list.length) continue;
    list.sort(blockComparator(b, settings));
    for (const p of list) {
      ruleOrder.push(p); group.set(p.id, b.label);
      for (const r of (attachedTo.get(p.id) || []).sort((x, y) => x.vis - y.vis || compareText(x.title, y.title))) { ruleOrder.push(r); group.set(r.id, `${b.label} (Refill)`); }
    }
    if (b.max && list.length > b.max) note(null, 'block-voll', `${b.label}: ${list.length} statt höchstens ${b.max}`);
  }

  // 5. Allgemeine Regeln
  for (const p of products) {
    if (p.tags.has(settings.pinTag) && !validDate(p.pinUntil)) note(p, 'pin-ohne-datum', 'Tag „pin“ ohne Datum im Feld „Pin bis“ – wird nicht gepinnt');
    if (p.visible && settings.imageRule && p.vis === 1) note(p, 'bild', 'Erstes Bild ist kein 6:7-Packshot – steht am Ende seines Blocks');
  }
  const pinned = (p) => p.visible && p.available && validDate(p.pinUntil) && p.pinUntil >= today;
  const isNew = (p) => kind === 'brand' && p.visible && p.available && p.tags.has(settings.neuTag) && (settings.neuRefills || !p.parsed.refill);
  const activeSeasons = Object.entries(settings.seasons || {}).filter(([, w]) => seasonActive(w, today)).map(([tag]) => tag);
  const inSeason = (p) => kind === 'brand' && p.visible && p.available && activeSeasons.some((t) => p.tags.has(t));
  const soldOut = (p) => p.visible && !p.available;

  const front = [];
  const used = new Set();
  const take = (pred, label) => { for (const p of ruleOrder) if (!used.has(p.id) && !soldOut(p) && pred(p)) { front.push(p); used.add(p.id); group.set(p.id, label); } };
  take(pinned, 'Pin');
  // Neu: jüngster Veröffentlichungstag zuerst, am selben Tag die Regelordnung (ein Launch bleibt beisammen)
  const newStart = front.length;
  take(isNew, 'Neu');
  const newOnes = front.splice(newStart).map((p, k) => ({ p, k })).sort((a, b) => pubDay(b.p).localeCompare(pubDay(a.p)) || a.k - b.k).map((x) => x.p);
  front.push(...newOnes);
  take(inSeason, 'Saison');
  const middle = ruleOrder.filter((p) => !used.has(p.id) && !soldOut(p));
  const tail = ruleOrder.filter((p) => !used.has(p.id) && soldOut(p));
  for (const p of tail) group.set(p.id, `Ausverkauft · ${group.get(p.id)}`);
  const final = [...front, ...middle, ...tail];

  if (final.length !== products.length || new Set(final.map((p) => p.id)).size !== products.length) throw new Error('Sortierung hat Produkte verloren oder verdoppelt');
  return {
    order: final.map((p) => p.id),
    groups: Object.fromEntries(final.map((p) => [p.id, group.get(p.id)])),
    notes,
    classic: products.filter((p) => p.classic).map((p) => p.id),
  };
}

const scentKey = (p) => `${p.parsed.scent.toLowerCase()}|${p.parsed.line.toLowerCase()}`;
const compareKey = (t) => String(t || '').replace(/­/g, '').replace(/[“”„"«»]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();
const validDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d);
// Veröffentlichungstag in Wien (für die Reihenfolge der Neuheiten); ohne Datum ganz hinten
const pubDay = (p) => (p.publishedAt ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(p.publishedAt)) : '');

/* ------------------------------------------------------------------------------------------- */
/* Vergleich alt ↔ neu (für Bericht und Trockenlauf)                                           */
/* ------------------------------------------------------------------------------------------- */

// Sichtbare Reihenfolge vergleichen: wie viele Produkte stehen anders, welche springen am weitesten
export function diffOrders(current, target, visibleIds) {
  const vis = visibleIds ? (id) => visibleIds.has(id) : () => true;
  const a = current.filter(vis), b = target.filter(vis);
  const posA = new Map(a.map((id, i) => [id, i]));
  const moves = b.map((id, i) => ({ id, from: posA.get(id), to: i })).filter((m) => m.from !== m.to);
  // wie viele Produkte müssen tatsächlich umziehen (Rest bleibt in seiner Reihenfolge) = n − längste aufsteigende Teilfolge
  const seq = b.map((id) => posA.get(id)).filter((x) => x !== undefined);
  const tails = [];
  for (const x of seq) { let lo = 0, hi = tails.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (tails[mid] < x) lo = mid + 1; else hi = mid; } tails[lo] = x; }
  return { same: moves.length === 0, changedFull: current.join() !== target.join(), moved: moves.length, displaced: seq.length - tails.length, total: b.length, moves };
}

/* ------------------------------------------------------------------------------------------- */
/* Züge für collectionReorderProducts                                                           */
/* ------------------------------------------------------------------------------------------- */

// Möglichst wenige Züge: die längste Teilfolge, die schon richtig liegt, bleibt stehen; alle anderen
// wandern der Zielreihenfolge nach jeweils direkt hinter ihren Vorgänger. Shopify wendet die Züge
// nacheinander an, newPosition gilt jeweils für den Stand nach den vorigen Zügen.
export function planMoves(current, target) {
  if (current.length !== target.length) throw new Error('planMoves: unterschiedliche Produktmengen');
  const pos = new Map(current.map((id, i) => [id, i]));
  const seq = target.map((id) => { const p = pos.get(id); if (p === undefined) throw new Error(`planMoves: ${id} fehlt`); return p; });
  const tails = []; const prev = new Array(seq.length).fill(-1);
  for (let i = 0; i < seq.length; i++) {
    let lo = 0, hi = tails.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (seq[tails[mid]] < seq[i]) lo = mid + 1; else hi = mid; }
    if (lo > 0) prev[i] = tails[lo - 1];
    tails[lo] = i;
  }
  const kept = new Set();
  for (let k = tails.length ? tails[tails.length - 1] : -1; k >= 0; k = prev[k]) kept.add(target[k]);

  const arr = current.slice(); const moves = [];
  for (let i = 0; i < target.length; i++) {
    const id = target[i];
    if (kept.has(id)) continue;
    arr.splice(arr.indexOf(id), 1);
    const at = i === 0 ? 0 : arr.indexOf(target[i - 1]) + 1;
    arr.splice(at, 0, id);
    moves.push({ id, newPosition: at });
  }
  if (arr.every((x, i) => x === target[i])) return moves;
  // Sicherheitsnetz: Platz für Platz von vorne
  const a = current.slice(); const full = [];
  for (let i = 0; i < target.length; i++) if (a[i] !== target[i]) { a.splice(a.indexOf(target[i]), 1); a.splice(i, 0, target[i]); full.push({ id: target[i], newPosition: i }); }
  return full;
}

// Züge lokal nachspielen (für Tests und als Gegenprobe vor dem Schreiben)
export function simulateMoves(current, moves) {
  const arr = current.slice();
  for (const m of moves) { arr.splice(arr.indexOf(m.id), 1); arr.splice(Math.min(m.newPosition, arr.length), 0, m.id); }
  return arr;
}

/* ------------------------------------------------------------------------------------------- */
/* Kategorieseiten                                                                              */
/* ------------------------------------------------------------------------------------------- */
// Aufbau: Schaufenster (ab 40 sichtbaren Produkten: je Marke eines, in der Markenfolge) → Markenblöcke in der
// Markenfolge der Kategorie, im Block die Regel der Marke (Neu, Saison und Pin vorne im Block) → Ausverkauft
// (in Markenfolge) → nicht sichtbar. Kuratierte Seiten (Geschenke): Reihenfolge bleibt, nur Ausverkauftes ans Ende.

export const vendorKey = (v) => String(v || '').replace(/[’‘`´]/g, "'").toLowerCase().trim();

export function sortCategory(input, catRule = {}, opts = {}) {
  const settings = { ...SETTINGS, ...(opts.settings || {}) };
  const today = opts.today || new Date().toISOString().slice(0, 10);
  const notes = [];
  const group = new Map();
  const parseTitle = makeParser([...new Set(input.map((x) => x.type))]);
  const items = input.map((p, idx) => ({ ...p, idx, visible: p.status === 'ACTIVE' && p.published !== false, parsed: parseTitle(p.title, p.type) }));
  const soldOut = (p) => p.visible && !p.available;

  if (catRule.mode === 'curated') {
    const keep = items.filter((p) => p.visible && p.available);
    const so = items.filter(soldOut);
    const hidden = items.filter((p) => !p.visible);
    keep.forEach((p) => group.set(p.id, 'Handauswahl'));
    so.forEach((p) => group.set(p.id, 'Ausverkauft'));
    hidden.forEach((p) => group.set(p.id, 'Nicht sichtbar'));
    const order = [...keep, ...so, ...hidden];
    return { order: order.map((p) => p.id), groups: Object.fromEntries(group), notes };
  }

  // Neuheiten-Seiten: jüngster Veröffentlichungstag zuerst, am selben Tag Markenblöcke wie sonst; Ausverkauft und Unsichtbares ans Ende
  if (catRule.mode === 'new') {
    const live = items.filter((p) => p.visible && p.available);
    const days = [...new Set(live.map(pubDay))].sort().reverse();
    const order = [];
    for (const day of days) {
      const subset = input.filter((x) => live.some((p) => p.id === x.id && pubDay(p) === day));
      const res = sortCategory(subset, { mode: 'blocks', brandOrder: catRule.brandOrder, showcase: false }, opts);
      for (const id of res.order) { order.push(id); group.set(id, `Neu ${day || 'ohne Datum'} · ${res.groups[id] || ''}`); }
      notes.push(...res.notes);
    }
    const so = items.filter(soldOut).sort((a, b) => pubDay(b).localeCompare(pubDay(a)) || a.idx - b.idx);
    const hidden = items.filter((p) => !p.visible);
    so.forEach((p) => group.set(p.id, 'Ausverkauft'));
    hidden.forEach((p) => group.set(p.id, 'Nicht sichtbar'));
    const all = [...order, ...so.map((p) => p.id), ...hidden.map((p) => p.id)];
    if (all.length !== items.length || new Set(all).size !== items.length) throw new Error('Neuheiten-Sortierung hat Produkte verloren oder verdoppelt');
    return { order: all, groups: Object.fromEntries(group), notes, showcase: 0 };
  }

  // Markenfolge: Liste aus der Regel, unbekannte Marken dahinter A–Z (mit Hinweis)
  const brandOrder = (catRule.brandOrder || []).map(vendorKey);
  const vendors = [...new Set(items.map((p) => p.vendor))];
  const rank = (v) => { const i = brandOrder.indexOf(vendorKey(v)); return i < 0 ? brandOrder.length : i; };
  vendors.sort((a, b) => rank(a) - rank(b) || compareText(a, b));
  const unknown = vendors.filter((v) => rank(v) === brandOrder.length);
  if (unknown.length && items.some((p) => p.visible && unknown.includes(p.vendor))) notes.push({ id: null, title: '', kind: 'marke-ohne-platz', msg: `Nicht in der Markenfolge, steht hinten: ${unknown.join(', ')}` });

  // je Marke die Markenregel auf ihre Produkte dieser Kategorie
  const classicIds = new Set();
  const blocks = [];
  const soTail = [];
  const hiddenTail = [];
  for (const v of vendors) {
    const subset = items.filter((p) => p.vendor === v);
    const rule = (opts.brandRuleFor && opts.brandRuleFor(v)) || { pattern: 'C' };
    const res = sortCollection(subset, rule, { today, kind: 'brand', settings, classics: opts.classicsFor ? opts.classicsFor(v) : [] });
    for (const id of res.classic) classicIds.add(id);
    const byId = new Map(subset.map((p) => [p.id, p]));
    const block = [];
    for (const id of res.order) {
      const p = byId.get(id);
      if (!p.visible) hiddenTail.push(p);
      else if (!p.available) soTail.push(p);
      else block.push(p);
      group.set(id, `${v}${res.groups[id] && !/^Ausverkauft/.test(res.groups[id]) ? ` · ${res.groups[id]}` : ''}`);
    }
    blocks.push({ vendor: v, items: block, lead: (rule.lead || []).map((x) => clean(x).toLowerCase()) });
  }

  // Schaufenster: je Marke ein Produkt – Pin vor Zugpferd vor Neu vor Bestseller vor Klassiker vor Team Pick vor dem ersten Produkt; nur mit 6:7-Packshot.
  // Marken aus showcaseAlways (Diptyque) bekommen immer einen Platz; alle in der Markenfolge.
  const showcase = [];
  const visibleCount = items.filter((p) => p.visible && p.available).length;
  const sc = catRule.showcase === false ? null : { min: settings.showcaseMin, size: settings.showcaseSize, always: settings.showcaseAlways || [], ...(catRule.showcase || {}) };
  if (sc && visibleCount >= sc.min) {
    const good = (p) => !settings.imageRule || (p.image && goodImage(p.image, settings));
    const pinned = (p) => typeof p.pinUntil === 'string' && p.pinUntil >= today;
    const isNew = (p) => p.tags && (Array.isArray(p.tags) ? p.tags : [...p.tags]).some((t) => String(t).toLowerCase() === settings.neuTag);
    const isLead = (p, b) => b.lead.length > 0 && p.parsed && leadIndex(p, b.lead) < b.lead.length;
    const isSet = (p) => isDiscovery(p.type, p.title) || /set$/i.test(p.type || '');
    // Sets dürfen ins Schaufenster, zählen aber nicht als „neu“ (Matthias 11.10.: neues Diptyque-Set muss nicht vorne stehen)
    const pickOf = (b) => b.items.find((p) => pinned(p) && good(p)) || b.items.find((p) => isLead(p, b) && good(p)) || b.items.find((p) => isNew(p) && !isSet(p) && good(p))
      || b.items.find((p) => p.bestseller && good(p)) || b.items.find((p) => classicIds.has(p.id) && good(p)) || b.items.find((p) => p.teamPick && good(p)) || b.items.find(good);
    const eligible = blocks.map((b) => ({ b, pick: pickOf(b) })).filter((x) => x.pick);
    const always = new Set(sc.always.map(vendorKey));
    let chosen = eligible.slice(0, sc.size);
    for (const x of eligible) {
      if (!always.has(vendorKey(x.b.vendor)) || chosen.includes(x)) continue;
      if (chosen.length >= sc.size) { const drop = [...chosen].reverse().find((y) => !always.has(vendorKey(y.b.vendor))); if (!drop) continue; chosen = chosen.filter((y) => y !== drop); }
      chosen.push(x);
    }
    chosen.sort((x, y) => blocks.indexOf(x.b) - blocks.indexOf(y.b));
    for (const { b, pick } of chosen) {
      showcase.push(pick);
      b.items = b.items.filter((p) => p !== pick);
      const why = pinned(pick) ? 'Pin' : isLead(pick, b) ? 'Zugpferd' : isNew(pick) && !isSet(pick) ? 'Neu' : pick.bestseller ? 'Bestseller' : classicIds.has(pick.id) ? 'Klassiker' : pick.teamPick ? 'Team Pick' : 'erstes Produkt';
      group.set(pick.id, `Schaufenster · ${b.vendor} · ${why}`);
    }
  }
  for (const p of soTail) group.set(p.id, `Ausverkauft · ${p.vendor}`);
  for (const p of hiddenTail) group.set(p.id, `Nicht sichtbar · ${p.vendor}`);
  const order = [...showcase, ...blocks.flatMap((b) => b.items), ...soTail, ...hiddenTail];
  if (order.length !== items.length || new Set(order.map((p) => p.id)).size !== items.length) throw new Error('Kategorie-Sortierung hat Produkte verloren oder verdoppelt');
  return { order: order.map((p) => p.id), groups: Object.fromEntries(group), notes, showcase: showcase.length };
}
