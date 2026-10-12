// Tests: Titel-Zerlegung, Regelkern, Züge und der ganze Worker gegen ein nachgebautes Shopify.
// FIXTURES=<Storefront-Abzug> npm test   (ohne Abzug laufen nur die Einheitstests)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeParser } from '../src/titles.js';
import { sortCollection, sortCategory, planMoves, simulateMoves, seasonActive } from '../src/engine.js';

let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); } catch (e) { failed++; console.log(`  ✗ ${name}\n    ${e.message}`); }
}

/* ------------------------------------------------------------------------------------------- */
console.log('titles.js');
const parse = makeParser(['Eau de Parfum', 'Duftkerze', 'Handcreme', 'Roll-on Parfum', 'Extrait de Parfum']);
await test('Typwort und Größe ab, klein erkannt', () => { const r = parse('Eau de Parfum Bois Impérial 10ml', 'Eau de Parfum'); assert.equal(r.scent, 'Bois Impérial'); assert.equal(r.mini, true); });
await test('große Kerze', () => { const r = parse('Duftkerze Baies 300 g', 'Duftkerze'); assert.equal(r.scent, 'Baies'); assert.equal(r.large, true); });
await test('Travel Size vorne', () => { const r = parse('Travel Size Eau de Parfum Mortel', 'Eau de Parfum'); assert.equal(r.scent, 'Mortel'); assert.equal(r.mini, true); });
await test('Unterlinie in Anführungszeichen + Refill mit Mutter', () => {
  const r = parse('Duftkerze “The Alabasters” Ernesto Refill', 'Duftkerzen Refill');
  assert.equal(r.scent, 'Ernesto'); assert.equal(r.line, 'The Alabasters'); assert.equal(r.refill, true); assert.equal(r.parentTitle, 'Duftkerze “The Alabasters” Ernesto');
});
await test('Mini vorne', () => { const r = parse('Mini Handcreme Lavendel', 'Handcreme'); assert.equal(r.scent, 'Lavendel'); assert.equal(r.mini, true); });
await test('Roll-On vorne', () => assert.equal(parse('Roll-On Extrait de Parfum Culot Thé', 'Roll-on Parfum').scent, 'Culot Thé'));
await test('weiche Trennstriche stören nicht', () => assert.equal(parse('Duft­kerze Feu de Bois', 'Duftkerze').scent, 'Duftkerze Feu de Bois'.replace('Duftkerze ', '') ));
await test('englische Bezeichnung hinten (Aesop)', () => assert.equal(makeParser(['Handbalsam'])('Resurrection Aromatique Hand Balm', 'Handbalsam').scent, 'Resurrection'));

/* ------------------------------------------------------------------------------------------- */
console.log('engine.js');
let n = 0;
const P = (title, type, extra = {}) => ({ id: String(++n), title, type, vendor: 'X', tags: [], status: 'ACTIVE', published: true, available: true, bestseller: false, pinUntil: null, series: [], image: { w: 1440, h: 1680 }, ...extra });
const titles = (res, list) => res.order.map((id) => list.find((p) => p.id === id).title);

