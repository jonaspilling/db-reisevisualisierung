// Lädt ausschließlich die Dateien aus public/data (routes.geojson, stations.json): deine Fahrten und Bahnhöfe.
// Alle Kennzahlen werden daraus berechnet, nichts ist erfunden.
import { stationName } from "./format.js";

const DAY = 86_400_000;

function stamp(datum, zeit) {
  const [d, m, y] = datum.split(".").map(Number);
  const [hh, mm] = (zeit || "00:00").split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm).getTime();
}

const flatten = (g) => {
  if (g.type === "LineString") return g.coordinates;
  const out = [];
  for (const part of g.coordinates)
    for (const pt of part) {
      const last = out[out.length - 1];
      if (!last || last[0] !== pt[0] || last[1] !== pt[1]) out.push(pt);
    }
  return out;
};

export async function loadData() {
  const base = import.meta.env.BASE_URL;
  const [r, s] = await Promise.all([
    fetch(`${base}data/routes.geojson`).then((x) => x.json()),
    fetch(`${base}data/stations.json`).then((x) => x.json()),
  ]);

  const trips = r.features
    .map((f) => {
      const p = f.properties;
      const t0 = stamp(p.datum, p.abfahrt);
      let t1 = stamp(p.datum, p.ankunft);
      if (t1 < t0) t1 += DAY;
      return {
        datum: p.datum,
        abfahrt: p.abfahrt,
        ankunft: p.ankunft,
        von: stationName(p.start),
        nach: stationName(p.ziel),
        zuege: p.zuege,
        halte: p.halte,
        km: p.distanz_km,
        t0,
        minutes: Math.round((t1 - t0) / 60000),
        path: flatten(f.geometry),
      };
    })
    .sort((a, b) => a.t0 - b.t0)
    .map((t, i) => ({ ...t, no: i + 1 }));

  const stations = s.map((x) => ({ key: x.name, name: stationName(x.name), coords: x.coords, visits: x.visits }));

  const km = trips.reduce((a, t) => a + t.km, 0);
  const minutes = trips.reduce((a, t) => a + t.minutes, 0);
  const longest = trips.reduce((a, t) => (t.km > a.km ? t : a), trips[0]);
  const stats = {
    trips: trips.length,
    km,
    hours: minutes / 60,
    stations: stations.length,
    kmh: km / (minutes / 60),
    longest,
    top: stations[0],
  };
  return { trips, stations, stats };
}
