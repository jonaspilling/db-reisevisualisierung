<script>
  // Die Geschichte: Startbild, ein Jahr als eine Linie (angeheftet, vom Scrollen gesteuert), Zahlen,
  // längste Fahrt, Bahnhöfe, Sprung zur Karte. Alles aus deinen Daten (routes.geojson, stations.json).
  import { onMount } from "svelte";
  import { gsap } from "gsap";
  import { ScrollTrigger } from "gsap/ScrollTrigger";
  import { nf, hm } from "../lib/format.js";
  import { projector, toPath } from "../lib/project.js";

  gsap.registerPlugin(ScrollTrigger);

  let { data } = $props();
  const { trips, stations, stats } = data;

  const allPts = trips.flatMap((t) => t.path);
  const P = projector(allPts, 34);
  const paths = trips.map((t) => toPath(t.path, P.proj));
  const stationDots = stations.map((s) => ({ ...s, xy: P.proj(s.coords) }));
  const byKey = new Map(stationDots.map((s) => [s.key, s]));

  // längste Fahrt in eigener Zeichnung
  const L = stats.longest;
  const PL = projector(L.path, 40);
  const longestPath = toPath(L.path, PL.proj);
  const longestStops = L.halte.map((h) => byKey.get(h)).filter(Boolean).map((s) => ({ name: s.name, xy: PL.proj(s.coords) }));

  const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- Zustand ----
  let root;
  let heroSvg, lineSvg, longSvg;
  let heroLens = $state([]);
  let lineLens = $state([]);
  let longLen = $state(1);
  let heroPaths = [];
  let linePaths = [];
  let longEl;
  let km = $state(reduce ? stats.km : 0);
  let p = $state(reduce ? 1 : 0); // Fortschritt der angehefteten Szene 0..1
  const N = trips.length;
  const t = $derived(Math.min(N, p * (N + 0.4)));
  const cur = $derived(Math.min(N - 1, Math.floor(t)));
  const frac = (i) => Math.max(0, Math.min(1, t - i));
  const kmDrawn = $derived(trips.reduce((a, tr, i) => a + tr.km * frac(i), 0));

  const tiles = [
    { label: "Fahrten", value: stats.trips, dec: 0, unit: "" },
    { label: "Kilometer", value: stats.km, dec: 0, unit: "km" },
    { label: "Stunden im Zug", value: stats.hours, dec: 0, unit: "h" },
    { label: "Bahnhöfe", value: stats.stations, dec: 0, unit: "" },
    { label: "Durchschnitt", value: stats.kmh, dec: 0, unit: "km/h" },
    { label: "Längste Fahrt", value: stats.longest.km, dec: 0, unit: "km" },
  ];
  let tileVals = $state(tiles.map((x) => (reduce ? x.value : 0)));

  const marquee = [...stations].sort((a, b) => b.visits - a.visits);

  onMount(() => {
    // Längen messen: die Linien zeichnen sich in Pixeln (nicht über pathLength, das manche Handys falsch umsetzen)
    heroLens = heroPaths.map((e) => e.getTotalLength());
    lineLens = linePaths.map((e) => e.getTotalLength());
    longLen = longEl.getTotalLength();

    const ctx = gsap.context(() => {
      // -------- Startbild --------
      if (!reduce) {
        gsap.from(".h-word", { yPercent: 115, duration: 1.1, ease: "power4.out", stagger: 0.07, delay: 0.15 });
        gsap.from(".h-fade", { opacity: 0, y: 18, duration: 0.9, ease: "power3.out", stagger: 0.12, delay: 0.9 });
        const o = { v: 0 };
        gsap.to(o, { v: stats.km, duration: 2.6, ease: "power3.out", delay: 0.5, onUpdate: () => (km = o.v) });
        gsap.fromTo(
          ".net",
          { strokeDashoffset: (i) => heroLens[i] },
          { strokeDashoffset: 0, duration: 2.4, ease: "power2.inOut", stagger: 0.12, delay: 0.3 }
        );
      }

      // Zug: ein kurzes helles Stück läuft auf jeder Strecke (bewegt von Hand, Länge in Zeichnungseinheiten)
      let trainRaf = 0;
      const trains = [...root.querySelectorAll(".train")];
      const SAMPLES = 5;
      const T0 = performance.now();
      const frame = (now) => {
        trainRaf = requestAnimationFrame(frame);
        trains.forEach((el, i) => {
          const len = heroLens[i];
          if (!len) return;
          const size = 22 / len;
          const run = len * 15;
          const dur = run + 1500 + i * 240;
          const tt = now - T0 - 2800 - i * 260;
          if (tt < 0) return;
          const u = (tt % dur) / run;
          if (u > 1) return el.setAttribute("d", "");
          const s = u * (1 + size);
          const a = Math.max(0, s - size);
          const b = Math.min(1, s);
          if (b - a < 0.002) return el.setAttribute("d", "");
          let d = "";
          for (let k = 0; k <= SAMPLES; k++) {
            const pt = heroPaths[i].getPointAtLength((a + ((b - a) * k) / SAMPLES) * len);
            d += (k ? "L" : "M") + pt.x.toFixed(1) + " " + pt.y.toFixed(1);
          }
          el.setAttribute("d", d);
        });
      };
      if (!reduce) {
        trainRaf = requestAnimationFrame(frame);
        ScrollTrigger.create({
          trigger: ".hero",
          start: "top top",
          end: "bottom top",
          onToggle: (self) => {
            cancelAnimationFrame(trainRaf);
            if (self.isActive) trainRaf = requestAnimationFrame(frame);
          },
        });
      }

      // -------- Ein Jahr, eine Linie (angeheftet) --------
      if (!reduce) {
        ScrollTrigger.create({
          trigger: ".year",
          start: "top top",
          end: "+=320%",
          pin: true,
          scrub: 0.6,
          onUpdate: (self) => (p = self.progress),
        });
      }

      // -------- Zahlen --------
      if (!reduce) {
        ScrollTrigger.create({
          trigger: ".numbers",
          start: "top 70%",
          once: true,
          onEnter: () => {
            tiles.forEach((tile, i) => {
              const o = { v: 0 };
              gsap.to(o, { v: tile.value, duration: 1.8, ease: "power3.out", delay: i * 0.1, onUpdate: () => (tileVals[i] = o.v) });
            });
          },
        });
        gsap.from(".tile", {
          scrollTrigger: { trigger: ".numbers", start: "top 75%", once: true },
          y: 50,
          opacity: 0,
          duration: 0.9,
          ease: "power3.out",
          stagger: 0.09,
        });
      }

      // -------- Längste Fahrt --------
      if (!reduce) {
        gsap.fromTo(
          ".long-line",
          { strokeDashoffset: longLen },
          { strokeDashoffset: 0, ease: "none", scrollTrigger: { trigger: ".longest", start: "top 65%", end: "bottom 60%", scrub: 0.5 } }
        );
        gsap.from(".long-stop", {
          opacity: 0,
          scale: 0.2,
          transformOrigin: "50% 50%",
          stagger: 0.12,
          ease: "back.out(3)",
          scrollTrigger: { trigger: ".longest", start: "top 55%", end: "bottom 55%", scrub: 0.5 },
        });
      }

      // -------- Bahnhöfe: zwei Bänder laufen gegeneinander, bremsen beim Scrollen aus --------
      if (!reduce) {
        gsap.to(".row-a", { xPercent: -50, ease: "none", duration: 60, repeat: -1 });
        gsap.fromTo(".row-b", { xPercent: -50 }, { xPercent: 0, ease: "none", duration: 70, repeat: -1 });
      }

      // -------- Abschluss --------
      if (!reduce) {
        gsap.from(".end-word", {
          yPercent: 110,
          duration: 1,
          ease: "power4.out",
          stagger: 0.08,
          scrollTrigger: { trigger: ".end", start: "top 70%", once: true },
        });
      }
    }, root);

    // Schriften ändern die Höhen: Positionen neu rechnen, sobald sie da sind
    document.fonts?.ready.then(() => ScrollTrigger.refresh());
    return () => ctx.revert();
  });
