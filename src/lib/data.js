export const DAY = 86_400_000;

function parseTime(datum, zeit) {
  const [d, m, y] = datum.split(".").map(Number);
  const [hh, mm] = (zeit || "00:00").split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm).getTime();
}

// MultiLineString -> eine durchgehende Linie
function flatten(geometry) {
  if (geometry.type === "LineString") return geometry.coordinates;
  const out = [];
  for (const part of geometry.coordinates) {
    for (const pt of part) {
      const last = out[out.length - 1];
      if (!last || last[0] !== pt[0] || last[1] !== pt[1]) out.push(pt);
    }
  }
  return out;
}

export function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} h ${String(m).padStart(2, "0")} min`;
}

export function trainTypes(zuege) {
  return zuege
    .split(/[,/]/)
    .map((s) => s.trim().split(/\s+/)[0])
    .filter(Boolean);
}

export async function loadData() {
  const base = import.meta.env.BASE_URL;
  const [routesRes, stationsRes] = await Promise.all([
    fetch(`${base}data/routes.geojson`),
    fetch(`${base}data/stations.json`),
  ]);
  if (!routesRes.ok || !stationsRes.ok) {
    throw new Error("Die Daten konnten nicht geladen werden.");
  }
  const routes = await routesRes.json();
  const stations = await stationsRes.json();

  const trips = routes.features
    .map((f) => {
      const p = f.properties;
      const t0 = parseTime(p.datum, p.abfahrt);
      let t1 = parseTime(p.datum, p.ankunft);
      if (t1 < t0) t1 += DAY;
      return {
        id: p.id,
        datum: p.datum,
        abfahrt: p.abfahrt,
        ankunft: p.ankunft,
        von: p.start,
        nach: p.ziel,
        zuege: p.zuege,
        umstiege: p.umstiege,
        halte: p.halte,
        km: p.distanz_km,
        t0,
        t1,
        minutes: Math.round((t1 - t0) / 60000),
        path: flatten(f.geometry),
      };
    })
    .sort((a, b) => a.t0 - b.t0)
    .map((trip, i) => ({ ...trip, no: i + 1 }));

  return { trips, stations };
}