await test('Muster C: Discovery Set, Bestseller, A–Z nach Duftname, Konzentrationen beisammen', () => {
  const list = [P('Eau de Parfum Zeta', 'Eau de Parfum'), P('Extrait de Parfum Alpha', 'Extrait de Parfum'), P('Eau de Parfum Alpha', 'Eau de Parfum'), P('Discovery Set X', 'Discovery Set'), P('Eau de Parfum Mitte', 'Eau de Parfum', { bestseller: true })];
  assert.deepEqual(titles(sortCollection(list, { pattern: 'C' }, { today: '2026-10-11' }), list), ['Discovery Set X', 'Eau de Parfum Mitte', 'Eau de Parfum Alpha', 'Extrait de Parfum Alpha', 'Eau de Parfum Zeta']);
});
await test('Muster C: höchstens drei Bestseller vorne', () => {
  const list = ['A', 'B', 'C', 'D', 'E'].map((x) => P(`Eau de Parfum ${x}`, 'Eau de Parfum', { bestseller: x !== 'E' }));
  const res = sortCollection(list, { pattern: 'C' }, { today: '2026-10-11' });
  assert.deepEqual(titles(res, list).map((t) => t.slice(-1)), ['A', 'B', 'C', 'D', 'E']);
  assert.equal(res.groups[list[3].id], 'Düfte');
  assert.ok(res.notes.some((x) => x.kind === 'bestseller-zu-viele'));
});
await test('Ausverkauft ans Ende, schlägt Neu und Pin; teilweise ausverkauft bleibt (available = true)', () => {
  const list = [P('Eau de Parfum A', 'Eau de Parfum', { available: false, tags: ['neu'] }), P('Eau de Parfum B', 'Eau de Parfum'), P('Eau de Parfum C', 'Eau de Parfum', { available: false, pinUntil: '2026-12-01' }), P('Eau de Parfum D', 'Eau de Parfum')];
  assert.deepEqual(titles(sortCollection(list, { pattern: 'C' }, { today: '2026-10-11' }), list), ['Eau de Parfum B', 'Eau de Parfum D', 'Eau de Parfum A', 'Eau de Parfum C']);
});
await test('Pin vor Neu vor Saison; Pin läuft ab', () => {
  const list = [P('Eau de Parfum A', 'Eau de Parfum'), P('Eau de Parfum B', 'Eau de Parfum', { tags: ['saison-weihnachten'] }), P('Eau de Parfum C', 'Eau de Parfum', { tags: ['neu'] }), P('Eau de Parfum D', 'Eau de Parfum', { pinUntil: '2026-11-20' })];
  assert.deepEqual(titles(sortCollection(list, { pattern: 'C' }, { today: '2026-11-05' }), list), ['Eau de Parfum D', 'Eau de Parfum C', 'Eau de Parfum B', 'Eau de Parfum A']);
  assert.deepEqual(titles(sortCollection(list, { pattern: 'C' }, { today: '2026-11-21' }), list), ['Eau de Parfum C', 'Eau de Parfum B', 'Eau de Parfum A', 'Eau de Parfum D']);
  // außerhalb der Saison steht B wieder an seinem Regelplatz
  assert.deepEqual(titles(sortCollection(list, { pattern: 'C' }, { today: '2026-10-11' }), list), ['Eau de Parfum D', 'Eau de Parfum C', 'Eau de Parfum A', 'Eau de Parfum B']);
});
await test('Tag „pin“ ohne Datum pinnt nicht und landet im Bericht', () => {
  const list = [P('Eau de Parfum A', 'Eau de Parfum'), P('Eau de Parfum B', 'Eau de Parfum', { tags: ['pin'] })];
  const res = sortCollection(list, { pattern: 'C' }, { today: '2026-10-11' });
  assert.deepEqual(titles(res, list), ['Eau de Parfum A', 'Eau de Parfum B']);
  assert.ok(res.notes.some((x) => x.kind === 'pin-ohne-datum'));
});
await test('Saisonfenster über den Jahreswechsel', () => {
  assert.equal(seasonActive({ from: '11-01', to: '01-06' }, '2027-01-03'), true);
  assert.equal(seasonActive({ from: '11-01', to: '01-06' }, '2026-10-31'), false);
});
await test('Muster B: Blockfolge, Zugpferd, Größen (Standard, groß, klein), Refill hinter Mutter', () => {
  const list = [P('Diffusor Ambre', 'Diffusor'), P('Duftkerze Baies Mini', 'Duftkerze'), P('Duftkerze Baies Refill', 'Duftkerzen Refill'), P('Duftkerze Baies 300g', 'Duftkerze'), P('Duftkerze Baies', 'Duftkerze'), P('Duftkerze Forêts', 'Duftkerze'), P('Diffusor Forêts', 'Diffusor')];
  const res = sortCollection(list, { pattern: 'B', lead: ['Forêts'], refills: 'after-parent', blocks: ['Duftkerze', 'Diffusor'] }, { today: '2026-10-11' });
  assert.deepEqual(titles(res, list), ['Duftkerze Forêts', 'Duftkerze Baies', 'Duftkerze Baies Refill', 'Duftkerze Baies 300g', 'Duftkerze Baies Mini', 'Diffusor Forêts', 'Diffusor Ambre']);
});
await test('Muster B: nicht sichtbare Produkte ans Ende ihres Blocks, unbekannte Art ans Ende mit Hinweis', () => {
  const list = [P('Duftkerze A', 'Duftkerze', { status: 'DRAFT' }), P('Duftkerze B', 'Duftkerze'), P('Kerzenschere', 'Werkzeug'), P('Raumspray A', 'Raumspray')];
  const res = sortCollection(list, { pattern: 'B', blocks: ['Duftkerze', 'Raumspray'] }, { today: '2026-10-11' });
  assert.deepEqual(titles(res, list), ['Duftkerze B', 'Duftkerze A', 'Raumspray A', 'Kerzenschere']);
  assert.ok(res.notes.some((x) => x.kind === 'ohne-regel'));
});
await test('Muster A: Serien in Folge, Serien-Discovery-Set vorne, Extrait folgt seinem Duft in die Serie', () => {
  const list = [P('Eau de Parfum Ohne', 'Eau de Parfum'), P('Eau de Parfum Zwei', 'Eau de Parfum', { series: ['s2'] }), P('Extrait de Parfum Eins', 'Extrait de Parfum'), P('Eau de Parfum Eins', 'Eau de Parfum', { series: ['s1'] }), P('Discovery Set S2', 'Discovery Set', { series: ['s2'] }), P('Discovery Set Marke', 'Discovery Set'), P('Bodylotion Eins', 'Bodylotion')];
  const res = sortCollection(list, { pattern: 'A', series: ['s1', 's2'] }, { today: '2026-10-11' });
  assert.deepEqual(titles(res, list), ['Discovery Set Marke', 'Eau de Parfum Eins', 'Extrait de Parfum Eins', 'Discovery Set S2', 'Eau de Parfum Zwei', 'Eau de Parfum Ohne', 'Bodylotion Eins']);
});
await test('Muster C mit seriesLast: Hauptlinie A–Z, Serie als Block dahinter', () => {
  const list = [P('Eau de Parfum Liwa', 'Eau de Parfum', { series: ['oasis'] }), P('Eau de Parfum Ambre Extrême', 'Eau de Parfum'), P('Eau de Parfum Vanille Extrême', 'Eau de Parfum'), P('Eau de Parfum Skoura', 'Eau de Parfum', { series: ['oasis'] })];
  assert.deepEqual(titles(sortCollection(list, { pattern: 'C', seriesLast: true }, { today: '2026-10-11' }), list), ['Eau de Parfum Ambre Extrême', 'Eau de Parfum Vanille Extrême', 'Eau de Parfum Liwa', 'Eau de Parfum Skoura']);
});
await test('Bild-Regel: ohne 6:7-Packshot ans Ende des Blocks', () => {
  const list = [P('Eau de Parfum A', 'Eau de Parfum', { image: { w: 1440, h: 1440 } }), P('Eau de Parfum B', 'Eau de Parfum')];
  assert.deepEqual(titles(sortCollection(list, { pattern: 'C' }, { today: '2026-10-11' }), list), ['Eau de Parfum B', 'Eau de Parfum A']);
});
await test('Neu-Refill bleibt beim Mutterprodukt', () => {
  const list = [P('Duftkerze A', 'Duftkerze'), P('Duftkerze B', 'Duftkerze'), P('Duftkerze B Refill', 'Duftkerzen Refill', { tags: ['neu'] })];
  assert.deepEqual(titles(sortCollection(list, { pattern: 'B', refills: 'after-parent', blocks: ['Duftkerze'] }, { today: '2026-10-11' }), list), ['Duftkerze A', 'Duftkerze B', 'Duftkerze B Refill']);
});
await test('Gleiche Eingabe → gleiche Ausgabe (Ruhe statt Dauerwechsel)', () => {
  const list = ['Q', 'B', 'X', 'A'].map((x) => P(`Eau de Parfum ${x}`, 'Eau de Parfum'));
  const a = sortCollection(list, { pattern: 'C' }, { today: '2026-10-11' }).order;
  const b = sortCollection(a.map((id) => list.find((p) => p.id === id)), { pattern: 'C' }, { today: '2026-10-11' }).order;
  assert.deepEqual(a, b);
});

