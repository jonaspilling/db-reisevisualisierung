import hashlib
import heapq
import json
import math
import os
import time

import pandas as pd
import requests

CSV_PATH = "data/db_reisen_historie_komplett.csv"
OUT_DIR = "public/data"
OUT_ROUTES = f"{OUT_DIR}/routes.geojson"
OUT_STATIONS = f"{OUT_DIR}/stations.json"
OVERPASS_URLS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
)
OVERPASS_BOXES_PER_QUERY = 2
CACHE_DIR = "data/.overpass_cache"
FERN_SNAP_KM = 1.0  # so weit darf ein Fernverkehrsgleis vom Bahnhof entfernt sein
S_BAHN_PENALTY = 4.0  # Kostenfaktor für reine S-Bahn-Gleise
SIMPLIFY_TOLERANCE_DEG = 0.0002  # ca. 20 m: unsichtbar, spart ~90 % Punkte
LOCAL_NETWORK ="data/rail_network.json"  # erzeugt von scripts/extract_rails.py

# Fallback-Koordinaten [lon, lat] für alle 43 Bahnhöfe
KNOWN_STATIONS = {
    "Aachen Hbf": [6.0914, 50.7678],
    "Aschaffenburg Hbf": [9.1436, 49.9806],
    "Augsburg Hbf": [10.8856, 48.3654],
    "Bamberg": [10.8994, 49.9008],
    "Bensheim": [8.6175, 49.6806],
    "Berlin Südkreuz": [13.3653, 52.4750],
    "Bonn Hbf": [7.0972, 50.7320],
    "Bruxelles-Midi": [4.3365, 50.8357],
    "Bruxelles-Nord": [4.3608, 50.8597],
    "Darmstadt Hbf": [8.6297, 49.8725],
    "Eisenach": [10.3203, 50.9744],
    "Erfurt Hbf": [11.0381, 50.9722],
    "Erlangen": [11.0019, 49.5961],
    "Frankfurt(M) Flughafen Fernbf": [8.5700, 50.0531],
    "Frankfurt(Main)Hbf": [8.6638, 50.1071],
    "Fulda": [9.6839, 50.5547],
    "Günzburg": [10.2781, 48.4606],
    "Heidelberg Hbf": [8.6753, 49.4036],
    "Ingolstadt Hbf": [11.4372, 48.7444],
    "Innsbruck Hbf": [11.4008, 47.2633],
    "Jenbach": [11.7747, 47.3886],
    "Koblenz Hbf": [7.5889, 50.3511],
    "Kufstein": [12.1661, 47.5831],
    "Köln Hbf": [6.9589, 50.9431],
    "Leipzig Hbf": [12.3819, 51.3455],
    "Lille Europe": [3.0757, 50.6394],
    "Limburg Süd": [8.0961, 50.3828],
    "Liège-Guillemins": [5.5667, 50.6244],
    "Lutherstadt Wittenberg Hbf": [12.6606, 51.8672],
    "Mainz Hbf": [8.2586, 50.0011],
    "Mannheim Hbf": [8.4689, 49.4797],
    "Montabaur": [7.8253, 50.4447],
    "München Hbf": [11.5583, 48.1403],
    "München Ost": [11.6047, 48.1272],
    "München-Pasing": [11.4614, 48.1500],
    "Nürnberg Hbf": [11.0822, 49.4458],
    "Rosenheim": [12.1189, 47.8503],
    "Siegburg/Bonn": [7.2031, 50.7939],
    "Stuttgart Hbf": [9.1816, 48.7840],
    "Ulm Hbf": [9.9822, 48.3994],
    "Weinheim(Bergstr)Hbf": [8.6672, 49.5536],
    "Wörgl Hbf": [12.0636, 47.4919],
    "Würzburg Hbf": [9.9358, 49.8019],
}

station_info_cache = {}
segment_cache = {}
station_node_cache = {}
main_component = None  # wird in main() gesetzt
fern_nodes = None  # Knoten an Gleisen, die in Fernverkehrsrelationen vorkommen
usable_nodes = None  # Knoten, die nicht ausschließlich an S-Bahn-Gleisen liegen


