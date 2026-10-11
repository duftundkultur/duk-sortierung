// Produkttitel zerlegen: Typwort vorne, Duftname, Größe, Travel Size / Mini, Refill, Unterlinie in „…“.
// Beispiele aus dem Shop:
//   „Eau de Parfum Bois Impérial 10ml“          → Duft „Bois Impérial“, klein
//   „Travel Size Eau de Parfum Mortel“           → Duft „Mortel“, klein
//   „Duftkerze “The Alabasters” Ernesto Refill“  → Duft „Ernesto“, Linie „The Alabasters“, Refill, Mutter „Duftkerze “The Alabasters” Ernesto“
//   „Mini Handcreme Lavendel“                    → Duft „Lavendel“, klein
//   „Duftkerze Baies 300 g“                      → Duft „Baies“, groß

// Typwörter, die vorne im Titel stehen können (zusätzlich zu den Produktarten im Shop). Längste zuerst geprüft.
const EXTRA_PREFIXES = [
  'Eau de Parfum', 'Extrait de Parfum', 'Eau de Toilette', 'Eau de Cologne', 'Eau Fraîche', 'Parfum',
  'Duschgel', 'Duftkerze', 'Mini-Duftkerze', 'Raumduftspender', 'Raumspray', 'Diffusor', 'Discovery Set',
];

// Englische Produktbezeichnungen hinten im Titel (Aesop: „Resurrection Aromatique Hand Wash“) – für den Duftnamen abschneiden
const EN_SUFFIXES = [
  'Aromatique Hand Wash', 'Aromatique Hand Balm', 'Resurrection Hand Wash', 'Hand Wash', 'Hand Balm', 'Hand Cream',
  'Nourishing Body Cleanser', 'Body Cleanser', 'Intensive Body Balm', 'Concentrate Body Balm', 'Body Balm', 'Body Scrub', 'Body Oil', 'Body Lotion',
  'Bar Soap', 'Lip Balm SPF30', 'Lip Balm', 'Lip Salve', 'Travel Kit',
].sort((a, b) => b.length - a.length);

const SIZE_RX = /\s*(\d+(?:[.,]\d+)?)\s*(ml|g|kg|cl|l)\.?\s*$/i;
const REFILL_RX = /\s*\bRefill\b\s*/i;
const QUOTE_RX = /^[“"„«]([^”"“»]+)[”"“»]\s*/;

// Duftfamilie der Parfums: Reihenfolge, wenn ein Duft in mehreren Konzentrationen da ist (EdP vor Extrait vor EdT …)
export const FRAGRANCE_TYPES = [
  'Eau de Parfum', 'Extrait de Parfum', 'Parfum', 'Eau de Toilette', 'Eau de Cologne', 'Eau Fraîche',
  'Haarparfum', 'Hair & Body Mist', 'Roll-on Parfum', 'Festes Parfum', 'Parfum Refill',
];
export const isFragrance = (type) => FRAGRANCE_TYPES.includes(type);
export const isDiscovery = (type, title = '') => type === 'Discovery Set' || /^Discovery Set\b/i.test(title);

// Vergleich: deutsch, Groß/Klein und Akzente egal, Zahlen numerisch („45°“ vor „Absolu“, „2“ vor „10“)
const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });
export const clean = (s) => String(s || '')
  .replace(/­/g, '') // weiche Trennstriche
  .replace(/[“”„"«»‘’'`´]/g, '')
  .replace(/\s+/g, ' ')
  .trim();
export const compareText = (a, b) => collator.compare(clean(a), clean(b));

const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function makeParser(types = []) {
  const prefixes = [...new Set([...types, ...EXTRA_PREFIXES].filter(Boolean))]
    .sort((a, b) => b.length - a.length)
    .map((p) => ({ p, rx: new RegExp(`^${escapeRx(p)}(?=\\s|$)\\s*`, 'i') }));

  return function parse(title, type = '') {
    const raw = String(title || '').replace(/­/g, '').replace(/\s+/g, ' ').trim();
    const out = { scent: '', line: '', size: null, unit: '', mini: false, large: false, refill: false, parentTitle: '' };

    if (REFILL_RX.test(raw) || /Refill/i.test(type)) {
      out.refill = true;
      out.parentTitle = raw.replace(REFILL_RX, ' ').replace(/\s+/g, ' ').trim();
    }
    // Unterlinie in Anführungszeichen vor dem Bereinigen merken
    let rest = raw.replace(REFILL_RX, ' ').replace(/\s+/g, ' ').trim();
    if (/^Travel Size\s+/i.test(rest)) { out.mini = true; rest = rest.replace(/^Travel Size\s+/i, ''); }
    if (/^Mini[\s-]+/i.test(rest)) { out.mini = true; rest = rest.replace(/^Mini[\s-]+/i, ''); }
    rest = rest.replace(/^Roll-?On\s+/i, ''); // „Roll-On Extrait de Parfum Culot Thé“ – Art steht im Produkttyp
    const m = rest.match(SIZE_RX);
    if (m) {
      out.size = Number(m[1].replace(',', '.'));
      out.unit = m[2].toLowerCase();
      rest = rest.slice(0, m.index).trim();
      const grams = out.unit === 'kg' ? out.size * 1000 : out.size;
      const ml = out.unit === 'l' ? out.size * 1000 : out.unit === 'cl' ? out.size * 10 : out.size;
      if (out.unit === 'ml' || out.unit === 'cl' || out.unit === 'l') { if (ml <= 30) out.mini = true; else out.large = true; }
      else if (grams <= 100) out.mini = true; else out.large = true;
    }
    if (/\s+Mini$/i.test(rest)) { out.mini = true; rest = rest.replace(/\s+Mini$/i, ''); }
    for (const { rx } of prefixes) { if (rx.test(rest)) { rest = rest.replace(rx, ''); break; } }
    for (const suf of EN_SUFFIXES) { if (rest.length > suf.length && rest.toLowerCase().endsWith(` ${suf.toLowerCase()}`)) { rest = rest.slice(0, -suf.length).trim(); break; } }
    const q = rest.match(QUOTE_RX);
    if (q) { out.line = q[1].trim(); rest = rest.slice(q[0].length); }
    out.scent = clean(rest) || clean(raw);
    return out;
  };
}
