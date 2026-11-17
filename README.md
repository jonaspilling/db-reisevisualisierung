# DB Reise-Visualisierung

Interaktive Visualisierung meiner Bahnreisen und Streckenverläufe (Uni-Projekt).

## Features
- Weiss-rote Website (DB-Rot), Hash-Routing, läuft auf jedem Webspace: Karte, Statistik, Projekt
- Startseite: feste 3D-Karte (MapLibre), nur 2D/3D umschaltbar. Einzelne Linien zeigen mit Höhe und Farbe (Hell- bis Dunkelrot), wie oft eine Strecke gefahren wurde
- Zeitleiste: Fahrten nacheinander, Pausen im Schnelldurchlauf; Bahnhofsnamen poppen beim Abspielen auf
- Hover auf Linien hebt die zugehörigen Fahrten hervor
- Farbskala am echten Maximum ausgerichtet (Knotenbahnhöfe zählen nicht mit)
- Datenbasis aufbereitet als CSV / GeoJSON

## Starten
- Windows: `start.bat` doppelklicken (öffnet http://localhost:5173)
- Oder: `npm install` und `npm run dev`; Produktions-Build mit `npm run build` (Ergebnis in `dist/`)

## Setup & Start
1. Repository klonen:
   ```bash
   git clone <DEINE-REPOSITORY-URL>
   ```
2. Python-Umgebung anlegen (einmalig):
   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```
3. Bahnnetz aus OpenStreetMap-Daten (Geofabrik) extrahieren (einmalig, ca. 6 GB
   Download, danach darf `data/pbf/` gelöscht werden):
   ```bash
   python scripts/extract_rails.py
   ```
   Ergebnis: `data/rail_network.json` (Hauptstrecken in DE, AT, BE, Nordfrankreich).
4. Echte Streckengeometrien berechnen:
   ```bash
   npm run build:routes
   ```
   Der Generator berechnet kürzeste Wege entlang kartierter Gleise; das muss nicht
   der tatsächlich gefahrenen Zugroute entsprechen. Ohne `data/rail_network.json`
   fällt er auf die (oft überlastete) Overpass-API zurück. Danach die Seite neu laden.

## Design-Werkzeuge
Skills unter `.claude/skills/`: [Impeccable](https://github.com/pbakaus/impeccable), [Taste Skill](https://github.com/Leonxlnx/taste-skill) und [Emil Kowalskis Skills](https://github.com/emilkowalski/skills); Versionen in `skills-lock.json`. Prüfung der laufenden Seite: `npx impeccable detect http://localhost:5173`.
