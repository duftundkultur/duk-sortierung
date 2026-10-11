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
// Zugpferd: lead: ['Forêts'] auf Markenebene – dauerhaft zuerst in jedem Block und im Schaufenster der Kategorien bevorzugt
//   (vor Neu und Bestseller, nur ein Pin geht vor). Statt eines „dauerhaften Pins“ (Matthias 11.10.).
// Muster C: seriesLast: true → Hauptlinie A–Z, Serien als Block dahinter
// Refills: 'block' (eigener Block nach Produktart) oder 'after-parent' (direkt hinter dem Mutterprodukt, Titel ohne „Refill“);
//   auch je Produktart: { 'Duftkerzen Refill': 'after-parent', default: 'block' }

export const SETTINGS = {
  neuTag: 'neu', // gesetzt/entfernt von Shopify Flow (42 Tage nach Veröffentlichung)
  neuRefills: false, // Refills mit „neu“ bleiben bei ihrem Mutterprodukt statt ganz vorne
  pinTag: 'pin', // Hinweis-Tag; wirksam ist das Datum im Feld „Pin bis“ (custom.pin_bis, Datum, angelegt 11.10.2026)
  seasons: {
    // Tag → Fenster MM-DD bis MM-DD (Ende Weihnachten noch offen: 24.12. oder 6.1.; Sommer noch nicht festgelegt)
    'saison-weihnachten': { from: '11-01', to: '12-24' },
    'saison-sommer': { from: '06-01', to: '08-31' },
  },
  bestsellerMax: 3,
  imageRule: true, // erstes Bild kein 6:7-Packshot → ans Ende des eigenen Blocks
  imageRatio: 6 / 7,
  imageTolerance: 0.01,
  showcaseMin: 40, // Kategorieseiten ab so vielen sichtbaren, verfügbaren Produkten bekommen ein Schaufenster
  showcaseSize: 8, // zwei Reihen
  showcaseAlways: ['Diptyque'], // bekommt im Schaufenster immer einen Platz (Matthias 11.10.)
  classicTag: 'klassiker', // unsichtbares Tag am Leitprodukt eines Klassikers; alle Produkte dieses Dufts stehen vorne im Block (Matthias 11.10.)
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
    lead: ['Bois Impérial'], // Zugpferd (Matthias 11.10.): in jedem Block zuerst, im Schaufenster der Kategorien bevorzugt
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
  'christian-tortu': { pattern: 'B', lead: ['Forêts'] /* Zugpferd */, blocks: ['Duftkerze', 'Diffusor', 'Raumspray', 'Duftöl', 'Flüssigseife', 'Diffusor Refill'] },
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
  'dr-vranjes-firenze': { pattern: 'B', lead: ['Rosso Nobile'] /* Zugpferd */, blocks: ['Diffusor', 'Duftkerze', 'Rattanstäbchen', 'Diffusor Refill'] },
  nicolai: { pattern: 'B', blocks: ['Eau de Parfum', 'Eau de Toilette', 'Eau Fraîche', 'Duftkerze', 'Raumspray'] },
  carthusia: { pattern: 'B', blocks: ['Eau de Parfum', 'Roll-on Parfum', 'Sonnencreme', 'After Sun', 'Bodylotion', 'Duschöl', 'Diffusor', 'Diffusor Refill'] },
  lothantique: { pattern: 'B', blocks: ['Feste Seife', 'Flüssigseife', 'Eau de Toilette', 'Diffusor', 'Raumspray', 'Diffusor Refill'] },
  'tierra-zen': { pattern: 'B', blocks: ['Räucherstäbchen', 'Räucherwerk', 'Räucherharz', 'Räuchermittelhalter'] },
  'paul-smith': { pattern: 'B', blocks: ['Duftkerze', 'Diffusor', 'Diffusor Refill'] },
  'giardini-di-toscana': { pattern: 'B', lead: ['Bianco Latte'] /* Zugpferd */, blocks: ['Eau de Parfum', 'Bodylotion'] },
  'la-compagnie-de-provence': { pattern: 'B', blocks: ['Flüssigseife', 'Handcreme', 'Seifen Refill'] },
  unifrom: { pattern: 'B', blocks: ['Roll-on Parfum', 'Räucherstäbchen'] },
  'versatile-paris': { // nach Kategorie (Matthias, 11.10.): Extraits → Roll-on Eau de Parfum → Roll-on Extrait
    pattern: 'B',
    blocks: ['Extrait de Parfum', { types: ['Roll-on Parfum'], title: '^Roll-On Eau de Parfum', label: 'Roll-on Eau de Parfum' }, { types: ['Roll-on Parfum'], label: 'Roll-on Extrait' }],
  },
  suite702: { pattern: 'B', blocks: [{ types: ['Wärmflasche'], order: 'live' }, { types: ['Augenkissen'], order: 'live' }] }, // im Block von Hand (Linien Puffy → Mini Puffy → XL, Farben)

  /* ---------- Sonderfälle ---------- */
  'au-maison': { pattern: 'L', why: 'Musterfamilien in Herstellerfolge (01.10.) – bis die Familien hinterlegt sind, bleibt die Reihenfolge' },

  /* ---------- Muster C mit kleiner Serie: Hauptlinie A–Z, die Serie als Block dahinter (wie live; offene Frage 5) ---------- */
  'heritage-berbere': { pattern: 'C', seriesLast: true },
  'obvious-parfums': { pattern: 'C', seriesLast: true },
  'parfum-dempire': { pattern: 'C' }, // live reines A–Z, L'Héritage Corse nicht gruppiert

  'annick-goutal': { pattern: 'C', lead: ['Noël — Une Forêt d’Or'] }, // Zugpferd, auch außerhalb der Weihnachtszeit (Matthias 11.10.)

  /* ---------- Muster C: alle übrigen Marken (ausdrücklich, damit der Bericht nicht nachfragt) ---------- */
  ...Object.fromEntries([
    'd-orsay', 'bon-parfumeur', 'meo-fusciuni', 'wienerblut', 'stora-skuggan', 'neomirage', 'astrophil-stella',
    'theodoros-kalotinis', 'altaia', 'ciro', 'fragrantarium', 'maitre-parfumeur-et-gantier', 'eau-d-italie', 'le-plein-ete', 'j-b-filz', 'notch-code',
    'ottomania', 'chi-chi-fan', 'mariage-freres', 'uchino', 'original-home', 'herb-earth', 'marvis', 'saltrain', 'archivist-gallery',
    'lapuan-kankurit', 'castelbel', 'eau-de-menton', 'calma-compania', 'green-petition', 'duft-und-kultur', 'yup-in-de-boom', 'inge-glasmanufaktur',
  ].map((h) => [h, { pattern: 'C' }])),
};

