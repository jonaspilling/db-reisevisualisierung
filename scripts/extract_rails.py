"""Lädt OSM-Extrakte von Geofabrik und filtert daraus das Bahnnetz.

Ergebnis: data/rail_network.json (Overpass-kompatibles Format). build_routes.py
nutzt diese Datei automatisch, falls sie existiert, statt Overpass abzufragen.

Aufruf:  python scripts/extract_rails.py [--keep-pbf]
Nur einmalig nötig (oder wenn du die OSM-Daten aktualisieren willst).
"""
import gc
import json
import os
import sys

import osmium
import requests

PBF_DIR = "data/pbf"
OUT_PATH = "data/rail_network.json"
REGIONS = {
    "germany": "https://download.geofabrik.de/europe/germany-latest.osm.pbf",
    "austria": "https://download.geofabrik.de/europe/austria-latest.osm.pbf",
    "belgium": "https://download.geofabrik.de/europe/belgium-latest.osm.pbf",
    "nord-pas-de-calais": "https://download.geofabrik.de/europe/france/nord-pas-de-calais-latest.osm.pbf",
}
USAGE_OK = {"main", "branch"}


def download(name, url):
    os.makedirs(PBF_DIR, exist_ok=True)
    path = os.path.join(PBF_DIR, f"{name}.osm.pbf")
    if os.path.exists(path):
        print(f"{name}: bereits vorhanden ({os.path.getsize(path) / 1e6:.0f} MB).")
        return path

    tmp = path + ".part"
    print(f"{name}: lade {url}")
    with requests.get(url, stream=True, timeout=60,
                      headers={"User-Agent": "db-reisevisualisierung/1.0"}) as r:
        r.raise_for_status()
        total = int(r.headers.get("content-length", 0))
        done = 0
        last = -1
        with open(tmp, "wb") as f:
            for chunk in r.iter_content(chunk_size=1 << 20):
                f.write(chunk)
                done += len(chunk)
                if total and done * 100 // total != last and (done * 100 // total) % 5 == 0:
                    last = done * 100 // total
                    print(f"  {last}% ({done / 1e6:.0f}/{total / 1e6:.0f} MB)")
    os.replace(tmp, path)
    return path


def classify_relations(pbf_path):
    """Liest nur die Linienrelationen und gibt (sbahn_way_ids, fern_way_ids) zurück.

    sbahn: S-Bahn/Stadtbahn-Linien; fern: ICE/IC (high_speed / long_distance).
    Ein Gleis zählt später nur dann als "reines S-Bahn-Gleis", wenn es in keiner
    Fernverkehrsrelation vorkommt.
    """
    sbahn, fern = set(), set()
    for rel in osmium.FileProcessor(pbf_path, osmium.osm.RELATION):
        tags = rel.tags
        route = tags.get("route")
        if route not in ("train", "light_rail"):
            continue
        service = tags.get("service", "")
        name = (tags.get("name", "") + " " + tags.get("ref", "")).strip()
        network = tags.get("network", "")
        if service in ("high_speed", "long_distance"):
            target = fern
        elif (
            route == "light_rail"
            or service == "commuter"
            or "S-Bahn" in network
            or name.startswith("S-Bahn")
            or (tags.get("ref", "")[:1] == "S" and tags.get("ref", "")[1:].isdigit())
        ):
            target = sbahn
        else:
            continue
        for member in rel.members:
            if member.type == "w":
                target.add(member.ref)
    return sbahn, fern


def extract_ways(pbf_path, seen_ids):
    """Gibt Bahn-Ways als Overpass-kompatible Elemente zurück."""
    print("  lese Linienrelationen (S-Bahn / Fernverkehr) ...")
    sbahn_ids, fern_ids = classify_relations(pbf_path)
    print(f"  {len(sbahn_ids):,} S-Bahn-Ways, {len(fern_ids):,} Fernverkehrs-Ways")
    elements = []
    # Disk-basierter Node-Index: braucht kaum RAM, auch für ganz Deutschland.
    # Windows hält die Datei gesperrt, solange der Reader lebt -> erst freigeben
    # (del + gc), dann löschen. Sonst bleiben pro Lauf mehrere GB liegen.
    os.makedirs(PBF_DIR, exist_ok=True)
    # Pro Datei ein eigener Index: eine alte Datei wiederzuverwenden liefert
    # falsche Positionen (Ways verschwinden stillschweigend).
    index_path = os.path.join(PBF_DIR, f"nodes_{os.path.basename(pbf_path)}.idx")
    if os.path.exists(index_path):
        os.remove(index_path)
    fp = (
        osmium.FileProcessor(pbf_path)
        .with_locations(f"sparse_file_array,{index_path}")
        .with_filter(osmium.filter.KeyFilter("railway"))
    )
    try:
        for obj in fp:
            if not obj.is_way() or obj.id in seen_ids:
                continue
            tags = obj.tags
            if tags.get("railway") != "rail":
                continue
            # Abstell-/Industriegleise raus, aber Weichenverbindungen behalten:
            # ohne sie fehlen die Wechsel zwischen Gleisen im Bahnhofshals.
            if "service" in tags and tags.get("service") != "crossover":
                continue
            # Gleise ganz ohne usage-Tag (oft Brücken/Tunnel der Hauptstrecken)
            # bleiben drin; sonst entstehen Lücken im Netz.
            usage = tags.get("usage")
            if usage is not None and usage not in USAGE_OK and tags.get("service") != "crossover":
                continue
            try:
                geometry = [{"lat": n.lat, "lon": n.lon} for n in obj.nodes]
            except osmium.InvalidLocationError:
                continue  # Way ragt aus dem Extrakt heraus
            if len(geometry) < 2:
                continue
            seen_ids.add(obj.id)
            elements.append({
                "type": "way",
                "id": obj.id,
                "nodes": [n.ref for n in obj.nodes],
                "geometry": geometry,
                "tags": {"railway": "rail"},
                # reines S-Bahn-Gleis: in S-Bahn-, aber in keiner Fern-Relation
                "sbahn": obj.id in sbahn_ids and obj.id not in fern_ids,
                "fern": obj.id in fern_ids,
            })
    finally:
        del fp
        gc.collect()
        try:
            os.remove(index_path)
        except OSError:
            pass
    return elements


def main():
    keep_pbf = "--keep-pbf" in sys.argv
    paths = {name: download(name, url) for name, url in REGIONS.items()}

    seen = set()
    elements = []
    for name, path in paths.items():
        print(f"{name}: filtere Gleise (dauert ein paar Minuten) ...")
        found = extract_ways(path, seen)
        print(f"  {len(found):,} Gleisabschnitte")
        elements.extend(found)

    gc.collect()
    for name in os.listdir(PBF_DIR):
        if name.startswith("nodes") and name.endswith(".idx"):
            try:
                os.remove(os.path.join(PBF_DIR, name))
            except OSError:
                print(f"Hinweis: {name} konnte nicht gelöscht werden (manuell löschen).")

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump({"elements": elements}, f)
    print(f"\nFertig: {len(elements):,} Gleisabschnitte in '{OUT_PATH}' "
          f"({os.path.getsize(OUT_PATH) / 1e6:.0f} MB).")

    if not keep_pbf:
        print("Die PBF-Dateien in data/pbf/ kannst du jetzt löschen (~6 GB).")


if __name__ == "__main__":
    main()
