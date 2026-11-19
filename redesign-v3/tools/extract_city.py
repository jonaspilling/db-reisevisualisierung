"""Schneidet die Stadt rund um die Start- und Zielbahnhöfe aus den OSM-Dateien in data/pbf aus.

Aufruf:  python -I redesign-v3/tools/extract_city.py germany
         (oder austria, nord-pas-de-calais)
Ergebnis: redesign-v3/data/city/<bahnhof>.json, Koordinaten in Metern relativ zum Bahnhof (x = Osten, y = Norden):
  b     Gebäude: [Höhe, Mindesthöhe, Dachform, Dachhöhe, Firstrichtung (Grad oder -1), quer (0/1), Bahnhof (0/1/2),
                  Außenring, [Innenringe]]
  rail  Gleise, road Straßen ([Klasse, ...]), water Flüsse (Linien), wa Wasserflächen ([Außenring, [Innenringe]])
  axis  Richtung der Gleise am Bahnhof (Bogenmaß, gegen den Uhrzeigersinn ab Osten)

Gelesen wird in zwei Durchgängen: erst die Multipolygon-Relationen (Gebäude mit Innenhöfen, Wasserflächen),
dann alle Wege mit Koordinaten.
"""
import json
import math
import os
import re
import sys
import tempfile
import time

import osmium
from shapely.geometry import Polygon
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
V3 = os.path.dirname(HERE)
ROOT = os.path.dirname(V3)

TERM = {
    "Frankfurt(Main)Hbf": ("germany", 1400),
    "Köln Hbf": ("germany", 1300),
    "Berlin Südkreuz": ("germany", 1100),
    "München Hbf": ("germany", 1400),
    "Augsburg Hbf": ("germany", 1000),
    "Bamberg": ("germany", 900),
    "Innsbruck Hbf": ("austria", 1200),
    "Lille Europe": ("nord-pas-de-calais", 1200),
}

ROADS = {
    "motorway": 4, "trunk": 4, "primary": 3, "secondary": 3, "tertiary": 2,
    "unclassified": 1, "residential": 1, "living_street": 1, "pedestrian": 1, "service": 0,
    "motorway_link": 2, "trunk_link": 2, "primary_link": 2, "secondary_link": 2, "footway": 0,
}
ROOF = {"flat": 0, "gabled": 1, "gambrel": 1, "saltbox": 1, "hipped": 2, "half-hipped": 2, "mansard": 2,
        "side_hipped": 2, "pyramidal": 3, "cone": 3, "dome": 4, "onion": 4, "round": 5, "skillion": 6}
STATION_NAME = re.compile(r"hauptbahnhof|\bhbf\b|bahnhof|gare\b|station|südkreuz|empfangsgeb", re.I)


def num(v):
    if not v:
        return None
    try:
        return float(v.replace(",", ".").replace("m", "").strip().split(";")[0])
    except ValueError:
        return None


def describe(t):
    """Höhe, Dach und Bahnhofs-Kennzeichen aus den Tags."""
    b = t.get("building", t.get("building:part", "yes"))
    rs = ROOF.get(t.get("roof:shape", "flat"), 0)
    h = num(t.get("height"))
    lv = num(t.get("building:levels"))
    rh = num(t.get("roof:height"))
    if rh is None:
        rl = num(t.get("roof:levels"))
        rh = rl * 2.8 if rl is not None else None
    if h is None:
        if lv is not None:
            h = lv * 3.1 + (rh if rh is not None else (2.5 if rs else 0))
        else:
            h = {"church": 22, "cathedral": 45, "garage": 3, "garages": 3, "shed": 3, "hut": 3, "roof": 7,
                 "kiosk": 3, "house": 8, "detached": 8, "industrial": 10, "train_station": 16}.get(b, 13)
    mh = num(t.get("min_height"))
    if mh is None:
        ml = num(t.get("building:min_level"))
        mh = ml * 3.1 if ml is not None else 0
    if b == "roof" and mh == 0 and t.get("building:part") is None:
        mh = max(0, h - 3)  # Vordach / Bahnsteigdach: schwebt
    rd = t.get("roof:direction")
    rdv = num(rd) if rd else None
    if rdv is None and rd:
        rdv = {"N": 0, "NE": 45, "E": 90, "SE": 135, "S": 180, "SW": 225, "W": 270, "NW": 315}.get(rd.upper())
    across = 1 if t.get("roof:orientation") == "across" else 0
    st = 0
    if (b in ("train_station", "transportation") or t.get("railway") == "station"
            or t.get("public_transport") == "station" or STATION_NAME.search(t.get("name", ""))):
        st = 1
    elif b == "roof":
        st = 2
    return [round(h, 1), round(mh, 1), rs, round(rh, 1) if rh is not None else -1,
            round(rdv) if rdv is not None else -1, across, st]