def haversine_km(coords):
    total = 0.0
    r = 6371.0
    for i in range(len(coords) - 1):
        lon1, lat1 = math.radians(coords[i][0]), math.radians(coords[i][1])
        lon2, lat2 = math.radians(coords[i + 1][0]), math.radians(coords[i + 1][1])
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
        total += 2 * r * math.asin(math.sqrt(a))
    return total


def resolve_station(station_name: str):
    if station_name in station_info_cache:
        return station_info_cache[station_name]

    if station_name not in KNOWN_STATIONS:
        raise ValueError(f"Keine Koordinaten für Bahnhof: {station_name}")

    info = {"id": None, "coords": KNOWN_STATIONS[station_name]}
    station_info_cache[station_name] = info
    return info


def segment_bounds(station_a: str, station_b: str):
    start = resolve_station(station_a)["coords"]
    end = resolve_station(station_b)["coords"]
    distance_km = haversine_km([start, end])
    latitude_padding = max(0.1, min(0.1 + distance_km / 111 * 0.1, 0.5))
    middle_latitude = math.radians((start[1] + end[1]) / 2)
    longitude_padding = latitude_padding / max(math.cos(middle_latitude), 0.5)

    south = min(start[1], end[1]) - latitude_padding
    west = min(start[0], end[0]) - longitude_padding
    north = max(start[1], end[1]) + latitude_padding
    east = max(start[0], end[0]) + longitude_padding
    return south, west, north, east


def _segment_boxes(station_pairs):
    return {
        tuple(round(value, 5) for value in segment_bounds(station_a, station_b))
        for station_a, station_b in station_pairs
    }


def _format_overpass_query(boxes):
    queries = [
        f'way["railway"="rail"]["usage"~"^(main|branch)$"][!"service"]'
        f"({south},{west},{north},{east});"
        for south, west, north, east in boxes
    ]
    return "[out:json][timeout:120];\n(\n" + "\n".join(queries) + "\n);\nout body geom;"


def build_overpass_query(station_pairs):
    boxes = _segment_boxes(station_pairs)
    if not boxes:
        raise ValueError("Keine Streckenabschnitte zum Berechnen vorhanden.")
    return _format_overpass_query(sorted(boxes))


def build_overpass_queries(station_pairs, boxes_per_query=OVERPASS_BOXES_PER_QUERY):
    boxes = sorted(_segment_boxes(station_pairs))
    if not boxes:
        raise ValueError("Keine Streckenabschnitte zum Berechnen vorhanden.")
    if boxes_per_query < 1:
        raise ValueError("boxes_per_query muss mindestens 1 sein.")

    return [
        _format_overpass_query(boxes[index:index + boxes_per_query])
        for index in range(0, len(boxes), boxes_per_query)
    ]


def build_rail_graph(overpass_data):
    global usable_nodes, fern_nodes
    graph = {}
    node_coords = {}
    usable_nodes = set()
    fern_nodes = set()

    for way in overpass_data.get("elements", []):
        tags = way.get("tags") or {}
        if tags.get("railway") != "rail":
            continue
        nodes = way.get("nodes") or []
        geometry = way.get("geometry") or []
        if len(geometry) < 2:
            continue

        if len(nodes) != len(geometry):
            nodes = [(point["lon"], point["lat"]) for point in geometry]

        coordinates = []
        sbahn_only = bool(way.get("sbahn"))
        for node, point in zip(nodes, geometry):
            coordinate = [point["lon"], point["lat"]]
            node_coords[node] = coordinate
            coordinates.append((node, coordinate))
            if not sbahn_only:
                usable_nodes.add(node)
            if way.get("fern"):
                fern_nodes.add(node)

        # Reine S-Bahn-Gleise sind erlaubt, aber teuer: Fernzüge nutzen sie nur,
        # wenn es keine vernünftige Alternative gibt.
        penalty = S_BAHN_PENALTY if sbahn_only else 1.0
        for (start_node, start), (end_node, end) in zip(coordinates, coordinates[1:]):
            if start_node == end_node:
                continue
            distance = haversine_km([start, end]) * penalty
            graph.setdefault(start_node, {})[end_node] = min(
                distance, graph.get(start_node, {}).get(end_node, distance)
            )
            graph.setdefault(end_node, {})[start_node] = min(
                distance, graph.get(end_node, {}).get(start_node, distance)
            )

    if not graph:
        elements = overpass_data.get("elements", [])
        remark = overpass_data.get("remark")
        details = f" Overpass-Hinweis: {remark}" if remark else ""
        raise RuntimeError(
            f"Overpass lieferte {len(elements)} Elemente, aber keine nutzbaren "
            f"Eisenbahn-Gleise.{details}"
        )
    return graph, node_coords


