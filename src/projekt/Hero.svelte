<script>
  // Erste Szene: links die Überschrift, rechts ein dunkler Hintergrund, auf dem die Routen entstehen
  // und kleine Züge darauf fahren. Keine echte Karte, nur Linien: ruhig und fast ohne Last.
  // Die Karte folgt als eigenes Fenster in der nächsten Szene.
  import { onMount } from "svelte";
  import { scene, prefersReducedMotion } from "../lib/scenes.js";
  import { goSection } from "../lib/router.svelte.js";
  import { jumpToInfo } from "../lib/jump.js";
  import { projectTrips } from "../lib/project.js";
  import { shortName } from "../lib/facts.js";
  import { endpointNames } from "../lib/story.js";
  import Odometer from "./Odometer.svelte";

  let { story } = $props();

  const net = projectTrips(story.trips, 120);
  // Wenige Orte beschriften, damit man sich zurechtfindet
  const places = endpointNames(story.trips).flatMap((name) => {
    const st = story.stations.find((s) => s.name === name);
    if (!st) return [];
    const [x, y] = net.proj(st.coords);
    return [{ name: shortName(name), x, y }];
  });
  const LEFT = (name) => /^(Köln|Lille|Augsburg|Frankfurt)/.test(name);

  const target = $derived(Math.round(story.km));
  let km = $state(0);
  let svgEl;
  let ready = $state(false);

  // Die Züge werden von Hand bewegt: pro Bild wird ein kurzes Stück der Strecke als eigener Linienzug gesetzt.
  // Strichmuster (stroke-dasharray) animiert zu lassen, zerfällt auf manchen Handys in einzelne Splitter.
  onMount(() => {
    const paths = [...svgEl.querySelectorAll(".base")];
    const trains = [...svgEl.querySelectorAll(".train")];
    const lens = paths.map((p) => p.getTotalLength());
    paths.forEach((p, i) => p.style.setProperty("--len", lens[i].toFixed(2)));
    ready = true;
    if (prefersReducedMotion()) return;

    const T0 = performance.now();
    const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * x);
    const SAMPLES = 7;
    const SIZE = 0.04;
    let raf = 0;
    let on = true;
    const frame = (now) => {
      raf = 0;
      if (!on) return;
      trains.forEach((el, i) => {
        const delay = 3000 + i * 140;
        const dur = 5000 + i * 450;
        const t = now - T0 - delay;
        if (t < 0) return;
        const s = ease((t % dur) / dur) * (1 + SIZE);
        const a = Math.max(0, s - SIZE);
        const b = Math.min(1, s);
        if (b - a < 0.002) {
          el.setAttribute("d", "");
          return;
        }
        let d = "";
        for (let k = 0; k <= SAMPLES; k++) {
          const pt = paths[i].getPointAtLength((a + ((b - a) * k) / SAMPLES) * lens[i]);
          d += (k ? "L" : "M") + pt.x.toFixed(1) + " " + pt.y.toFixed(1);
        }
        el.setAttribute("d", d);
      });
      raf = requestAnimationFrame(frame);
    };
    // Nur laufen lassen, solange die Zeichnung im Bild ist
    const io = new IntersectionObserver(([e]) => {
      on = e.isIntersecting;
      if (on && !raf) raf = requestAnimationFrame(frame);
    });
    io.observe(svgEl);
    return () => {
      on = false;
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  });

  // Beim Laden einmal hochrollen: kurz warten, dann bremst der Zähler weich ab
  onMount(() => {
    if (prefersReducedMotion()) {
      km = target;
      return;
    }
    let raf;
    const start = performance.now() + 650;
    const DURATION = 3000;
    const step = (now) => {
      const t = Math.min(1, Math.max(0, (now - start) / DURATION));
      km = target * (1 - Math.pow(1 - t, 5));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  });
</script>

<section class="scene hero t-light" style="--dwell:0.3" use:scene>
  <div class="sc-stage">
    <div class="copy">
      <h1 class="say">
        <span class="w" style="--i:0"><span class="wi">Ich</span></span>
        <span class="w" style="--i:1"><span class="wi">bin</span></span>
        <span class="w num" style="--i:2"><span class="wi"><Odometer value={km} digits={4} label="{target} " /></span></span>
        <span class="w" style="--i:3"><span class="wi">Kilometer</span></span>
        <span class="w" style="--i:4"><span class="wi">Zug</span></span>
        <span class="w" style="--i:5"><span class="wi">gefahren.</span></span>
      </h1>

      <p class="sub intro">
        {story.trips.length} Fahrten, {story.stations.length} Bahnhöfe, ein Jahr. Weiter unten fährt alles noch einmal
        ab, auf der Karte und in Zahlen.
      </p>

      <button class="cue" type="button" onclick={() => goSection("map")}>
        Weiter
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 5v14m0 0-6-6m6 6 6-6" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none" /></svg>
      </button>
      <button class="skip" type="button" onclick={jumpToInfo}>Direkt zu Projekt &amp; Kontakt</button>
    </div>

    <!-- Der Hintergrund: die Routen werden gezeichnet, danach fahren kleine Züge darauf -->
    <div class="backdrop" aria-hidden="true">
      <svg bind:this={svgEl} class:ready viewBox={net.viewBox} preserveAspectRatio="xMidYMid meet">
        {#each net.paths as d, i}
          <path {d} class="base" style="--i:{i}" />
        {/each}
        {#each net.paths as d, i}
          <path class="train" d="" />
        {/each}
        {#each places as pl}
          <g transform="translate({pl.x} {pl.y})" class="place">
            <circle r="4" />
            <text x={LEFT(pl.name) ? -10 : 10} y="4" text-anchor={LEFT(pl.name) ? "end" : "start"}>{pl.name}</text>
          </g>
        {/each}
      </svg>
    </div>
  </div>
</section>

<style>
  .sc-stage {
    grid-template-columns: minmax(0, 1fr);
    align-content: center;
  }

  .copy {
    position: relative;
    z-index: 2;
    display: grid;
    gap: clamp(1.25rem, 3.5vh, 2.25rem);
    justify-items: start;
    /* Der Text endet vor dem dunklen Feld rechts (dessen Breite steht unten bei .backdrop): sonst läuft er beim
       Schmalerziehen in die Animation hinein */
    max-width: min(46rem, calc(100vw - min(54vw, 55rem) - var(--pad) - 1.5rem));
  }

  .hero :global(.say) {
    font-size: clamp(2.4rem, 5.2vw, 5.6rem);
  }

  .num {
    color: var(--red);
  }

  .num :global(.odo) {
    margin-inline: 0.04em;
  }

  /* Erster Auftritt: Wörter steigen nacheinander auf (kein Scrollen nötig) */
  .hero :global(.wi) {
    transform: none;
    animation: rise 1100ms var(--ease) both;
    animation-delay: calc(var(--i) * 85ms + 120ms);
  }

  .intro {
    animation: fade-up 900ms var(--ease) 900ms both;
  }

  @keyframes rise {
    from {
      transform: translateY(112%);
    }
  }

  @keyframes fade-up {
    from {
      opacity: 0;
      transform: translateY(0.875rem);
    }
  }

  .cue {
    display: inline-flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.75rem 1.1rem 0.75rem 1.3rem;
    background: var(--red);
    color: #fff;
    font-weight: 700;
    font-size: 1rem;
    white-space: nowrap;
    border-radius: var(--r);
    animation: fade-up 900ms var(--ease) 1300ms both;
    transition: background-color 140ms var(--ease);
  }

  .skip {
    display: block;
    width: fit-content;
    margin: 1.1rem 0 0 0.1rem;
    font-weight: 700;
    font-size: 0.95rem;
    color: var(--muted);
    text-decoration: underline;
    text-decoration-color: var(--line);
    text-underline-offset: 0.25rem;
    animation: fade-up 900ms var(--ease) 1500ms both;
    transition: color 140ms var(--ease), text-decoration-color 140ms var(--ease);
  }

  .skip:hover {
    color: var(--red);
    text-decoration-color: var(--red);
  }

  .cue:hover {
    background: var(--red-dark);
  }

  .cue:active {
    transform: scale(0.97);
  }

  .cue svg {
    animation: nudge 1.8s var(--ease) infinite;
  }

  @keyframes nudge {
    0%,
    100% {
      transform: translateY(-1px);
    }
    50% {
      transform: translateY(0.1875rem);
    }
  }

  /* ---- Der dunkle Hintergrund rechts ---- */
  .backdrop {
    position: absolute;
    z-index: 1;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(54%, 55rem);
    background: #1a1e26;
    border-radius: var(--r-lg) 0 0 var(--r-lg);
    overflow: hidden;
    animation: slide-in 1200ms var(--ease) 100ms both;
  }

  @keyframes slide-in {
    from {
      transform: translateX(14%);
      opacity: 0;
    }
  }

  .backdrop svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    padding: clamp(1rem, 3vw, 3rem);
  }

  path {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  /* Die Strecken legen sich nacheinander an ... */
  .base {
    stroke: #3a4352;
    stroke-width: 2;
    stroke-dasharray: calc(var(--len, 1) * 1px);
    animation: draw 2600ms var(--ease) both;
    animation-delay: calc(500ms + var(--i) * 140ms);
  }

  @keyframes draw {
    from {
      stroke-dashoffset: calc(var(--len, 1) * 1px);
    }
    to {
      stroke-dashoffset: 0;
    }
  }

  /* ... danach fährt auf jeder ein kurzer roter Zug von Anfang bis Ende, immer wieder */
  /* ... danach fährt auf jeder ein kurzer roter Zug von Anfang bis Ende, immer wieder (Bewegung in Script) */
  .train {
    stroke: var(--red);
    stroke-width: 3.4;
  }

  .place circle {
    fill: #d7dce3;
  }

  .place text {
    font-family: var(--sans);
    font-weight: 700;
    font-size: 14px;
    fill: #8c96a6;
  }

  @media (max-width: 860px) {
    .sc-stage {
      grid-template-rows: auto minmax(0, 1fr);
      align-content: start;
      row-gap: 1.25rem;
    }

    .copy {
      max-width: none;
    }

    .hero :global(.say) {
      font-size: clamp(2.2rem, 9vw, 3.4rem);
    }

    .cue {
      display: none;
    }

    .skip {
      margin-left: 0;
    }

    /* Auf dem Handy liegt der Hintergrund unter der Überschrift */
    .backdrop {
      position: relative;
      width: auto;
      border-radius: var(--r-lg);
      min-height: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .cue svg {
      animation: none;
    }

  }
</style>
