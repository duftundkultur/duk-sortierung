// Ein Durchlauf: Marken- und Kategorieseiten lesen, Zielreihenfolge rechnen, vergleichen, bei Freigabe schreiben, Bericht in KV.
import { sortCollection, sortCategory, diffOrders, planMoves, simulateMoves, vendorKey } from './engine.js';
import { ruleFor, BRANDS, categoryRuleFor } from './rules.js';
import { fetchCollections, fetchSeriesMembership, fetchCollectionProducts, fetchClassics, setManual, applyMoves } from './shopify.js';

export const viennaDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

const LOCK_TTL = 15 * 60;
export const isCategory = (c) => /^Kategorie:/.test(c.title || '');

// write: { brands, categories } – was geschrieben werden darf; scope: 'all' | 'brands' | 'categories';
// only: Liste von Handles; detail: volle Zielliste je Kollektion im Ergebnis
export async function runSort(env, { write = {}, scope = 'all', only = null, detail = false, trigger = 'manual' } = {}) {
  const started = new Date();
  const writing = Boolean(write.brands || write.categories);
  if (writing) {
    const lock = await env.SORT.get('lock');
    if (lock) return { error: 'locked', lock: JSON.parse(lock) };
    await env.SORT.put('lock', JSON.stringify({ at: started.toISOString(), trigger }), { expirationTtl: LOCK_TTL });
  }
  try {
    const today = viennaDate(started);
    const all = await fetchCollections(env);
    // Marke → Regel: Hersteller der Markenkollektion (custom.vendor, sonst Titel „Brand: …“) → ihr Handle
    const vendorHandle = new Map();
    for (const c of all) if (c.type === 'vendor') vendorHandle.set(vendorKey(c.vendor || c.title.replace(/^Brand:\s*/, '')), c.handle);
    const brandRuleFor = (v) => ruleFor(vendorHandle.get(vendorKey(v)) || '');

    const want = (c) => !only || only.includes(c.handle);
    const brands = scope === 'categories' ? [] : all.filter((c) => c.type === 'vendor' && want(c));
    const categories = scope === 'brands' ? [] : all.filter((c) => isCategory(c) && want(c));
    const series = await fetchSeriesMembership(env);
    const classics = await fetchClassics(env);
    const classicsFor = (v) => classics.get(vendorKey(v)) || [];
    const lastWritten = (await env.SORT.get('written', 'json')) || {};
    const state = {};
    const results = [];

    const jobs = [...brands.map((c) => ({ c, kind: 'brand' })), ...categories.map((c) => ({ c, kind: 'category' }))];
    for (const { c, kind } of jobs) {
      const r = { kind, handle: c.handle, title: c.title, sortOrder: c.sortOrder };
      try {
        const products = await fetchCollectionProducts(env, c.id, series, state);
        let res; let ruleInfo;
        if (kind === 'brand') {
          const rule = ruleFor(c.handle);
          res = sortCollection(products, rule, { today, kind: 'brand', classics: classicsFor(c.vendor || c.title.replace(/^Brand:\s*/, '')) });
          ruleInfo = { pattern: rule.pattern, unknownRule: Boolean(rule.unknown) };
        } else {
          const rule = categoryRuleFor(c.handle, products);
          if (rule.mode === 'skip' || !products.length) { results.push({ ...r, skipped: true, products: products.length }); continue; }
          res = sortCategory(products, rule, { today, brandRuleFor, classicsFor });
          ruleInfo = { pattern: rule.mode === 'curated' ? 'kuratiert' : rule.mode === 'new' ? `neueste zuerst (${rule.orderName})` : rule.orderName, showcase: res.showcase || 0 };
        }
        const current = products.map((p) => p.id);
        const visible = new Set(products.filter((p) => p.status === 'ACTIVE' && p.published).map((p) => p.id));
        const d = diffOrders(current, res.order, visible);
        const moves = planMoves(current, res.order);
        Object.assign(r, ruleInfo, {
          products: products.length, visible: visible.size,
          soldOut: products.filter((p) => visible.has(p.id) && !p.available).length,
          changed: moves.length > 0, visibleMoved: d.displaced, moves: moves.length,
          externalChange: lastWritten[c.handle] ? lastWritten[c.handle] !== hash(current) : null, // seit unserem letzten Schreiben von außen umsortiert (Jedi, Hand)?
          notes: res.notes,
        });
        if (detail) {
          const byId = new Map(products.map((p) => [p.id, p]));
          const from = new Map(current.map((id, i) => [id, i]));
          r.target = res.order.map((id, i) => { const p = byId.get(id); return { pos: i + 1, from: from.get(id) + 1, title: p.title, vendor: p.vendor, group: res.groups[id], available: p.available, visible: visible.has(id), status: p.status }; });
        }
        const mayWrite = kind === 'brand' ? write.brands : write.categories;
        if (mayWrite && moves.length) {
          if (simulateMoves(current, moves).join() !== res.order.join()) throw new Error('Gegenprobe der Züge stimmt nicht – nichts geschrieben');
          if (c.sortOrder !== 'MANUAL') r.sortOrderSet = await setManual(env, c.id);
          const gid = new Map(products.map((p) => [p.id, p.gid]));
          r.jobs = await applyMoves(env, c.id, moves.map((m) => ({ gid: gid.get(m.id), newPosition: m.newPosition })));
          const after = (await fetchCollectionProducts(env, c.id, series, state)).map((p) => p.id);
          r.verified = after.join() === res.order.join();
          r.written = true;
          if (r.verified) lastWritten[c.handle] = hash(res.order);
          else r.error = 'Nach dem Schreiben weicht die Reihenfolge ab';
        } else if (!moves.length) lastWritten[c.handle] = lastWritten[c.handle] || hash(current);
      } catch (e) {
        r.error = String(e.message || e).slice(0, 300);
      }
      results.push(r);
    }
    const done = results.filter((r) => !r.skipped);
    const report = {
      at: started.toISOString(), finished: new Date().toISOString(), today, trigger, write, scope, only,
      imageRule: state.withImage !== false, imageError: state.imageError || null,
      collections: done.length, brands: done.filter((r) => r.kind === 'brand').length, categories: done.filter((r) => r.kind === 'category').length,
      skipped: results.filter((r) => r.skipped).map((r) => r.handle),
      changed: done.filter((r) => r.changed).length, written: done.filter((r) => r.written).length, errors: done.filter((r) => r.error).length,
      missingRule: brands.filter((c) => !BRANDS[c.handle]).map((c) => c.handle),
      results,
    };
    if (writing) await env.SORT.put('written', JSON.stringify(lastWritten));
    if (!only && scope === 'all') {
      const slim = { ...report, results: results.map(({ target, ...x }) => x) };
      await env.SORT.put('report:latest', JSON.stringify(slim));
      await env.SORT.put(`report:${today}`, JSON.stringify(slim), { expirationTtl: 60 * 86400 });
    }
    return report;
  } finally {
    if (writing) await env.SORT.delete('lock');
  }
}

// kurzer Fingerabdruck einer Reihenfolge
function hash(ids) {
  let h = 2166136261;
  for (const ch of ids.join(',')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return `${ids.length}:${h.toString(16)}`;
}
