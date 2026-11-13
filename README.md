# DB Reise-Visualisierung

Interaktive Visualisierung meiner Bahnreisen und Streckenverläufe (Uni-Projekt).

## Features
- Darstellung der gefahrenen Bahnstrecken inklusive Zwischenhalten
- Datenbasis aufbereitet als CSV / GeoJSON

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