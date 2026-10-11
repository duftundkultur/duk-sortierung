// Regeldatei des Sortier-Motors.
// Dauerhafte Regeln (Muster und Blockfolgen je Marke) stehen hier und ändert Claude.
// Zeitliches (Pin, Neu, Saison) steuert das Team im Shopify-Admin über Tags und das Feld „Pin bis“.
// Konzept: Claude-Dokument „Sortierung — Konzept“ · Regelwerk: Projekt-Dokument claude/sortierung-regelwerk.md
//
// Muster
//   A  Serien:     Discovery Sets der Marke → Serienblöcke in fester Folge (Serien-Discovery-Set vorne) → Düfte ohne Serie → Rest
//   B  Typ-Blöcke: Discovery Set → Blöcke in der Folge der Marke; im Block nach Duftname, Zugpferd (lead) zuerst
//   C  A–Z:        Discovery Sets → bis zu drei Bestseller → Düfte A–Z nach Duftname (Konzentrationen beisammen) → übrige Arten
//   L  wie bisher: Live-Reihenfolge bleibt, nur die allgemeinen Regeln greifen (Platzhalter, bis die Marke eine Regel hat)
//
// Blockangabe: 'Duftkerze' · ['Flüssigseife', 'Handbalsam'] (gemeinsamer Block, je Duft beisammen)
//   · { types, mini: true|false, series: '<Serien-Handle>', title: '<Regex>', lead: ['Forêts'], order: 'scent'|'type'|'title'|'live', typeOrder: [...] }
// Muster C: seriesLast: true → Hauptlinie A–Z, Serien als Block dahinter
// Refills: 'block' (eigener Block nach Produktart) oder 'after-parent' (direkt hinter dem Mutterprodukt, Titel ohne „Refill“);
//   auch je Produktart: { 'Duftkerzen Refill': 'after-parent', default: 'block' }

export const SETTINGS = {
  neuTag: 'neu', // gesetzt/entfernt von Shopify Flow (42 Tage nach Veröffentlichung)
  neuRefills: false, // Refills mit „neu“ bleiben bei ihrem Mutterprodukt statt ganz vorne
  pinTag: 'pin', // Hinweis-Tag; wirksam ist das Datum im Feld „Pin bis“ (custom.pin_bis)
  seasons: {
    // Tag → Fenster MM-DD bis MM-DD (Ende Weihnachten noch offen: 24.12. oder 6.1.; Sommer noch nicht festgelegt)
    'saison-weihnachten': { from: '11-01', to: '12-24' },
    'saison-sommer': { from: '06-01', to: '08-31' },
  },
  bestsellerMax: 3,
  imageRule: true, // erstes Bild kein 6:7-Packshot → ans Ende des eigenen Blocks
  imageRatio: 6 / 7,
  imageTolerance: 0.01,
};

// Grundfolge der Produktarten (Muster C und für Arten ohne Block)
export const TYPE_ORDER = [
  'Discovery Set', 'Eau de Parfum', 'Extrait de Parfum', 'Parfum', 'Eau de Toilette', 'Eau de Cologne', 'Eau Fraîche',
  'Haarparfum', 'Hair & Body Mist', 'Roll-on Parfum', 'Festes Parfum', 'Parfum Refill', 'Eau de Parfum Set',
  'Duftkerze', 'Duftkerzen Refill', 'Stabkerze', 'Stumpenkerze', 'Duftkerzen Zubehör',
  'Diffusor', 'Diffusor Refill', 'Elektrischer Diffusor', 'Duftkartusche', 'Rattanstäbchen', 'Raumspray', 'Textilspray',
  'Schrankduft', 'Autoduft', 'Duftöl', 'Räucherstäbchen', 'Räucherwerk', 'Räucherharz', 'Räuchermittelhalter', 'Streichholz', 'Staubsaugerpulver',
  'Feste Seife', 'Flüssigseife', 'Seifen Refill', 'Waschgel', 'Duschöl', 'Badesalz', 'Körperpeeling', 'Bodylotion', 'Körperbalsam', 'Körperöl',
  'Handcreme', 'Handbalsam', 'Fußcreme', 'Lippenbalsam', 'Deodorant', 'Gesichtswasser', 'Sonnencreme', 'After Sun', 'Mückenspray',
  'Shampoo', 'Conditioner', 'Haarmaske', 'Rasierseife', 'Rasiercreme', 'Aftershave', 'Bartöl', 'Rasierpinsel', 'Zahnpasta', 'Mundwasser',
  'Saunaöl', 'Pflegeset', 'Reiseset', 'Naturschwamm', 'Peelinghandschuh', 'Seifenablage', 'Sprühkopf',
  'Waschmittel', 'Geschirrspülmittel', 'Universalreiniger', 'Holz- & Lederpflege',
  'Hamamtuch', 'Handtuch', 'Strandtuch', 'Strandkissen', 'Bademantel', 'Decke', 'Fächer', 'Kulturbeutel', 'Wärmflasche', 'Augenkissen',
  'Tee', 'Adventskalender', 'Gutschein', 'Refill',
];