export const ruleFor = (handle) => BRANDS[handle] || { pattern: 'C', unknown: true };

/* =========================================================================================== */
/* Kategorieseiten                                                                              */
/* =========================================================================================== */
// Markenfolgen. „festgelegt“ = von Matthias entschieden (Memory „Sortierung“, Aug./Sept. 2026);
// „wie live“ = aus der Handsortierung der Kategorie abgelesen (11.10.2026), braucht noch sein Ja.
// Marken, die hier fehlen, stehen hinten (A–Z) und erscheinen im Bericht.
export const BRAND_ORDERS = {
  // festgelegt: kanonische Folge für Raumdüfte – kleine, bewusst geführte Marken vor dem Mengenblock; Rest wie live
  raumduft: ['Trudon', 'Christian Tortu', 'Miller et Bertaux', 'Diptyque', 'Geodesis', 'Annick Goutal', 'Paul Smith', 'Esteban', 'Nicolaï',
    'Culti Milano', 'Dr. Vranjes Firenze', 'Walde', 'Herb & Earth', 'Tierra Zen', 'L:A Bruket', 'Lothantique', 'Unifrom', 'Carthusia', 'Héritage Berbère', 'Castelbel', 'Aesop', 'L.T. Piver',
    'Essential Parfums', 'La Compagnie de Provence'],
  // festgelegt: wie Raumduft, aber Paul Smith vor Geodesis (Prestige, Bilder)
  duftkerzen: ['Trudon', 'Christian Tortu', 'Miller et Bertaux', 'Diptyque', 'Paul Smith', 'Geodesis', 'Annick Goutal', 'Esteban', 'Nicolaï',
    'Dr. Vranjes Firenze', 'Héritage Berbère', 'Castelbel', 'L.T. Piver', 'Essential Parfums'],
  // festgelegt (Diptyque hinter Paul Smith, Tortu vor Carthusia)
  diffusoren: ['Trudon', 'L:A Bruket', 'Paul Smith', 'Diptyque', 'Miller et Bertaux', 'Dr. Vranjes Firenze', 'Culti Milano', 'Geodesis', 'Esteban', 'Christian Tortu', 'Carthusia', 'Lothantique'],
  // festgelegt
  raeucherstaebchen: ['Unifrom', 'Tierra Zen', 'Herb & Earth', 'Esteban'],
  // wie live (Kategorie Parfums), dazu Matthias 11.10.: L.T. Piver und Dries Van Noten weit nach vorne (neu, spannend, gute Moods,
  // kleines Sortiment – sonst sieht man ewig nichts anderes), Carthusia weit nach hinten
  parfum: ['L.T. Piver', 'Dries Van Noten', 'Astrophil & Stella', 'Stora Skuggan', 'BDK Parfums', 'd’Annam', 'Versatile Paris', 'Essential Parfums', 'WienerBlut', 'Aesop', 'Diptyque', 'D’Orsay',
    'Trudon', 'Meo Fusciuni', 'L’Artisan Parfumeur', 'Penhaligon’s', 'Obvious Parfums', 'Adamo Parfum', 'Altaia', 'Bon Parfumeur', 'Maître Parfumeur et Gantier',
    'Eau d’Italie', 'Giardini di Toscana', 'Theodoros Kalotinis', 'Nēomirage', 'Héritage Berbère', 'Nicolaï', 'L’Atelier Parfum', 'J.B. Filz', 'Le Plein Été',
    'Miller et Bertaux', 'Notch Code', 'Ciro', 'Fragrantarium', 'Claus Porto', 'Panier des Sens', 'Eau de Menton', 'Lothantique', 'Unifrom', 'Parfum d’Empire',
    'Carthusia'],
  // wie live (Kategorie Pflege), Einzelstücke dahinter
  pflege: ['Aesop', 'L:A Bruket', 'Diptyque', 'Trudon', 'Essential Parfums', 'Claus Porto', 'Panier des Sens', 'Walde', 'Marvis', 'Saltrain', 'La Compagnie de Provence',
    'Lothantique', 'Carthusia', 'BDK Parfums', 'Dries Van Noten', 'Tadé', 'Calma Compania', 'Christian Tortu', 'Eau de Menton', 'Giardini di Toscana', 'Castelbel', 'L.T. Piver'],
  // wie live (Kategorie Home)
  home: ['Uchino', 'Lapuan Kankurit', 'Suite702', 'Original Home', 'Diptyque', 'Essential Parfums', 'Simone et George', 'Au Maison', 'Duft und Kultur', 'Ottomania',
    'Chi Chi Fan', 'Archivist Gallery', 'L:A Bruket', 'Esteban', 'Green Petition', 'Tadé', 'Yup in de boom', 'Inge Glasmanufaktur'],
};

