# DUK Sortierung

Cloudflare Worker, der die Marken- und Kategorieseiten im Shopify-Shop von Duft und Kultur nach festen Regeln sortiert. Er ersetzt die Handsortierung und Jedi (Collection Sort).

- **Regeldatei:** `src/rules.js`. Darin stehen das Muster und die Blockfolge je Marke. Claude pflegt sie; der Deploy läuft automatisch.
- **Zeitliches:** Pin, Neu und Saison steuert das Team im Shopify-Admin über Tags und das Feld „Pin bis“, ohne Code.
- **Konzept und Entscheidungen:** Projekt-Dokument `claude/sortierung-regelwerk.md` und das Claude-Dokument „Sortierung — Konzept“.

## Was der Motor tut

Er sortiert jede Kollektion mit `custom.collection_type = vendor`, also jede Markenseite.

1. **Regelordnung nach Muster**
   - **A — Serien:** Discovery Sets der Marke, dann die Serienblöcke in fester Folge. Gehört ein Discovery Set zu einer Serie, steht es vorne in ihrem Block. Extrait, Haarparfum und Travel Size folgen ihrem Duft in die Serie. Danach kommen die Düfte ohne Serie, dann der Rest.
   - **B — Typ-Blöcke:** Discovery Set, dann die Blöcke in der Folge der Marke. Im Block wird nach Duftname sortiert, das Zugpferd zuerst. Größen stehen in der Folge Standard, groß, klein. Refills stehen je nach Marke hinter ihrem Mutterprodukt oder als eigener Block.
   - **C — A–Z:** Discovery Sets, dann bis zu drei Bestseller (Badge „Bestseller“), dann die Düfte A–Z nach Duftname. Konzentrationen eines Dufts bleiben beisammen.
   - **L — wie bisher:** Platzhalter, die Live-Reihenfolge bleibt. Derzeit nur Au Maison.
2. **Allgemeine Regeln darüber** (entschieden am 11.10.2026)
   - **Pin:** Feld `custom.pin_bis` mit einem Datum ab heute → ganz vorne. Am Datum fällt das Produkt von selbst zurück.
   - **Neu:** Tag `neu` → vorne auf der Markenseite. Den Tag setzt und entfernt Shopify Flow nach 42 Tagen. Refills bleiben bei ihrem Mutterprodukt.
   - **Saison:** Tag `saison-weihnachten` (1.11.–24.12.) oder `saison-sommer` → vorne, solange das Fenster offen ist.
   - **Ohne 6:7-Packshot** als erstes Bild → ans Ende des eigenen Blocks.
   - **Komplett ausverkauft** → ans Ende der Seite. Das gilt auch für Neu und Pin. Kommt Ware nach, springt das Produkt zurück an seinen Platz.
   - **Nicht sichtbar** (Unlisted, Draft, Archived, nicht im Online Store) → ans Ende des eigenen Blocks.

Geschrieben wird nur, wenn sich etwas geändert hat. Der Motor schickt dabei möglichst wenige Züge, höchstens 250 pro Aufruf, und prüft die Reihenfolge danach Platz für Platz. Hat jemand seit dem letzten Schreiben von außen umsortiert, etwa Jedi oder eine Hand, meldet der Bericht `externalChange`.

## Kategorieseiten

Alle Kollektionen mit dem Titel „Kategorie: …“, also Produktarten, Duftfamilien, Primäre Noten, Geschenke und Neuheiten.

- **Markenblöcke:** Die Marken stehen als Blöcke in der Markenfolge der Kategorie (`BRAND_ORDERS` in `src/rules.js`). Im Block gilt die Regel der Marke. Neu, Saison und Pin stehen vorne im eigenen Block.
- **Schaufenster:** Ab 40 sichtbaren Produkten stehen vorne zwei Reihen, also 8 Plätze, mit je einem Produkt pro Marke in der Markenfolge. Diptyque bekommt immer einen Platz (`showcaseAlways`). Gewählt wird der Pin, sonst ein neues Produkt (Tag `neu`), sonst ein Bestseller, sonst ein Team Pick, sonst das erste Produkt mit 6:7-Packshot.
- **Ausverkauft** steht am Ende der Seite, in Markenfolge. Dahinter folgt, was nicht sichtbar ist.
- **Welche Markenfolge gilt:** Für Parfums, Raumdüfte, Duftkerzen, Diffusoren, Räucherstäbchen, Pflege und Home ist sie fest hinterlegt. Alle anderen Kategorien, auch Duftfamilien und Noten, nehmen die Folge der Welt, aus der die meisten ihrer Produkte stammen.
- **Handauswahl:** Bei den Geschenken, Damen- und Herrendüften und Weihnachten bleibt die Reihenfolge, nur Ausverkauftes rückt ans Ende.
- **Nicht angefasst:** Die Neuheiten sortiert Shopify selbst, neueste zuerst. Die Gutscheine bleiben ebenfalls, wie sie sind.