// Schlüssel = Handle der Markenkollektion. Marken ohne Eintrag laufen nach Muster C (und erscheinen im Bericht).
export const BRANDS = {
  /* ---------- Muster A: Serien ---------- */
  'penhaligon-s': { pattern: 'A', series: ['penhaligons-portraits', 'penhaligons-british-tales', 'penhaligons-trade-routes', 'penhaligons-potions-remedies'] },
  'd-annam': { pattern: 'A', series: ['dannam-enchanting-vietnam', 'dannam-memories-of-japan', 'dannam-majestic-china'] },
  'l-artisan-parfumeur': { pattern: 'A', series: ['lartisan-parfumeur-la-collection', 'lartisan-parfumeur-la-botanique', 'lartisan-parfumeur-les-merveilles', 'lartisan-parfumeur-les-paysages', 'lartisan-parfumeur-le-potager'] },
  'bdk-parfums': { pattern: 'A', series: ['bdk-collection-parisienne', 'bdk-collection-matieres', 'bdk-collection-azur', 'bdk-collection-exclusive'] },
  'l-atelier-parfum': { pattern: 'A', series: ['latelier-parfum-opus-ii', 'latelier-parfum-opus-iii'] },
  'adamo-parfum': { pattern: 'A', series: ['adamo-parfum-roman-collection', 'adamo-parfum-costiera-collection'] },
  'l-t-piver': { pattern: 'A', series: ['lt-piver-collection-historique', 'lt-piver-collection-voyage'] },

  /* ---------- Muster B: Typ-Blöcke (festgelegt) ---------- */
  diptyque: {
    pattern: 'B',
    refills: { Diffusor: 'block', default: 'after-parent' },
    blocks: [
      { series: 'diptyque-les-rituels-de-soin', label: 'Les Rituels de Soin', typeOrder: ['Duftkerze', 'Waschgel', 'Bodylotion', 'Körperbalsam', 'Körperöl', 'Lippenbalsam', 'Pflegeset'] },
      'Eau de Parfum', 'Eau de Toilette', 'Haarparfum', 'Festes Parfum', 'Parfum Refill',
      'Duftkerze', 'Duftkerzen Refill', 'Duftkerzen Zubehör',
      'Diffusor', 'Elektrischer Diffusor', 'Duftkartusche', 'Raumspray', 'Schrankduft', 'Autoduft',
      'Waschgel', 'Duschöl', 'Feste Seife', 'Seifen Refill', 'Flüssigseife', 'Handcreme', 'Handbalsam', 'Bodylotion', 'Körperbalsam', 'Körperöl', 'Lippenbalsam', 'Pflegeset',
      'Geschirrspülmittel', 'Universalreiniger', 'Spülbürste', 'Holz- & Lederpflege', 'Refill', 'Adventskalender',
    ],
  },
  trudon: {
    pattern: 'B',
    refills: { 'Duftkerzen Refill': 'after-parent', default: 'block' }, // Alabaster-Refill ans Ende der Duftgruppe
    blocks: ['Duftkerze', 'Duftkerzen Refill', 'Duftkerzen Zubehör', 'Eau de Parfum', 'Raumspray', 'Diffusor', 'Diffusor Refill', 'Flüssigseife', 'Seifen Refill'],
  },
  'essential-parfums': {
    pattern: 'B',
    blocks: [
      { types: ['Eau de Parfum', 'Extrait de Parfum'], mini: false, label: 'Eau de Parfum 100 ml mit Extrait' },
      { types: ['Eau de Parfum'], mini: true, label: 'Eau de Parfum 10 ml' },
      'Parfum Refill', 'Hair & Body Mist', 'Handcreme', 'Duftkerze', 'Flüssigseife', 'Seifen Refill', 'Waschmittel',
    ],
  },
  aesop: {
    pattern: 'B',
    blocks: [
      'Eau de Parfum', ['Flüssigseife', 'Handbalsam'], 'Waschgel', 'Feste Seife', 'Körperpeeling', 'Körperbalsam', 'Körperöl',
      'Shampoo', 'Conditioner', 'Haarmaske', 'Bartöl', 'Lippenbalsam', 'Deodorant', 'Zahnpasta', 'Mundwasser', 'Reiseset',
      'Duftöl', // Post-Poo Drops nach den Reisesets
    ],
  },
  'dries-van-noten': { pattern: 'B', blocks: ['Eau de Parfum', 'Flüssigseife', 'Handcreme', 'Bodylotion', 'Eau de Parfum Set'] },
  'panier-des-sens': {
    pattern: 'B',
    blocks: [
      { types: ['Handcreme'], mini: false, label: 'Handcreme' }, { types: ['Handcreme'], mini: true, label: 'Mini Handcreme' },
      'Feste Seife', 'Flüssigseife', 'Bodylotion', 'Waschgel', 'Eau de Toilette', 'Duschöl', 'Körperpeeling',
    ],
  },
  walde: {
    pattern: 'B',
    blocks: [
      'Flüssigseife',
      { types: ['Feste Seife'], title: '^Seife Tiroler Reine', label: 'Tiroler Reine (fest)' },
      { types: ['Feste Seife'], title: '^Seifenset', label: 'Seifensets' },
      { types: ['Feste Seife'], title: '^Glycerin', label: 'Glycerinseifen' },
      { types: ['Feste Seife'], label: 'Übrige Seifen' },
      'Rasierseife', 'Badesalz', 'Saunaöl',
    ],
  },
  'christian-tortu': { pattern: 'B', lead: ['Forêts'], blocks: ['Duftkerze', 'Diffusor', 'Raumspray', 'Duftöl', 'Flüssigseife', 'Diffusor Refill'] },
  'culti-milano': { pattern: 'B', blocks: ['Diffusor', 'Raumspray', 'Autoduft', 'Rattanstäbchen', 'Diffusor Refill'] },
  geodesis: { pattern: 'B', blocks: [{ types: ['Duftkerze'], label: 'Duftkerze' }, { types: ['Duftkerze'], title: '^Duftkerze Natur ', label: 'Duftkerze Natur' }, 'Raumspray', 'Diffusor', 'Diffusor Refill', 'Rattanstäbchen'] },
  'miller-et-bertaux': { pattern: 'B', blocks: ['Eau de Parfum', 'Duftkerze', 'Diffusor', 'Diffusor Refill'] },
  'claus-porto': {
    pattern: 'B',
    blocks: [
      { types: ['Feste Seife'], label: 'Seifen' },
      { title: '^Soap on a Rope', label: 'Soap on a Rope' },
      { title: 'Musgo Real', label: 'Musgo Real', typeOrder: ['Eau de Cologne', 'Rasiercreme', 'Aftershave', 'Feste Seife'] },
    ],
  },
  tade: {
    pattern: 'B',
    blocks: [
      { types: ['Feste Seife', 'Flüssigseife'], order: 'type', label: 'Seifen' }, 'Seifenablage',
      { types: ['Naturschwamm', 'Peelinghandschuh'], order: 'type', label: 'Badezubehör' },
      { types: ['Gesichtswasser', 'Körperöl'], order: 'type', label: 'Gesicht und Körper' },
      { types: ['Rasierseife', 'Rasierpinsel', 'Bartöl'], order: 'type', label: 'Rasur' },
    ],
  },
  'simone-et-george': { pattern: 'B', blocks: ['Strandtuch', 'Strandkissen', 'Fächer'] },
  'l-a-bruket': {
    pattern: 'B',
    blocks: ['Waschgel', 'Badesalz', 'Körperpeeling', 'Bodylotion', 'Handcreme', 'Fußcreme', 'Lippenbalsam', 'Deodorant', 'Shampoo', 'Conditioner', 'Diffusor', 'Textilspray', 'Seifen Refill', 'Sprühkopf'],
  },

  /* ---------- Muster B: Typ-Blöcke („wie live“, Bestätigung offen) ---------- */
  esteban: { pattern: 'B', blocks: ['Duftkerze', 'Diffusor', 'Raumspray', 'Duftöl', 'Räucherstäbchen', 'Staubsaugerpulver', 'Duftkerzen Refill', 'Diffusor Refill'] },
  'dr-vranjes-firenze': { pattern: 'B', blocks: ['Diffusor', 'Duftkerze', 'Rattanstäbchen', 'Diffusor Refill'] },
  nicolai: { pattern: 'B', blocks: ['Eau de Parfum', 'Eau de Toilette', 'Eau Fraîche', 'Duftkerze', 'Raumspray'] },
  carthusia: { pattern: 'B', blocks: ['Eau de Parfum', 'Roll-on Parfum', 'Sonnencreme', 'After Sun', 'Bodylotion', 'Duschöl', 'Diffusor', 'Diffusor Refill'] },
  lothantique: { pattern: 'B', blocks: ['Feste Seife', 'Flüssigseife', 'Eau de Toilette', 'Diffusor', 'Raumspray', 'Diffusor Refill'] },
  'tierra-zen': { pattern: 'B', blocks: ['Räucherstäbchen', 'Räucherwerk', 'Räucherharz', 'Räuchermittelhalter'] },
  'paul-smith': { pattern: 'B', blocks: ['Duftkerze', 'Diffusor', 'Diffusor Refill'] },
  'giardini-di-toscana': { pattern: 'B', blocks: ['Eau de Parfum', 'Bodylotion'] },
  'la-compagnie-de-provence': { pattern: 'B', blocks: ['Flüssigseife', 'Handcreme', 'Seifen Refill'] },
  unifrom: { pattern: 'B', blocks: ['Roll-on Parfum', 'Räucherstäbchen'] },
  suite702: { pattern: 'B', blocks: [{ types: ['Wärmflasche'], order: 'live' }, { types: ['Augenkissen'], order: 'live' }] }, // im Block von Hand (Linien Puffy → Mini Puffy → XL, Farben)

  /* ---------- Sonderfälle ---------- */
  'au-maison': { pattern: 'L', why: 'Musterfamilien in Herstellerfolge (01.10.) – bis die Familien hinterlegt sind, bleibt die Reihenfolge' },

  /* ---------- Muster C mit kleiner Serie: Hauptlinie A–Z, die Serie als Block dahinter (wie live; offene Frage 5) ---------- */
  'heritage-berbere': { pattern: 'C', seriesLast: true },
  'obvious-parfums': { pattern: 'C', seriesLast: true },
  'parfum-dempire': { pattern: 'C' }, // live reines A–Z, L'Héritage Corse nicht gruppiert

  /* ---------- Muster C: alle übrigen Marken (ausdrücklich, damit der Bericht nicht nachfragt) ---------- */
  ...Object.fromEntries([
    'd-orsay', 'bon-parfumeur', 'meo-fusciuni', 'wienerblut', 'stora-skuggan', 'neomirage', 'astrophil-stella',
    'theodoros-kalotinis', 'altaia', 'ciro', 'fragrantarium', 'maitre-parfumeur-et-gantier', 'eau-d-italie', 'versatile-paris', 'annick-goutal', 'le-plein-ete', 'j-b-filz', 'notch-code',
    'ottomania', 'chi-chi-fan', 'mariage-freres', 'uchino', 'original-home', 'herb-earth', 'marvis', 'saltrain', 'archivist-gallery',
    'lapuan-kankurit', 'castelbel', 'eau-de-menton', 'calma-compania', 'green-petition', 'duft-und-kultur', 'yup-in-de-boom', 'inge-glasmanufaktur',
  ].map((h) => [h, { pattern: 'C' }])),
};

export const ruleFor = (handle) => BRANDS[handle] || { pattern: 'C', unknown: true };