def fetch_overpass_data(query):
    os.makedirs(CACHE_DIR, exist_ok=True)
    cache_file = os.path.join(CACHE_DIR, hashlib.sha1(query.encode()).hexdigest() + ".json")
    if os.path.exists(cache_file):
        with open(cache_file, encoding="utf-8") as f:
            return json.load(f)

    errors = []
    for attempt in range(3):
        if attempt:
            wait = 10 * attempt
            print(f"Alle Dienste fehlgeschlagen; neuer Versuch in {wait}s ...")
            time.sleep(wait)
        data = _try_overpass_services(query, errors)
        if data is not None:
            with open(cache_file, "w", encoding="utf-8") as f:
                json.dump(data, f)
            return data

    raise RuntimeError(
        "Alle OpenStreetMap-Overpass-Dienste sind fehlgeschlagen: "
        + " | ".join(errors[-len(OVERPASS_URLS):])
    )


def _try_overpass_services(query, errors):
    for index, url in enumerate(OVERPASS_URLS):
        try:
            response = requests.post(
                url,
                data={"data": query},
                headers={"User-Agent": "db-reisevisualisierung/1.0"},
                timeout=180,
            )
            response.raise_for_status()
            data = response.json()
            if not isinstance(data, dict) or not data.get("elements"):
                remark = data.get("remark") if isinstance(data, dict) else None
                message = remark or "Antwort enthält keine OSM-Elemente."
                raise requests.RequestException(message)
            if data.get("remark"):
                raise requests.RequestException(
                    f"Unvollständige Overpass-Antwort: {data['remark']}"
                )
            return data
        except (requests.RequestException, ValueError) as error:
            errors.append(f"{url}: {error}")
            if index < len(OVERPASS_URLS) - 1:
                print(f"Overpass-Dienst nicht erreichbar; versuche Ersatzdienst ({error}).")
    return None


def fetch_rail_graph(station_pairs):
    if os.path.exists(LOCAL_NETWORK):
        print(f"Nutze lokales Bahnnetz aus {LOCAL_NETWORK} (statt Overpass).")
        with open(LOCAL_NETWORK, encoding="utf-8") as f:
            return build_rail_graph(json.load(f))

    queries = build_overpass_queries(station_pairs)
    graph = {}
    node_coords = {}

    for index, query in enumerate(queries):
        if index:
            time.sleep(1)
        print(f"Overpass-Abfrage {index + 1}/{len(queries)} ...")
        batch_graph, batch_node_coords = build_rail_graph(fetch_overpass_data(query))
        for node, neighbors in batch_graph.items():
            for neighbor, distance in neighbors.items():
                graph.setdefault(node, {})[neighbor] = min(
                    distance, graph.get(node, {}).get(neighbor, distance)
                )
        node_coords.update(batch_node_coords)

    return graph, node_coords


def largest_component(graph):
    """Knoten des größten zusammenhängenden Teilnetzes (Inseln werden ignoriert)."""
    seen = set()
    best = set()
    for start in graph:
        if start in seen:
            continue
        component = {start}
        stack = [start]
        while stack:
            node = stack.pop()
            for neighbor in graph[node]:
                if neighbor not in component:
                    component.add(neighbor)
                    stack.append(neighbor)
        seen |= component
        if len(component) > len(best):
            best = component
    return best


