<script>
  import { onMount } from "svelte";
  import L from "leaflet";
  import "leaflet/dist/leaflet.css";

  let mapContainer;
  let map;
  let openRailwayLayer;
  let routeLayers = [];
  let allBounds = null;

  // Reaktiver State in Svelte
  let trips = $state([]);
  let stationCount = $state(0);
  let selectedId = $state(null);
  let showOrm = $state(false);

  // Automatisch berechnete Statistiken
  let totalKm = $derived(
    Math.round(trips.reduce((sum, t) => sum + (t.distanz_km || 0), 0)).toLocaleString("de-DE")
  );

  const HIGHLIGHT_STYLE = { color: "#be123c", weight: 6, opacity: 1 };

  function getSegmentKey(start, end) {
    const startKey = `${start[0]},${start[1]}`;
    const endKey = `${end[0]},${end[1]}`;
    return startKey < endKey ? `${startKey}|${endKey}` : `${endKey}|${startKey}`;
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

  // Reagiert automatisch auf die Checkbox für OpenRailwayMap
  $effect(() => {
    if (!map || !openRailwayLayer) return;
    if (showOrm) {
      openRailwayLayer.addTo(map);
    } else {
      map.removeLayer(openRailwayLayer);
    }
  });

  onMount(async () => {
    map = L.map(mapContainer).setView([50.1, 9.8], 6);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    openRailwayLayer = L.tileLayer(
      "https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png",
      { opacity: 0.45, attribution: "&copy; OpenRailwayMap" }
    );

    const [routesRes, stationsRes] = await Promise.all([
      fetch("/data/routes.geojson"),
      fetch("/data/stations.json"),
    ]);

    const routesData = await routesRes.json();
    const stationsData = await stationsRes.json();

    trips = routesData.features.map((f) => f.properties);
    stationCount = stationsData.length;

    const segmentCounts = new Map();
    routesData.features.forEach((feature) => {
      const coordinates = feature.geometry.coordinates;
      for (let index = 0; index < coordinates.length - 1; index += 1) {
        const key = getSegmentKey(coordinates[index], coordinates[index + 1]);
        segmentCounts.set(key, (segmentCounts.get(key) || 0) + 1);
      }
    });

    const maxVisits = Math.max(1, ...segmentCounts.values());
    const allSegments = [];

    routesData.features.forEach((feature) => {
      const p = feature.properties;
      const coordinates = feature.geometry.coordinates;
      const popup = `
          <strong>${p.start} &rarr; ${p.ziel}</strong><br/>
          <span>${p.datum} (${p.abfahrt} – ${p.ankunft} Uhr)</span><br/>
          <span>Zug: <b>${p.zuege}</b> | Distanz: <b>${p.distanz_km} km</b></span><br/>
          <small style="color:#94a3b8;">Halte: ${p.halte.join(" &bull; ")}</small>
        `;
      const segments = [];

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
          .on("click", () => selectTrip(p.id, false))
          .addTo(map);

        segments.push({ layer, style });
        allSegments.push(layer);
      }

      routeLayers.push({ id: p.id, segments });
    });

    if (allSegments.length > 0) {
      allBounds = L.featureGroup(allSegments).getBounds();
      map.fitBounds(allBounds, { padding: [30, 30] });
    }

    stationsData.forEach((st) => {
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

  function selectTrip(id, zoomToTrip = true) {
    selectedId = id;
    routeLayers.forEach((route) => {
      route.segments.forEach(({ layer, style }) => {
        layer.setStyle(id === null ? style : { ...style, opacity: 0.12 });
        if (id === null || route.id !== id) layer.closePopup();
      });
    });

    const selectedRoute = routeLayers.find((route) => route.id === id);
    if (!selectedRoute) return;

    selectedRoute.segments.forEach(({ layer }) => {
      layer.setStyle(HIGHLIGHT_STYLE);
      layer.bringToFront();
    });

    if (zoomToTrip && selectedRoute.segments.length > 0) {
      const bounds = L.featureGroup(selectedRoute.segments.map(({ layer }) => layer)).getBounds();
      map.fitBounds(bounds, { padding: [50, 50] });
      selectedRoute.segments[0].layer.openPopup();
    }
  }

  function resetView() {
    selectTrip(null, false);
    if (allBounds) map.fitBounds(allBounds, { padding: [30, 30] });
  }
</script>

<div class="app-layout">
  <aside class="sidebar">
    <header>
      <h1>Bahnreisen 2026</h1>
      <p class="subtitle">Schienennetz-Visualisierung</p>
    </header>

    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-value">{trips.length}</span>
        <span class="stat-label">Fahrten</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{totalKm}</span>
        <span class="stat-label">Schienen-km</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{stationCount}</span>
        <span class="stat-label">Bahnhöfe</span>
      </div>
    </div>

    <div class="controls">
      <button class="btn-primary" onclick={resetView}>Alle Fahrten anzeigen</button>
      <label class="toggle-label">
        <input type="checkbox" bind:checked={showOrm} />
        OpenRailwayMap-Netz einblenden
      </label>
    </div>

    <div class="frequency-legend" aria-label="Streckenhäufigkeit: von einmal gefahren bis häufig gefahren">
      <span>Streckenhäufigkeit</span>
      <div class="frequency-gradient"></div>
      <div class="frequency-labels"><span>einmal</span><span>häufig</span></div>
    </div>

    <ul class="trip-list">
      {#each trips as trip (trip.id)}
        <li>
          <button
            class="trip-item"
            class:active={selectedId === trip.id}
            onclick={() => selectTrip(trip.id, true)}
          >
            <div class="trip-meta">
              <span>{trip.datum} &bull; {trip.zuege}</span>
              <span>{trip.distanz_km} km</span>
            </div>
            <div class="trip-route">{trip.start} &rarr; {trip.ziel}</div>
          </button>
        </li>
      {/each}
    </ul>
  </aside>

  <main bind:this={mapContainer}></main>
</div>

<style>
  :global(*) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  :global(body) {
    font-family: system-ui, -apple-system, sans-serif;
    background: #0f172a;
    color: #f8fafc;
    height: 100vh;
    overflow: hidden;
  }

  .app-layout {
    display: grid;
    grid-template-columns: 340px 1fr;
    height: 100vh;
  }

  .sidebar {
    background: #1e293b;
    border-right: 1px solid #334155;
    display: flex;
    flex-direction: column;
    padding: 1.25rem;
    overflow: hidden;
  }

  header h1 {
    font-size: 1.25rem;
    font-weight: 700;
  }

  .subtitle {
    font-size: 0.85rem;
    color: #94a3b8;
    margin-top: 0.2rem;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
    margin: 1rem 0;
  }

  .stat-card {
    background: #0f172a;
    padding: 0.65rem 0.5rem;
    border-radius: 8px;
    text-align: center;
    border: 1px solid #334155;
  }

  .stat-value {
    display: block;
    font-size: 1.1rem;
    font-weight: 700;
    color: #38bdf8;
  }

  .stat-label {
    font-size: 0.72rem;
    color: #94a3b8;
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    margin-bottom: 1rem;
  }

  .btn-primary {
    background: #0284c7;
    color: #fff;
    border: none;
    padding: 0.55rem 0.8rem;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
    font-size: 0.85rem;
  }

  .btn-primary:hover {
    background: #0369a1;
  }

  .toggle-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.82rem;
    color: #cbd5e1;
    cursor: pointer;
  }

  .trip-list {
    list-style: none;
    overflow-y: auto;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding-right: 0.25rem;
  }

  .trip-item {
    width: 100%;
    text-align: left;
    color: inherit;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 0.7rem;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }

  .trip-item:hover,
  .trip-item.active {
    border-color: #38bdf8;
    background: #172554;
  }

  .trip-meta {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    color: #94a3b8;
    margin-bottom: 0.25rem;
  }

  .trip-route {
    font-size: 0.88rem;
    font-weight: 600;
  }

  main {
    width: 100%;
    height: 100%;
  }

  .frequency-legend {
    margin-bottom: 0.9rem;
    color: #cbd5e1;
    font-size: 0.75rem;
  }

  .frequency-gradient {
    height: 5px;
    margin: 0.35rem 0 0.2rem;
    border-radius: 999px;
    background: linear-gradient(90deg, #9ca3af, #dc2626);
  }

  .frequency-labels {
    display: flex;
    justify-content: space-between;
    color: #94a3b8;
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