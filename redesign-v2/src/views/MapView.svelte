<script>
  // Die Karte: groß, hell, ohne Rahmen. Die Fahrten zeichnen sich über die Zeit ein, Bahnhöfe erscheinen erst, wenn der Zug
  // sie erreicht. 3D-Modus: Karte kippt, Bahnhöfe wachsen als Türme (Höhe = Besuche). Klick auf einen Bahnhof filtert.
  import { onMount } from "svelte";
  import * as maplibregl from "maplibre-gl";
  import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
  import { gsap, reduce } from "../lib/motion.js";
  import { nf, hm } from "../lib/format.js";

  let { data } = $props();
  const { trips, stations, stats } = data;
  const N = trips.length;
  const STYLE = "https://tiles.openfreemap.org/styles/positron";

  let el, map, ready = false, tween;
  let t = $state(0);
  let playing = $state(false);
  let speed = $state(1);
  let is3D = $state(false);
  let follow = $state(false);
  let drawer = $state(false);
  let selTrips = $state.raw(null);
  let selLabel = $state("");

  const cur = $derived(Math.min(N - 1, Math.floor(t)));
  const frac = (i) => Math.max(0, Math.min(1, t - i));
  const kmDone = $derived(selTrips ? [...selTrips].reduce((a, i) => a + trips[i].km, 0) : trips.reduce((a, tr, i) => a + tr.km * frac(i), 0));

  // ---- Wann wird ein Bahnhof erreicht? (Fahrt-Index + Anteil der Strecke) ----
  const cum = trips.map((tr) => {
    const c = [0];
    for (let i = 1; i < tr.path.length; i++) {
      const [x0, y0] = tr.path[i - 1], [x1, y1] = tr.path[i];
      c.push(c[i - 1] + Math.hypot((x1 - x0) * 0.64, y1 - y0));
    }
    return c;
  });
  const when = new Map();
  stations.forEach((s) => {
    let best = Infinity;
    trips.forEach((tr, i) => {
      if (!tr.halte.includes(s.key)) return;
      let k = 0, bd = Infinity;
      tr.path.forEach((p, j) => {
        const d = Math.hypot((p[0] - s.coords[0]) * 0.64, p[1] - s.coords[1]);
        if (d < bd) { bd = d; k = j; }
      });
      const f = cum[i][cum[i].length - 1] ? cum[i][k] / cum[i][cum[i].length - 1] : 0;
      best = Math.min(best, i + f);
    });
    when.set(s.key, best);
  });

  function pointAt(i, f) {
    const c = cum[i];
    const target = c[c.length - 1] * f;
    let k = 1;
    while (k < c.length - 1 && c[k] < target) k++;
    const a = trips[i].path[k - 1], b = trips[i].path[k];
    const u = c[k] === c[k - 1] ? 0 : (target - c[k - 1]) / (c[k] - c[k - 1]);
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  }

  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  // Linie bis f gefärbt, danach durchsichtig: so zeichnet sich jede Fahrt Stück für Stück
  function grad(f, c, a) {
    const on = rgba(c, a), off = rgba(c, 0);
    if (f <= 0.0005 || a <= 0) return ["interpolate", ["linear"], ["line-progress"], 0, off, 1, off];
    if (f >= 0.9995) return ["interpolate", ["linear"], ["line-progress"], 0, on, 1, on];
    return ["interpolate", ["linear"], ["line-progress"], 0, on, f, on, Math.min(0.9999, f + 0.0004), off, 1, off];
  }

  const bounds = (idx) => {
    const b = new maplibregl.LngLatBounds();
    for (const i of idx) for (const p of trips[i].path) b.extend(p);
    return b;
  };
  function pad() {
    const wide = innerWidth > 860;
    return wide ? { top: 90, bottom: 120, left: 60, right: drawer ? 380 : 60 } : { top: 90, bottom: 190, left: 24, right: 24 };
  }
  const fit = (idx, duration = 1000) => map?.fitBounds(bounds(idx), { padding: pad(), duration, maxZoom: 9.5, pitch: is3D ? 55 : 0, bearing: is3D ? -16 : 0 });
  const fitAll = (d = 1000) => fit(trips.map((_, i) => i), d);

  // Kreis als Polygon für die Türme
  const ring = (c, r = 0.034, n = 16) => {
    const pts = [];
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * Math.PI * 2;
      pts.push([c[0] + (Math.cos(a) * r) / 0.64, c[1] + Math.sin(a) * r]);
    }
    return pts;
  };

  function build() {
    map.addSource("trips", {
      type: "geojson",
      lineMetrics: true,
      data: { type: "FeatureCollection", features: trips.map((tr, i) => ({ type: "Feature", id: i, properties: { i }, geometry: { type: "LineString", coordinates: tr.path } })) },
    });
    // Blasse Gesamtansicht, sobald etwas ausgewählt ist
    map.addLayer({ id: "ghost", type: "line", source: "trips", layout: { visibility: "none", "line-cap": "round" }, paint: { "line-color": "#6b7280", "line-opacity": 0.35, "line-width": 2 } });
    trips.forEach((_, i) => {
      map.addLayer({
        id: `c${i}`, type: "line", source: "trips", filter: ["==", ["id"], i],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-gradient": grad(0, [255, 255, 255], 0), "line-width": ["interpolate", ["linear"], ["zoom"], 4, 5, 9, 9] },
      });
      map.addLayer({
        id: `l${i}`, type: "line", source: "trips", filter: ["==", ["id"], i],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-gradient": grad(0, [236, 0, 22], 0), "line-width": ["interpolate", ["linear"], ["zoom"], 4, 2.4, 9, 5] },
      });
    });
    const feats = stations.map((s) => ({ type: "Feature", properties: { key: s.key, name: s.name, visits: s.visits }, geometry: { type: "Point", coordinates: s.coords } }));
    map.addSource("stations", { type: "geojson", data: { type: "FeatureCollection", features: feats } });
    map.addSource("towers", {
      type: "geojson",
      data: { type: "FeatureCollection", features: stations.map((s) => ({ type: "Feature", properties: { key: s.key, visits: s.visits }, geometry: { type: "Polygon", coordinates: [ring(s.coords)] } })) },
    });
    const none = ["==", 1, 0];
    map.addLayer({
      id: "tower", type: "fill-extrusion", source: "towers", filter: none, layout: { visibility: "none" },
      paint: {
        "fill-extrusion-height": ["*", ["get", "visits"], 7000],
        "fill-extrusion-color": ["interpolate", ["linear"], ["get", "visits"], 1, "#f2b705", 14, "#b8000f"],
        "fill-extrusion-opacity": 0.92,
      },
    });
    map.addLayer({
      id: "st-dot", type: "circle", source: "stations", filter: none,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["get", "visits"], 1, 4.5, 14, 9],
        "circle-color": "#ffffff",
        "circle-stroke-color": "#1b2620",
        "circle-stroke-width": 2.2,
      },
    });
    map.addLayer({ id: "st-hit", type: "circle", source: "stations", filter: none, paint: { "circle-radius": 16, "circle-opacity": 0 } });
    map.addLayer({
      id: "st-label", type: "symbol", source: "stations", filter: none,
      layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Bold"], "text-size": 12.5, "text-anchor": "top", "text-offset": [0, 0.9], "text-padding": 5 },
      paint: { "text-color": "#1b2620", "text-halo-color": "#ffffff", "text-halo-width": 2 },
    });
    map.addSource("head", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: "head", type: "circle", source: "head", paint: { "circle-radius": 8, "circle-color": "#ffffff", "circle-stroke-color": "#ec0016", "circle-stroke-width": 4 } });
    last = [];
    shownSig = "";
    apply();
  }

  let last = [];
  let shownSig = "";
  let shownSet = new Set();

  function revealedKeys() {
    const keys = new Set();
    if (selTrips) {
      selTrips.forEach((i) => trips[i].halte.forEach((h) => keys.add(h)));
      return keys;
    }
    if (t > 0) stations.forEach((s) => when.get(s.key) <= t + 0.0001 && keys.add(s.key));
    return keys;
  }

  function apply() {
    if (!map || !ready) return;
    const sel = selTrips;
    trips.forEach((_, i) => {
      const f = sel ? (sel.has(i) ? 1 : 0) : frac(i);
      const key = `${f.toFixed(4)}|${sel ? 1 : 0}`;
      if (last[i] === key) return;
      last[i] = key;
      map.setPaintProperty(`c${i}`, "line-gradient", grad(f, [255, 255, 255], 0.95));
      map.setPaintProperty(`l${i}`, "line-gradient", grad(f, [236, 0, 22], 1));
    });
    // Bahnhöfe nur anzeigen, wenn sie erreicht sind
    const keys = revealedKeys();
    const sig = [...keys].sort().join("|");
    if (sig !== shownSig) {
      const added = [...keys].filter((k) => !shownSet.has(k));
      shownSig = sig;
      const f = keys.size ? ["in", ["get", "key"], ["literal", [...keys]]] : ["==", 1, 0];
      map.setFilter("st-dot", f);
      map.setFilter("st-hit", f);
      map.setFilter("tower", f);
      map.setFilter("st-label", keys.size ? ["all", f, [">", ["get", "visits"], 1]] : f);
      if (playing && !sel && added.length && added.length <= 2 && !reduce) added.forEach(popLabel);
      shownSet = keys;
    }
    map.setLayoutProperty("ghost", "visibility", sel ? "visible" : "none");
    const hs = map.getSource("head");
    if (hs) {
      const f = frac(cur);
      hs.setData({ type: "FeatureCollection", features: !sel && playing && f > 0 && f < 1 ? [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: pointAt(cur, f) } }] : [] });
    }
  }

  // Kleines Namensschild, wenn der Zug einen Bahnhof erreicht
  function popLabel(key) {
    const s = stations.find((x) => x.key === key);
    if (!s) return;
    const div = document.createElement("div");
    div.className = "popchip";
    div.textContent = s.name;
    const m = new maplibregl.Marker({ element: div, anchor: "bottom", offset: [0, -14] }).setLngLat(s.coords).addTo(map);
    setTimeout(() => m.remove(), 2400);
  }

  $effect(() => {
    t; selTrips; playing;
    apply();
  });

  // ---- Zeitleiste ----
  function play() {
    if (selTrips) clearSel(false);
    if (t >= N - 0.001) t = 0;
    tween?.kill();
    const o = { v: t };
    playing = true;
    tween = gsap.to(o, {
      v: N,
      duration: Math.max(1, ((N - t) * 2.1) / speed),
      ease: "none",
      onUpdate: () => (t = o.v),
      onComplete: () => {
        playing = false;
        follow = false;
        fitAll();
      },
    });
  }
  const pause = () => { tween?.kill(); playing = false; };
  const toggle = () => (playing ? pause() : play());
  function scrub(e) {
    pause();
    if (selTrips) clearSel(false);
    t = (+e.currentTarget.value / 1000) * N;
  }
  function setSpeed() {
    speed = speed === 1 ? 2 : speed === 2 ? 4 : 1;
    if (playing) play();
  }

  // ---- 3D und Kamera ----
  function toggle3D() {
    is3D = !is3D;
    map.setLayoutProperty("tower", "visibility", is3D ? "visible" : "none");
    map.easeTo({ pitch: is3D ? 58 : 0, bearing: is3D ? -18 : 0, duration: 1400, essential: true });
  }
  let lastFollow = 0;
  function followTick() {
    if (!follow || !playing || selTrips) return;
    const now = performance.now();
    if (now - lastFollow < 700) return;
    lastFollow = now;
    const f = frac(cur);
    if (f <= 0 || f >= 1) return;
    map.easeTo({ center: pointAt(cur, f), zoom: 7.4, duration: 800, easing: (x) => x, essential: true });
  }
  $effect(() => {
    t;
    followTick();
  });
  $effect(() => {
    if (map && ready && !follow && !selTrips && lastFollow) {
      lastFollow = 0;
      fitAll();
    }
  });

  // ---- Auswahl ----
  function clearSel(refit = true) {
    selTrips = null;
    selLabel = "";
    if (refit) fitAll();
  }
  function selectStation(key) {
    const st = stations.find((s) => s.key === key);
    const idx = trips.map((tr, i) => (tr.halte.includes(key) ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) return;
    pause();
    follow = false;
    selTrips = new Set(idx);
    selLabel = `${st.name} · ${idx.length}×`;
    fit(idx, 1100);
  }
  function selectTrip(i) {
    pause();
    follow = false;
    selTrips = new Set([i]);
    selLabel = `${trips[i].von} → ${trips[i].nach}`;
    fit([i], 1100);
    drawer = false;
  }

  onMount(() => {
    maplibregl.setWorkerUrl(workerUrl);
    map = new maplibregl.Map({
      container: el,
      style: STYLE,
      center: [10.4, 50.2],
      zoom: 5.2,
      attributionControl: { compact: true },
      dragRotate: true,
      pitchWithRotate: true,
      maxPitch: 70,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.on("style.load", () => {
      ready = true;
      build();
    });
    map.once("load", () => {
      fitAll(0);
      setTimeout(() => !selTrips && t === 0 && play(), 1500);
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
</script>

<main>
  <div class="map" bind:this={el}></div>

  {#if selLabel}
    <div class="chip" role="status">
      <span>Nur: <b>{selLabel}</b></span>
      <button type="button" onclick={() => clearSel()} aria-label="Auswahl aufheben">×</button>
    </div>
  {:else if t > 0}
    <div class="now" aria-live="off">
      <span class="mono">Fahrt {Math.min(N, cur + 1)} von {N}</span>
      <b>{trips[cur].von} <i>→</i> {trips[cur].nach}</b>
    </div>
  {/if}

  <!-- Schwebende Mini-Steuerung -->
  <div class="dock" role="group" aria-label="Wiedergabe">
    <button type="button" class="play" onclick={toggle} aria-label={playing ? "Pause" : "Abspielen"}>
      {#if playing}
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" /></svg>
      {:else}
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
      {/if}
    </button>
    <div class="mid">
      <span class="mono date">{selTrips ? "Auswahl" : t > 0 ? trips[cur].datum : "Jahresbeginn"} · {nf(kmDone)} km</span>
      <input class="scrub" type="range" min="0" max="1000" value={Math.round((t / N) * 1000)} oninput={scrub} aria-label="Zeit im Jahr" />
    </div>
    <button type="button" class="pill" onclick={setSpeed} aria-label="Tempo">{speed}×</button>
    <button type="button" class="pill" class:on={is3D} onclick={toggle3D} aria-pressed={is3D}>3D</button>
    <button type="button" class="pill" class:on={follow} onclick={() => (follow = !follow)} aria-pressed={follow}>Folgen</button>
    <button type="button" class="pill" class:on={drawer} onclick={() => (drawer = !drawer)} aria-expanded={drawer}>Fahrten</button>
  </div>

  <aside class="drawer" class:open={drawer} aria-label="Fahrten">
    <header><h2>Fahrten</h2><span class="mono">{N} · {nf(stats.km)} km</span></header>
    <ol>
      {#each trips as tr, i}
        <li>
          <button type="button" class:on={selTrips?.has(i)} class:now={!selTrips && i === cur && t > 0} onclick={() => selectTrip(i)} tabindex={drawer ? 0 : -1}>
            <span class="no mono">{String(tr.no).padStart(2, "0")}</span>
            <span class="r"><b>{tr.von}</b> → <b>{tr.nach}</b></span>
            <span class="m mono">{tr.datum.slice(0, 5)} · {nf(tr.km)} km · {hm(tr.minutes)}</span>
          </button>
        </li>
      {/each}
    </ol>
  </aside>
</main>

<style>
  main {
    position: fixed;
    inset: 0;
    z-index: 1;
  }

  .map {
    position: absolute;
    inset: 0;
    background: #e8ebe7;
  }

  :global(.popchip) {
    padding: 0.35rem 0.8rem;
    border-radius: 99px;
    background: #1b2620;
    color: #f3ead7;
    font: 700 0.85rem var(--font-text);
    white-space: nowrap;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
    animation: pop 2.4s var(--ease) both;
    pointer-events: none;
  }

  @keyframes pop {
    0% {
      opacity: 0;
      transform: translateY(10px) scale(0.8);
    }
    12% {
      opacity: 1;
      transform: none;
    }
    75% {
      opacity: 1;
      transform: translateY(-4px);
    }
    100% {
      opacity: 0;
      transform: translateY(-16px);
    }
  }

  main :global(.maplibregl-ctrl-group) {
    background: color-mix(in srgb, var(--bg) 88%, transparent);
    border: 1px solid var(--line);
    box-shadow: none;
    border-radius: 0.9rem;
    overflow: hidden;
  }

  main :global(.maplibregl-ctrl-group button) {
    width: 2.4rem;
    height: 2.4rem;
  }

  main :global(.maplibregl-ctrl-group button + button) {
    border-top: 1px solid var(--line);
  }

  main :global(.maplibregl-ctrl-icon) {
    filter: invert(1);
  }

  main :global(.maplibregl-ctrl-bottom-right) {
    bottom: 5.4rem;
  }

  main :global(.maplibregl-ctrl-attrib) {
    background: rgba(255, 255, 255, 0.85) !important;
  }

  /* Titel der laufenden Fahrt */
  .now,
  .chip {
    position: absolute;
    z-index: 10;
    top: 5.2rem;
    left: 50%;
    translate: -50% 0;
    max-width: calc(100% - 2rem);
  }

  .now {
    display: grid;
    justify-items: center;
    gap: 0.1rem;
    text-align: center;
    padding: 0.5rem 1.2rem;
    border-radius: 1.2rem;
    background: color-mix(in srgb, var(--bg) 82%, transparent);
    backdrop-filter: blur(12px);
    box-shadow: 0 0 0 1px var(--line);
    pointer-events: none;
  }

  .now .mono {
    color: var(--ink-2);
    font-size: 0.68rem;
  }

  .now b {
    font-family: var(--font-display);
    font-weight: var(--fw);
    font-size: 1.15rem;
    letter-spacing: var(--ls);
  }

  .now i {
    color: var(--red-ink);
    font-style: normal;
  }

  .chip {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.4rem 0.4rem 0.4rem 1rem;
    border-radius: 99px;
    background: var(--ink);
    color: var(--bg);
    font-size: 0.9rem;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.4);
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

  /* Dock: klein, mittig unten */
  .dock {
    position: absolute;
    z-index: 10;
    left: 50%;
    bottom: 1rem;
    translate: -50% 0;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: min(46rem, calc(100% - 1.4rem));
    padding: 0.5rem 0.6rem;
    border-radius: 99px;
    background: color-mix(in srgb, var(--bg) 88%, transparent);
    backdrop-filter: blur(14px);
    box-shadow: 0 0 0 1px var(--line), 0 14px 34px rgba(0, 0, 0, 0.35);
  }

  .play {
    flex: none;
    width: 2.8rem;
    height: 2.8rem;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--red);
    color: #fff;
    transition: transform 160ms var(--ease);
  }

  .play:active {
    transform: scale(0.92);
  }

  .mid {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 0;
  }

  .date {
    color: var(--ink-2);
    font-size: 0.66rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .scrub {
    width: 100%;
    height: 1.4rem;
    accent-color: var(--red);
  }

  .pill {
    flex: none;
    padding: 0.4rem 0.8rem;
    border-radius: 99px;
    font-weight: 700;
    font-size: 0.82rem;
    color: var(--ink-2);
    box-shadow: inset 0 0 0 1px var(--line);
    transition: background-color 200ms var(--ease), color 200ms var(--ease);
  }

  .pill:hover {
    color: var(--ink);
  }

  .pill.on {
    background: var(--ink);
    color: var(--bg);
    box-shadow: none;
  }

  /* Fahrtenliste: fährt von rechts herein */
  .drawer {
    position: absolute;
    z-index: 9;
    top: 5rem;
    right: 0.8rem;
    bottom: 5.4rem;
    width: min(22rem, calc(100% - 1.6rem));
    display: flex;
    flex-direction: column;
    background: color-mix(in srgb, var(--bg) 92%, transparent);
    backdrop-filter: blur(14px);
    border-radius: 1.4rem;
    box-shadow: 0 0 0 1px var(--line), 0 20px 50px rgba(0, 0, 0, 0.4);
    overflow: hidden;
    transform: translateX(calc(100% + 1.5rem));
    visibility: hidden;
    transition: transform 500ms var(--ease), visibility 0s linear 500ms;
  }

  .drawer.open {
    transform: none;
    visibility: visible;
    transition: transform 500ms var(--ease);
  }

  .drawer header {
    padding: 1rem 1.1rem 0.7rem;
    border-bottom: 1px solid var(--line);
  }

  .drawer h2 {
    font-size: 1.6rem;
    margin-bottom: 0.2rem;
  }

  .drawer header .mono {
    color: var(--ink-2);
  }

  .drawer ol {
    list-style: none;
    margin: 0;
    padding: 0.3rem;
    overflow-y: auto;
    flex: 1;
    scrollbar-width: thin;
  }

  .drawer li button {
    width: 100%;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.1rem 0.7rem;
    text-align: left;
    padding: 0.6rem 0.7rem;
    border-radius: 0.8rem;
    transition: background-color 200ms var(--ease);
  }

  .drawer li button:hover {
    background: var(--bg-3);
  }

  .drawer li button.on,
  .drawer li button.now {
    background: var(--bg-3);
    box-shadow: inset 3px 0 0 var(--red);
  }

  .no {
    grid-row: 1 / 3;
    align-self: center;
    color: var(--ink-2);
  }

  .r {
    font-size: 0.93rem;
    line-height: 1.25;
  }

  .r b {
    font-weight: 600;
  }

  .m {
    color: var(--ink-2);
    font-size: 0.68rem;
  }

  @media (max-width: 860px) {
    .dock {
      flex-wrap: wrap;
      border-radius: 1.6rem;
      bottom: 0.7rem;
      row-gap: 0.4rem;
    }

    .mid {
      order: 5;
      flex-basis: 100%;
    }

    .pill {
      padding: 0.4rem 0.65rem;
    }

    .play {
      margin-right: auto;
    }

    .drawer {
      left: 0.8rem;
      bottom: 8.4rem;
      top: 5rem;
    }

    main :global(.maplibregl-ctrl-bottom-right) {
      bottom: 9rem;
    }

    .now,
    .chip {
      top: 4.6rem;
    }
  }
</style>
