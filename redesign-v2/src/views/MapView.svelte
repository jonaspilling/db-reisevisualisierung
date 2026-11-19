<script>
  // Die Karte: Vollbild, deine Fahrten als Linien, die sich über die Zeit einzeichnen. Wo sich Fahrten überlagern,
  // wird es heller (gestapelte Deckkraft): das zeigt, wie oft ich dort gefahren bin. Bahnhöfe sind anklickbar.
  import { onMount } from "svelte";
  import { gsap } from "gsap";
  import * as maplibregl from "maplibre-gl";
  import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
  import { theme } from "../lib/theme.svelte.js";
  import { nf, hm } from "../lib/format.js";

  let { data } = $props();
  const { trips, stations, stats } = data;
  const N = trips.length;

  const STYLES = {
    dark: "https://tiles.openfreemap.org/styles/dark",
    light: "https://tiles.openfreemap.org/styles/positron",
  };

  let el;
  let map;
  let ready = false;
  let tween;

  let t = $state(0);
  let playing = $state(false);
  let selTrips = $state.raw(null); // Set von Fahrt-Indizes oder null
  let selLabel = $state(""); // Beschriftung der Auswahl (Bahnhof)
  let listOpen = $state(false);

  const cur = $derived(Math.min(N - 1, Math.floor(t)));
  const frac = (i) => Math.max(0, Math.min(1, t - i));
  const kmDone = $derived(
    selTrips ? [...selTrips].reduce((a, i) => a + trips[i].km, 0) : trips.reduce((a, tr, i) => a + tr.km * frac(i), 0)
  );

  // Strecke je Fahrt für den "Kopf": laufende Länge in Gradeinheiten
  const cum = trips.map((tr) => {
    const c = [0];
    for (let i = 1; i < tr.path.length; i++) {
      const [x0, y0] = tr.path[i - 1];
      const [x1, y1] = tr.path[i];
      c.push(c[i - 1] + Math.hypot((x1 - x0) * 0.64, y1 - y0));
    }
    return c;
  });
  function pointAt(i, f) {
    const c = cum[i];
    const target = c[c.length - 1] * f;
    let k = 1;
    while (k < c.length - 1 && c[k] < target) k++;
    const a = trips[i].path[k - 1];
    const b = trips[i].path[k];
    const u = c[k] === c[k - 1] ? 0 : (target - c[k - 1]) / (c[k] - c[k - 1]);
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  }

  // Farben als RGB: die Deckkraft steckt im Verlauf (line-gradient), damit sich jede Linie Stück für Stück einzeichnet
  const colors = () => (theme.mode === "dark" ? { core: [255, 59, 78], glow: [255, 27, 48], glowOp: 0.3 } : { core: [212, 0, 26], glow: [212, 0, 26], glowOp: 0 });
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  // Bis f gefärbt, danach durchsichtig. Bei 0 komplett unsichtbar, bei 1 komplett sichtbar.
  function grad(f, c, a) {
    const on = rgba(c, a);
    const off = rgba(c, 0);
    if (f <= 0.0005 || a <= 0) return ["interpolate", ["linear"], ["line-progress"], 0, off, 1, off];
    if (f >= 0.9995) return ["interpolate", ["linear"], ["line-progress"], 0, on, 1, on];
    return ["interpolate", ["linear"], ["line-progress"], 0, on, f, on, Math.min(0.9999, f + 0.0004), off, 1, off];
  }

  function bounds(idx) {
    const b = new maplibregl.LngLatBounds();
    for (const i of idx) for (const p of trips[i].path) b.extend(p);
    return b;
  }

  const fitAll = (duration = 900) => fit(trips.map((_, i) => i), duration);
  function fit(idx, duration = 900) {
    if (!map) return;
    const wide = innerWidth > 860;
    map.fitBounds(bounds(idx), {
      padding: wide ? { top: 100, bottom: 150, left: 60, right: 400 } : { top: 90, bottom: 190, left: 24, right: 24 },
      duration,
      maxZoom: 9.5,
    });
  }

  // ---- Ebenen aufbauen (nach jedem Stilwechsel neu) ----
  function build() {
    const c = colors();
    map.addSource("trips", {
      type: "geojson",
      lineMetrics: true,
      data: {
        type: "FeatureCollection",
        features: trips.map((tr, i) => ({ type: "Feature", id: i, properties: { i }, geometry: { type: "LineString", coordinates: tr.path } })),
      },
    });
    trips.forEach((_, i) => {
      map.addLayer({
        id: `g${i}`,
        type: "line",
        source: "trips",
        filter: ["==", ["id"], i],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-gradient": grad(0, c.glow, 0), "line-width": 10, "line-blur": 7 },
      });
      map.addLayer({
        id: `l${i}`,
        type: "line",
        source: "trips",
        filter: ["==", ["id"], i],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-gradient": grad(0, c.core, 0), "line-width": ["interpolate", ["linear"], ["zoom"], 4, 1.8, 9, 4.5] },
      });
    });
    map.addSource("stations", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: stations.map((s) => ({ type: "Feature", properties: { key: s.key, name: s.name, visits: s.visits }, geometry: { type: "Point", coordinates: s.coords } })),
      },
    });
    map.addLayer({
      id: "st-dot",
      type: "circle",
      source: "stations",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["get", "visits"], 1, 3.2, 14, 8],
        "circle-color": theme.mode === "dark" ? "#0c0e13" : "#f3efe6",
        "circle-stroke-color": theme.mode === "dark" ? "#f2efe9" : "#14161b",
        "circle-stroke-width": 1.6,
      },
    });
    map.addLayer({
      id: "st-hit",
      type: "circle",
      source: "stations",
      paint: { "circle-radius": 15, "circle-opacity": 0 },
    });
    map.addLayer({
      id: "st-label",
      type: "symbol",
      source: "stations",
      filter: [">", ["get", "visits"], 2],
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 12,
        "text-anchor": "top",
        "text-offset": [0, 0.9],
        "text-padding": 6,
      },
      paint: {
        "text-color": theme.mode === "dark" ? "#f2efe9" : "#14161b",
        "text-halo-color": theme.mode === "dark" ? "#0c0e13" : "#f3efe6",
        "text-halo-width": 1.6,
      },
    });
    map.addSource("head", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({
      id: "head",
      type: "circle",
      source: "head",
      paint: { "circle-radius": 6, "circle-color": "#ffffff", "circle-stroke-color": rgba(c.core, 1), "circle-stroke-width": 3 },
    });
    last = trips.map(() => "");
    apply();
  }

  // ---- Zustand auf die Karte schreiben ----
  let last = [];
  function apply() {
    if (!map || !ready) return;
    const sel = selTrips;
    const c = colors();
    trips.forEach((_, i) => {
      const f = sel ? (sel.has(i) ? 1 : 0) : frac(i);
      const op = sel ? (sel.has(i) ? 0.85 : 0) : 0.62;
      const key = `${f.toFixed(4)}|${op}|${theme.mode}`;
      if (last[i] === key) return;
      last[i] = key;
      map.setPaintProperty(`l${i}`, "line-gradient", grad(f, c.core, op));
      map.setPaintProperty(`g${i}`, "line-gradient", grad(f, c.glow, op * c.glowOp));
    });
    const hs = map.getSource("head");
    if (hs) {
      const f = frac(cur);
      hs.setData({
        type: "FeatureCollection",
        features: !sel && playing && f > 0 && f < 1 ? [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: pointAt(cur, f) } }] : [],
      });
    }
  }

  $effect(() => {
    t;
    selTrips;
    playing;
    apply();
  });

  // ---- Zeitleiste ----
  function play() {
    if (selTrips) clearSel();
    if (t >= N - 0.001) t = 0;
    const left = (N - t) / N;
    tween?.kill();
    const o = { v: t };
    playing = true;
    tween = gsap.to(o, {
      v: N,
      duration: Math.max(1, N * 1.9 * left),
      ease: "none",
      onUpdate: () => (t = o.v),
      onComplete: () => {
        playing = false;
        fitAll();
      },
    });
  }
  function pause() {
    tween?.kill();
    playing = false;
  }
  const toggle = () => (playing ? pause() : play());
  function scrub(e) {
    pause();
    if (selTrips) clearSel();
    t = (+e.currentTarget.value / 1000) * N;
  }

  // ---- Auswahl ----
  function clearSel() {
    selTrips = null;
    selLabel = "";
    fitAll();
  }
  function selectStation(key) {
    const st = stations.find((s) => s.key === key);
    const idx = trips.map((tr, i) => (tr.halte.includes(key) ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) return;
    pause();
    selTrips = new Set(idx);
    selLabel = `${st.name} · ${idx.length}×`;
    fit(idx, 1100);
  }
  function selectTrip(i) {
    pause();
    selTrips = new Set([i]);
    selLabel = `${trips[i].von} → ${trips[i].nach}`;
    fit([i], 1100);
    listOpen = false;
  }

  onMount(() => {
    maplibregl.setWorkerUrl(workerUrl);
    map = new maplibregl.Map({
      container: el,
      style: STYLES[theme.mode],
      center: [10.4, 50.2],
      zoom: 5,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

    map.on("style.load", () => {
      ready = true;
      build();
    });
    map.once("load", () => {
      fitAll(0);
      setTimeout(() => !selTrips && t === 0 && play(), 1200);
    });
    map.on("click", "st-hit", (e) => {
      const f = e.features?.[0];
      if (f) selectStation(f.properties.key);
    });
    map.on("click", (e) => {
      if (map.queryRenderedFeatures(e.point, { layers: ["st-hit"] }).length) return;
      if (selTrips) clearSel();
    });
    map.on("mouseenter", "st-hit", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "st-hit", () => (map.getCanvas().style.cursor = ""));

    return () => {
      tween?.kill();
      map.remove();
    };
  });

  // Stilwechsel dunkel/hell
  let lastMode = theme.mode;
  $effect(() => {
    const mode = theme.mode;
    if (!map || mode === lastMode) return;
    lastMode = mode;
    ready = false;
    map.setStyle(STYLES[mode]);
  });
</script>

<main>
  <div class="map" bind:this={el}></div>

  {#if selLabel}
    <div class="chip" role="status">
      <span>Nur: <b>{selLabel}</b></span>
      <button type="button" onclick={clearSel} aria-label="Auswahl aufheben">×</button>
    </div>
  {/if}

  <!-- Fahrtentafel -->
  <aside class="board" class:open={listOpen} aria-label="Fahrtentafel">
    <header>
      <h2>Fahrten</h2>
      <span class="mono">{N} im Jahr · {nf(stats.km)} km</span>
    </header>
    <ol>
      {#each trips as tr, i}
        <li>
          <button type="button" class:on={selTrips?.has(i)} class:now={!selTrips && i === cur && t > 0} onclick={() => selectTrip(i)}>
            <span class="no mono">{String(tr.no).padStart(2, "0")}</span>
            <span class="route"><b>{tr.von}</b> → <b>{tr.nach}</b></span>
            <span class="meta mono">{tr.datum.slice(0, 5)} · {nf(tr.km)} km · {hm(tr.minutes)}</span>
          </button>
        </li>
      {/each}
    </ol>
  </aside>

  <button type="button" class="board-toggle" onclick={() => (listOpen = !listOpen)} aria-expanded={listOpen}>Fahrten</button>

  <!-- Zeitleiste -->
  <div class="dock">
    <button type="button" class="play" onclick={toggle} aria-label={playing ? "Pause" : "Abspielen"}>
      {#if playing}
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" /></svg>
      {:else}
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
      {/if}
    </button>
    <div class="now-info">
      <span class="mono">Fahrt {selTrips ? "–" : Math.min(N, t > 0 ? cur + 1 : 0)} von {N}</span>
      <b>{selTrips ? "Auswahl" : t > 0 ? trips[cur].datum : "Vor der ersten Fahrt"}</b>
    </div>
    <input class="scrub" type="range" min="0" max="1000" value={Math.round((t / N) * 1000)} oninput={scrub} aria-label="Zeit im Jahr" />
    <div class="km"><b>{nf(kmDone)}</b><span class="mono">km</span></div>
  </div>
</main>

<style>
  main {
    position: fixed;
    inset: var(--bar-h) 0 0 0;
  }

  .map {
    position: absolute;
    inset: 0;
  }

  /* Karte im Seitenfarbton: MapLibre-Bedienelemente anpassen */
  main :global(.maplibregl-ctrl-group) {
    background: var(--bg-2);
    border: 1px solid var(--line);
    box-shadow: none;
    border-radius: 0.9rem;
    overflow: hidden;
  }

  main :global(.maplibregl-ctrl-group button) {
    width: 2.5rem;
    height: 2.5rem;
  }

  main :global(.maplibregl-ctrl-group button + button) {
    border-top: 1px solid var(--line);
  }

  main :global(.maplibregl-ctrl-icon) {
    filter: var(--map-icon-filter, none);
  }

  :global(:root[data-theme="dark"]) main :global(.maplibregl-ctrl-icon) {
    filter: invert(1);
  }

  main :global(.maplibregl-ctrl-bottom-right) {
    bottom: 6.5rem;
    right: 0.75rem;
  }

  main :global(.maplibregl-ctrl-attrib) {
    background: var(--bg-2) !important;
    color: var(--ink-2) !important;
    border-radius: 0.6rem;
  }

  main :global(.maplibregl-ctrl-attrib a) {
    color: var(--ink-2) !important;
  }

  /* Fahrtentafel rechts */
  .board {
    position: absolute;
    top: 0.9rem;
    right: 0.9rem;
    bottom: 6.2rem;
    width: min(23rem, calc(100% - 1.8rem));
    display: flex;
    flex-direction: column;
    background: color-mix(in srgb, var(--bg) 88%, transparent);
    backdrop-filter: blur(14px);
    border: 1px solid var(--line);
    border-radius: 1.3rem;
    overflow: hidden;
  }

  .board header {
    padding: 1rem 1.1rem 0.8rem;
    border-bottom: 1px solid var(--line);
  }

  .board h2 {
    font-size: 1.7rem;
    margin-bottom: 0.3rem;
  }

  .board header .mono {
    color: var(--ink-2);
  }

  .board ol {
    list-style: none;
    margin: 0;
    padding: 0.3rem;
    overflow-y: auto;
    flex: 1;
    scrollbar-width: thin;
  }

  .board li button {
    width: 100%;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.1rem 0.7rem;
    text-align: left;
    padding: 0.6rem 0.7rem;
    border-radius: 0.8rem;
    transition: background-color 200ms var(--ease);
  }

  .board li button:hover {
    background: var(--bg-3);
  }

  .board li button.on,
  .board li button.now {
    background: var(--bg-3);
    box-shadow: inset 3px 0 0 var(--red);
  }

  .no {
    grid-row: 1 / 3;
    align-self: center;
    color: var(--ink-2);
  }

  .route {
    font-size: 0.95rem;
    line-height: 1.25;
  }

  .route b {
    font-weight: 600;
  }

  .meta {
    color: var(--ink-2);
    font-size: 0.7rem;
  }

  .board-toggle {
    display: none;
  }

  /* Auswahl-Chip */
  .chip {
    position: absolute;
    z-index: 20;
    top: 1rem;
    left: 50%;
    translate: -50% 0;
    max-width: calc(100% - 2rem);
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.4rem 0.4rem 0.4rem 1rem;
    border-radius: 99px;
    background: var(--ink);
    color: var(--bg);
    font-size: 0.9rem;
    box-shadow: 0 0.6rem 1.6rem -0.6rem rgba(0, 0, 0, 0.6);
  }

  .chip span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chip button {
    flex: none;
    width: 1.9rem;
    height: 1.9rem;
    border-radius: 50%;
    background: var(--red);
    color: #fff;
    font-size: 1.2rem;
    line-height: 1;
  }

  /* Zeitleiste unten */
  .dock {
    position: absolute;
    left: 0.9rem;
    right: 0.9rem;
    bottom: 0.9rem;
    display: grid;
    grid-template-columns: auto auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 1.2rem;
    padding: 0.8rem 1.1rem;
    background: color-mix(in srgb, var(--bg) 90%, transparent);
    backdrop-filter: blur(14px);
    border: 1px solid var(--line);
    border-radius: 1.3rem;
  }

  .dock .play {
    width: 3.2rem;
    height: 3.2rem;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--red);
    color: #fff;
    transition: transform 160ms var(--ease);
  }

  .dock .play:active {
    transform: scale(0.93);
  }

  .now-info {
    display: grid;
    gap: 0.1rem;
    min-width: 11.5rem;
  }

  .now-info .mono {
    color: var(--ink-2);
    font-size: 0.7rem;
  }

  .now-info b {
    font-family: var(--font-display);
    font-size: 1.3rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    white-space: nowrap;
  }

  .scrub {
    width: 100%;
    accent-color: var(--red);
    height: 1.8rem;
  }

  .km {
    display: grid;
    justify-items: end;
    min-width: 5.6rem;
    font-variant-numeric: tabular-nums;
  }

  .km b {
    font-family: var(--font-display);
    font-size: 1.6rem;
    font-weight: 800;
    letter-spacing: -0.03em;
    line-height: 1;
  }

  .km .mono {
    color: var(--ink-2);
    font-size: 0.7rem;
  }

  @media (max-width: 860px) {
    .board {
      top: auto;
      bottom: 6.2rem;
      max-height: 55%;
      transform: translateY(calc(100% + 7rem));
      visibility: hidden;
      transition: transform 400ms var(--ease), visibility 0s linear 400ms;
      right: 0.9rem;
      left: 0.9rem;
      width: auto;
    }

    .board.open {
      transform: none;
      visibility: visible;
      transition: transform 400ms var(--ease);
    }

    .board-toggle {
      display: block;
      position: absolute;
      top: 0.9rem;
      right: 0.9rem;
      padding: 0.55rem 1rem;
      border-radius: 99px;
      background: var(--ink);
      color: var(--bg);
      font-weight: 700;
      font-size: 0.9rem;
    }

    .chip {
      top: 3.6rem;
    }

    .dock {
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 0.8rem;
      padding: 0.7rem 0.9rem;
    }

    .dock .now-info {
      grid-column: 2 / 4;
      min-width: 0;
    }

    .dock .scrub {
      grid-column: 1 / -1;
      grid-row: 2;
    }

    .dock .km {
      display: none;
    }

    main :global(.maplibregl-ctrl-bottom-right) {
      bottom: 9.8rem;
    }

    .board {
      bottom: 9.4rem;
    }
  }
</style>
