// Einfache Projektion in eine SVG-Fläche: Längengrade um cos(Breite) gestaucht, Norden oben.
// Für Zeichnungen, die keine echte Karte brauchen.
export function projector(points, pad = 24, scale = 100) {
  const lons = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const proj = ([lon, lat]) => [(lon - minLon) * kx * scale, (maxLat - lat) * scale];
  const w = (maxLon - minLon) * kx * scale;
  const h = (maxLat - minLat) * scale;
  return { proj, width: w, height: h, viewBox: `${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}` };
}

export const toPath = (pts, proj) =>
  "M" + pts.map((p) => proj(p).map((v) => v.toFixed(1)).join(" ")).join("L");
