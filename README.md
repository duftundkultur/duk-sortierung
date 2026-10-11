# DUK Sortierung

Cloudflare Worker, der die Markenseiten im Shopify-Shop von Duft und Kultur nach festen Regeln sortiert. Er ersetzt die Handsortierung und Jedi (Collection Sort).

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

## Betriebsart

Die Betriebsart steht in `wrangler.toml` unter `[vars] MODE`.

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
```

Der Storefront-Abzug liegt nicht im Repo (`fixtures/` ist ignoriert). Er hat diesen Aufbau:

- `brands/<handle>.json` — `/collections/<handle>/products.json`, in der Live-Reihenfolge
- `series/<handle>.json` — Produkt-IDs je Serien-Kollektion
- `bestseller_ids.json` — IDs mit dem Badge „Bestseller“