def nearest_track_node(station_name: str, node_coords):
    if station_name in station_node_cache:
        return station_node_cache[station_name]

    station_coords = resolve_station(station_name)["coords"]

    def best(only_fern):
        candidates = (
            (node, haversine_km([station_coords, coords]))
            for node, coords in node_coords.items()
            if (main_component is None or node in main_component)
            and (not usable_nodes or node in usable_nodes)
            and (not only_fern or node in fern_nodes)
        )
        return min(candidates, key=lambda item: item[1], default=(None, float("inf")))

    # Fernverkehrshalte liegen an Fernverkehrsgleisen: die bevorzugen, wenn eines
    # in Bahnhofsnähe liegt. Sonst dockt der Halt an einem Nebengleis an, das nur
    # über große Umwege mit der Strecke verbunden ist (z. B. Montabaur).
    node, distance = best(only_fern=bool(fern_nodes))
    if node is None or distance > FERN_SNAP_KM:
        node, distance = best(only_fern=False)
    if distance > 5:
        raise RuntimeError(
            f"Kein OSM-Gleis in Bahnhofsnähe gefunden: {station_name} "
            f"(nächster Gleispunkt {distance:.1f} km entfernt)."
        )

    if distance > 0.5:
        print(f"  Hinweis: {station_name} dockt {distance:.2f} km entfernt am Netz an.")
    station_node_cache[station_name] = node
    return node


def shortest_rail_path(graph, start_node, end_node):
    distances = {start_node: 0.0}
    previous = {}
    queue = [(0.0, start_node)]

    while queue:
        distance, node = heapq.heappop(queue)
        if node == end_node:
            break
        if distance > distances[node]:
            continue

        for neighbor, edge_distance in graph.get(node, {}).items():
            candidate = distance + edge_distance
            if candidate < distances.get(neighbor, float("inf")):
                distances[neighbor] = candidate
                previous[neighbor] = node
                heapq.heappush(queue, (candidate, neighbor))

    if end_node not in distances:
        return None

    path = [end_node]
    while path[-1] != start_node:
        path.append(previous[path[-1]])
    path.reverse()
    return path


def _point_segment_dist(p, a, b):
    """Abstand Punkt-Strecke in Grad (lon-Skalierung korrigiert)."""
    k = math.cos(math.radians(p[1]))
    px, py = p[0] * k, p[1]
    ax, ay = a[0] * k, a[1]
    bx, by = b[0] * k, b[1]
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def simplify_path(coords, tolerance=SIMPLIFY_TOLERANCE_DEG):
    """Douglas-Peucker (iterativ). Start/Ende bleiben erhalten."""
    if len(coords) < 3:
        return coords
    keep = [False] * len(coords)
    keep[0] = keep[-1] = True
    stack = [(0, len(coords) - 1)]
    while stack:
        first, last = stack.pop()
        far_dist, far_index = 0.0, None
        for i in range(first + 1, last):
            d = _point_segment_dist(coords[i], coords[first], coords[last])
            if d > far_dist:
                far_dist, far_index = d, i
        if far_index is not None and far_dist > tolerance:
            keep[far_index] = True
            stack.append((first, far_index))
            stack.append((far_index, last))
    return [[round(c[0], 5), round(c[1], 5)] for c, k in zip(coords, keep) if k]


def route_segment(station_a: str, station_b: str, graph, node_coords):
    key = (station_a, station_b)
    if key in segment_cache:
        return segment_cache[key]
    reverse_key = (station_b, station_a)
    if reverse_key in segment_cache:
        reverse_paths, distance = segment_cache[reverse_key]
        paths = [list(reversed(path)) for path in reverse_paths]
        segment_cache[key] = (paths, distance)
        return paths, distance

    start_node = nearest_track_node(station_a, node_coords)
    end_node = nearest_track_node(station_b, node_coords)
    node_path = shortest_rail_path(graph, start_node, end_node)
    if not node_path:
        raise RuntimeError(f"Kein zusammenhängender OSM-Gleisweg: {station_a} -> {station_b}")

    coordinates = [resolve_station(station_a)["coords"]]
    for node in node_path:
        point = node_coords[node]
        if point != coordinates[-1]:
            coordinates.append(point)
    end_coords = resolve_station(station_b)["coords"]
    if end_coords != coordinates[-1]:
        coordinates.append(end_coords)

    distance = haversine_km(coordinates)  # Länge vor der Vereinfachung
    paths = [simplify_path(coordinates)]
    segment_cache[key] = (paths, distance)
    return paths, distance


