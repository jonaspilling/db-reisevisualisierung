"""Bereitet zwei Kartenebenen für die Kartenseite auf: Stadtflächen und das europäische Streckennetz.

Quelle: Natural Earth (gemeinfrei), Maßstab 1:10 Mio. Die Rohdateien sind groß (28 und 40 MB), deshalb werden sie
auf Europa zugeschnitten, vereinfacht und gerundet. Ergebnis:

  public/data/urban.geojson     Stadtflächen (Ballungsräume), weiche Umrisse in jedem Zoom
  public/data/rails_eu.geojson  Streckennetz als Übersicht (beim Hineinzoomen übernimmt das genaue Netz der Grundkarte)

Aufruf:  python scripts/prepare_overlays.py
"""
import json
import math
import os
import urllib.request

NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
RAW_DIR = "data/ne"
OUT_DIR = "public/data"
BBOX = (-11.0, 34.0, 32.0, 66.0)  # Europa: Länge min, Breite min, Länge max, Breite max
RAIL_TOLERANCE = 0.0025  # Grad, rund 250 m: reicht für die Übersicht
URBAN_TOLERANCE = 0.003
MIN_URBAN_KM2 = 4.0  # kleinere Flächen sind bei der Übersicht nur Krümel


def fetch(name):
    os.makedirs(RAW_DIR, exist_ok=True)
    path = os.path.join(RAW_DIR, name)
    if not os.path.exists(path):
        print(f"lade {name} ...")
        urllib.request.urlretrieve(NE + name, path)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def point_segment(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    if dx == 0 and dy == 0:
        return math.hypot(p[0] - a[0], p[1] - a[1])
    t = max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)))
    return math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))


def simplify(pts, tol):
    """Douglas-Peucker, iterativ."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        far, idx = 0.0, None
        for k in range(i + 1, j):
            d = point_segment(pts[k], pts[i], pts[j])
            if d > far:
                far, idx = d, k
        if idx is not None and far > tol:
            keep[idx] = True
            stack.append((i, idx))
            stack.append((idx, j))
    return [p for p, k in zip(pts, keep) if k]


def rnd(pts, digits=3):
    return [[round(x, digits), round(y, digits)] for x, y in pts]


def in_box(pts):
    return any(BBOX[0] <= x <= BBOX[2] and BBOX[1] <= y <= BBOX[3] for x, y in pts[::3] or pts)


def lines(geom):
    if geom["type"] == "LineString":
        return [geom["coordinates"]]
    if geom["type"] == "MultiLineString":
        return geom["coordinates"]
    return []


def rails():
    data = fetch("ne_10m_railroads.geojson")
    out = []
    for f in data["features"]:
        if not f["geometry"] or f["properties"].get("featurecla") != "Railroad":
            continue
        for line in lines(f["geometry"]):
            if len(line) < 2 or not in_box(line):
                continue
            s = simplify(line, RAIL_TOLERANCE)
            if len(s) >= 2:
                out.append(rnd(s))
    return {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {}, "geometry": {"type": "MultiLineString", "coordinates": out}}
    ]}, len(out)


def urban():
    data = fetch("ne_10m_urban_areas.geojson")
    feats = []
    for f in data["features"]:
        g = f["geometry"]
        if not g or f["properties"].get("area_sqkm", 0) < MIN_URBAN_KM2:
            continue
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        keep = []
        for poly in polys:
            outer = poly[0]
            if not in_box(outer):
                continue
            s = simplify(outer, URBAN_TOLERANCE)
            if len(s) >= 4:
                keep.append([rnd(s)])
        if keep:
            feats.append({"type": "Feature", "properties": {}, "geometry": {"type": "MultiPolygon", "coordinates": keep}})
    return {"type": "FeatureCollection", "features": feats}, len(feats)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, build in (("rails_eu.geojson", rails), ("urban.geojson", urban)):
        data, n = build()
        path = os.path.join(OUT_DIR, name)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, separators=(",", ":"))
        print(f"{name}: {n} Teile, {os.path.getsize(path) / 1024:.0f} KB")


if __name__ == "__main__":
    main()
