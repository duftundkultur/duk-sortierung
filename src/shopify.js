// Shopify Admin API für den Sortier-Motor: lesen (Kollektionen, Produkte, Serien) und schreiben (Reihenfolge).
// Anmeldung wie bei duk-suche: Client-Credentials der eigenen App „DUK Sortierung“ (read_products, write_products).

const API_VERSION = '2026-10';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class ShopifyError extends Error {}

let cachedToken = null;

export async function accessToken(env) {
  if (env.SHOPIFY_ADMIN_TOKEN) return env.SHOPIFY_ADMIN_TOKEN;
  if (cachedToken && cachedToken.expires > Date.now() + 60000) return cachedToken.value;
  const res = await fetch(`https://${env.SHOPIFY_SHOP}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.SHOPIFY_CLIENT_ID || '', client_secret: env.SHOPIFY_CLIENT_SECRET || '' }),
  });
  if (!res.ok) throw new ShopifyError(`token ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  if (!data.access_token) throw new ShopifyError('token: no access_token in response');
  cachedToken = { value: data.access_token, expires: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
  return cachedToken.value;
}

// Ein Admin-GraphQL-Aufruf; wartet bei knappem Kostenbudget, wiederholt bei THROTTLED / 5xx.
export async function admin(env, query, variables = {}, attempt = 0) {
  const res = await fetch(`https://${env.SHOPIFY_SHOP}/admin/api/${env.SHOPIFY_API_VERSION || API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Shopify-Access-Token': await accessToken(env) },
    body: JSON.stringify({ query, variables }),
  });
  if ((res.status === 429 || res.status >= 500) && attempt < 5) { await sleep(1000 * 2 ** attempt); return admin(env, query, variables, attempt + 1); }
  if (res.status === 401 && !env.SHOPIFY_ADMIN_TOKEN && attempt < 1) { cachedToken = null; return admin(env, query, variables, attempt + 1); }
  if (!res.ok) throw new ShopifyError(`admin ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  const throttled = body.errors?.some((e) => e.extensions?.code === 'THROTTLED');
  if (throttled && attempt < 6) { await sleep(2000 * (attempt + 1)); return admin(env, query, variables, attempt + 1); }
  if (body.errors) throw new ShopifyError(`admin: ${JSON.stringify(body.errors).slice(0, 400)}`);
  const t = body.extensions?.cost?.throttleStatus;
  if (t && t.currentlyAvailable < (body.extensions.cost.requestedQueryCost || 500)) {
    await sleep(Math.ceil(((body.extensions.cost.requestedQueryCost || 500) - t.currentlyAvailable) / (t.restoreRate || 50)) * 1000);
  }
  return body.data;
}

async function adminAll(env, query, path, variables = {}) {
  const nodes = [];
  let after = null;
  do {
    const data = await admin(env, query, { ...variables, after });
    const conn = path.split('.').reduce((o, k) => o?.[k], data);
    if (!conn) break;
    nodes.push(...conn.nodes);
    after = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
  } while (after);
  return nodes;
}

/* ------------------------------------------------------------------------------------------- */
/* Lesen                                                                                        */
/* ------------------------------------------------------------------------------------------- */

const Q_COLLECTIONS = `query SortCollections($after: String) {
  collections(first: 100, after: $after, sortKey: ID) {
    pageInfo { hasNextPage endCursor }
    nodes { id legacyResourceId handle title sortOrder productsCount { count } ct: metafield(namespace: "custom", key: "collection_type") { value } v: metafield(namespace: "custom", key: "vendor") { value } }
  }
}`;

// Alle Kollektionen mit Typ (vendor = Markenseite, series = Serie, edit = Editorial …)
export async function fetchCollections(env) {
  return (await adminAll(env, Q_COLLECTIONS, 'collections')).map((c) => ({
    id: c.id, legacyId: c.legacyResourceId, handle: c.handle, title: c.title, sortOrder: c.sortOrder, count: c.productsCount?.count ?? null, type: c.ct?.value || '', vendor: c.v?.value || '',
  }));
}

const Q_SERIES = `query SortSeries($after: String) {
  collections(first: 10, after: $after, query: "title:Serie*") {
    pageInfo { hasNextPage endCursor }
    nodes { handle ct: metafield(namespace: "custom", key: "collection_type") { value } products(first: 100) { nodes { legacyResourceId } } }
  }
}`;

// Produkt-ID → Handles seiner Serien-Kollektionen (auch unveröffentlichte Serien)
export async function fetchSeriesMembership(env) {
  const map = new Map();
  for (const c of await adminAll(env, Q_SERIES, 'collections')) {
    if (c.ct?.value && c.ct.value !== 'series') continue;
    for (const p of c.products.nodes) {
      const id = String(p.legacyResourceId);
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(c.handle);
    }
  }
  return map;
}

const Q_CLASSICS = `query SortClassics($after: String) {
  products(first: 250, after: $after, query: "tag:klassiker") {
    pageInfo { hasNextPage endCursor }
    nodes { title productType vendor }
  }
}`;

// Leitprodukte der Klassiker (Tag „klassiker“): Marke → [{ title, type }]
export async function fetchClassics(env) {
  const map = new Map();
  for (const p of await adminAll(env, Q_CLASSICS, 'products')) {
    const k = String(p.vendor || '').replace(/[’‘`´]/g, "'").toLowerCase().trim();
    if (!map.has(k)) map.set(k, []);
    map.get(k).push({ title: p.title, type: p.productType || '' });
  }
  return map;
}

const productFields = (withImage) => `
        id legacyResourceId title productType vendor tags status onlineStoreUrl publishedAt
        variants(first: 20) { nodes { availableForSale } }
        ${withImage ? 'featuredMedia { preview { image { width height } } }' : ''}
        badges: metafield(namespace: "custom", key: "badges") { value }
        pin: metafield(namespace: "custom", key: "pin_bis") { value }`;
const Q_PRODUCTS = (withImage) => `query SortCollectionProducts($id: ID!, $after: String) {
  collection(id: $id) {
    products(first: 50, after: $after, sortKey: COLLECTION_DEFAULT) {
      pageInfo { hasNextPage endCursor }
      nodes { ${productFields(withImage)} }
    }
  }
}`;

const list = (v) => { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a.map(String) : []; } catch { return []; } };

export function normalizeProduct(p, series) {
  const id = String(p.legacyResourceId);
  const img = p.featuredMedia?.preview?.image;
  return {
    id, gid: p.id, title: p.title, type: p.productType || '', vendor: p.vendor, tags: p.tags || [],
    status: p.status, published: Boolean(p.onlineStoreUrl), publishedAt: p.publishedAt,
    available: (p.variants?.nodes || []).some((v) => v.availableForSale),
    bestseller: list(p.badges?.value).includes('Bestseller'),
    teamPick: list(p.badges?.value).includes('Team pick'),
    pinUntil: (p.pin?.value || '').slice(0, 10) || null,
    series: series.get(id) || [],
    image: img ? { w: img.width, h: img.height } : null,
  };
}

// Produkte einer Kollektion in der aktuellen Reihenfolge. Fehlt das Recht auf Medien, ohne Bildregel weiter.
export async function fetchCollectionProducts(env, collectionId, series, state = {}) {
  if (state.withImage === undefined) state.withImage = true;
  try {
    const nodes = await adminAll(env, Q_PRODUCTS(state.withImage), 'collection.products', { id: collectionId });
    return nodes.map((p) => normalizeProduct(p, series));
  } catch (e) {
    if (state.withImage && /featuredMedia|ACCESS_DENIED|access/i.test(e.message)) { state.withImage = false; state.imageError = e.message.slice(0, 200); return fetchCollectionProducts(env, collectionId, series, state); }
    throw e;
  }
}

/* ------------------------------------------------------------------------------------------- */
/* Schreiben                                                                                    */
/* ------------------------------------------------------------------------------------------- */

const M_MANUAL = `mutation SortManual($input: CollectionInput!) {
  collectionUpdate(input: $input) { collection { id sortOrder } userErrors { field message } }
}`;
const M_REORDER = `mutation SortReorder($id: ID!, $moves: [MoveInput!]!) {
  collectionReorderProducts(id: $id, moves: $moves) { job { id done } userErrors { field message } }
}`;
const Q_JOB = 'query SortJob($id: ID!) { job(id: $id) { id done } }';

export async function setManual(env, collectionId) {
  const r = (await admin(env, M_MANUAL, { input: { id: collectionId, sortOrder: 'MANUAL' } })).collectionUpdate;
  if (r.userErrors.length) throw new ShopifyError(`collectionUpdate: ${r.userErrors.map((e) => e.message).join('; ')}`);
  return r.collection.sortOrder;
}

// Züge in Paketen zu höchstens 250, jedes Paket erst nach Abschluss des vorigen (Shopify wendet sie nacheinander an)
export async function applyMoves(env, collectionId, moves) {
  const jobs = [];
  for (let i = 0; i < moves.length; i += 250) {
    const chunk = moves.slice(i, i + 250).map((m) => ({ id: m.gid, newPosition: String(m.newPosition) }));
    const r = (await admin(env, M_REORDER, { id: collectionId, moves: chunk })).collectionReorderProducts;
    if (r.userErrors.length) throw new ShopifyError(`collectionReorderProducts: ${r.userErrors.map((e) => e.message).join('; ')}`);
    let job = r.job;
    const pollMs = Number(env.JOB_POLL_MS) || 2000;
    for (let n = 0; job && !job.done && n * pollMs < 120000; n++) { await sleep(pollMs); job = (await admin(env, Q_JOB, { id: job.id })).job; }
    if (job && !job.done) throw new ShopifyError(`Job ${job.id} nach 2 Minuten nicht fertig`);
    jobs.push(job?.id || null);
  }
  return jobs;
}