// Welche Welt eine Produktart ist (für Kategorien ohne eigene Markenfolge: Mehrheit der Produkte entscheidet)
const DOMAIN_TYPES = {
  parfum: ['Discovery Set', 'Eau de Parfum', 'Extrait de Parfum', 'Parfum', 'Eau de Toilette', 'Eau de Cologne', 'Eau Fraîche', 'Haarparfum', 'Hair & Body Mist',
    'Roll-on Parfum', 'Festes Parfum', 'Parfum Refill', 'Eau de Parfum Set'],
  raumduft: ['Duftkerze', 'Duftkerzen Refill', 'Duftkerzen Zubehör', 'Diffusor', 'Diffusor Refill', 'Elektrischer Diffusor', 'Duftkartusche', 'Rattanstäbchen',
    'Raumspray', 'Textilspray', 'Schrankduft', 'Autoduft', 'Duftöl', 'Räucherstäbchen', 'Räucherwerk', 'Räucherharz', 'Räuchermittelhalter', 'Saunaöl', 'Staubsaugerpulver'],
  home: ['Stabkerze', 'Stumpenkerze', 'Streichholz', 'Hamamtuch', 'Handtuch', 'Strandtuch', 'Strandkissen', 'Bademantel', 'Decke', 'Fächer', 'Kulturbeutel', 'Wärmflasche',
    'Augenkissen', 'Tee', 'Adventskalender', 'Gutschein', 'Baumschmuck', 'Berberteppich', 'Grußkarte', 'Waschmittel', 'Geschirrspülmittel', 'Universalreiniger',
    'Holz- & Lederpflege', 'Spülbürste'],
};
const domainOf = (type) => Object.keys(DOMAIN_TYPES).find((d) => DOMAIN_TYPES[d].includes(type)) || 'pflege';

