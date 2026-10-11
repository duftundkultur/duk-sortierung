// Trockenlauf gegen einen Storefront-Abzug (nur sichtbare Produkte, Live-Reihenfolge der Markenseiten).
// FIXTURES=<Ordner mit brands/, series/, bestseller_ids.json> node scripts/dryrun-local.mjs [handle …] [--show] [--json out.json]
import fs from 'node:fs';
import path from 'node:path';
import { sortCollection, diffOrders } from '../src/engine.js';
import { ruleFor, BRANDS } from '../src/rules.js';

const FIX = process.env.FIXTURES || 'fixtures';
const TODAY = process.env.TODAY || new Date().toISOString().slice(0, 10);
const args = process.argv.slice(2);
const show = args.includes('--show');
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const only = args.filter((a) => !a.startsWith('--') && a !== jsonOut);

const J = (f) => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
const bestsellers = new Set(J('bestseller_ids.json').map(String));
const seriesOf = new Map();
for (const f of fs.readdirSync(path.join(FIX, 'series'))) {
  const h = f.replace(/\.json$/, '');
  for (const id of J(`series/${f}`)) { const k = String(id); if (!seriesOf.has(k)) seriesOf.set(k, []); seriesOf.get(k).push(h); }
}

export function fromStorefront(p) {
  const im = p.images?.[0];
  return {
    id: String(p.id), title: p.title, type: p.product_type, vendor: p.vendor, tags: p.tags || [],
    status: 'ACTIVE', published: true, available: (p.variants || []).some((v) => v.available),
    bestseller: bestsellers.has(String(p.id)), pinUntil: null, series: seriesOf.get(String(p.id)) || [],
    image: im ? { w: im.width, h: im.height } : null, publishedAt: p.published_at,
  };
}

const handles = (only.length ? only : fs.readdirSync(path.join(FIX, 'brands')).map((f) => f.replace(/\.json$/, ''))).sort();
const rows = [];
const out = {};
for (const h of handles) {
  const products = J(`brands/${h}.json`).map(fromStorefront);
  const rule = ruleFor(h);
  const res = sortCollection(products, rule, { today: TODAY, kind: 'brand' });
  const cur = products.map((p) => p.id);
  const d = diffOrders(cur, res.order);
  const soldOut = products.filter((p) => !p.available).length;
  const neu = Object.values(res.groups).filter((g) => g === 'Neu').length;
  rows.push({ h, pattern: rule.pattern + (rule.unknown ? '?' : ''), n: products.length, moved: d.displaced, soldOut, neu, notes: res.notes.length });
  out[h] = { rule: rule.pattern, current: cur, target: res.order, groups: res.groups, notes: res.notes };
  if (show) {
    const byId = new Map(products.map((p) => [p.id, p]));
    const pos = new Map(cur.map((id, i) => [id, i]));
    console.log(`\n== ${h} (Muster ${rule.pattern}) – ${d.displaced} von ${products.length} ziehen um`);
    res.order.forEach((id, i) => {
      const p = byId.get(id); const from = pos.get(id);
      const mark = from === i ? '   ' : from < i ? ` ↓${String(i - from).padStart(2)}`.slice(-4) : ` ↑${String(from - i).padStart(2)}`.slice(-4);
      console.log(`${String(i + 1).padStart(3)} ${mark} ${p.available ? ' ' : '×'} ${(res.groups[id] || '').slice(0, 26).padEnd(26)} ${p.title.slice(0, 64)}`);
    });
    for (const n of res.notes) console.log(`   ! ${n.kind}: ${n.title ? `${n.title} – ` : ''}${n.msg}`);
  }
}
if (!show || handles.length > 1) {
  console.log('\nMarke                         Muster  Prod  ziehen  ausverk.  neu  Hinweise');
  for (const r of rows) console.log(`${r.h.padEnd(30)} ${r.pattern.padEnd(6)} ${String(r.n).padStart(5)} ${String(r.moved).padStart(8)} ${String(r.soldOut).padStart(9)} ${String(r.neu).padStart(4)} ${String(r.notes).padStart(9)}`);
  const unknown = handles.filter((h) => !BRANDS[h]);
  if (unknown.length) console.log(`\nOhne Regel (Muster C angenommen): ${unknown.join(', ')}`);
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(out, null, 1));
