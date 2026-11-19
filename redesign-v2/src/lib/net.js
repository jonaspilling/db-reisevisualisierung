// Das Streckennetz als einfache SVG-Zeichnung (ohne Kartenkacheln): leicht und schnell.
import { projector, toPath } from "./project.js";

export function makeNet(trips, stations, pad = 30) {
  const pts = trips.flatMap((t) => t.path);
  const P = projector(pts, pad);
  return {
    viewBox: P.viewBox,
    width: P.width,
    height: P.height,
    proj: P.proj,
    paths: trips.map((t) => toPath(t.path.filter((_, i) => i % 2 === 0 || i === t.path.length - 1), P.proj)),
    dots: stations.map((s) => ({ ...s, xy: P.proj(s.coords) })),
  };
}

// Eine einzelne Fahrt in eigenem Ausschnitt (für Mini-Karten)
export function makeMini(trip, stations, pad = 18) {
  const P = projector(trip.path, pad, 100);
  const byKey = new Map(stations.map((s) => [s.key, s]));
  return {
    viewBox: P.viewBox,
    d: toPath(trip.path.filter((_, i) => i % 2 === 0 || i === trip.path.length - 1), P.proj),
    stops: trip.halte.map((h) => byKey.get(h)).filter(Boolean).map((s) => ({ name: s.name, xy: P.proj(s.coords) })),
  };
}
