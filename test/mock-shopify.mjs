// Nachgebautes Shopify (Token + Admin GraphQL) aus einem Storefront-Abzug – für den Test des ganzen Workers ohne Netz.
import fs from 'node:fs';
import path from 'node:path';

export function loadShop(dir) {
  const J = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const bestsellers = new Set(J('bestseller_ids.json').map(String));
  const products = new Map();
  const collections = [];
  let cid = 1;
  for (const f of fs.readdirSync(path.join(dir, 'brands')).sort()) {
    const handle = f.replace(/\.json$/, '');
    const list = J(`brands/${f}`);
    for (const p of list) {
      products.set(String(p.id), {
        id: `gid://shopify/Product/${p.id}`, legacyResourceId: String(p.id), title: p.title, productType: p.product_type, vendor: p.vendor, tags: p.tags,
        status: 'ACTIVE', onlineStoreUrl: `https://www.duftundkultur.at/products/${p.handle}`, publishedAt: p.published_at,
        variants: { nodes: p.variants.map((v) => ({ availableForSale: v.available })) },
        featuredMedia: p.images?.[0] ? { preview: { image: { width: p.images[0].width, height: p.images[0].height } } } : null,
        badges: bestsellers.has(String(p.id)) ? { value: '["Bestseller"]' } : null, pin: null,
      });
    }
    collections.push({ id: `gid://shopify/Collection/${cid++}`, handle, title: `Brand: ${list[0]?.vendor || handle}`, sortOrder: 'MANUAL', type: 'vendor', ids: list.map((p) => String(p.id)) });
  }
  for (const f of fs.readdirSync(path.join(dir, 'series')).sort()) {
    collections.push({ id: `gid://shopify/Collection/${cid++}`, handle: f.replace(/\.json$/, ''), title: `Serie: ${f}`, sortOrder: 'ALPHA_ASC', type: 'series', ids: J(`series/${f}`).map(String) });
  }
  return { products, collections, calls: [], reorders: 0 };
}

// fetch-Ersatz: beantwortet Token- und GraphQL-Aufrufe aus dem Abzug, führt Umsortierungen wirklich aus
export function createMockFetch(shop) {
  const page = (arr, after, n) => { const start = after ? Number(after) : 0; const nodes = arr.slice(start, start + n); return { nodes, pageInfo: { hasNextPage: start + n < arr.length, endCursor: String(start + n) } }; };
  const jobs = new Map();
  return async (url, init = {}) => {
    const u = String(url);
    if (u.endsWith('/admin/oauth/access_token')) return new Response(JSON.stringify({ access_token: 'shpat_test', expires_in: 86399 }), { status: 200 });
    if (!u.includes('/graphql.json')) return new Response('not found', { status: 404 });
    const { query, variables = {} } = JSON.parse(init.body);
    const name = (query.match(/(?:query|mutation)\s+(\w+)/) || [])[1];
    shop.calls.push(name);
    let data;
    if (name === 'SortCollections') {
      data = { collections: page(shop.collections.map((c) => ({ id: c.id, legacyResourceId: c.id.split('/').pop(), handle: c.handle, title: c.title, sortOrder: c.sortOrder, productsCount: { count: c.ids.length }, ct: { value: c.type } })), variables.after, 100) };
    } else if (name === 'SortSeries') {
      data = { collections: page(shop.collections.filter((c) => c.type === 'series').map((c) => ({ handle: c.handle, ct: { value: 'series' }, products: { nodes: c.ids.map((id) => ({ legacyResourceId: id })) } })), variables.after, 10) };
    } else if (name === 'SortCollectionProducts') {
      const c = shop.collections.find((x) => x.id === variables.id);
      data = { collection: c ? { products: page(c.ids.map((id) => shop.products.get(id)), variables.after, 50) } : null };
    } else if (name === 'SortManual') {
      const c = shop.collections.find((x) => x.id === variables.input.id); c.sortOrder = variables.input.sortOrder;
      data = { collectionUpdate: { collection: { id: c.id, sortOrder: c.sortOrder }, userErrors: [] } };
    } else if (name === 'SortReorder') {
      const c = shop.collections.find((x) => x.id === variables.id);
      if (c.sortOrder !== 'MANUAL') data = { collectionReorderProducts: { job: null, userErrors: [{ field: ['id'], message: 'sortOrder must be MANUAL' }] } };
      else if (variables.moves.length > 250) data = { collectionReorderProducts: { job: null, userErrors: [{ field: ['moves'], message: 'Too many moves' }] } };
      else {
        for (const m of variables.moves) { const id = m.id.split('/').pop(); c.ids.splice(c.ids.indexOf(id), 1); c.ids.splice(Math.min(Number(m.newPosition), c.ids.length), 0, id); }
        shop.reorders++;
        const jid = `gid://shopify/Job/${shop.reorders}`; jobs.set(jid, 0);
        data = { collectionReorderProducts: { job: { id: jid, done: shop.reorders % 2 === 0 }, userErrors: [] } }; // jeder zweite Job braucht eine Abfrage
      }
    } else if (name === 'SortJob') {
      data = { job: { id: variables.id, done: true } };
    } else {
      return new Response(JSON.stringify({ errors: [{ message: `unbekannte Abfrage ${name}` }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ data, extensions: { cost: { requestedQueryCost: 10, throttleStatus: { currentlyAvailable: 2000, restoreRate: 100 } } } }), { status: 200 });
  };
}

// KV im Speicher
export function memoryKV() {
  const m = new Map();
  return {
    async get(k, type) { const v = m.get(k); if (v === undefined) return null; return type === 'json' ? JSON.parse(v) : v; },
    async put(k, v) { m.set(k, String(v)); },
    async delete(k) { m.delete(k); },
    _map: m,
  };
}
