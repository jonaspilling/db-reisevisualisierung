<script>
  import { onMount, onDestroy } from "svelte";
  import L from "leaflet";
  import "leaflet/dist/leaflet.css";

  let { routesData, stations = [], selectedId = null, showOrm = false, onSelectTrip } = $props();

  let mapContainer;
  let map;
  let openRailwayLayer;
  let routeLayers = [];
  let allBounds = null;

  const HIGHLIGHT_STYLE = { color: "#be123c", weight: 6, opacity: 1 };

  function getSegmentKey(start, end) {
    const startKey = `${start[0]},${start[1]}`;
    const endKey = `${end[0]},${end[1]}`;
    return startKey < endKey ? `${startKey}|${endKey}` : `${endKey}|${startKey}`;
  }

  function getGeometryPaths(feature) {
    if (feature.geometry.type === "LineString") return [feature.geometry.coordinates];
    if (feature.geometry.type === "MultiLineString") return feature.geometry.coordinates;
    return [];
  }

  function getFrequencyStyle(visits, maxVisits) {
    const ratio = maxVisits > 1 ? (visits - 1) / (maxVisits - 1) : 0;
    const from = [156, 163, 175];
    const to = [220, 38, 38];
    const color =
      "#" +
      from
        .map((value, index) =>
          Math.round(value + (to[index] - value) * ratio)
            .toString(16)
            .padStart(2, "0")
        )
        .join("");

    return { color, weight: 4, opacity: 0.85 };
  }

  onMount(() => {
    map = L.map(mapContainer).setView([50.1, 9.8], 6);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    openRailwayLayer = L.tileLayer(
      "https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png",
      { opacity: 0.45, attribution: "&copy; OpenRailwayMap" }
    );

    const segmentCounts = new Map();
    routesData.features.forEach((feature) => {
      getGeometryPaths(feature).forEach((coordinates) => {
        for (let index = 0; index < coordinates.length - 1; index += 1) {
          const key = getSegmentKey(coordinates[index], coordinates[index + 1]);
          segmentCounts.set(key, (segmentCounts.get(key) || 0) + 1);
        }
      });
    });

    const maxVisits = Math.max(1, ...segmentCounts.values());
    const allSegments = [];

    routesData.features.forEach((feature) => {
      const p = feature.properties;
      const paths = getGeometryPaths(feature);
      const popup = `
          <strong>${p.start} &rarr; ${p.ziel}</strong><br/>
          <span>${p.datum} (${p.abfahrt} – ${p.ankunft} Uhr)</span><br/>
          <span>Zug: <b>${p.zuege}</b> | Distanz: <b>${p.distanz_km} km</b></span><br/>
          <small style="color:#94a3b8;">Halte: ${p.halte.join(" &bull; ")}</small>
        `;
      const segments = [];

      paths.forEach((coordinates) => {
        for (let index = 0; index < coordinates.length - 1; index += 1) {
          const start = coordinates[index];
          const end = coordinates[index + 1];
          const style = getFrequencyStyle(
            segmentCounts.get(getSegmentKey(start, end)),
            maxVisits
          );
          const layer = L.polyline(
            [
              [start[1], start[0]],
              [end[1], end[0]],
            ],
            style
          )
            .bindPopup(popup)
            .on("click", () => onSelectTrip(p.id))
            .addTo(map);

          segments.push({ layer, style });
          allSegments.push(layer);
        }
      });

      routeLayers.push({ id: p.id, segments });
    });

    if (allSegments.length > 0) {
      allBounds = L.featureGroup(allSegments).getBounds();
      map.fitBounds(allBounds, { padding: [30, 30] });
    }

    stations.forEach((st) => {
      const [lon, lat] = st.coords;
      const radius = Math.min(3 + st.visits * 0.7, 9);

      L.circleMarker([lat, lon], {
        radius,
        fillColor: "#f8fafc",
        color: "#6b7280",
        weight: 1.5,
        fillOpacity: 0.9,
      })
        .bindTooltip(`${st.name} (${st.visits}x)`, { direction: "top" })
        .addTo(map);
    });
  });

  onDestroy(() => {
    map?.remove();
  });

  // Reagiert auf das Umschalten von OpenRailwayMap
  $effect(() => {
    if (!map || !openRailwayLayer) return;
    if (showOrm) {
      openRailwayLayer.addTo(map);
    } else {
      map.removeLayer(openRailwayLayer);
    }
  });

  // Reagiert auf die Auswahl einer Fahrt
  $effect(() => {
    if (!map || routeLayers.length === 0) return;

    const id = selectedId;
    routeLayers.forEach((route) => {
      route.segments.forEach(({ layer, style }) => {
        layer.setStyle(id === null ? style : { ...style, opacity: 0.12 });
        if (id === null || route.id !== id) layer.closePopup();
      });
    });

    if (id === null) {
      if (allBounds) map.fitBounds(allBounds, { padding: [30, 30] });
      return;
    }

    const selectedRoute = routeLayers.find((route) => route.id === id);
    if (!selectedRoute) return;

    selectedRoute.segments.forEach(({ layer }) => {
      layer.setStyle(HIGHLIGHT_STYLE);
      layer.bringToFront();
    });

    if (selectedRoute.segments.length > 0) {
      const bounds = L.featureGroup(selectedRoute.segments.map(({ layer }) => layer)).getBounds();
      map.fitBounds(bounds, { padding: [50, 50] });
      selectedRoute.segments[0].layer.openPopup();
    }
  });
</script>

<main bind:this={mapContainer}></main>

<style>
  main {
    width: 100%;
    height: 100%;
  }

  :global(.leaflet-container) {
    background: #fff;
  }

  :global(.leaflet-tile-pane) {
    filter: grayscale(1) brightness(1.08) contrast(0.9);
  }

  :global(.leaflet-popup-content-wrapper),
  :global(.leaflet-popup-tip) {
    background: #1e293b;
    color: #f8fafc;
    border: 1px solid #334155;
  }
</style>