export const CATEGORY_RULES = {
  // Handauswahl: Reihenfolge bleibt, nur Ausverkauftes ans Ende
  curated: ['kategorie-geschenke-bis-10', 'kategorie-geschenke-bis-25', 'kategorie-geschenke-bis-50', 'kategorie-geschenke-bis-100', 'kategorie-geschenke-bis-200',
    'kategorie-geschenke-fur-sie', 'kategorie-geschenke-fur-ihn', 'kategorie-geschenke-fur-alle', 'damenduefte', 'herrenduefte', 'weihnachten'],
  // Neuheiten: nach Veröffentlichungstag, neueste zuerst (Shopify kann nur nach Anlagedatum; Matthias 11.10.)
  newest: ['neuheiten', 'nischenduft-neuheiten'],
  // nicht anfassen
  skip: ['gutscheine'],
  // Kategorie → Markenfolge (sonst nach der Mehrheit der Produktarten)
  order: { parfums: 'parfum', raumduefte: 'raumduft', duftkerzen: 'duftkerzen', diffusoren: 'diffusoren', raeucherstaebchen: 'raeucherstaebchen', pflege: 'pflege', home: 'home' },
};

// Regel für eine Kategorie-Kollektion: { mode: 'blocks'|'curated'|'skip', orderName, brandOrder }
export function categoryRuleFor(handle, products = []) {
  if (CATEGORY_RULES.skip.includes(handle)) return { mode: 'skip' };
  if (CATEGORY_RULES.curated.includes(handle)) return { mode: 'curated' };
  const mode = CATEGORY_RULES.newest.includes(handle) ? 'new' : 'blocks';
  let orderName = CATEGORY_RULES.order[handle];
  if (!orderName) {
    const count = (pred) => products.filter(pred).length;
    const half = products.length / 2;
    if (count((p) => p.type === 'Duftkerze') > half) orderName = 'duftkerzen';
    else if (count((p) => p.type === 'Diffusor') > half) orderName = 'diffusoren';
    else if (count((p) => p.type === 'Räucherstäbchen') > half) orderName = 'raeucherstaebchen';
    else {
      const tally = {};
      for (const p of products) { const d = domainOf(p.type); tally[d] = (tally[d] || 0) + 1; }
      orderName = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] || 'parfum';
    }
  }
  return { mode, orderName, brandOrder: BRAND_ORDERS[orderName] };
}
