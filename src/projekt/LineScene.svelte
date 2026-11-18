<script>
  import { scene } from "../lib/scenes.js";
  import { shortName } from "../lib/facts.js";
  import { endpointNames } from "../lib/story.js";
  import { measure, dashOff, dashVis } from "../lib/dash.js";
  import Odometer from "./Odometer.svelte";

  let { story } = $props();

  const trips = story.trips;
  const N = trips.length;
  const clamp = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

  // Einfache Projektion: Längengrade um cos(Breite) gestaucht, Norden oben
  const pts = trips.flatMap((t) => t.path);
  const lons = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const SCALE = 100;
  const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const proj = ([lon, lat]) => [(lon - minLon) * kx * SCALE, (maxLat - lat) * SCALE];
  const W = (maxLon - minLon) * kx * SCALE;
  const H = (maxLat - minLat) * SCALE;
  const PAD = 28;
  const viewBox = `${-PAD} ${-PAD} ${W + PAD * 2} ${H + PAD * 2}`;

  const d = trips.map(
    (t) =>
      "M" +
      t.path
        .map((pt) => proj(pt).map((v) => v.toFixed(1)).join(" "))
        .join("L")
  );

  // Orte, an denen eine Fahrt beginnt oder endet, mit dem Moment ihres ersten Auftauchens
  const labels = endpointNames(trips).map((name) => {
    const st = story.stations.find((s) => s.name === name);
    const first = trips.findIndex((t) => t.von === name || t.nach === name);
    const [x, y] = proj(st ? st.coords : trips[first].path[0]);
    return { name: shortName(name), x, y, first };
  });
  // Beschriftung links vom Punkt, wo rechts nichts mehr Platz hätte oder Nachbarn im Weg wären
  const LEFT = (name) => /^(Köln|Lille|Augsburg|Frankfurt|Berlin)/.test(name);

  let p = $state(0);
  let els = $state([]);

  // Anfang und Ende der Szene bleiben ruhig, dazwischen läuft das Jahr
  const t = $derived(clamp((p - 0.03) / 0.92) * N);
  const cur = $derived(Math.min(N - 1, Math.floor(t)));
  const frac = (j) => clamp(t - j);
  const kmTotal = trips.reduce((s, tr) => s + tr.km, 0);
  // Am Ende genau auf die ganze Zahl, sonst bleibt das letzte Rad zwischen zwei Ziffern stehen
  const km = $derived(t >= N ? Math.round(kmTotal) : trips.reduce((s, tr, j) => s + tr.km * frac(j), 0));
  const trip = $derived(trips[cur]);

  // Spitze der gerade gezeichneten Fahrt
  const head = $derived.by(() => {
    const el = els[cur];
    if (!el || t <= 0) return null;
    const f = frac(cur);
    if (f <= 0 || f >= 1) return null;
    const pt = el.getPointAtLength(f * el.getTotalLength());
    return { x: pt.x, y: pt.y };
  });
</script>

<section class="scene t-light" style="--dwell:2.2" data-ms="15000" use:scene={(v) => (p = v)}>
  <div class="sc-stage">
    <div class="copy">
      <h2 class="say">
        <span class="w" style="--i:0"><span class="wi">Ein</span></span>
        <span class="w" style="--i:1"><span class="wi">Jahr,</span></span>
        <span class="w" style="--i:2"><span class="wi">eine</span></span>
        <span class="w" style="--i:3"><span class="wi">Linie.</span></span>
      </h2>

      <div class="counter" aria-live="off">
        <span class="odo-wrap"><Odometer value={km} digits={4} label="{Math.round(km)} " /></span>
        <span class="unit">km</span>
      </div>

      <div class="caption" class:on={t > 0}>
        <b>{shortName(trip.von)} – {shortName(trip.nach)}</b>
        <span>Fahrt {Math.min(N, Math.floor(t) + 1)} von {N} · {trip.datum}</span>
      </div>
    </div>

    <svg class="map" {viewBox} role="img" aria-label="Alle Fahrten des Jahres als Linien auf einer Karte" preserveAspectRatio="xMidYMid meet">
      <!-- noch nicht gefahrene Strecken: nur als Schatten -->
      {#each d as dd}
        <path d={dd} class="ghost" />
      {/each}
      <!-- gefahrene Strecken: überlagern sich, je öfter, desto dunkler -->
      {#each d as dd, j}
        <path
          bind:this={els[j]}
          use:measure
          d={dd}
          class="trip"
          class:now={j === cur && frac(j) > 0 && frac(j) < 1}
          style:stroke-dashoffset={dashOff(frac(j))}
          style:stroke-opacity={dashVis(frac(j))}
        />
      {/each}

      {#each labels as l}
        <g class="place" class:seen={t > l.first} transform="translate({l.x} {l.y})">
          <circle r="5" />
          <text x={LEFT(l.name) ? -11 : 11} y="5" text-anchor={LEFT(l.name) ? "end" : "start"}>{l.name}</text>
        </g>
      {/each}

      {#if head}
        <circle class="head" cx={head.x} cy={head.y} r="6.5" />
      {/if}
    </svg>
  </div>
</section>

<style>
  .sc-stage {
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    align-content: stretch;
    align-items: center;
    column-gap: clamp(1rem, 4vw, 4rem);
  }

  .copy {
    display: grid;
    gap: clamp(1rem, 3vh, 2rem);
    align-content: center;
  }

  .counter {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    font-family: var(--display);
    font-weight: 800;
    letter-spacing: -0.035em;
    color: var(--red);
    font-size: clamp(3.2rem, 8.4vw, 7.5rem);
    line-height: 1;
  }

  .odo-wrap {
    display: inline-block;
    height: 1em;
  }

  .unit {
    font-size: 0.4em;
    color: var(--text);
    letter-spacing: -0.02em;
  }

  .caption {
    display: grid;
    gap: 0.15rem;
    opacity: 0;
    transition: opacity 300ms var(--ease);
    min-height: 3.2rem;
  }

  .caption.on {
    opacity: 1;
  }

  .caption b {
    font-size: clamp(1.2rem, 2vw, 1.7rem);
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  .caption span {
    color: var(--muted);
  }

  .map {
    width: 100%;
    height: 100%;
    max-height: calc(100svh - var(--bar-h) - 3rem);
    overflow: visible;
  }

  path {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .ghost {
    stroke: var(--panel-2);
    stroke-width: 2.4;
  }

  .trip {
    stroke-dasharray: calc(var(--len, 99999) * 1px);
    stroke: var(--red);
    stroke-opacity: 0.3;
    stroke-width: 2.4;
  }

  .trip.now {
    stroke-opacity: 1;
    stroke-width: 3.6;
  }

  .place {
    opacity: 0;
    transition: opacity 350ms var(--ease);
  }

  .place.seen {
    opacity: 1;
  }

  .place circle {
    fill: var(--text);
  }

  .place text {
    font-family: var(--sans);
    font-weight: 700;
    font-size: 15px;
    fill: var(--text);
    paint-order: stroke;
    stroke: #fff;
    stroke-width: 4px;
    stroke-linejoin: round;
  }

  .head {
    fill: var(--red);
    stroke: #fff;
    stroke-width: 3;
  }


  @media (max-width: 860px) {
    .sc-stage {
      grid-template-columns: 1fr;
      grid-template-rows: auto minmax(0, 1fr);
      align-content: start;
      row-gap: 0.5rem;
    }

    .copy {
      gap: 0.6rem;
    }

    .map {
      max-height: none;
    }

    .caption {
      min-height: 4.6rem;
    }
  }
</style>
