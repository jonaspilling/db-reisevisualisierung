<script>
  // "So liest du die Karte": zum Ausprobieren statt zum Lesen.
  // 1. Ein Regler zeigt, was Breite, Farbe und Mauerhöhe bedeuten.
  // 2. Eine kleine Karte mit den echten Fahrten: abspielen, an der Zeit ziehen, Linien berühren.
  // 3. Ein Spickzettel für Maus und Finger.
  import { onMount } from "svelte";
  import { reveal } from "../lib/actions.js";
  import { projectTrips } from "../lib/project.js";
  import { shortName } from "../lib/facts.js";
  import { formatDuration } from "../lib/data.js";
  import { measure, dashOff, dashVis } from "../lib/dash.js";

  let { trips, stations } = $props();

  const totalKm = $derived(Math.round(trips.reduce((s, t) => s + t.km, 0)));
  const clamp = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

  // ---------- 1. Regler: wie oft gefahren ----------
  const SLATE = [43, 47, 74];
  const PLUM = [177, 35, 92];
  const RED = [236, 0, 22];
  const mix = (a, b, f) => a.map((v, k) => Math.round(v + (b[k] - v) * f));
  const heat = (f) => (f < 0.5 ? mix(SLATE, PLUM, f / 0.5) : mix(PLUM, RED, (f - 0.5) / 0.5));
  const rgb = (c) => `rgb(${c.join(",")})`;

  let often = $state(1);
  let touched = $state(false);
  const f = $derived((often - 1) / 13);
  const lineColor = $derived(rgb(heat(f)));
  const lineWidth = $derived(3 + often * 1.7);
  const caption = $derived(
    often === 1
      ? "Einmal gefahren: dunkles Schiefer, eine schlanke Linie."
      : often < 5
        ? `${often}× gefahren: die Linie wird kräftiger und wärmer.`
        : often < 10
          ? `${often}× gefahren: schon deutlich rot und breit.`
          : `${often}× gefahren: ein Dauerbrenner, leuchtendes DB-Rot.`
  );

  // ---------- 2. Die Spielwiese ----------
  const net = $derived(projectTrips(trips, 30));
  const N = $derived(trips.length);
  let t = $state(0); // 0 .. N
  let playing = $state(false);
  let hovered = $state(-1);
  let mapEl = $state();
  const frac = (i) => clamp(t - i);
  const doneKm = $derived(Math.round(trips.reduce((s, tr, i) => s + tr.km * frac(i), 0)));
  const cur = $derived(Math.min(N - 1, Math.floor(t)));
  const shown = $derived(hovered >= 0 ? hovered : cur);
  const progress = $derived(t / N);

  let raf = 0;
  let last = 0;
  function tick(now) {
    const dt = Math.min(now - last, 80);
    last = now;
    t = Math.min(N, t + (dt / 1000) * 0.9);
    if (t >= N) playing = false;
    if (playing) raf = requestAnimationFrame(tick);
  }
  function play() {
    if (playing) {
      playing = false;
      cancelAnimationFrame(raf);
      return;
    }
    if (t >= N) t = 0;
    playing = true;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
  function scrub(e) {
    playing = false;
    cancelAnimationFrame(raf);
    t = (+e.currentTarget.value / 1000) * N;
  }

  onMount(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      t = N;
      return;
    }
    // Startet von selbst, sobald die Karte im Bild ist
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !playing && t === 0) {
          io.disconnect();
          play();
        }
      },
      { threshold: 0.5 }
    );
    if (mapEl) io.observe(mapEl);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  });

  const trip = $derived(trips[shown]);

  // ---------- 3. Spickzettel ----------
  const keys = [
    { k: "Ziehen", t: "Verschiebt die Karte.", icon: "drag" },
    { k: "Mausrad · zwei Finger", t: "Zoomt hinein und heraus.", icon: "zoom" },
    { k: "Rechte Maustaste", t: "Gedrückt halten und ziehen: seitwärts dreht, hoch und runter neigt die Karte.", icon: "tilt" },
    { k: "Klick auf eine Linie", t: "Wählt die Fahrten dort aus. Die Karte zeigt dann nur sie.", icon: "click" },
  ];