</script>

<main bind:this={root}>
  <!-- ============ Start ============ -->
  <section class="hero">
    <svg class="net-svg" bind:this={heroSvg} viewBox={P.viewBox} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {#each paths as d, i}
        <path
          {d}
          class="net"
          bind:this={heroPaths[i]}
          style:stroke-dasharray={heroLens[i] || 99999}
          style:stroke-dashoffset={reduce ? 0 : undefined}
        />
      {/each}
      {#each paths as _, i}
        <path d="" class="train" />
      {/each}
      {#each stationDots.filter((s) => s.visits > 2) as s}
        <circle cx={s.xy[0]} cy={s.xy[1]} r="3.6" class="dot" />
      {/each}
    </svg>

    <div class="hero-copy">
      <p class="mono kicker h-fade">Bahnjahr 2026</p>
      <h1>
        <span class="mask"><span class="h-word">Ich bin</span></span>
        <span class="mask num-line">
          <span class="h-word red num">
            <span class="ghost" aria-hidden="true">{nf(stats.km)}</span>
            <span class="live">{nf(km)}</span>
          </span>
        </span>
        <span class="mask"><span class="h-word">Kilometer</span></span>
        <span class="mask"><span class="h-word"><span class="acc">Zug</span> gefahren.</span></span>
      </h1>
      <p class="lead h-fade">{stats.trips} Fahrten, {stats.stations} Bahnhöfe, ein Jahr. Unten fährt alles noch einmal ab.</p>
      <div class="cta h-fade">
        <a class="btn" href="#/karte">Zur Karte <span aria-hidden="true">→</span></a>
        <span class="mono scroll-hint">Weiterscrollen</span>
      </div>
    </div>
  </section>

  <!-- ============ Ein Jahr, eine Linie ============ -->
  <section class="year">
    <div class="year-grid">
      <div class="year-copy">
        <h2>Ein Jahr,<br />eine <span class="acc red">Linie.</span></h2>
        <p class="counter"><span class="ghost" aria-hidden="true">{nf(stats.km)}</span><span class="live">{nf(kmDrawn)}</span><small> km</small></p>
        <p class="caption mono" aria-live="off">
          Fahrt {Math.min(N, Math.floor(t) + 1)} von {N}<br />
          <b>{trips[cur].von} → {trips[cur].nach}</b><br />
          {trips[cur].datum}
        </p>
      </div>
      <svg class="year-svg" bind:this={lineSvg} viewBox={P.viewBox} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Alle Fahrten des Jahres als Linien">
        {#each paths as d}
          <path {d} class="ghost-line" />
        {/each}
        {#each paths as d, i}
          <path
            {d}
            class="draw"
            bind:this={linePaths[i]}
            style:stroke-dasharray={lineLens[i] || 99999}
            style:stroke-dashoffset={(lineLens[i] || 99999) * (1 - frac(i))}
            style:opacity={frac(i) > 0.001 ? 1 : 0}
          />
        {/each}
        {#each stationDots.filter((s) => s.visits > 2) as s}
          <g transform="translate({s.xy[0]} {s.xy[1]})">
            <circle r="4" class="dot" />
          </g>
        {/each}
      </svg>
    </div>
    <div class="bar-progress" aria-hidden="true"><i style:width="{p * 100}%"></i></div>
  </section>

  <!-- ============ Zahlen ============ -->
  <section class="numbers">
    <h2>Das Jahr in <span class="acc red">Zahlen.</span></h2>
    <div class="tiles">
      {#each tiles as tile, i}
        <article class="tile">
          <p class="mono label">{tile.label}</p>
          <p class="val">
            <span class="ghost" aria-hidden="true">{nf(tile.value, tile.dec)}</span>
            <span class="live">{nf(tileVals[i], tile.dec)}</span>
            {#if tile.unit}<small>{tile.unit}</small>{/if}
          </p>
        </article>
      {/each}
    </div>
  </section>

  <!-- ============ Längste Fahrt ============ -->
  <section class="longest">
    <div class="long-grid">
      <div class="long-copy">
        <p class="mono kicker">Längste Fahrt</p>
        <h2>{L.von}<br /><span class="red">→</span> {L.nach}</h2>
        <dl class="facts">
          <div><dt class="mono">Strecke</dt><dd>{nf(L.km)} km</dd></div>
          <div><dt class="mono">Dauer</dt><dd>{hm(L.minutes)}</dd></div>
          <div><dt class="mono">Datum</dt><dd>{L.datum}</dd></div>
          <div><dt class="mono">Züge</dt><dd>{L.zuege}</dd></div>
        </dl>
      </div>
      <svg class="long-svg" bind:this={longSvg} viewBox={PL.viewBox} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Die längste Fahrt als Linie">
        <path d={longestPath} class="ghost-line" />
        <path d={longestPath} class="long-line" bind:this={longEl} style:stroke-dasharray={longLen} />
        {#each longestStops as s, i}
          <g class="long-stop" transform="translate({s.xy[0]} {s.xy[1]})">
            <circle r={i === 0 || i === longestStops.length - 1 ? 7 : 4} class="dot" />
          </g>
        {/each}
      </svg>
    </div>
  </section>

  <!-- ============ Bahnhöfe ============ -->
  <section class="stations" aria-labelledby="st-h">
    <h2 id="st-h" class="sr">Bahnhöfe</h2>
    <div class="band" aria-hidden="true">
      <div class="row row-a">
        {#each [0, 1] as _}
          {#each marquee as s, i}
            {#if i % 2 === 0}<span class:big={s.visits >= 5}>{s.name}<sup>{s.visits}×</sup></span>{/if}
          {/each}
        {/each}
      </div>
      <div class="row row-b">
        {#each [0, 1] as _}
          {#each marquee as s, i}
            {#if i % 2 === 1}<span class:big={s.visits >= 5}>{s.name}<sup>{s.visits}×</sup></span>{/if}
          {/each}
        {/each}
      </div>
    </div>
    <p class="st-note"><b>{stats.top.name}</b> war {stats.top.visits}× auf meinem Weg, öfter als jeder andere.</p>
  </section>

  <!-- ============ Abschluss ============ -->
  <section class="end">
    <h2>
      <span class="mask"><span class="end-word">Jetzt die</span></span>
      <span class="mask"><span class="end-word"><span class="acc">Karte.</span></span></span>
    </h2>
    <a class="btn big" href="#/karte">Zur Karte <span aria-hidden="true">→</span></a>
    <p class="mono foot">Jonas' Bordbistro · Daten: eigene DB-Reisehistorie, Gleise: OpenStreetMap · kein offizielles Angebot der Deutschen Bahn</p>
  </section>
</main>

<style>
  main {
    overflow-x: clip;
  }

  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  .mask {
    display: block;
    overflow: hidden;
    padding-bottom: 0.08em;
    margin-bottom: -0.08em;
  }

  .ghost {
    visibility: hidden;
  }

  /* feste Breite für laufende Zahlen: der fertige Wert reserviert den Platz, nichts springt */
  .num,
  .counter,
  .val {
    display: inline-grid;
    font-variant-numeric: tabular-nums;
  }

  .num > *,
  .counter > .ghost,
  .counter > .live,
  .val > .ghost,
  .val > .live {
    grid-area: 1 / 1;
  }

  /* ---------- Start ---------- */
  .hero {
    position: relative;
    min-height: 100svh;
    display: grid;
    align-items: end;
    padding: calc(var(--bar-h) + 1rem) var(--pad) clamp(2rem, 7vh, 5rem);
    isolation: isolate;
  }

  .net-svg {
    position: absolute;
    inset: calc(var(--bar-h)) 0 0 0;
    width: 100%;
    height: calc(100% - var(--bar-h));
    z-index: -1;
    opacity: 0.9;
  }

  :global(:root[data-theme="dark"]) .net {
    stroke: #5a6173;
  }

  :global(:root[data-theme="light"]) .net {
    stroke: #8b8576;
  }

  .net {
    fill: none;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .train {
    fill: none;
    stroke: var(--red);
    stroke-width: 3.6;
    stroke-linecap: butt;
  }

  :global(:root[data-theme="dark"]) .train {
    filter: drop-shadow(0 0 6px rgba(236, 0, 22, 0.85));
  }

  .dot {
    fill: var(--bg);
    stroke: var(--ink);
    stroke-width: 1.8;
  }

  .hero-copy {
    position: relative;
    max-width: 62rem;
  }

  .kicker {
    color: var(--ink-2);
    margin-bottom: 1.1rem;
  }

  .hero h1 {
    font-size: clamp(3.2rem, 11.5vw, 12rem);
    line-height: 0.9;
  }

  .h-word {
    display: inline-block;
  }

  .num-line .num {
    display: inline-grid;
  }

  .lead {
    margin-top: clamp(1.2rem, 3vh, 2.2rem);
    max-width: 32rem;
    color: var(--ink-2);
    font-size: clamp(1.05rem, 1.5vw, 1.3rem);
  }

  .cta {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    margin-top: 1.6rem;
    flex-wrap: wrap;
  }

  .scroll-hint {
    color: var(--ink-2);
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.95rem 1.5rem;
    border-radius: 99px;
    background: var(--red);
    color: var(--on-red);
    font-weight: 700;
    text-decoration: none;
    transition: transform 200ms var(--ease), background-color 200ms var(--ease), gap 200ms var(--ease);
  }

  .btn:hover {
    gap: 1.1rem;
    background: #c80013;
  }

  .btn:active {
    transform: scale(0.97);
  }

  .btn.big {
    font-size: clamp(1.2rem, 2.4vw, 1.8rem);
    padding: 1.2rem 2.2rem;
  }

  /* ---------- Ein Jahr, eine Linie ---------- */
  .year {
    position: relative;
    height: 100svh;
    padding: calc(var(--bar-h) + 1rem) var(--pad) 2rem;
    background: var(--bg-2);
    display: grid;
    align-content: center;
  }

  .year-grid {
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    gap: clamp(1rem, 4vw, 4rem);
    align-items: center;
    height: 100%;
  }

  .year h2 {
    font-size: clamp(2.8rem, 7.5vw, 8rem);
  }

  .counter {
    margin-top: clamp(1rem, 3vh, 2rem);
    font-family: var(--font-display);
    font-weight: 800;
    font-size: clamp(3rem, 8vw, 7.5rem);
    letter-spacing: -0.04em;
    line-height: 1;
    align-items: baseline;
    grid-template-columns: auto auto;
    column-gap: 0.4rem;
    justify-content: start;
  }

  .counter .ghost,
  .counter .live {
    grid-area: 1 / 1;
  }

  .counter small {
    grid-area: 1 / 2;
    font-size: 0.32em;
    color: var(--ink-2);
    font-weight: 600;
    letter-spacing: 0;
  }

  .caption {
    margin-top: 1.2rem;
    color: var(--ink-2);
    line-height: 1.7;
    min-height: 5.2em;
  }

  .caption b {
    color: var(--ink);
    font-weight: 500;
  }

  .year-svg {
    width: 100%;
    height: 100%;
    max-height: calc(100svh - var(--bar-h) - 3rem);
    overflow: visible;
  }

  .ghost-line {
    fill: none;
    stroke: var(--line);
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .draw {
    fill: none;
    stroke: var(--red);
    stroke-width: 3;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-opacity: 0.78;
  }

  :global(:root[data-theme="dark"]) .draw {
    filter: drop-shadow(0 0 5px rgba(236, 0, 22, 0.55));
  }

  .bar-progress {
    position: absolute;
    left: var(--pad);
    right: var(--pad);
    bottom: 1.4rem;
    height: 3px;
    background: var(--line);
    border-radius: 3px;
  }

  .bar-progress i {
    display: block;
    height: 100%;
    background: var(--red);
    border-radius: 3px;
  }

  /* ---------- Zahlen ---------- */
  .numbers {
    padding: clamp(5rem, 14vh, 9rem) var(--pad);
  }

  .numbers h2 {
    font-size: clamp(2.6rem, 7vw, 7rem);
    margin-bottom: clamp(2rem, 6vh, 4rem);
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: clamp(0.6rem, 1.4vw, 1.2rem);
  }

  .tile {
    padding: clamp(1.1rem, 2vw, 1.8rem);
    border: 1px solid var(--line);
    border-radius: 1.4rem;
    background: var(--bg-2);
    transition: transform 300ms var(--ease), border-color 300ms var(--ease), background-color 300ms var(--ease);
  }

  .tile:hover {
    transform: translateY(-6px);
    border-color: var(--red);
  }

  .tile .label {
    color: var(--ink-2);
    margin-bottom: clamp(1rem, 4vh, 2.4rem);
  }

  .val {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: clamp(2.6rem, 6vw, 5.6rem);
    letter-spacing: -0.04em;
    line-height: 1;
    grid-template-columns: auto auto;
    column-gap: 0.45rem;
    align-items: baseline;
    justify-content: start;
  }

  .val .ghost,
  .val .live {
    grid-area: 1 / 1;
  }

  .val small {
    grid-area: 1 / 2;
    font-size: 0.28em;
    letter-spacing: 0;
    color: var(--ink-2);
    font-weight: 600;
  }

  /* ---------- Längste Fahrt ---------- */
  .longest {
    padding: clamp(4rem, 12vh, 8rem) var(--pad);
    background: var(--bg-2);
  }

  .long-grid {
    display: grid;
    grid-template-columns: minmax(0, 6fr) minmax(0, 6fr);
    gap: clamp(1.5rem, 5vw, 5rem);
    align-items: center;
  }

  .long-copy h2 {
    font-size: clamp(2.4rem, 5.6vw, 6rem);
  }

  .long-copy .kicker {
    color: var(--ink-2);
    margin-bottom: 1.2rem;
  }

  .facts {
    margin: clamp(1.4rem, 4vh, 2.6rem) 0 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.2rem 2rem;
  }

  .facts dt {
    color: var(--ink-2);
    margin-bottom: 0.2rem;
  }

  .facts dd {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: clamp(1.3rem, 2.2vw, 2rem);
    letter-spacing: -0.02em;
  }

  .long-svg {
    width: 100%;
    height: auto;
    max-height: 70svh;
    overflow: visible;
  }

  .long-line {
    fill: none;
    stroke: var(--red);
    stroke-width: 4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  :global(:root[data-theme="dark"]) .long-line {
    filter: drop-shadow(0 0 7px rgba(236, 0, 22, 0.7));
  }

  /* ---------- Bahnhöfe ---------- */
  .stations {
    padding: clamp(4rem, 12vh, 8rem) 0 clamp(3rem, 8vh, 6rem);
    overflow: hidden;
  }

  .band {
    display: grid;
    gap: clamp(0.4rem, 1.5vw, 1.2rem);
  }

  .row {
    display: flex;
    gap: clamp(1.5rem, 4vw, 4rem);
    width: max-content;
    font-family: var(--font-display);
    font-weight: 800;
    font-size: clamp(2.6rem, 8vw, 8rem);
    letter-spacing: -0.035em;
    line-height: 1.02;
    white-space: nowrap;
    color: transparent;
    -webkit-text-stroke: 1.5px var(--ink);
  }

  .row .big {
    color: var(--red-ink);
    -webkit-text-stroke: 0;
  }

  .row sup {
    font-family: var(--font-mono);
    font-weight: 400;
    font-size: 0.14em;
    letter-spacing: 0.04em;
    margin-left: 0.4em;
    vertical-align: top;
    color: var(--ink-2);
    -webkit-text-stroke: 0;
  }

  .st-note {
    padding: clamp(1.4rem, 4vh, 2.4rem) var(--pad) 0;
    max-width: 40rem;
    color: var(--ink-2);
    font-size: clamp(1.05rem, 1.5vw, 1.3rem);
  }

  .st-note b {
    color: var(--ink);
  }

  /* ---------- Abschluss ---------- */
  .end {
    min-height: 90svh;
    display: grid;
    align-content: center;
    justify-items: start;
    gap: clamp(1.4rem, 4vh, 2.6rem);
    padding: clamp(4rem, 12vh, 8rem) var(--pad) 2rem;
    background: var(--red);
    color: var(--on-red);
  }

  .end h2 {
    font-size: clamp(3.6rem, 14vw, 15rem);
    line-height: 0.88;
  }

  .end .end-word {
    display: inline-block;
  }

  .end .btn {
    background: var(--on-red);
    color: var(--red);
  }

  .end .btn:hover {
    background: #fff;
  }

  .foot {
    margin-top: clamp(2rem, 8vh, 5rem);
    opacity: 0.85;
    max-width: 44rem;
    line-height: 1.6;
  }

  @media (max-width: 860px) {
    .year-grid,
    .long-grid {
      grid-template-columns: 1fr;
    }

    .year-grid {
      grid-template-rows: auto minmax(0, 1fr);
      align-content: start;
    }

    .year {
      align-content: start;
    }

    .year h2 {
      font-size: clamp(2.4rem, 11vw, 4rem);
    }

    .counter {
      font-size: clamp(2.6rem, 14vw, 4.4rem);
      margin-top: 0.6rem;
    }

    .caption {
      min-height: 4.6em;
      margin-top: 0.6rem;
      font-size: 0.72rem;
    }

    .tiles {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .hero h1 {
      font-size: clamp(3rem, 15vw, 6rem);
    }

    .net-svg {
      opacity: 0.55;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .net {
      stroke-dashoffset: 0 !important;
    }
  }
</style>
