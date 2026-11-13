<script>
  import { onMount } from "svelte";
  import L from "leaflet";
  import "leaflet/dist/leaflet.css";

  // ---- Einstellungen ----------------------------------------------------
  const PLAY_SECONDS = 75; // so lange dauert das ganze Jahr bei 1x
  const DRAW_DAYS = 6; // so viele Timeline-Tage braucht eine Fahrt zum "Einzeichnen"
  const SPEEDS = [0.5, 1, 2, 4, 8];
  const DAY = 86_400_000;

  // ---- State ------------------------------------------------------------
  let mapEl;
  let trackEl;
  let map;
  let trips = []; // { p, start, path, cum, dense, keys, cells, group, line, head, mode }
  let maxCount = 1;
  let maxLabel = $state(1);
  let stationLayers = []; // { name, first, visits:[starts], marker }

  let ready = $state(false);
  let error = $state("");
  let rangeStart = $state(0);
  let rangeEnd = $state(1);
  let t = $state(0);
  let playing = $state(true);
  let speed = $state(1);
  let dragging = false;
  let resumeAfterDrag = false;

  let tripMarks = $state([]); // { id, frac, label }
  let monthMarks = $state([]); // { frac, label }
  let stats = $state({ trips: 0, km: 0, stations: 0 });

  let fraction = $derived(rangeEnd > rangeStart ? (t - rangeStart) / (rangeEnd - rangeStart) : 0);
  let dateLabel = $derived(
    new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", year: "numeric" }).format(t)
  );
  let atEnd = $derived(t >= rangeEnd);
  let totalTrips = $state(0);

  // ---- Hilfsfunktionen --------------------------------------------------
  function parseTime(datum, zeit) {
    const [d, m, y] = datum.split(".").map(Number);
    const [hh, mm] = (zeit || "00:00").split(":").map(Number);
    return new Date(y, m - 1, d, hh, mm).getTime();
  }

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

  function cumulative(path) {
    const cum = [0];
    for (let i = 1; i < path.length; i++) {
      const k = Math.cos((path[i][1] * Math.PI) / 180);
      const dx = (path[i][0] - path[i - 1][0]) * k;
      const dy = path[i][1] - path[i - 1][1];
      cum.push(cum[i - 1] + Math.hypot(dx, dy));
    }
    return cum;
  }

  // ---- Streckenhäufigkeit ------------------------------------------------
  // Fahrten nutzen leicht unterschiedlich vereinfachte Pfade; daher zählen wir
  // pro Rasterzelle (~0,7 km), wie viele Fahrten sie berühren.
  const CELL = 0.01;
  const DENSE_STEP = 0.004;
  const HEAT = [
    [0, [51, 78, 122]], // selten: gedämpftes Blau
    [0.35, [34, 211, 238]], // Cyan
    [0.7, [250, 204, 21]], // Gelb
    [1, [255, 59, 107]], // sehr häufig: Rot
  ];
  const countCache = new Map();

  function cellKey(pt) {
    return `${Math.round(pt[0] / CELL)},${Math.round(pt[1] / CELL)}`;
  }

  function densify(path) {
    const out = [];
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      out.push(a);
      const steps = Math.floor(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / DENSE_STEP);
      for (let s = 1; s <= steps; s++) {
        const f = s / (steps + 1);
        out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
      }
    }
    out.push(path[path.length - 1]);
    return out;
  }

  // Zählstand, wenn die ersten n Fahrten (nach Datum) begonnen haben
  function countsFor(n) {
    if (countCache.has(n)) return countCache.get(n);
    const counts = new Map();
    for (const trip of trips.slice(0, n)) {
      for (const cell of trip.cells) counts.set(cell, (counts.get(cell) || 0) + 1);
    }
    countCache.set(n, counts);
    return counts;
  }

  function heatStyle(count) {
    const r = maxCount > 1 ? Math.pow((count - 1) / (maxCount - 1), 0.8) : 0;
    let i = 1;
    while (i < HEAT.length - 1 && r > HEAT[i][0]) i++;
    const [r0, c0] = HEAT[i - 1];
    const [r1, c1] = HEAT[i];
    const f = (r - r0) / (r1 - r0);
    const rgb = c0.map((v, k) => Math.round(v + (c1[k] - v) * f));
    return {
      color: `rgb(${rgb.join(",")})`,
      weight: 2 + 3.5 * r,
      opacity: 0.55 + 0.45 * r,
      lineJoin: "round",
      lineCap: "round",
    };
  }

  function buildRuns(trip, counts) {
    trip.group.clearLayers();
    const { dense, keys } = trip;
    let run = [[dense[0][1], dense[0][0]]];
    let current = counts.get(keys[0]) || 1;
    for (let i = 1; i < dense.length; i++) {
      const c = counts.get(keys[i]) || 1;
      const point = [dense[i][1], dense[i][0]];
      if (c === current) {
        run.push(point);
      } else {
        run.push(point);
        L.polyline(run, heatStyle(current)).addTo(trip.group);
        run = [point];
        current = c;
      }
    }
    if (run.length > 1) L.polyline(run, heatStyle(current)).addTo(trip.group);
  }

  // Teil des Pfads bis Fortschritt p (0..1) als Leaflet-LatLngs
  function slicePath(trip, p) {
    const { path, cum } = trip;
    const total = cum[cum.length - 1];
    const target = total * p;
    let lo = 0;
    let hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (cum[mid] <= target) lo = mid;
      else hi = mid - 1;
    }
    const latlngs = path.slice(0, lo + 1).map(([lon, lat]) => [lat, lon]);
    if (lo < path.length - 1) {
      const span = cum[lo + 1] - cum[lo] || 1;
      const f = (target - cum[lo]) / span;
      const a = path[lo];
      const b = path[lo + 1];
      latlngs.push([a[1] + (b[1] - a[1]) * f, a[0] + (b[0] - a[0]) * f]);
    }
    return latlngs;
  }

  // ---- Darstellung zum Zeitpunkt now -----------------------------------
  function render(now) {
    if (!map) return;
    let km = 0;
    let doneOrActive = 0;
    const started = trips.filter((trip) => now >= trip.start).length;
    const counts = countsFor(started);

    for (const trip of trips) {
      const p = Math.max(0, Math.min(1, (now - trip.start) / (DRAW_DAYS * DAY)));
      km += trip.p.distanz_km * p;
      if (p > 0) doneOrActive++;

      if (p <= 0) {
        if (trip.mode !== "none") {
          trip.line.setLatLngs([]);
          trip.group.clearLayers();
          trip.head.setStyle({ opacity: 0, fillOpacity: 0 });
          trip.mode = "none";
        }
      } else if (p < 1) {
        // Läuft gerade: weiß, wächst mit der Zeit
        const latlngs = slicePath(trip, p);
        if (trip.mode !== "active") {
          trip.group.clearLayers();
          trip.mode = "active";
        }
        trip.line.setLatLngs(latlngs);
        trip.head.setLatLng(latlngs[latlngs.length - 1]);
        trip.head.setStyle({ opacity: 1, fillOpacity: 1 });
      } else if (trip.mode !== "done" || trip.runsFor !== started) {
        // Fertig: nach Häufigkeit eingefärbt (neu, wenn sich der Zählstand ändert)
        trip.line.setLatLngs([]);
        trip.head.setStyle({ opacity: 0, fillOpacity: 0 });
        buildRuns(trip, counts);
        trip.mode = "done";
        trip.runsFor = started;
      }
    }

    let visitedStations = 0;
    for (const st of stationLayers) {
      const count = st.visits.filter((v) => v <= now).length;
      if (count === st.shown) {
        if (count > 0) visitedStations++;
        continue;
      }
      st.shown = count;
      if (count === 0) {
        st.marker.setStyle({ opacity: 0, fillOpacity: 0 });
      } else {
        st.marker.setStyle({ opacity: 1, fillOpacity: 0.95 });
        st.marker.setRadius(Math.min(3 + count * 0.8, 10));
        st.marker.setTooltipContent(`${st.name} (${count}×)`);
      }
      if (count > 0) visitedStations++;
    }

    stats = { trips: doneOrActive, km: Math.round(km), stations: visitedStations };
  }

  $effect(() => {
    render(t);
  });

  // ---- Wiedergabe -------------------------------------------------------
  let rafId;
  let lastFrame = 0;

  function tick(ts) {
    rafId = requestAnimationFrame(tick);
    const dt = lastFrame ? ts - lastFrame : 0;
    lastFrame = ts;
    if (!playing || dragging || !ready) return;
    const perMs = (rangeEnd - rangeStart) / (PLAY_SECONDS * 1000);
    const next = t + dt * perMs * speed;
    if (next >= rangeEnd) {
      t = rangeEnd;
      playing = false;
    } else {
      t = next;
    }
  }

  function togglePlay() {
    if (atEnd) t = rangeStart;
    playing = !playing;
  }

  function restart() {
    t = rangeStart;
    playing = true;
  }

  // ---- Timeline per Maus/Touch -----------------------------------------
  function timeFromEvent(e) {
    const rect = trackEl.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return rangeStart + f * (rangeEnd - rangeStart);
  }

  function onPointerDown(e) {
    dragging = true;
    resumeAfterDrag = playing;
    trackEl.setPointerCapture(e.pointerId);
    t = timeFromEvent(e);
  }

  function onPointerMove(e) {
    if (dragging) t = timeFromEvent(e);
  }

  function onPointerUp(e) {
    if (!dragging) return;
    dragging = false;
    trackEl.releasePointerCapture(e.pointerId);
    playing = resumeAfterDrag && t < rangeEnd;
  }

  function onKey(e) {
    const step = (rangeEnd - rangeStart) / 100;
    if (e.key === "ArrowRight") t = Math.min(rangeEnd, t + step);
    else if (e.key === "ArrowLeft") t = Math.max(rangeStart, t - step);
    else if (e.key === "Home") t = rangeStart;
    else if (e.key === "End") t = rangeEnd;
    else if (e.key === " ") togglePlay();
    else return;
    e.preventDefault();
  }

  function jumpToTrip(trip) {
    t = Math.min(rangeEnd, trip.start + DRAW_DAYS * DAY);
    playing = false;
  }

  // ---- Initialisierung --------------------------------------------------
  onMount(() => {
    map = L.map(mapEl, { preferCanvas: true, zoomControl: false, zoomSnap: 0.25 }).setView(
      [50.1, 9.8],
      6
    );
    L.control.zoom({ position: "topright" }).addTo(map);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd",
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    }).addTo(map);

    load().catch((e) => {
      error = String(e.message || e);
    });

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      map.remove();
    };
  });

  async function load() {
    const [routesRes, stationsRes] = await Promise.all([
      fetch("/data/routes.geojson"),
      fetch("/data/stations.json"),
    ]);
    if (!routesRes.ok || !stationsRes.ok) {
      throw new Error("Daten nicht gefunden. Bitte zuerst 'npm run build:routes' ausführen.");
    }
    const routes = await routesRes.json();
    const stations = await stationsRes.json();

    const bounds = [];
    trips = routes.features
      .map((f) => {
        const p = f.properties;
        const start = parseTime(p.datum, p.abfahrt);
        const path = flatten(f.geometry);
        bounds.push(...path.map(([lon, lat]) => [lat, lon]));
        const dense = densify(path);
        const keys = dense.map(cellKey);
        return {
          p,
          start,
          end: parseTime(p.datum, p.ankunft),
          path,
          cum: cumulative(path),
          dense,
          keys,
          cells: new Set(keys),
          mode: "none",
          runsFor: -1,
          group: L.layerGroup().addTo(map),
          line: L.polyline([], { color: "#ffffff", weight: 4, opacity: 1, lineJoin: "round" }).addTo(map),
          head: L.circleMarker([0, 0], {
            radius: 5,
            color: "#fff",
            weight: 2,
            fillColor: "#ffffff",
            opacity: 0,
            fillOpacity: 0,
          }).addTo(map),
        };
      })
      .sort((a, b) => a.start - b.start);

    // Skala der Häufigkeit: Maximum über das ganze Jahr
    maxCount = Math.max(1, ...countsFor(trips.length).values());
    maxLabel = maxCount;

    // Stationen: erster Besuch = Beginn der Fahrt, auf der sie vorkommt
    const byName = new Map(stations.map((s) => [s.name, s]));
    const visits = new Map();
    for (const trip of trips) {
      for (const name of new Set(trip.p.halte)) {
        if (!visits.has(name)) visits.set(name, []);
        visits.get(name).push(trip.start + DRAW_DAYS * DAY * 0.5);
      }
    }
    stationLayers = [...visits].flatMap(([name, list]) => {
      const st = byName.get(name);
      if (!st) return [];
      const [lon, lat] = st.coords;
      const marker = L.circleMarker([lat, lon], {
        radius: 4,
        color: "#475569",
        weight: 1.5,
        fillColor: "#f8fafc",
        opacity: 0,
        fillOpacity: 0,
      })
        .bindTooltip(name, { direction: "top" })
        .addTo(map);
      return [{ name, visits: list.sort((a, b) => a - b), marker, shown: -1 }];
    });

    if (bounds.length) map.fitBounds(bounds, { padding: [60, 60] });

    // Zeitraum: ganzes Jahr der ersten Fahrt
    const year = new Date(trips[0].start).getFullYear();
    rangeStart = new Date(year, 0, 1).getTime();
    rangeEnd = new Date(year, 11, 31, 23, 59).getTime();
    t = rangeStart;
    totalTrips = trips.length;

    const span = rangeEnd - rangeStart;
    tripMarks = trips.map((trip) => ({
      trip,
      frac: (trip.start - rangeStart) / span,
      label: `${trip.p.datum}: ${trip.p.start} → ${trip.p.ziel}`,
    }));
    monthMarks = Array.from({ length: 12 }, (_, m) => ({
      frac: (new Date(year, m, 1).getTime() - rangeStart) / span,
      label: new Intl.DateTimeFormat("de-DE", { month: "short" }).format(new Date(year, m, 1)),
    }));

    ready = true;
  }
