// Ein Durchlauf: Markenseiten lesen, Zielreihenfolge rechnen, vergleichen, bei Freigabe schreiben, Bericht in KV.
import { sortCollection, diffOrders, planMoves, simulateMoves } from './engine.js';
import { ruleFor, BRANDS } from './rules.js';
import { fetchCollections, fetchSeriesMembership, fetchCollectionProducts, setManual, applyMoves } from './shopify.js';

export const viennaDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

const LOCK_TTL = 15 * 60;

// write: true schreibt geänderte Kollektionen; only: Liste von Handles; detail: volle Ziel-Liste je Kollektion im Ergebnis
export async function runSort(env, { write = false, only = null, detail = false, trigger = 'manual' } = {}) {
  const started = new Date();
  if (write) {
    const lock = await env.SORT.get('lock');
    if (lock) return { error: 'locked', lock: JSON.parse(lock) };
    await env.SORT.put('lock', JSON.stringify({ at: started.toISOString(), trigger }), { expirationTtl: LOCK_TTL });
  }
  try {
    const today = viennaDate(started);
    const all = await fetchCollections(env);
    const brands = all.filter((c) => c.type === 'vendor' && (!only || only.includes(c.handle)));
    const series = await fetchSeriesMembership(env);
    const lastWritten = (await env.SORT.get('written', 'json')) || {};
    const state = {};
    const results = [];
    for (const c of brands) {
      const r = { handle: c.handle, title: c.title, sortOrder: c.sortOrder };
      try {
        const products = await fetchCollectionProducts(env, c.id, series, state);
        const rule = ruleFor(c.handle);
        const res = sortCollection(products, rule, { today, kind: 'brand' });
        const current = products.map((p) => p.id);
        const visible = new Set(products.filter((p) => p.status === 'ACTIVE' && p.published).map((p) => p.id));
        const d = diffOrders(current, res.order, visible);
        const moves = planMoves(current, res.order);
        Object.assign(r, {
          pattern: rule.pattern, unknownRule: Boolean(rule.unknown), products: products.length, visible: visible.size,
          soldOut: products.filter((p) => visible.has(p.id) && !p.available).length,
          changed: moves.length > 0, visibleMoved: d.displaced, moves: moves.length,
          externalChange: lastWritten[c.handle] ? lastWritten[c.handle] !== hash(current) : null, // seit unserem letzten Schreiben von außen umsortiert (Jedi, Hand)?
          notes: res.notes,
        });
        if (detail) {
          const byId = new Map(products.map((p) => [p.id, p]));
          const from = new Map(current.map((id, i) => [id, i]));
          r.target = res.order.map((id, i) => { const p = byId.get(id); return { pos: i + 1, from: from.get(id) + 1, title: p.title, group: res.groups[id], available: p.available, visible: visible.has(id), status: p.status }; });
        }
        if (write && moves.length) {
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
    const missingRule = brands.filter((c) => !BRANDS[c.handle]).map((c) => c.handle);
    const report = {
      at: started.toISOString(), finished: new Date().toISOString(), today, trigger, write, only,
      imageRule: state.withImage !== false, imageError: state.imageError || null,
      collections: results.length, changed: results.filter((r) => r.changed).length, written: results.filter((r) => r.written).length,
      errors: results.filter((r) => r.error).length, missingRule, results,
    };
    if (write) await env.SORT.put('written', JSON.stringify(lastWritten));
    if (!only) {
      const slim = { ...report, results: results.map(({ target, ...x }) => x) };
      await env.SORT.put('report:latest', JSON.stringify(slim));
      await env.SORT.put(`report:${today}`, JSON.stringify(slim), { expirationTtl: 60 * 86400 });
    }
    return report;
  } finally {
    if (write) await env.SORT.delete('lock');
  }
}

// kurzer Fingerabdruck einer Reihenfolge
function hash(ids) {
  let h = 2166136261;
  for (const ch of ids.join(',')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return `${ids.length}:${h.toString(16)}`;
}