def remove_spikes(nodes):
    """Entfernt Hin-und-zurück-Zacken (A, B, A -> A), z. B. an Durchgangsbahnhöfen."""
    out = []
    for node in nodes:
        if out and out[-1] == node:
            continue
        if len(out) >= 2 and out[-2] == node:
            out.pop()
        else:
            out.append(node)
    return out


def route_trip(stops, graph, node_coords):
    """Berechnet den Gleisweg einer ganzen Fahrt als zusammenhängende Linie."""
    nodes = []
    for station_a, station_b in zip(stops, stops[1:]):
        start = nearest_track_node(station_a, node_coords)
        end = nearest_track_node(station_b, node_coords)
        path = shortest_rail_path(graph, start, end)
        if not path:
            raise RuntimeError(f"Kein zusammenhängender OSM-Gleisweg: {station_a} -> {station_b}")
        nodes.extend(path)
    coordinates = [node_coords[node] for node in remove_spikes(nodes)]
    return coordinates, haversine_km(coordinates)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    df = pd.read_csv(CSV_PATH, sep=";")
    route_features = []
    station_visits = {}
    trip_rows = []
    station_pairs = []

    for idx, row in df.iterrows():
        stops = [row["Startbahnhof"].strip()]
        if pd.notna(row["Zwischenhalte (Auswahl)"]):
            for s in str(row["Zwischenhalte (Auswahl)"]).split(","):
                clean = s.replace("(Umstieg)", "").strip()
                if clean:
                    stops.append(clean)
        stops.append(row["Zielbahnhof"].strip())

        for s in stops:
            station_visits[s] = station_visits.get(s, 0) + 1

        print(f"[{idx + 1}/{len(df)}] {row['Datum']}: {stops[0]} -> {stops[-1]}")
        trip_rows.append((idx, row, stops))
        station_pairs.extend(zip(stops, stops[1:]))

    print("Lade OpenStreetMap-Schienenwege für alle Streckenabschnitte ...")
    graph, node_coords = fetch_rail_graph(station_pairs)
    print(f"{len(node_coords):,} Gleispunkte geladen; berechne kürzeste Gleiswege.")
    global main_component
    main_component = largest_component(graph)

    segment_cache.clear()
    station_node_cache.clear()
    for idx, row, stops in trip_rows:
        coordinates, total_dist_km = route_trip(stops, graph, node_coords)
        full_paths = [simplify_path(coordinates)]

        route_features.append(
            {
                "type": "Feature",
                "properties": {
                    "id": idx,
                    "datum": row["Datum"],
                    "abfahrt": row["Abfahrt_Zeit"],
                    "ankunft": row["Ankunft_Zeit"],
                    "start": row["Startbahnhof"],
                    "ziel": row["Zielbahnhof"],
                    "zuege": row["Züge"],
                    "umstiege": "" if pd.isna(row["Umstiege"]) else row["Umstiege"],
                    "halte": stops,
                    "distanz_km": round(total_dist_km, 1),
                },
                "geometry": {
                    "type": "MultiLineString",
                    "coordinates": full_paths,
                },
            }
        )

    with open(OUT_ROUTES, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": route_features}, f)

    stations_export = [
        {
            "name": name,
            # Marker auf das Gleis setzen, an dem die Linien tatsächlich enden
            "coords": (
                node_coords[station_node_cache[name]]
                if name in station_node_cache
                else resolve_station(name)["coords"]
            ),
            "visits": count,
        }
        for name, count in sorted(station_visits.items(), key=lambda x: -x[1])
    ]
    with open(OUT_STATIONS, "w", encoding="utf-8") as f:
        json.dump(stations_export, f, ensure_ascii=False, indent=2)

    print(f"\nFertig! {len(route_features)} Routen in '{OUT_ROUTES}' gespeichert.")


if __name__ == "__main__":
    main()