/* ------------------------------------------------------------------------------------------- */
console.log('Kategorien');
const V = (vendor, title, type, extra = {}) => P(title, type, { vendor, ...extra });
await test('Markenblöcke in der Markenfolge, unbekannte Marke hinten mit Hinweis, Ausverkauft ans Seitenende', () => {
  const list = [V('Zeta', 'Duftkerze Z', 'Duftkerze'), V('Diptyque', 'Duftkerze Baies', 'Duftkerze'), V('Trudon', 'Duftkerze Cire', 'Duftkerze', { available: false }), V('Trudon', 'Duftkerze Abd El Kader', 'Duftkerze'), V('Diptyque', 'Duftkerze Ambre', 'Duftkerze')];
  const res = sortCategory(list, { mode: 'blocks', brandOrder: ['Trudon', 'Diptyque'] }, { today: '2026-10-11' });
  assert.deepEqual(titles(res, list), ['Duftkerze Abd El Kader', 'Duftkerze Ambre', 'Duftkerze Baies', 'Duftkerze Z', 'Duftkerze Cire']);
  assert.ok(res.notes.some((x) => x.kind === 'marke-ohne-platz'));
});
await test('Schaufenster ab 40 Produkten: je Marke eines (Bestseller vor dem ersten), dann die Blöcke', () => {
  const list = [];
  for (const b of ['A', 'B', 'C']) for (let i = 0; i < 15; i++) list.push(V(b, `Eau de Parfum ${b}${String(i).padStart(2, '0')}`, 'Eau de Parfum', { bestseller: b === 'B' && i === 7 }));
  const res = sortCategory(list, { mode: 'blocks', brandOrder: ['A', 'B', 'C'] }, { today: '2026-10-11' });
  const t = titles(res, list);
  assert.deepEqual(t.slice(0, 4), ['Eau de Parfum A00', 'Eau de Parfum B07', 'Eau de Parfum C00', 'Eau de Parfum A01']);
  assert.equal(res.showcase, 3);
});
await test('Schaufenster: Diptyque bekommt immer einen Platz, Team Pick vor dem ersten Produkt', () => {
  const list = [];
  for (const b of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'Diptyque']) for (let i = 0; i < 5; i++) list.push(V(b, `Eau de Parfum ${b}${i}`, 'Eau de Parfum', { teamPick: b === 'A' && i === 3 }));
  const res = sortCategory(list, { mode: 'blocks', brandOrder: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'Diptyque'] }, { today: '2026-10-11' });
  const t = titles(res, list).slice(0, 8);
  assert.deepEqual(t, ['Eau de Parfum A3', 'Eau de Parfum B0', 'Eau de Parfum C0', 'Eau de Parfum D0', 'Eau de Parfum E0', 'Eau de Parfum F0', 'Eau de Parfum G0', 'Eau de Parfum Diptyque0']);
  assert.match(res.groups[list[3].id], /Team Pick/);
});
await test('Schaufenster: Neu vor Bestseller', () => {
  const list = [];
  for (const b of ['A', 'B', 'C']) for (let i = 0; i < 15; i++) list.push(V(b, `Eau de Parfum ${b}${String(i).padStart(2, '0')}`, 'Eau de Parfum', { bestseller: i === 3, tags: b === 'A' && i === 9 ? ['neu'] : [] }));
  const res = sortCategory(list, { mode: 'blocks', brandOrder: ['A', 'B', 'C'] }, { today: '2026-10-11' });
  assert.deepEqual(titles(res, list).slice(0, 3), ['Eau de Parfum A09', 'Eau de Parfum B03', 'Eau de Parfum C03']);
});
await test('Zugpferd: auf der Markenseite in jedem Block zuerst, im Schaufenster vor Neu und Bestseller', () => {
  const brand = [P('Eau de Parfum Ambre Latte', 'Eau de Parfum'), P('Eau de Parfum Bois Impérial', 'Eau de Parfum'), P('Handcreme Ambre', 'Handcreme'), P('Handcreme Bois Impérial', 'Handcreme')];
  assert.deepEqual(titles(sortCollection(brand, { pattern: 'B', lead: ['Bois Impérial'], blocks: ['Eau de Parfum', 'Handcreme'] }, { today: '2026-10-11' }), brand), ['Eau de Parfum Bois Impérial', 'Eau de Parfum Ambre Latte', 'Handcreme Bois Impérial', 'Handcreme Ambre']);
  const list = [];
  for (const b of ['EP', 'X', 'Y']) for (let i = 0; i < 15; i++) list.push(V(b, `Eau de Parfum ${b === 'EP' && i === 12 ? 'Bois Impérial' : `${b}${String(i).padStart(2, '0')}`}`, 'Eau de Parfum', { bestseller: i === 2, tags: i === 5 ? ['neu'] : [] }));
  const rules = { EP: { pattern: 'C', lead: ['Bois Impérial'] } };
  const res = sortCategory(list, { mode: 'blocks', brandOrder: ['EP', 'X', 'Y'] }, { today: '2026-10-11', brandRuleFor: (v) => rules[v] || { pattern: 'C' } });
  assert.equal(titles(res, list)[0], 'Eau de Parfum Bois Impérial');
  assert.match(res.groups[list[12].id], /Zugpferd/);
});
await test('Zugpferd mit Apostroph und Gedankenstrich (Goutal Noël)', () => {
  const brand = [P('Duftkerze Ambre', 'Duftkerze'), P('Duftkerze Noël — Une Forêt d’Or', 'Duftkerze'), P('Duftkerze Noël — Une Forêt d’Or 300g', 'Duftkerze')];
  assert.deepEqual(titles(sortCollection(brand, { pattern: 'C', lead: ['Noël — Une Forêt d’Or'] }, { today: '2026-10-11' }), brand), ['Duftkerze Noël — Une Forêt d’Or', 'Duftkerze Noël — Une Forêt d’Or 300g', 'Duftkerze Ambre']);
});
await test('Klassiker: vorne im Block nach dem Zugpferd, auch in anderen Produktarten desselben Dufts', () => {
  const brand = [P('Duftkerze Ambre', 'Duftkerze'), P('Duftkerze Baies 300g', 'Duftkerze'), P('Duftkerze Zeder', 'Duftkerze'), P('Duftkerze Baies', 'Duftkerze', { tags: ['klassiker'] }), P('Duftkerze Forêts', 'Duftkerze'),
    P('Raumspray Ambre', 'Raumspray'), P('Raumspray Baies', 'Raumspray')];
  const rule = { pattern: 'B', lead: ['Forêts'], blocks: ['Duftkerze', 'Raumspray'] };
  const res = sortCollection(brand, rule, { today: '2026-10-11' });
  assert.deepEqual(titles(res, brand), ['Duftkerze Forêts', 'Duftkerze Baies', 'Duftkerze Baies 300g', 'Duftkerze Ambre', 'Duftkerze Zeder', 'Raumspray Baies', 'Raumspray Ambre']);
  assert.equal(res.classic.length, 3);
  // Kategorie ohne das Leitprodukt: das Tag kommt über classicsFor
  const sprays = [V('D', 'Raumspray Ambre', 'Raumspray'), V('D', 'Raumspray Baies', 'Raumspray')];
  const cat = sortCategory(sprays, { mode: 'blocks', brandOrder: ['D'] }, { today: '2026-10-11', classicsFor: (v) => (v === 'D' ? [{ title: 'Duftkerze Baies', type: 'Duftkerze' }] : []) });
  assert.deepEqual(titles(cat, sprays), ['Raumspray Baies', 'Raumspray Ambre']);
});
await test('Klassiker: Kurzname passt zur Linie (Aramara ↔ Aramara Stile), Discovery Set zählt nicht', () => {
  const brand = [P('Raumspray Mediterranea', 'Raumspray'), P('Raumspray Aramara', 'Raumspray'), P('Diffusor Aramara Stile', 'Diffusor', { tags: ['klassiker'] })];
  assert.deepEqual(titles(sortCollection(brand, { pattern: 'B', blocks: ['Diffusor', 'Raumspray'] }, { today: '2026-10-11' }), brand), ['Diffusor Aramara Stile', 'Raumspray Aramara', 'Raumspray Mediterranea']);
});
await test('Schaufenster: Bestseller vor Klassiker vor Team Pick', () => {
  const list = [];
  for (const b of ['A', 'B', 'C']) for (let i = 0; i < 15; i++) list.push(V(b, `Eau de Parfum ${b}${String(i).padStart(2, '0')}`, 'Eau de Parfum', {
    bestseller: b === 'A' && i === 4, teamPick: i === 2, tags: i === 7 ? ['klassiker'] : [] }));
  const res = sortCategory(list, { mode: 'blocks', brandOrder: ['A', 'B', 'C'] }, { today: '2026-10-11' });
  assert.deepEqual(titles(res, list).slice(0, 3), ['Eau de Parfum A04', 'Eau de Parfum B07', 'Eau de Parfum C07']);
  assert.match(res.groups[list[22].id], /Klassiker/);
});
await test('Schaufenster: neues Set zählt nicht als Neu, Bestseller kommt vor', () => {
  const list = [];
  for (const b of ['A', 'B', 'C']) for (let i = 0; i < 15; i++) list.push(V(b, `Eau de Parfum ${b}${String(i).padStart(2, '0')}`, 'Eau de Parfum', { bestseller: i === 6 }));
  list.push(V('A', 'Set mit 3 Eaux de Parfum', 'Eau de Parfum Set', { tags: ['neu'] }));
  const res = sortCategory(list, { mode: 'blocks', brandOrder: ['A', 'B', 'C'] }, { today: '2026-10-11' });
  assert.equal(titles(res, list)[0], 'Eau de Parfum A06');
});
await test('Schaufenster: Set nur im Titel zählt nicht als Neu, Refills nie im Schaufenster', () => {
  const list = [];
  for (const b of ['A', 'B', 'C']) for (let i = 0; i < 15; i++) list.push(V(b, `Duftkerze ${b}${String(i).padStart(2, '0')}`, 'Duftkerze', { bestseller: i === 6 }));
  list.unshift(V('A', 'Set mit 3 Eaux de Parfum', 'Eau de Parfum', { tags: ['neu'] }));
  list.unshift(V('B', 'Duftkerze Baies Refill', 'Duftkerzen Refill', { tags: ['neu'] }));
  list.unshift(V('C', 'Duftkerze C99 Refill', 'Duftkerzen Refill', { bestseller: true }));
  const res = sortCategory(list, { mode: 'blocks', brandOrder: ['A', 'B', 'C'] }, { today: '2026-10-11' });
  assert.deepEqual(titles(res, list).slice(0, 3), ['Duftkerze A06', 'Duftkerze B06', 'Duftkerze C06']);
});
await test('Schaufenster: Pins ganz vorne, mehrere je Marke, früheres Pin-Datum zuerst', () => {
  const list = [];
  for (const b of ['A', 'B', 'C']) for (let i = 0; i < 15; i++) list.push(V(b, `Duftkerze ${b}${String(i).padStart(2, '0')}`, 'Duftkerze', {
    bestseller: i === 6,
    pinUntil: (b === 'A' && (i === 5 || i === 9)) ? '2027-01-06' : (b === 'C' && i === 3) ? '2026-12-24' : null }));
  list.push(V('A', 'Duftkerze A99', 'Duftkerze', { pinUntil: '2026-10-01' })); // abgelaufen
  const res = sortCategory(list, { mode: 'blocks', brandOrder: ['A', 'B', 'C'] }, { today: '2026-10-12' });
  assert.deepEqual(titles(res, list).slice(0, 4), ['Duftkerze C03', 'Duftkerze A05', 'Duftkerze A09', 'Duftkerze B06']);
  assert.match(res.groups[list[3 + 30].id], /Schaufenster · C · Pin/);
});
await test('Neu: jüngster Veröffentlichungstag zuerst, am selben Tag Regelordnung', () => {
  const list = [P('Eau de Parfum Alt', 'Eau de Parfum', { tags: ['neu'], publishedAt: '2026-09-02T08:00:00Z' }), P('Eau de Parfum Zeta', 'Eau de Parfum', { tags: ['neu'], publishedAt: '2026-10-10T08:00:00Z' }),
    P('Eau de Parfum Beta', 'Eau de Parfum', { tags: ['neu'], publishedAt: '2026-10-10T09:00:00Z' }), P('Eau de Parfum Rest', 'Eau de Parfum')];
  assert.deepEqual(titles(sortCollection(list, { pattern: 'C' }, { today: '2026-10-11' }), list), ['Eau de Parfum Beta', 'Eau de Parfum Zeta', 'Eau de Parfum Alt', 'Eau de Parfum Rest']);
});
await test('Neuheiten-Seite: nach Veröffentlichungstag, nicht Anlagedatum; Ausverkauft ans Ende', () => {
  const list = [V('A', 'Eau de Parfum A1', 'Eau de Parfum', { tags: ['neu'], publishedAt: '2026-09-20T08:00:00Z' }), V('B', 'Duftkerze B1', 'Duftkerze', { tags: ['neu'], publishedAt: '2026-10-20T08:00:00Z' }),
    V('A', 'Eau de Parfum A2', 'Eau de Parfum', { tags: ['neu'], publishedAt: '2026-10-20T07:00:00Z' }), V('C', 'Eau de Parfum C1', 'Eau de Parfum', { tags: ['neu'], publishedAt: '2026-10-21T07:00:00Z', available: false })];
  const res = sortCategory(list, { mode: 'new', brandOrder: ['B', 'A'] }, { today: '2026-10-21' });
  assert.deepEqual(titles(res, list), ['Duftkerze B1', 'Eau de Parfum A2', 'Eau de Parfum A1', 'Eau de Parfum C1']);
});
await test('Neu steht vorne im eigenen Markenblock, nicht ganz oben', () => {
  const list = [V('A', 'Eau de Parfum A1', 'Eau de Parfum'), V('B', 'Eau de Parfum B1', 'Eau de Parfum'), V('B', 'Eau de Parfum B2', 'Eau de Parfum', { tags: ['neu'] })];
  assert.deepEqual(titles(sortCategory(list, { mode: 'blocks', brandOrder: ['A', 'B'] }, { today: '2026-10-11' }), list), ['Eau de Parfum A1', 'Eau de Parfum B2', 'Eau de Parfum B1']);
});
await test('Handauswahl bleibt, nur Ausverkauftes und Unsichtbares ans Ende', () => {
  const list = [V('A', 'X', 'Tee', { available: false }), V('B', 'Y', 'Tee'), V('A', 'Z', 'Tee', { status: 'DRAFT' }), V('C', 'W', 'Tee')];
  assert.deepEqual(titles(sortCategory(list, { mode: 'curated' }, { today: '2026-10-11' }), list), ['Y', 'W', 'X', 'Z']);
});
await test('Markennamen mit typografischem Apostroph werden erkannt', () => {
  const list = [V('L’Artisan Parfumeur', 'Eau de Parfum L', 'Eau de Parfum'), V('D’Orsay', 'Eau de Parfum D', 'Eau de Parfum')];
  assert.deepEqual(titles(sortCategory(list, { mode: 'blocks', brandOrder: ["D'Orsay", 'L’Artisan Parfumeur'] }, { today: '2026-10-11' }), list), ['Eau de Parfum D', 'Eau de Parfum L']);
});

