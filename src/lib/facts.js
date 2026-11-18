// Abgeleitete Kennzahlen für Statistik und Fakten-Ticker.

const MOON_KM = 384400;
const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const nf = (n, d = 0) => n.toLocaleString("de-DE", { maximumFractionDigits: d });

// Bahnhofsname so, wie er in den Daten steht ("München Hbf", "Frankfurt(M) Flughafen Fernbf"),
// nur mit Leerzeichen um die Klammern ("Frankfurt (Main) Hbf"). Früher stand hier der Ortsname ("München"),
// das hat München Hbf, Ost und Pasing zu einem Namen verschmolzen.
export const stationName = (name) => name.replace(/(\S)\(/g, "$1 (").replace(/\)(\S)/g, ") $1");

// Alter Name der Funktion: überall in der Seite im Einsatz, liefert jetzt ebenfalls den Bahnhofsnamen
export const shortName = stationName;

const toMin = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

// Strecken unabhängig von der Fahrtrichtung zählen
export function routeRanking(trips, limit = 5) {
  const map = new Map();
  for (const t of trips) {
    const key = [t.von, t.nach].sort().join("|");
    const entry = map.get(key) || { name: `${shortName(t.von)} ⇄ ${shortName(t.nach)}`, a: shortName(t.von), b: shortName(t.nach), n: 0 };
    entry.n++;
    map.set(key, entry);
  }
  const list = [...map.values()].sort((a, b) => b.n - a.n).slice(0, limit);
  const max = list[0].n;
  return list.map((r) => ({ ...r, w: r.n / max }));
}

export function weekdayCounts(trips) {
  const counts = Array(7).fill(0);
  for (const t of trips) counts[(new Date(t.t0).getDay() + 6) % 7]++;
  const max = Math.max(...counts);
  return counts.map((n, i) => ({ label: WEEKDAYS[i], n, h: n / max }));
}

export function tickerFacts(trips, stations) {
  const km = Math.round(trips.reduce((s, t) => s + t.km, 0));
  const minutes = trips.reduce((s, t) => s + t.minutes, 0);
  const hours = minutes / 60;
  const longest = trips.reduce((a, b) => (b.km > a.km ? b : a));
  const earliest = trips.reduce((a, b) => (toMin(b.abfahrt) < toMin(a.abfahrt) ? b : a));
  const top = routeRanking(trips, 1)[0];
  const span = Math.round((trips[trips.length - 1].t0 - trips[0].t0) / 86_400_000);
  const stops = trips.reduce((s, t) => s + t.halte.length, 0);

  return [
    `${nf(km)} Kilometer auf Schienen`,
    `${top.n}× ${top.name}`,
    `${nf(hours)} Stunden im Zug`,
    `${nf((km / MOON_KM) * 100, 1)} % des Wegs zum Mond`,
    `${stations.length} Bahnhöfe besucht`,
    `Ø ${nf(km / hours)} km/h`,
    `${stops} Halte unterwegs`,
    `Früheste Abfahrt ${earliest.abfahrt} Uhr`,
    `Längste Fahrt: ${nf(longest.km)} km`,
    `${span} Tage von der ersten bis zur letzten Fahrt`,
  ];
}