RAW = lambda region: os.path.join(tempfile.gettempdir(), f"bb_city_raw_{region}.json")


def main(region):
    if "--finish" in sys.argv and os.path.exists(RAW(region)):
        # nur die Nachbearbeitung neu rechnen (Rohdaten vom letzten Lauf)
        boxes = json.load(open(RAW(region), encoding="utf-8"))
        out_dir = os.path.join(V3, "data", "city")
        for bx in boxes:
            finish(bx, out_dir)
        return
    stations ={s["name"]: s for s in json.load(open(os.path.join(V3, "data", "stations.json"), encoding="utf-8"))}
    boxes = []
    for key, (reg, r) in TERM.items():
        if reg != region:
            continue
        lon0, lat0 = stations[key]["coords"]
        kx = 111320 * math.cos(math.radians(lat0))
        boxes.append({"key": key, "lon0": lon0, "lat0": lat0, "kx": kx, "r": r,
                      "dlon": r * 1.15 / kx, "dlat": r * 1.15 / 111320,
                      "b": [], "p": [], "rail": [], "road": [], "water": [], "wa": [], "ways": {}})
    if not boxes:
        print("keine Bahnhöfe für", region)
        return
    path = os.path.join(ROOT, "data", "pbf", region + ".osm.pbf")
    t0 = time.time()

    # --- Durchgang 1: Multipolygone (Gebäude, Gebäudeteile, Wasser)
    rels = []
    members = set()
    for r in (osmium.FileProcessor(path, osmium.osm.RELATION)
              .with_filter(osmium.filter.KeyFilter("building", "building:part", "natural", "waterway"))):
        t = r.tags
        if t.get("type") != "multipolygon":
            continue
        kind = "b" if ("building" in t or "building:part" in t) else ("w" if t.get("natural") == "water" or t.get("waterway") == "riverbank" else None)
        if not kind:
            continue
        mem = [(m.ref, m.role) for m in r.members if m.type == "w"]
        rels.append((kind, describe(t) if kind == "b" else None, "building:part" in t, mem))
        members.update(ref for ref, _ in mem)
    print(f"Relationen: {len(rels):,} Multipolygone, {len(members):,} Mitgliedswege, {time.time() - t0:.0f} s", flush=True)

    # --- Durchgang 2: alle Wege mit Koordinaten
    idx = os.path.join(tempfile.gettempdir(), f"bb_nodes_{region}.idx")
    fp = (osmium.FileProcessor(path, osmium.osm.NODE | osmium.osm.WAY)
          .with_locations(osmium.index.create_map("sparse_file_array," + idx))
          .with_filter(osmium.filter.EntityFilter(osmium.osm.WAY)))
    n = 0
    for w in fp:
        n += 1
        if n % 5_000_000 == 0:
            print(f"  {n:,} Wege, {time.time() - t0:.0f} s", flush=True)
        t = w.tags
        is_member = w.id in members
        if not is_member and len(t) == 0:
            continue
        nodes = w.nodes
        if len(nodes) < 2:
            continue
        try:
            l = nodes[len(nodes) // 2].location
            if not l.valid():
                continue
            lon, lat = l.lon, l.lat
        except osmium.InvalidLocationError:
            continue
        hit = None
        for bx in boxes:
            if abs(lon - bx["lon0"]) < bx["dlon"] and abs(lat - bx["lat0"]) < bx["dlat"]:
                hit = bx
                break
        if hit is None:
            continue
        pts = []
        try:
            for nd in nodes:
                loc = nd.location
                pts.append(round((loc.lon - hit["lon0"]) * hit["kx"], 1))
                pts.append(round((loc.lat - hit["lat0"]) * 111320, 1))
        except osmium.InvalidLocationError:
            continue
        if is_member:
            hit["ways"][w.id] = (nodes[0].ref, nodes[-1].ref, pts)
        closed = nodes[0].ref == nodes[-1].ref
        ring = pts[:-2] if closed else pts
        if ("building" in t or "building:part" in t) and closed and len(ring) >= 6:
            (hit["p"] if "building:part" in t else hit["b"]).append(describe(t) + [ring, []])
        elif t.get("railway") in ("rail", "light_rail") and t.get("service") not in ("yard", "siding", "spur"):
            hit["rail"].append(pts)
        elif t.get("highway") in ROADS and not closed:
            hit["road"].append([ROADS[t.get("highway")]] + pts)
        elif t.get("waterway") in ("river", "canal"):
            hit["water"].append(pts)
        elif closed and (t.get("natural") == "water" or t.get("waterway") == "riverbank") and len(ring) >= 6:
            hit["wa"].append([ring, []])
    print(f"Wege gelesen: {n:,} in {time.time() - t0:.0f} s", flush=True)
    try:
        os.remove(idx)
    except OSError:
        pass

    # --- Multipolygone zusammensetzen
    for bx in boxes:
        for kind, desc, is_part, mem in rels:
            if not mem or any(ref not in bx["ways"] for ref, _ in mem):
                continue
            outer = rings([bx["ways"][ref] for ref, role in mem if role != "inner"])
            inner = rings([bx["ways"][ref] for ref, role in mem if role == "inner"])
            for o in outer:
                holes = [i for i in inner if inside(*centroid(i), o)]
                if kind == "b":
                    (bx["p"] if is_part else bx["b"]).append(desc + [o, holes])
                else:
                    bx["wa"].append([o, holes])

    out_dir = os.path.join(V3, "data", "city")
    os.makedirs(out_dir, exist_ok=True)
    for bx in boxes:
        bx.pop("ways", None)
    with open(RAW(region), "w", encoding="utf-8") as f:
        json.dump(boxes, f)
    for bx in boxes:
        finish(bx, out_dir)


def rings(ways):
    """Wege an gemeinsamen Endpunkten zu geschlossenen Ringen verbinden."""
    segs = [[a, b, list(p)] for a, b, p in ways]
    out = []
    while segs:
        a, b, p = segs.pop()
        changed = True
        while a != b and changed:
            changed = False
            for i, (c, d, q) in enumerate(segs):
                if c == b:
                    p += q[2:]; b = d
                elif d == b:
                    p += rev(q)[2:]; b = c
                elif d == a:
                    p = q + p[2:]; a = c
                elif c == a:
                    p = rev(q) + p[2:]; a = d
                else:
                    continue
                segs.pop(i)
                changed = True
                break
        if a == b and len(p) >= 8:
            out.append(p[:-2])
    return out


def rev(p):
    return [v for i in range(len(p) - 2, -1, -2) for v in (p[i], p[i + 1])]


def inside(px, py, poly):
    c = False
    j = len(poly) // 2 - 1
    for i in range(len(poly) // 2):
        xi, yi, xj, yj = poly[2 * i], poly[2 * i + 1], poly[2 * j], poly[2 * j + 1]
        if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi + 1e-12) + xi:
            c = not c
        j = i
    return c


def centroid(p):
    n = len(p) // 2
    return sum(p[0::2]) / n, sum(p[1::2]) / n


def to_poly(ring, holes=()):
    pts = list(zip(ring[0::2], ring[1::2]))
    return Polygon(pts, [list(zip(h[0::2], h[1::2])) for h in holes]).buffer(0)


def from_poly(pg):
    """shapely-Polygon -> (Außenring, [Innenringe]) als flache Listen, ohne doppelten Endpunkt."""
    flat = lambda coords: [round(v, 1) for xy in list(coords)[:-1] for v in xy]
    return flat(pg.exterior.coords), [flat(i.coords) for i in pg.interiors]


def finish(bx, out_dir):
    r = bx["r"]
    # Gebäude mit eigenen Bauteilen (Simple 3D Buildings): die Teile zeichnen; den Rest des Umrisses,
    # der von keinem Teil bedeckt ist, als eigenes Gebäude behalten (z. B. das Empfangsgebäude vor den Hallen)
    parts_c = [centroid(p[7]) for p in bx["p"]]
    keep = []
    for rec in bx["b"]:
        poly = rec[7]
        inner_parts = [p for p, (cx, cy) in zip(bx["p"], parts_c) if inside(cx, cy, poly)] if parts_c else []
        if not inner_parts:
            keep.append(rec)
            continue
        if rec[6]:
            for p in inner_parts:
                p[6] = max(p[6], rec[6])
        try:
            outline = to_poly(poly, rec[8])
            rest = outline.difference(unary_union([to_poly(p[7], p[8]) for p in inner_parts]))
            rest = rest.buffer(-0.5).buffer(0.5)  # schmale Reste wegputzen
            geoms = [rest] if rest.geom_type == "Polygon" else list(getattr(rest, "geoms", []))
            for g in geoms:
                if g.geom_type == "Polygon" and g.area > max(150, 0.05 * outline.area):
                    o, hs = from_poly(g)
                    keep.append(rec[:7] + [o, hs])
        except Exception:
            pass
    buildings = [b for b in keep + bx["p"] if math.hypot(*centroid(b[7])) < r]

    sx = sy = cxs = cys = 0.0
    for line in bx["rail"]:
        for i in range(0, len(line) - 2, 2):
            x0, y0, x1, y1 = line[i], line[i + 1], line[i + 2], line[i + 3]
            mx, my = (x0 + x1) / 2, (y0 + y1) / 2
            d = math.hypot(mx, my)
            L = math.hypot(x1 - x0, y1 - y0)
            if d < 450 and L > 0:
                a = math.atan2(y1 - y0, x1 - x0)
                sx += L * math.cos(2 * a)
                sy += L * math.sin(2 * a)
            if 200 < d < 1000:
                cxs += L * mx
                cys += L * my
    axis = math.atan2(sy, sx) / 2
    if cxs * math.cos(axis) + cys * math.sin(axis) < 0:
        axis += math.pi

    data = {"key": bx["key"], "lon0": bx["lon0"], "lat0": bx["lat0"], "r": r, "axis": round(axis, 4),
            "b": buildings, "rail": bx["rail"], "road": bx["road"], "water": bx["water"], "wa": bx["wa"]}
    name = bx["key"].replace("(", "_").replace(")", "_").replace(" ", "_")
    with open(os.path.join(out_dir, name + ".json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    nst = sum(1 for b in buildings if b[6] == 1)
    nroof = sum(1 for b in buildings if b[2])
    print(f"{bx['key']}: {len(buildings)} Gebäude ({nroof} mit Dachform, {nst} Bahnhofsteile), "
          f"{len(bx['rail'])} Gleise, {len(bx['road'])} Straßen, {len(bx['wa'])} Wasserflächen")


if __name__ == "__main__":
    main(sys.argv[1])
