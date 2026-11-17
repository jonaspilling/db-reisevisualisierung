# Design: Bahn-Auskunft in Weiss und DB-Rot

Helle, seriöse Oberfläche: Weiss, Anthrazit und genau ein Rot, das DB-Rot (#ec0016). Die Karte ist die Startseite, die Ansicht ist festgelegt (nur 2D/3D wechselbar).

## Farben
| Rolle | Wert |
|---|---|
| Grund | #ffffff, Flächen #f5f7f8 / #eceff1 |
| Text | Anthrazit #282d37, gedämpft #646973 |
| Akzent | DB-Rot #ec0016 (dunkler #b8000f), Weiss darauf |
| Linien | #d7dce1 |

Häufigkeit auf der Karte: Hellrot (1×) über DB-Rot zu Dunkelrot (häufigste Strecke). Die Skala endet an der echten Maximalhäufigkeit auf Strecken (Knotenbahnhöfe zählen nicht mit).

## Schrift
Libre Franklin (400–800), eine Familie, über Gewicht gegliedert. Zwei Variablen (--display, --sans) in src/styles.css steuern alles.

## Aufbau
Karte (Vollbild, Zeitleiste unten) · Statistik (Kennzahlenliste und Diagramme) · Projekt (Erklärung). Name und Logo sind Platzhalter (Header.svelte, BRAND).

## Bewegung
Kräftiges Ease-out (cubic-bezier(0.23,1,0.32,1)), UI-Reaktionen unter 300 ms, Press-Feedback scale(0.97). Beim Abspielen poppen Bahnhofsnamen auf und blenden nach oben aus (Start/Ziel größer und länger). Respektiert prefers-reduced-motion.