</script>

<div class="container">
  <div class="page-head split">
    <h1>So liest du die <span class="hl special">Karte</span></h1>
    <p class="lead" use:reveal={160}>
      {trips.length} Bahnfahrten, {totalKm.toLocaleString("de-DE")} Kilometer, {stations.length} Bahnhöfe. Du musst nichts
      lesen: probier es unten einfach aus.
    </p>
  </div>

  <!-- 1 · Regler -->
  <section class="block" use:reveal aria-labelledby="h1">
    <header>
      <span class="no">1</span>
      <div>
        <h2 id="h1">Je öfter, desto dicker</h2>
        <p>Jede Strecke ist eine Linie. Wie oft du einen Abschnitt gefahren bist, siehst du an Breite und Farbe. Zieh am Regler.</p>
      </div>
    </header>

    <div class="lab">
      <div class="stage" aria-hidden="true">
        <svg viewBox="0 0 400 150" preserveAspectRatio="xMidYMid meet">
          <path d="M30 100 C 110 100, 130 50, 200 50 S 300 100, 370 80" fill="none" stroke="#e3e7eb" stroke-width="3" stroke-linecap="round" />
          <path d="M30 100 C 110 100, 130 50, 200 50 S 300 100, 370 80" fill="none" stroke={lineColor} stroke-width={lineWidth} stroke-linecap="round" style="transition: stroke-width 200ms var(--ease), stroke 200ms var(--ease)" />
          <circle cx="30" cy="100" r="7" fill="#fff" stroke="#282d37" stroke-width="3" />
          <circle cx="370" cy="80" r="7" fill="#fff" stroke="#282d37" stroke-width="3" />
        </svg>
        <!-- Die 3D-Mauer: so hoch, wie oft gefahren -->
        <div class="wall">
          {#each Array(16) as _, i}
            <i style="height:{often * 6 + 6}px;background:{lineColor};transition-delay:{i * 6}ms"></i>
          {/each}
        </div>
        <p class="wall-lbl">3D-Mauer: so hoch, wie oft gefahren</p>
      </div>

      <div class="ctl">
        <label for="often"><b>{often}×</b> gefahren</label>
        <input id="often" type="range" min="1" max="14" step="1" bind:value={often} oninput={() => (touched = true)} class:hint={!touched} aria-describedby="cap" />
        <div class="grad" aria-hidden="true"></div>
        <div class="ends" aria-hidden="true"><span>1×</span><span>14×</span></div>
        <p id="cap" class="cap">{caption}</p>
      </div>
    </div>
  </section>

  <!-- 2 · Spielwiese -->
  <section class="block" use:reveal={80} aria-labelledby="h2">
    <header>
      <span class="no">2</span>
      <div>
        <h2 id="h2">Abspielen, ziehen, berühren</h2>
        <p>Das Jahr zeichnet sich Fahrt für Fahrt ein. Zieh an der Zeit oder fahr mit der Maus über eine Linie (am Handy: tippen).</p>
      </div>
    </header>

    <div class="play" bind:this={mapEl}>
      <svg viewBox={net.viewBox} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Alle Fahrten als Linien">
        {#each net.paths as d}
          <path {d} class="ghost" />
        {/each}
        {#each net.paths as d, i}
          <path
            {d}
            use:measure
            class="trip"
            class:on={hovered === i}
            class:dim={hovered >= 0 && hovered !== i}
            style:stroke-dashoffset={dashOff(frac(i))}
            style:stroke-opacity={dashVis(frac(i))}
          />
        {/each}
        <!-- Unsichtbare, breitere Linien zum Berühren -->
        {#each net.paths as d, i}
          {#if frac(i) > 0}
            <path
              {d}
              class="hit"
              role="button"
              tabindex="-1"
              aria-label="{shortName(trips[i].von)} nach {shortName(trips[i].nach)}"
              onpointerenter={() => (hovered = i)}
              onpointerleave={() => (hovered = -1)}
              onclick={() => (hovered = hovered === i ? -1 : i)}
              onkeydown={(e) => (e.key === "Enter" || e.key === " ") && (hovered = hovered === i ? -1 : i)}
            />
          {/if}
        {/each}
      </svg>

      <div class="card" class:pop={hovered >= 0}>
        <b>{shortName(trip.von)} → {shortName(trip.nach)}</b>
        <span>{trip.datum} · {Math.round(trip.km)} km · {formatDuration(trip.minutes)}</span>
      </div>
    </div>

    <div class="deck">
      <button type="button" class="pbtn" onclick={play} aria-label={playing ? "Pause" : t >= N ? "Noch einmal" : "Abspielen"}>
        {#if playing}
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" /></svg>
        {:else if t >= N}
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z" fill="currentColor" /></svg>
        {:else}
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
        {/if}
      </button>
      <input type="range" min="0" max="1000" value={Math.round(progress * 1000)} oninput={scrub} aria-label="Zeit im Jahr" />
      <div class="count"><b>{Math.min(N, Math.floor(t) + (t > 0 ? 1 : 0))}</b> von {N}<br /><span>{doneKm.toLocaleString("de-DE")} km</span></div>
    </div>
  </section>

  <!-- 3 · Spickzettel -->
  <section class="block" use:reveal={80} aria-labelledby="h3">
    <header>
      <span class="no">3</span>
      <div>
        <h2 id="h3">Der Spickzettel</h2>
        <p>Auf der Karte selbst gilt:</p>
      </div>
    </header>

    <ul class="keys">
      {#each keys as k, i}
        <li use:reveal={i * 70}>
          <svg class="ico {k.icon}" viewBox="0 0 48 48" aria-hidden="true">
            {#if k.icon === "drag"}
              <rect x="6" y="14" width="36" height="22" rx="5" class="frame" />
              <path d="M16 25h16m-5-5 5 5-5 5" class="arrow" />
            {:else if k.icon === "zoom"}
              <circle cx="21" cy="21" r="11" class="frame" />
              <path d="M30 30l10 10M16 21h10M21 16v10" class="arrow" />
            {:else if k.icon === "tilt"}
              <path d="M8 34l10-14h22l-6 14z" class="frame" />
              <path d="M24 10v6m-6-3 6-6 6 6" class="arrow" />
            {:else}
              <path d="M8 36c8-4 12-12 16-12s8 6 16 2" class="frame" fill="none" />
              <circle cx="26" cy="25" r="5" class="dot" />
            {/if}
          </svg>
          <div>
            <b>{k.k}</b>
            <p>{k.t}</p>
          </div>
        </li>
      {/each}
    </ul>
  </section>

  <!-- Hintergründe -->
  <section class="info">
    <div use:reveal>
      <h2>Woher die Daten kommen</h2>
      <p>
        Aus meiner persönlichen DB-Reisehistorie: Datum, Uhrzeit, Start, Ziel, Zugnummer und alle Zwischenhalte. Alles zusammen liegt als CSV-Datei im Projekt.
      </p>
    </div>
    <div use:reveal={100}>
      <h2>Wie die Linien entstehen</h2>
      <p>
        Die Historie kennt nur Bahnhöfe, keine Gleise. Die Linien folgen deshalb echten, in OpenStreetMap kartierten Zugverbindungen: der kürzeste Weg über die Gleise, die Fernzüge normalerweise befahren. S-Bahn-Strecken werden gemieden.
      </p>
    </div>
    <div use:reveal={200}>
      <h2>Was die Karte nicht weiß</h2>
      <p>
        Den Regionalverkehr: Ich fahre übers Jahr deutlich mehr Regionalzüge, bei ganz verschiedenen Anbietern. Das steht nicht in der Reisehistorie und lässt sich nicht messen. Der tatsächlich gefahrene Weg kann im Einzelfall abweichen. Auch die Höhe ist eine Näherung: Gezählt wird in Rasterzellen von drei Kilometern.
      </p>
    </div>
  </section>

  <div class="cta" use:reveal>
    <a class="btn" href="#/karte">Zur Karte <span aria-hidden="true">→</span></a>
    <a class="btn ghost" href="#/statistik">Statistik</a>
  </div>
</div>

<style>
  .block {
    margin-bottom: clamp(2.5rem, 5vw, 4.5rem);
    padding: clamp(1.2rem, 2.4vw, 2rem);
    border-radius: 1.5rem;
    background: var(--panel);
    box-shadow: inset 0 0 0 1px var(--line);
  }

  .block > header {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
    margin-bottom: 1.2rem;
  }

  .no {
    flex: none;
    width: 2.75rem;
    height: 2.75rem;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--red);
    color: #fff;
    font-family: var(--display);
    font-weight: 800;
    font-size: 1.3rem;
  }

  .block h2 {
    font-size: clamp(1.5rem, 2.4vw, 2.1rem);
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }

  .block header p {
    color: var(--muted);
    margin-top: 0.35rem;
    max-width: 38rem;
  }

  /* ---- 1 · Regler ---- */
  .lab {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
    gap: clamp(1rem, 3vw, 2.5rem);
    align-items: center;
  }

  .stage {
    background: var(--bg);
    border-radius: 1rem;
    box-shadow: inset 0 0 0 1px var(--line);
    padding: 0.5rem 0.8rem 0.9rem;
    display: grid;
    gap: 0.2rem;
  }

  .stage svg {
    width: 100%;
    height: auto;
    display: block;
  }

  .wall {
    display: flex;
    align-items: flex-end;
    gap: 3px;
    height: 5.7rem;
    padding: 0 0.6rem;
    overflow: hidden;
  }

  .wall i {
    flex: 1;
    border-radius: 3px 3px 0 0;
    transition: height 260ms var(--ease), background-color 200ms var(--ease);
  }

  /* Die Beschriftung steht unter der Mauer, nie darin: die Mauer wächst nach oben, nicht in den Text */
  .wall-lbl {
    padding: 0 0.6rem;
    font-size: 0.74rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .ctl {
    display: grid;
    gap: 0.45rem;
  }

  .ctl label {
    font-size: 1.1rem;
  }

  .ctl label b {
    font-family: var(--display);
    font-size: 2.2rem;
    font-weight: 800;
    letter-spacing: -0.03em;
    margin-right: 0.15em;
  }

  input[type="range"] {
    width: 100%;
    accent-color: var(--red);
    height: 1.8rem;
    cursor: pointer;
  }

  /* Ein sanftes Pulsieren lädt zum Ausprobieren ein, bis der Regler einmal bewegt wurde */
  input[type="range"].hint {
    animation: nudge 1.8s var(--ease) infinite;
  }

  @keyframes nudge {
    0%,
    100% {
      transform: none;
    }
    50% {
      transform: translateX(0.35rem);
    }
  }

  .grad {
    height: 0.5rem;
    border-radius: 0.3rem;
    background: linear-gradient(90deg, #2b2f4a, #b1235c, #ec0016);
  }

  .ends {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--muted);
  }

  .cap {
    min-height: 3em;
    font-weight: 600;
    margin-top: 0.3rem;
  }

  /* ---- 2 · Spielwiese ---- */
  .play {
    position: relative;
    background: #1a1e26;
    border-radius: 1rem;
    padding: 0.6rem;
  }

  .play svg {
    width: 100%;
    height: auto;
    max-height: 26rem;
    display: block;
  }

  .ghost {
    fill: none;
    stroke: #343b49;
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .trip {
    fill: none;
    stroke: #e8ecf2;
    stroke-width: 3;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: calc(var(--len, 99999) * 1px);
    transition: stroke 160ms var(--ease), stroke-width 160ms var(--ease), opacity 160ms var(--ease);
  }

  .trip.on {
    stroke: var(--red);
    stroke-width: 6;
  }

  .trip.dim {
    opacity: 0.25;
  }

  .hit {
    fill: none;
    stroke: transparent;
    stroke-width: 18;
    stroke-linecap: round;
    pointer-events: stroke;
    cursor: pointer;
  }

  .card {
    position: absolute;
    left: 0.9rem;
    bottom: 0.9rem;
    max-width: calc(100% - 1.8rem);
    display: grid;
    gap: 0.1rem;
    padding: 0.6rem 0.9rem;
    border-radius: 0.8rem;
    background: rgba(255, 255, 255, 0.94);
    box-shadow: 0 0.5rem 1.2rem -0.6rem rgba(0, 0, 0, 0.6);
    transition: transform 200ms var(--ease);
  }

  .card.pop {
    transform: translateY(-0.25rem) scale(1.02);
  }

  .card b {
    font-size: 1.05rem;
    font-weight: 800;
  }

  .card span {
    font-size: 0.85rem;
    color: var(--muted);
  }

  .deck {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 1rem;
    align-items: center;
    margin-top: 0.9rem;
  }

  .pbtn {
    width: 3.1rem;
    height: 3.1rem;
    border-radius: 50%;
    background: var(--red);
    color: #fff;
    display: grid;
    place-items: center;
    transition: transform 160ms var(--ease), background-color 160ms var(--ease);
  }

  .pbtn:hover {
    background: var(--red-dark);
  }

  .pbtn:active {
    transform: scale(0.94);
  }

  .count {
    text-align: right;
    font-size: 0.85rem;
    line-height: 1.25;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    min-width: 5.5rem;
  }

  .count b {
    font-size: 1.2rem;
    color: var(--text);
  }

  .count span {
    font-weight: 700;
    color: var(--text);
  }

  /* ---- 3 · Spickzettel ---- */
  .keys {
    list-style: none;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.9rem;
  }

  .keys li {
    display: grid;
    gap: 0.6rem;
    align-content: start;
    padding: 1rem;
    border-radius: 1rem;
    background: var(--bg);
    box-shadow: inset 0 0 0 1px var(--line);
    transition: transform 220ms var(--ease), box-shadow 220ms var(--ease);
  }

  .keys li:hover {
    transform: translateY(-0.25rem);
    box-shadow: inset 0 0 0 1px var(--red);
  }

  .keys b {
    display: block;
    font-weight: 800;
    margin-bottom: 0.2rem;
  }

  .keys p {
    color: var(--muted);
    font-size: 0.93rem;
  }

  .ico {
    width: 3.2rem;
    height: 3.2rem;
  }

  .ico .frame {
    fill: none;
    stroke: var(--text);
    stroke-width: 2.6;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  .ico .arrow {
    fill: none;
    stroke: var(--red);
    stroke-width: 3;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .ico .dot {
    fill: var(--red);
  }

  .keys li:hover .drag .arrow {
    animation: slide 700ms var(--ease) infinite alternate;
  }

  .keys li:hover .zoom .arrow {
    animation: pulse 700ms var(--ease) infinite alternate;
    transform-origin: 24px 24px;
  }

  .keys li:hover .tilt .arrow {
    animation: slide-y 700ms var(--ease) infinite alternate;
  }

  .keys li:hover .click .dot {
    animation: pulse 600ms var(--ease) infinite alternate;
    transform-origin: 26px 25px;
  }

  @keyframes slide {
    to {
      transform: translateX(4px);
    }
  }

  @keyframes slide-y {
    to {
      transform: translateY(-3px);
    }
  }

  @keyframes pulse {
    to {
      transform: scale(1.18);
    }
  }

  /* ---- Hintergründe ---- */
  .info {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: clamp(1.5rem, 3vw, 3rem);
    padding-top: clamp(1.5rem, 3vw, 2.5rem);
    border-top: 1px solid var(--line);
    margin-bottom: clamp(2rem, 4vw, 3rem);
  }

  .info h2 {
    font-size: 1.5rem;
    font-weight: 800;
    margin-bottom: 0.6rem;
  }

  .info p {
    color: var(--muted);
  }

  .cta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
  }

  @media (max-width: 1100px) {
    .keys {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .info {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 760px) {
    .lab {
      grid-template-columns: 1fr;
    }

    .keys {
      grid-template-columns: 1fr;
    }

    .deck {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .count {
      grid-column: 1 / -1;
      text-align: left;
    }
  }

  @media (max-width: 620px) {
    .info {
      grid-template-columns: 1fr;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    input[type="range"].hint,
    .keys li:hover .arrow,
    .keys li:hover .dot {
      animation: none;
    }
  }
</style>