Kategorieseiten haben eine eigene Betriebsart, `CATEGORY_MODE`. Jedi sortiert dort noch: erst in Jedi auf *Inactive* stellen, dann umschalten.

## Betriebsart

Die Betriebsart steht in `wrangler.toml` unter `[vars]`: `MODE` für die Markenseiten, `CATEGORY_MODE` für die Kategorieseiten.

| MODE | Zeitplan (täglich 04:20 UTC) | `/admin/run?write=1` |
|---|---|---|
| `dryrun` (Start) | rechnet, berichtet | abgelehnt |
| `manual` | rechnet, berichtet | schreibt |
| `live` | schreibt | schreibt |

## Endpunkte

Alle Admin-Endpunkte brauchen `?token=ADMIN_TOKEN` und lassen sich im Browser aufrufen.

- `/health` — Stand, Betriebsart, letzter Lauf
- `/admin/dryrun` — alle Markenseiten rechnen, nichts schreiben
- `/admin/dryrun?only=diptyque,trudon` — dazu die volle Zielliste je Marke, mit alter Position und Gruppe
- `/admin/dryrun?scope=categories` — nur die Kategorieseiten (`scope=brands`: nur die Markenseiten)
- `/admin/run?only=trudon&write=1` — rechnen und schreiben (ab MODE `manual`)
- `/admin/report` — Bericht des letzten Zeitplan-Laufs
- `/admin/scopes` — welche Rechte die App im Shop hat
- `/admin/unlock` — hängende Sperre lösen

## Einrichtung (einmalig)

1. **Shopify Dev Dashboard:** neue App „DUK Sortierung“ mit den Scopes `read_products` und `write_products`. Die App im Shop installieren, dann Client ID und Client secret kopieren.
2. **Cloudflare, KV:** ✅ Namespace `duk-sortierung` angelegt (11.10.2026), die ID steht in `wrangler.toml`.
3. **Cloudflare, Worker:** Workers & Pages → Create → Import a repository → `duftundkultur/duk-sortierung`. Die Build-Einstellungen bleiben, Deploy-Befehl `npx wrangler deploy`.
4. **Secrets:** unter Settings → Variables and Secrets drei Einträge anlegen:
   - `SHOPIFY_CLIENT_ID`
   - `SHOPIFY_CLIENT_SECRET`
   - `ADMIN_TOKEN` — frei gewählt, langes Zufallswort
5. **Prüfen:** `https://duk-sortierung.<konto>.workers.dev/health` muss `configured: true` zeigen. Danach `/admin/dryrun?token=…` aufrufen.

## Live schalten (Reihenfolge)

1. Trockenlauf gegen den echten Shop ansehen, Abweichungen klären.
2. Jedi aus den Markenkollektionen nehmen, sonst sortieren beide gegeneinander.
3. MODE `manual`. Eine Marke mit `/admin/run?only=…&write=1` schreiben und im Shop ansehen.
4. MODE `live`. Ab dann sortiert der Zeitplan jeden Morgen.

## Entwicklung

```
npm test                                   # Einheitstests + ganzer Worker gegen nachgebautes Shopify
FIXTURES=<Abzug> npm run dryrun            # Trockenlauf gegen einen Storefront-Abzug, Übersicht je Marke
FIXTURES=<Abzug> npm run dryrun -- diptyque --show   # volle Zielliste einer Marke
FIXTURES=<Abzug> node scripts/dryrun-cats.mjs [handle] [--show]   # Kategorieseiten
```

Der Storefront-Abzug liegt nicht im Repo (`fixtures/` ist ignoriert). Er hat diesen Aufbau:

- `brands/<handle>.json` — `/collections/<handle>/products.json`, in der Live-Reihenfolge
- `series/<handle>.json` — Produkt-IDs je Serien-Kollektion
- `cats/<handle>.json` — Kategorie-Kollektionen in der Live-Reihenfolge (verkürzt: id, title, vendor, type, avail, tags, img)
- `bestseller_ids.json` — IDs mit dem Badge „Bestseller“