/* ------------------------------------------------------------------------------------------- */
console.log('Züge');
await test('planMoves: Nachspielen ergibt die Zielreihenfolge, so wenige Züge wie nötig', () => {
  for (let t = 0; t < 2000; t++) {
    const len = 1 + Math.floor(Math.random() * 300);
    const cur = [...Array(len).keys()].map(String);
    const tgt = cur.slice();
    for (let j = Math.floor(Math.random() * 6); j > 0; j--) { const a = Math.floor(Math.random() * len); const [x] = tgt.splice(a, 1); tgt.splice(Math.floor(Math.random() * len), 0, x); }
    if (t % 5 === 0) tgt.sort(() => Math.random() - 0.5);
    const moves = planMoves(cur, tgt);
    assert.deepEqual(simulateMoves(cur, moves), tgt);
  }
});
await test('planMoves: ein ausverkauftes Produkt ans Ende = ein Zug', () => {
  const cur = ['a', 'b', 'c', 'd', 'e'];
  assert.deepEqual(planMoves(cur, ['b', 'c', 'd', 'e', 'a']), [{ id: 'a', newPosition: 4 }]);
  assert.deepEqual(planMoves(cur, cur), []);
});

/* ------------------------------------------------------------------------------------------- */
const FIX = process.env.FIXTURES || 'fixtures';
if (fs.existsSync(`${FIX}/brands`)) {
  console.log('Worker gegen nachgebautes Shopify');
  const { loadShop, createMockFetch, memoryKV } = await import('./mock-shopify.mjs');
  const worker = (await import('../src/index.js')).default;
  const shop = loadShop(FIX);
  const realFetch = globalThis.fetch;
  globalThis.fetch = createMockFetch(shop);
  const kv = memoryKV();
  const env = (mode, cat = 'dryrun') => ({ SHOPIFY_CLIENT_ID: 'id', SHOPIFY_CLIENT_SECRET: 'secret', ADMIN_TOKEN: 'geheim', MODE: mode, CATEGORY_MODE: cat, SORT: kv, JOB_POLL_MS: '5' });
  const call = async (p, mode = 'dryrun', cat = 'dryrun') => { const r = await worker.fetch(new Request(`https://sort.test${p}`), env(mode, cat)); return { status: r.status, body: await r.json() }; };
  const order = (h) => shop.collections.find((c) => c.handle === h).ids.slice();

  await test('/health ohne Token, meldet Betriebsart', async () => { const r = await call('/health'); assert.equal(r.body.configured, true); assert.equal(r.body.mode, 'dryrun'); });
  await test('/admin/scopes zeigt die Rechte der App', async () => { const r = await call('/admin/scopes?token=geheim'); assert.equal(r.body.canWrite, true); });
  await test('/admin ohne Token verboten', async () => assert.equal((await call('/admin/dryrun')).status, 403));
  await test('Trockenlauf schreibt nichts', async () => {
    const before = order('diptyque');
    const r = await call('/admin/dryrun?token=geheim&only=diptyque');
    assert.equal(r.body.results[0].changed, true);
    assert.ok(r.body.results[0].target.length > 100);
    assert.deepEqual(order('diptyque'), before);
    assert.equal(shop.reorders, 0);
  });
  await test('Schreiben bei MODE dryrun abgelehnt', async () => assert.equal((await call('/admin/run?token=geheim&only=trudon&write=1')).status, 409));
  await test('Schreiben bei MODE manual: Zielreihenfolge steht danach im Shop, Gegencheck ok', async () => {
    const r = await call('/admin/run?token=geheim&only=trudon,diptyque&write=1', 'manual');
    for (const x of r.body.results) { assert.equal(x.error, undefined, x.error); assert.equal(x.written, true); assert.equal(x.verified, true); }
    const again = await call('/admin/dryrun?token=geheim&only=trudon,diptyque');
    for (const x of again.body.results) { assert.equal(x.changed, false); assert.equal(x.externalChange, false); }
  });
  await test('Kategorien schreiben nur mit CATEGORY_MODE manual/live', async () => {
    const before = order('eau-de-parfum');
    const r = await call('/admin/run?token=geheim&only=eau-de-parfum&write=1', 'manual', 'dryrun');
    assert.equal(r.body.results[0].written, undefined);
    assert.deepEqual(order('eau-de-parfum'), before);
    const r2 = await call('/admin/run?token=geheim&only=eau-de-parfum&write=1', 'dryrun', 'manual');
    assert.equal(r2.body.results[0].verified, true, JSON.stringify(r2.body.results[0]).slice(0, 300));
  });
  await test('Ganzer Lauf (Zeitplan, live): alle Marken- und Kategorieseiten, danach nichts mehr zu tun', async () => {
    const waits = [];
    await worker.scheduled({ cron: '20 4 * * *', scheduledTime: Date.now() }, env('live', 'live'), { waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
    const rep = (await call('/admin/report?token=geheim')).body;
    assert.equal(rep.errors, 0, JSON.stringify(rep.results.filter((x) => x.error).slice(0, 3)));
    assert.equal(rep.brands, 70);
    assert.ok(rep.categories > 150, String(rep.categories));
    const again = await call('/admin/dryrun?token=geheim');
    assert.equal(again.body.changed, 0, JSON.stringify(again.body.results.filter((x) => x.changed).map((x) => x.handle)));
  });
  await test('Von außen umsortiert (Jedi, Hand) wird erkannt', async () => {
    const c = shop.collections.find((x) => x.handle === 'trudon'); c.ids.push(c.ids.shift());
    const r = await call('/admin/dryrun?token=geheim&only=trudon');
    assert.equal(r.body.results[0].externalChange, true);
  });
  globalThis.fetch = realFetch;
}

console.log(failed ? `\n${failed} Test(s) fehlgeschlagen` : '\nalle Tests grün');
process.exit(failed ? 1 : 0);