</script>

<div class="stage">
  <div class="map" bind:this={mapEl}></div>

  <header class="title">
    <h1>Mein Bahnjahr</h1>
    <p>{ready ? dateLabel : "Lade Daten …"}</p>
  </header>

  <section class="stats" aria-live="off">
    <div><b>{stats.trips}</b><span>von {totalTrips} Fahrten</span></div>
    <div><b>{stats.km.toLocaleString("de-DE")}</b><span>Schienen-km</span></div>
    <div><b>{stats.stations}</b><span>Bahnhöfe</span></div>
  </section>

  {#if error}
    <div class="error">{error}</div>
  {/if}

  <aside class="legend" aria-label="Streckenhäufigkeit">
    <span class="legend-title">Streckenhäufigkeit</span>
    <div class="legend-bar"></div>
    <div class="legend-labels"><span>1×</span><span>{maxLabel}× gefahren</span></div>
  </aside>

  <footer class="timeline">
    <div class="controls">
      <button class="icon" onclick={togglePlay} aria-label={playing ? "Pause" : atEnd ? "Nochmal" : "Abspielen"}>
        {#if playing}
          <svg viewBox="0 0 24 24" width="20" height="20"><path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor" /></svg>
        {:else if atEnd}
          <svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z" fill="currentColor" /></svg>
        {:else}
          <svg viewBox="0 0 24 24" width="20" height="20"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
        {/if}
      </button>
      <button class="icon" onclick={restart} aria-label="Von vorn" title="Von vorn">
        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 6h2v12H6zM9.5 12 18 6v12z" fill="currentColor" /></svg>
      </button>
      <div class="speeds" role="group" aria-label="Geschwindigkeit">
        {#each SPEEDS as s}
          <button class:on={speed === s} onclick={() => (speed = s)}>{s}×</button>
        {/each}
      </div>
    </div>

    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="track-wrap"
      role="slider"
      tabindex="0"
      aria-label="Zeitleiste"
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow={Math.round(fraction * 100)}
      aria-valuetext={dateLabel}
      onkeydown={onKey}
    >
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="track"
        bind:this={trackEl}
        onpointerdown={onPointerDown}
        onpointermove={onPointerMove}
        onpointerup={onPointerUp}
        onpointercancel={onPointerUp}
      >
        <div class="fill" style="width:{fraction * 100}%"></div>
        {#each tripMarks as m}
          <button
            class="mark"
            class:passed={fraction >= m.frac}
            style="left:{m.frac * 100}%"
            title={m.label}
            aria-label={m.label}
            onpointerdown={(e) => e.stopPropagation()}
            onclick={() => jumpToTrip(m.trip)}
          ></button>
        {/each}
        <div class="handle" style="left:{fraction * 100}%"></div>
      </div>
      <div class="months">
        {#each monthMarks as m}
          <span style="left:{m.frac * 100}%">{m.label}</span>
        {/each}
      </div>
    </div>
  </footer>
</div>

<style>
  :global(*) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  :global(body) {
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    background: #0b1020;
    color: #f1f5f9;
    height: 100vh;
    overflow: hidden;
  }
  :global(.leaflet-container) {
    background: #0b1020;
    font-family: inherit;
  }
  :global(.leaflet-tooltip) {
    background: #1e293b;
    border: 1px solid #334155;
    color: #f1f5f9;
  }
  :global(.leaflet-tooltip-top::before) {
    border-top-color: #334155;
  }

  .stage {
    position: relative;
    height: 100vh;
  }
  .map {
    position: absolute;
    inset: 0;
  }

  .title,
  .stats,
  .legend,
  .timeline {
    position: absolute;
    z-index: 1000;
    background: rgba(11, 16, 32, 0.78);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(148, 163, 184, 0.22);
    border-radius: 14px;
  }

  .title {
    top: 16px;
    left: 16px;
    padding: 0.8rem 1.1rem;
  }
  .title h1 {
    font-size: 1.35rem;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .title p {
    margin-top: 0.15rem;
    font-size: 0.95rem;
    color: #fda4af;
    font-variant-numeric: tabular-nums;
  }

  .stats {
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 1.6rem;
    padding: 0.7rem 1.3rem;
  }
  .stats div {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .stats b {
    font-size: 1.3rem;
    font-variant-numeric: tabular-nums;
    color: #7dd3fc;
  }
  .stats span {
    font-size: 0.72rem;
    color: #94a3b8;
  }

  .legend {
    left: 16px;
    bottom: 112px;
    width: 190px;
    padding: 0.6rem 0.8rem;
    font-size: 0.72rem;
    color: #cbd5e1;
  }
  .legend-bar {
    height: 6px;
    margin: 0.4rem 0 0.25rem;
    border-radius: 999px;
    background: linear-gradient(90deg, rgb(51, 78, 122), rgb(34, 211, 238) 35%, rgb(250, 204, 21) 70%, rgb(255, 59, 107));
  }
  .legend-labels {
    display: flex;
    justify-content: space-between;
    color: #94a3b8;
  }

  .timeline {
    left: 16px;
    right: 16px;
    bottom: 16px;
    padding: 0.8rem 1.1rem 0.6rem;
    display: flex;
    align-items: center;
    gap: 1.1rem;
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }
  button {
    font: inherit;
    color: inherit;
    cursor: pointer;
  }
  .icon {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    border: 1px solid #334155;
    background: #1e293b;
    display: grid;
    place-items: center;
  }
  .icon:hover {
    background: #334155;
  }
  .speeds {
    display: flex;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 999px;
    padding: 2px;
  }
  .speeds button {
    border: none;
    background: none;
    padding: 0.25rem 0.55rem;
    border-radius: 999px;
    font-size: 0.78rem;
    color: #94a3b8;
  }
  .speeds button.on {
    background: #0ea5e9;
    color: #fff;
  }

  .track-wrap {
    flex: 1;
    min-width: 0;
    outline: none;
  }
  .track-wrap:focus-visible .track {
    box-shadow: 0 0 0 2px #38bdf8;
  }
  .track {
    position: relative;
    height: 10px;
    margin: 14px 8px 6px;
    background: #1e293b;
    border-radius: 999px;
    cursor: ew-resize;
    touch-action: none;
  }
  .fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: linear-gradient(90deg, #0ea5e9, #fb7185);
    border-radius: 999px;
    pointer-events: none;
  }
  .handle {
    position: absolute;
    top: 50%;
    width: 20px;
    height: 20px;
    transform: translate(-50%, -50%);
    background: #fff;
    border-radius: 50%;
    box-shadow: 0 0 0 4px rgba(251, 113, 133, 0.35);
    pointer-events: none;
  }
  .mark {
    position: absolute;
    top: -5px;
    width: 12px;
    height: 20px;
    transform: translateX(-50%);
    border: none;
    background: none;
    padding: 0;
  }
  .mark::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 3px;
    width: 3px;
    height: 14px;
    transform: translateX(-50%);
    border-radius: 2px;
    background: #64748b;
  }
  .mark.passed::after {
    background: #fff;
  }
  .mark:hover::after {
    background: #fda4af;
  }
  .months {
    position: relative;
    height: 1rem;
    margin: 0 8px;
    font-size: 0.7rem;
    color: #94a3b8;
    pointer-events: none;
  }
  .months span {
    position: absolute;
    top: 0;
    transform: translateX(2px);
  }

  .error {
    position: absolute;
    z-index: 1100;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: #7f1d1d;
    padding: 1rem 1.4rem;
    border-radius: 10px;
  }

  @media (max-width: 720px) {
    .legend {
      bottom: 210px;
    }
    .stats {
      top: auto;
      bottom: 130px;
      left: 16px;
      right: 16px;
      transform: none;
      justify-content: space-around;
      gap: 0.5rem;
    }
    .timeline {
      flex-direction: column;
      align-items: stretch;
      gap: 0.3rem;
    }
    .months span:nth-child(even) {
      display: none;
    }
  }
</style>
