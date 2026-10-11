// Trockenlauf Kategorieseiten gegen einen Storefront-Abzug.
// FIXTURES=<Ordner mit brands/, series/, cats/, bestseller_ids.json> node scripts/dryrun-cats.mjs [handle …] [--show]
import fs from 'node:fs';
import path from 'node:path';
import { sortCategory, diffOrders, vendorKey } from '../src/engine.js';
import { ruleFor, categoryRuleFor } from '../src/rules.js';

const FIX = process.env.FIXTURES || 'fixtures';
const TODAY = process.env.TODAY || new Date().toISOString().slice(0, 10);
const args = process.argv.slice(2);
const show = args.includes('--show');
const only = args.filter((a) => !a.startsWith('--'));
const J = (f) => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));

const bestsellers = new Set(J('bestseller_ids.json').map(String));
const seriesOf = new Map();
for (const f of fs.readdirSync(path.join(FIX, 'series'))) for (const id of J(`series/${f}`)) { const k = String(id); if (!seriesOf.has(k)) seriesOf.set(k, []); seriesOf.get(k).push(f.replace(/\.json$/, '')); }
const vendorHandle = new Map();
for (const f of fs.readdirSync(path.join(FIX, 'brands'))) { const list = J(`brands/${f}`); if (list[0]) vendorHandle.set(vendorKey(list[0].vendor), f.replace(/\.json$/, '')); }
const brandRuleFor = (v) => ruleFor(vendorHandle.get(vendorKey(v)) || '');

const conv = (p) => ({ id: String(p.id), title: p.title, type: p.type, vendor: p.vendor, tags: p.tags || [], status: 'ACTIVE', published: true, available: p.avail,
  bestseller: bestsellers.has(String(p.id)), pinUntil: null, series: seriesOf.get(String(p.id)) || [], image: p.img ? { w: p.img[0], h: p.img[1] } : null });

const handles = (only.length ? only : fs.readdirSync(path.join(FIX, 'cats')).map((f) => f.replace(/\.json$/, ''))).sort();
const rows = [];
for (const h of handles) {
  const products = J(`cats/${h}.json`).map(conv);
  const rule = categoryRuleFor(h, products);
  if (rule.mode === 'skip') { rows.push({ h, mode: 'skip', n: products.length, moved: 0, showcase: 0, notes: '' }); continue; }
  const res = sortCategory(products, rule, { today: TODAY, brandRuleFor });
  const cur = products.map((p) => p.id);
  const d = diffOrders(cur, res.order);
  rows.push({ h, mode: rule.mode === 'curated' ? 'kuratiert' : rule.orderName, n: products.length, moved: d.displaced, showcase: res.showcase || 0, notes: res.notes.map((x) => x.msg).join(' ') });
  if (show) {
    const byId = new Map(products.map((p) => [p.id, p]));
    const pos = new Map(cur.map((id, i) => [id, i]));
    console.log(`\n== ${h} (${rows.at(-1).mode}) – ${d.displaced} von ${products.length} ziehen um`);
    res.order.forEach((id, i) => {
      const p = byId.get(id); const from = pos.get(id);
      const mark = from === i ? '    ' : from < i ? ` ↓${String(i - from).padStart(3)}` : ` ↑${String(from - i).padStart(3)}`;
      console.log(`${String(i + 1).padStart(3)}${mark} ${p.available ? ' ' : '×'} ${(res.groups[id] || '').slice(0, 34).padEnd(34)} ${p.title.slice(0, 56)}`);
    });
    for (const n of res.notes) console.log(`   ! ${n.msg}`);
  }
}
if (!show || handles.length > 1) {
  console.log('\nKategorie                                   Folge              Prod  ziehen  Schauf.  Hinweis');
  for (const r of rows) console.log(`${r.h.padEnd(43)} ${String(r.mode).padEnd(18)} ${String(r.n).padStart(4)} ${String(r.moved).padStart(7)} ${String(r.showcase).padStart(8)}  ${r.notes.slice(0, 90)}`);
}
