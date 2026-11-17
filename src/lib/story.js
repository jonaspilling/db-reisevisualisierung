// Alle Fakten der Projekt-Seite werden hier aus den echten Fahrten berechnet.
// Nichts davon ist von Hand eingetragen: ändern sich die Daten, ändert sich die Seite.
import { shortName } from "./facts.js";

export const EARTH_KM = 40075; // Erdumfang am Äquator
export const MOON_KM = 384400; // mittlere Entfernung zum Mond
export const WALK_KMH = 5; // zügiges Gehtempo
export const AUTOBAHN_KMH = 130; // deutsche Autobahn-Richtgeschwindigkeit

// Länder der Bahnhöfe in den Daten (alles andere liegt in Deutschland)
const COUNTRY_OF = {
  "Innsbruck Hbf": "Österreich",
  Jenbach: "Österreich",
  Kufstein: "Österreich",
  "Wörgl Hbf": "Österreich",
  "Bruxelles-Midi": "Belgien",
  "Bruxelles-Nord": "Belgien",
  "Liège-Guillemins": "Belgien",
  "Lille Europe": "Frankreich",
};

const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

const toMin = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

// Anbieter anhand der Zuggattung: ICE/IC/EC = Deutsche Bahn, TGV = SNCF, RJ/RJX = ÖBB
const OPERATOR_OF = { ICE: "db", IC: "db", EC: "db", TGV: "sncf", OUIGO: "sncf", RJ: "oebb", RJX: "oebb" };

// Zugfahrten (Teilstrecken) je Anbieter. Eine Fahrt kann aus mehreren Zügen bestehen ("ICE 690, ICE 314, TGV 9836");
// bei "ICE 575 / ICE 565" (mögliche Zugteilung) zählt nur eine.
export function operatorStats(trips) {
  const ops = { db: { legs: [], trips: new Set() }, sncf: { legs: [], trips: new Set() }, oebb: { legs: [], trips: new Set() } };
  let total = 0;
  for (const t of trips) {
    for (const part of t.zuege.split(",")) {
      const label = part.split("/")[0].trim();
      const op = OPERATOR_OF[label.split(/\s+/)[0]];
      if (!op) continue;
      ops[op].legs.push({ label, trip: t });
      ops[op].trips.add(t.id);
      total++;
    }
  }
  return { ...ops, total };
}

// Die Züge einer Fahrt als Abschnitte der Linie: Zugnummern aus "Züge", Umstiegsbahnhöfe aus "Umstiege".
// Jeder Abschnitt kennt seinen Anbieter und seine Lage auf der Linie (Indizes im Pfad).
// Gibt null zurück, wenn sich die Angaben nicht eindeutig zuordnen lassen.
export function tripLegs(trip, stations) {
  const labels = trip.zuege.split(",").map((x) => x.split("/")[0].trim()).filter(Boolean);
  const transfers = (trip.umstiege || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (labels.length !== transfers.length + 1) return null;

  const idx = [];
  for (const name of transfers) {
    const st = stations.find((x) => x.name === name);
    if (!st) return null;
    let best = 0;
    let bd = Infinity;
    trip.path.forEach((pt, i) => {
      const d = (pt[0] - st.coords[0]) ** 2 + (pt[1] - st.coords[1]) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    idx.push(best);
  }
  for (let k = 1; k < idx.length; k++) if (idx[k] < idx[k - 1]) return null;

  const bounds = [0, ...idx, trip.path.length - 1];
  return labels.map((label, k) => ({
    label,
    op: OPERATOR_OF[label.split(/\s+/)[0]] || null,
    from: bounds[k],
    to: bounds[k + 1],
  }));
}

export function buildStory(trips, stations) {
  const km = trips.reduce((s, t) => s + t.km, 0);
  const minutes = trips.reduce((s, t) => s + t.minutes, 0);
  const hours = minutes / 60;

  // Lieblingsstrecke, in beiden Richtungen gezählt
  const pairs = new Map();
  for (const t of trips) {
    const key = [t.von, t.nach].sort().join("|");
    const e = pairs.get(key) || { a: shortName(t.von), b: shortName(t.nach), n: 0, trips: [] };
    e.n++;
    e.trips.push(t);
    pairs.set(key, e);
  }
  const fav = [...pairs.values()].sort((x, y) => y.n - x.n)[0];

  const longest = trips.reduce((a, b) => (b.km > a.km ? b : a));
  const earliest = trips.reduce((a, b) => (toMin(b.abfahrt) < toMin(a.abfahrt) ? b : a));
  const before8 = trips.filter((t) => toMin(t.abfahrt) < 8 * 60).length;

  const perWeekday = Array(7).fill(0);
  for (const t of trips) perWeekday[(new Date(t.t0).getDay() + 6) % 7]++;
  const topDay = perWeekday.indexOf(Math.max(...perWeekday));

  const countries = new Map();
  for (const s of stations) {
    const c = COUNTRY_OF[s.name] || "Deutschland";
    countries.set(c, (countries.get(c) || 0) + 1);
  }

  const byVisits = [...stations].sort((a, b) => b.visits - a.visits);

  return {
    trips,
    stations,
    km,
    minutes,
    hours,
    avgKmh: km / hours,
    fav: { ...fav, share: fav.n / trips.length },
    longest,
    earliest,
    before8,
    topDay: WEEKDAYS[topDay],
    topDayCount: perWeekday[topDay],
    countries: [...countries].sort((a, b) => b[1] - a[1]),
    byVisits,
    walkHours: km / WALK_KMH,
    moonYears: Math.round((MOON_KM - km) / km),
    operators: operatorStats(trips),
    shortest: trips.reduce((a, b) => (b.km < a.km ? b : a)),
  };
}

// Bahnhöfe, an denen eine Fahrt beginnt oder endet (für die Beschriftung der Karte)
export function endpointNames(trips) {
  return [...new Set(trips.flatMap((t) => [t.von, t.nach]))];
}

export const nf = (n, d = 0) => n.toLocaleString("de-DE", { maximumFractionDigits: d, minimumFractionDigits: d });

export function daysAndHours(hours) {
  const total = Math.round(hours);
  return { days: Math.floor(total / 24), hours: total % 24 };
}

export function plural(n, one, many) {
  return n === 1 ? one : many;
}
