/*
  DUK Sortierung – Cloudflare Worker
  ------------------------------------------------------------------------------------------------
  Sortiert die Markenseiten (custom.collection_type = vendor) und die Kategorieseiten („Kategorie: …“) nach der
  Regeldatei (src/rules.js) und den allgemeinen Regeln: Pin mit Ablaufdatum → Neu → Saison → Regelplatz → Ausverkauft ans Ende.
  Kategorien: Schaufenster (ab 40 Produkten, je Marke eines) → Markenblöcke in der Markenfolge → Ausverkauft.
  Geschrieben wird nur, was sich geändert hat, mit möglichst wenigen Zügen, danach Gegencheck.

  Betriebsart (MODE für Markenseiten, CATEGORY_MODE für Kategorieseiten, in wrangler.toml):
    dryrun   nur rechnen und berichten, nie schreiben (Standard)
    manual   der Zeitplan rechnet nur; /admin/run?write=1 darf schreiben (für den ersten Test an einzelnen Marken)
    live     der Zeitplan schreibt jeden Morgen

  Admin (?token=ADMIN_TOKEN, im Browser aufrufbar):
    /admin/dryrun?only=diptyque,trudon      rechnen, nichts schreiben; mit only zusätzlich die volle Zielliste
    /admin/dryrun?scope=categories          nur Kategorieseiten (scope=brands: nur Markenseiten)
    /admin/run?only=…&write=1               rechnen und schreiben (nur bei MODE manual oder live)
    /admin/report                           letzter Bericht des Zeitplans
    /admin/scopes                           welche Rechte hat die App im Shop (read_products, write_products)?
    /admin/unlock                           hängende Sperre lösen
  Öffentlich:
    /health                                 läuft der Worker, sind die Variablen gesetzt?

  Zeitplan: täglich 04:20 UTC (06:20 Wien im Sommer, 05:20 im Winter) – nach den Neu-Flows um 05:00/05:05.
*/
import { runSort, viennaDate } from './run.js';
import { admin } from './shopify.js';

const DEFAULTS = { SHOPIFY_SHOP: '1rbajs-ae.myshopify.com', MODE: 'dryrun', CATEGORY_MODE: 'dryrun' };
const MODES = ['dryrun', 'manual', 'live'];
const NEEDED = ['SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET', 'ADMIN_TOKEN'];

function config(raw) {
  const env = { ...raw };
  for (const [k, v] of Object.entries(env)) if (typeof v === 'string') env[k] = v.trim();
  for (const [k, v] of Object.entries(DEFAULTS)) if (!env[k]) env[k] = v;
  if (!/^[a-z0-9-]+\.myshopify\.com$/.test(env.SHOPIFY_SHOP)) env.SHOPIFY_SHOP = DEFAULTS.SHOPIFY_SHOP;
  if (!MODES.includes(env.MODE)) env.MODE = 'dryrun';
  if (!MODES.includes(env.CATEGORY_MODE)) env.CATEGORY_MODE = 'dryrun';
  return env;
}

const json = (data, status = 200) => new Response(JSON.stringify(data, null, 1), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
const adminAllowed = (url, env) => Boolean(env.ADMIN_TOKEN) && safeEqual(url.searchParams.get('token') || '', env.ADMIN_TOKEN);
const onlyParam = (url) => { const v = url.searchParams.get('only'); return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : null; };
const scopeParam = (url) => (['brands', 'categories'].includes(url.searchParams.get('scope')) ? url.searchParams.get('scope') : 'all');
const canWrite = (mode) => mode === 'manual' || mode === 'live';

export default {
  async fetch(request, rawEnv) {
    const env = config(rawEnv);
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    try {
      if (path === '/health') {
        const missing = NEEDED.filter((k) => !env[k] && !(k !== 'ADMIN_TOKEN' && env.SHOPIFY_ADMIN_TOKEN));
        if (!env.SORT) missing.push('SORT (KV)');
        const last = env.SORT ? await env.SORT.get('report:latest', 'json') : null;
        return json({
          ok: true, configured: missing.length === 0, missing, shop: env.SHOPIFY_SHOP, mode: env.MODE, categoryMode: env.CATEGORY_MODE, today: viennaDate(),
          lastRun: last ? { at: last.at, trigger: last.trigger, write: last.write, collections: last.collections, changed: last.changed, written: last.written, errors: last.errors } : null,
        });
      }
      if (path.startsWith('/admin/')) {
        if (!adminAllowed(url, env)) return json({ error: 'forbidden' }, 403);
        if (path === '/admin/dryrun') { const only = onlyParam(url); return json(await runSort(env, { only, scope: scopeParam(url), detail: Boolean(only), trigger: 'dryrun' })); }
        if (path === '/admin/run') {
          const wanted = url.searchParams.get('write') === '1';
          const write = { brands: wanted && canWrite(env.MODE), categories: wanted && canWrite(env.CATEGORY_MODE) };
          if (wanted && !write.brands && !write.categories) return json({ error: 'Schreiben ist ausgeschaltet (MODE und CATEGORY_MODE stehen auf dryrun). In wrangler.toml auf "manual" setzen.' }, 409);
          const only = onlyParam(url);
          return json(await runSort(env, { write, only, scope: scopeParam(url), detail: Boolean(only), trigger: 'manual' }));
        }
        if (path === '/admin/scopes') {
          const d = await admin(env, 'query SortScopes { currentAppInstallation { accessScopes { handle } } }');
          const scopes = d.currentAppInstallation.accessScopes.map((x) => x.handle);
          return json({ scopes, canRead: scopes.includes('read_products') || scopes.includes('write_products'), canWrite: scopes.includes('write_products') });
        }
        if (path === '/admin/report') return json((await env.SORT.get('report:latest', 'json')) || { info: 'noch kein Bericht' });
        if (path === '/admin/unlock') { await env.SORT.delete('lock'); return json({ ok: true }); }
      }
      return json({ error: 'not_found' }, 404);
    } catch (e) {
      console.error('[duk-sortierung]', e);
      return json({ error: 'server', message: e.message }, 500);
    }
  },

  async scheduled(event, rawEnv, ctx) {
    const env = config(rawEnv);
    ctx.waitUntil(runSort(env, { write: { brands: env.MODE === 'live', categories: env.CATEGORY_MODE === 'live' }, trigger: 'cron' }).catch((e) => console.error('[duk-sortierung] cron', e)));
  },
};
