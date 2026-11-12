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
API_BASE = "https://v6.db.transport.rest"

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


def api_get(path: str, params: dict):
    for attempt in range(3):
        try:
            resp = requests.get(f"{API_BASE}{path}", params=params, timeout=20)
            if resp.status_code == 429 or resp.status_code >= 500:
                time.sleep(2 * (attempt + 1))
                continue
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException:
            if attempt == 2:
                return None
            time.sleep(1.5 * (attempt + 1))
    return None


def resolve_station(station_name: str):
    if station_name in station_info_cache:
        return station_info_cache[station_name]

    data = api_get(
        "/locations",
        {
            "query": station_name,
            "results": 3,
            "stops": "true",
            "addresses": "false",
            "poi": "false",
        },
    )
    time.sleep(0.25)

    if data:
        for item in data:
            if item.get("type") in ("stop", "station") and item.get("id"):
                loc = item.get("location") or {}
                coords = KNOWN_STATIONS.get(
                    station_name,
                    [loc.get("longitude"), loc.get("latitude")],
                )
                info = {"id": item["id"], "coords": coords}
                station_info_cache[station_name] = info
                return info

    # Fallback auf statische Koordinaten ohne HAFAS-ID
    info = {"id": None, "coords": KNOWN_STATIONS[station_name]}
    station_info_cache[station_name] = info
    return info


def route_segment(station_a: str, station_b: str):
    key = (station_a, station_b)
    if key in segment_cache:
        return segment_cache[key]

    info_a = resolve_station(station_a)
    info_b = resolve_station(station_b)

    if info_a["id"] and info_b["id"]:
        # Erst Direktverbindung (transfers=0), dann mit max. 1 Umstieg testen
        for max_transfers in (0, 1):
            data = api_get(
                "/journeys",
                {
                    "from": info_a["id"],
                    "to": info_b["id"],
                    "departure": "2026-11-18T09:00:00+01:00",
                    "results": 2,
                    "transfers": max_transfers,
                    "polylines": "true",
                    "bus": "false",
                    "subway": "false",
                    "tram": "false",
                    "taxi": "false",
                },
            )
            time.sleep(0.35)

            if data and data.get("journeys"):
                for journey in data["journeys"]:
                    coords = []
                    for leg in journey.get("legs", []):
                        poly = leg.get("polyline") or {}
                        for feat in poly.get("features", []):
                            geom = feat.get("geometry") or {}
                            if geom.get("type") == "Point":
                                c = geom.get("coordinates")
                                if c and len(c) >= 2:
                                    coords.append([c[0], c[1]])
                    if len(coords) >= 2:
                        dist_km = haversine_km(coords)
                        segment_cache[key] = (coords, dist_km)
                        return coords, dist_km

    # Fallback: direkte Verbindung der Bahnhofskoordinaten
    print(f"   [Fallback-Linie] {station_a} -> {station_b}")
    coords = [info_a["coords"], info_b["coords"]]
    dist_km = haversine_km(coords)
    segment_cache[key] = (coords, dist_km)
    return coords, dist_km


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    df = pd.read_csv(CSV_PATH, sep=";")
    route_features = []
    station_visits = {}

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

        full_coords = []
        total_dist_km = 0.0

        for i in range(len(stops) - 1):
            seg_coords, seg_dist = route_segment(stops[i], stops[i + 1])
            if full_coords and seg_coords:
                full_coords.extend(seg_coords[1:])
            else:
                full_coords.extend(seg_coords)
            total_dist_km += seg_dist

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
                    "type": "LineString",
                    "coordinates": full_coords,
                },
            }
        )

    with open(OUT_ROUTES, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": route_features}, f)

    stations_export = [
        {
            "name": name,
            "coords": resolve_station(name)["coords"],
            "visits": count,
        }
        for name, count in sorted(station_visits.items(), key=lambda x: -x[1])
    ]
    with open(OUT_STATIONS, "w", encoding="utf-8") as f:
        json.dump(stations_export, f, ensure_ascii=False, indent=2)

    print(f"\nFertig! {len(route_features)} Routen in '{OUT_ROUTES}' gespeichert.")


if __name__ == "__main__":
    main()