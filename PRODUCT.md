# Produkt: Bahnjahr 26

> Hinweis: Dieses Dokument wurde aus dem Auftrag und dem Repository abgeleitet, nicht in einem Interview mit der Autorin / dem Autor bestätigt. Alle Angaben sind Annahmen, bis sie bestätigt werden (`/impeccable init`).

## Platform
web

## Zweck
Persönliche Visualisierung aller Bahnfahrten des Jahres 2026 (16 Fahrten, rund 6.900 km, 43 Bahnhöfe) als Abgabe im Uni-Fach Information Design (3. Semester).

## Zielgruppe und Situation
- Dozierende und Kommiliton:innen, die das Projekt bewerten oder ansehen: am Laptop oder Beamer, oft nur wenige Minuten.
- Die Seite muss ohne Erklärung funktionieren (Karte zuerst), aber Erklärungen anbieten (Seite „Projekt“).

## Kernmechanismus
Eine 3D-Karte: Strecken stehen als feine Linien auf der Karte, Höhe und Farbe zeigen, wie oft ein Abschnitt gefahren wurde. Eine Zeitleiste spielt das Jahr Fahrt für Fahrt ab. Die Fahrtentafel (Liste) ist mit der Karte verknüpft.

## Feste Fakten (nicht ändern)
- Datenquelle: DB-Reisehistorie als CSV (`data/db_reisen_historie_komplett.csv`), Geometrie aus OpenStreetMap-Gleisdaten (kürzester Weg entlang kartierter Gleise, kann vom tatsächlichen Weg abweichen).
- Alle Fahrten gelten als gefahren (zur Abgabe liegen alle in der Vergangenheit).
- Sprache: Deutsch.
- Kein offizielles Angebot der Deutschen Bahn.

## Tonalität
Sachlich, präzise, mit Charakter: wie eine Bahnhofs-Abfahrtstafel.

## Stack
Svelte 5 + Vite, MapLibre GL (3D-Karte), Hash-Routing, statisch hostbar (GitHub Pages).
