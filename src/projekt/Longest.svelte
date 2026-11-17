<script>
  // Längste Fahrt (München–Lille) und kürzeste Fahrt (Railjet) in einem Kapitel.
  // Erst läuft die längste Fahrt: die Linie wird nach Zügen eingefärbt (ICE in DB-Rot, TGV im Rosa von TGV inOui).
  // Dann blendet die Szene in den Stil des Railjets über: die kürzeste Fahrt als Fahrkarte, dazu die Anbieter des Jahres.
  import { scene } from "../lib/scenes.js";
  import { shortName } from "../lib/facts.js";
  import { formatDuration } from "../lib/data.js";
  import { projectTrips } from "../lib/project.js";
  import { AUTOBAHN_KMH, nf, tripLegs } from "../lib/story.js";
  import Odometer from "./Odometer.svelte";

  let { story } = $props();

  const clamp = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const avg = Math.round(story.avgKmh);
  const COLOR = { db: "var(--red)", sncf: "#ff6fae", oebb: "#2a2d31" };
  const dOf = (pts) => "M" + pts.map((q) => q.map((v) => v.toFixed(1)).join(" ")).join("L");

  // ---- A: die längste Fahrt, nach Zügen eingefärbt ----
  const trip = story.longest;
  const netA = projectTrips([trip], 40);
  const pts = trip.path.map(netA.proj);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1] || 1;

  const raw = tripLegs(trip, story.stations);
  const legs = (raw || [{ label: null, op: "db", from: 0, to: pts.length - 1 }]).map((l) => ({
    ...l,
    d: dOf(pts.slice(l.from, l.to + 1)),
    s: cum[l.from] / total,
    e: cum[l.to] / total,
  }));
  const operatorsInTrip = new Set(legs.map((l) => l.op).filter(Boolean)).size;
  const a = pts[0];
  const b = pts[pts.length - 1];
  // Beschriftung immer zur Bildmitte hin, damit sie nie aus dem Bild läuft
  const side = (x) => (x > netA.width / 2 ? { dx: -14, anchor: "end" } : { dx: 14, anchor: "start" });
  const sa = side(a[0]);
  const sb = side(b[0]);
  const speedLine = `Im Schnitt ${avg} km/h über das ganze Jahr. Zum Vergleich: Autobahn-Richtgeschwindigkeit ${AUTOBAHN_KMH}, nur ohne Stau.`;

  // ---- B: die Railjet-Fahrt, meist die kürzeste ----
  const rjLeg = story.operators.oebb.legs[0];
  const bOn = !!rjLeg;
  const rjTrip = rjLeg?.trip;
  const isShortest = bOn && story.shortest.id === rjTrip.id;
  const netB = bOn ? projectTrips([rjTrip], 40) : null;
  const dB = bOn ? netB.paths[0] : "";
  // Die kurze Strecke wird stärker vergrößert: Strichstärke und Punkt schrumpfen im selben Maß mit
  const sizeOf = (n) => Math.max(n.width, n.height) + 80;
  const rjScale = bOn ? sizeOf(netB) / sizeOf(netA) : 1;

  // Anbieter des Jahres (Fernverkehr, laut Reisehistorie)
  const OP_LABEL = { db: "ICE", sncf: "TGV inOui", oebb: "Railjet" };
  const mix = ["db", "sncf", "oebb"]
    .map((k) => ({ key: k, n: story.operators[k].legs.length, label: OP_LABEL[k] }))
    .filter((m) => m.n > 0);

  let p = $state(0);
  let el = $state();
  let elB = $state();
  const fA = $derived(clamp((p - 0.04) / 0.42));
  // A blendet zuerst aus, dann kommt B herein: so liegen nie zwei Texte übereinander
  const kA = $derived(bOn ? clamp((p - 0.5) / 0.06) : 0);
  const k = $derived(bOn ? clamp((p - 0.55) / 0.08) : 0);
  const fB = $derived(clamp((p - 0.64) / 0.3));
  const km = $derived(trip.km * fA);

  const headA = $derived.by(() => {
    if (!el || fA <= 0 || fA >= 1) return null;
    const pt = el.getPointAtLength(fA * el.getTotalLength());
    return { x: pt.x, y: pt.y };
  });
  const headColor = $derived(COLOR[[...legs].reverse().find((l) => fA >= l.s)?.op] || "var(--red)");

  const headB = $derived.by(() => {
    if (!elB || fB <= 0 || fB >= 1) return null;
    const pt = elB.getPointAtLength(fB * elB.getTotalLength());
    return { x: pt.x, y: pt.y };
  });
</script>

<section class="scene t-dark" style="--dwell:2" use:scene={(v) => (p = v)}>
  <div class="sc-stage">
    <!-- A: längste Fahrt -->
    <div class="copy" style="opacity:{1 - kA}">
      <h2 class="say">
        <span class="w" style="--i:0"><span class="wi">Längste</span></span>
        <span class="w" style="--i:1"><span class="wi">Fahrt:</span></span>
      </h2>

      <div class="counter">
        <span class="odo-wrap"><Odometer value={km} digits={3} label="{nf(trip.km)} " /></span>
        <span class="unit">km</span>
      </div>

      <p class="sub">
        <b>{shortName(trip.von)} – {shortName(trip.nach)}</b>, {formatDuration(trip.minutes)} unterwegs.
        {#if raw}{legs.length} Züge, {operatorsInTrip} {operatorsInTrip === 1 ? "Anbieter" : "Anbieter"}: {speedLine}{:else}{speedLine}{/if}
      </p>

      {#if raw}
        <ul class="chips" aria-label="Die Züge dieser Fahrt">
          {#each legs as l}
            <li class="chip {l.op}" style="opacity:{clamp((fA - l.s) / 0.1 + 0.15)}">{l.label}</li>
          {/each}
        </ul>
      {/if}
    </div>

    <svg
      class="path"
      style="opacity:{1 - kA}"
      viewBox={netA.viewBox}
      role="img"
      aria-label="Die längste Fahrt als Linie: {shortName(trip.von)} – {shortName(trip.nach)}"
      preserveAspectRatio="xMidYMid meet"
    >
      <path d={netA.paths[0]} class="ghost" />
      <path bind:this={el} d={netA.paths[0]} class="measure" />
      {#each legs as l}
        <path
          d={l.d}
          class="run"
          pathLength="1"
          stroke-dasharray="1"
          stroke-dashoffset={1 - clamp((fA - l.s) / Math.max(l.e - l.s, 1e-6))}
          style="stroke:{COLOR[l.op] || 'var(--red)'}"
        />
      {/each}
      <g class="end">
        <circle cx={a[0]} cy={a[1]} r="6" />
        <text x={a[0] + sa.dx} y={a[1] + 5} text-anchor={sa.anchor}>{shortName(trip.von)}</text>
      </g>
      <g class="end">
        <circle cx={b[0]} cy={b[1]} r="6" />
        <text x={b[0] + sb.dx} y={b[1] + 5} text-anchor={sb.anchor}>{shortName(trip.nach)}</text>
      </g>
      {#if headA}
        <circle cx={headA.x} cy={headA.y} r="7" class="head" style="stroke:{headColor}" />
      {/if}
    </svg>

    <!-- B: Railjet, im Stil des Railjets (blendet beim Scrollen über die längste Fahrt) -->
    {#if bOn}
      <div class="railjet" style="opacity:{k};visibility:{k > 0 ? 'visible' : 'hidden'}">
        <div class="rj-copy">
          <h2 class="rj-say">{isShortest ? "Kürzeste Fahrt:" : "Und einmal:"} {rjLeg.label.replace(/^RJ/, "Railjet RJ")}.</h2>

          <div class="ticket" style="transform:translateX({(1 - fB) * 10}%)">
            <div class="route">
              <span class="lbl">Von</span>
              <b>{shortName(rjTrip.von)}</b>
              <span class="lbl">Nach</span>
              <b>{shortName(rjTrip.nach)}</b>
            </div>
            <div class="perf" aria-hidden="true"></div>
            <dl class="meta">
              <div><dt>Datum</dt><dd>{rjTrip.datum}</dd></div>
              <div><dt>Zeit</dt><dd>{rjTrip.abfahrt}–{rjTrip.ankunft}</dd></div>
              <div><dt>Strecke</dt><dd>{nf(rjTrip.km)} km</dd></div>
            </dl>
          </div>

          <div class="mix" aria-label="Anbieter des Jahres">
            <p class="mix-title">Meine Züge im Jahr, nach Anbieter</p>
            <div class="bar" style="width:{fB * 100}%">
              {#each mix as m}
                <i style="flex:{m.n};background:{COLOR[m.key]}" title="{m.n}× {m.label}"></i>
              {/each}
            </div>
            <ul class="legend" style="opacity:{clamp((fB - 0.5) * 3)}">
              {#each mix as m}
                <li><i style="background:{COLOR[m.key]}"></i><b>{m.n}×</b> {m.label}</li>
              {/each}
            </ul>
            <p class="rj-fine">Gezählt ist nur der Fernverkehr, so steht es in der Reisehistorie.</p>
          </div>
        </div>

        <svg class="rj-path" viewBox={netB.viewBox} role="img" aria-label="Die Railjet-Fahrt als Linie" preserveAspectRatio="xMidYMid meet">
          <path d={dB} class="rj-ghost" stroke-width={3 * rjScale} />
          <path bind:this={elB} d={dB} class="measure" />
          <path d={dB} class="rj-run" pathLength="1" stroke-dasharray="1" stroke-dashoffset={1 - fB} stroke-width={5 * rjScale} />
          {#if headB}
            <circle cx={headB.x} cy={headB.y} r={8 * rjScale} class="rj-head" stroke-width={4 * rjScale} />
          {/if}
        </svg>
      </div>
    {/if}
  </div>
</section>

<style>
  .sc-stage {
    grid-template-columns: minmax(0, 6fr) minmax(0, 6fr);
    align-items: center;
    column-gap: clamp(1rem, 4vw, 4rem);
  }

  .copy {
    display: grid;
    gap: clamp(0.9rem, 2.6vh, 1.7rem);
  }

  .counter {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    font-family: var(--display);
    font-weight: 800;
    letter-spacing: -0.035em;
    font-size: clamp(3.4rem, 9vw, 8rem);
    line-height: 1;
  }

  .odo-wrap {
    display: inline-block;
    height: 1em;
  }

  .unit {
    font-size: 0.4em;
    color: var(--s-mute);
  }

  /* Die Züge der Fahrt: ICE als rote Schilder, TGV als rosa Pille im Stil von inOui */
  .chips {
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .chip {
    padding: 0.3rem 0.75rem;
    font-weight: 800;
    font-size: 0.88rem;
    letter-spacing: 0.02em;
    font-variant-numeric: tabular-nums;
  }

  .chip.db {
    background: var(--red);
    color: #fff;
    border-radius: 0.375rem;
  }

  .chip.sncf {
    background: #ff6fae;
    color: #1b1133;
    border-radius: 62.4375rem;
    font-family: "Poppins", var(--sans);
    font-weight: 700;
  }

  .chip.oebb {
    background: #fff;
    color: #2a2d31;
    border-radius: 0.375rem;
  }

  .path {
    width: 100%;
    max-height: calc(100svh - var(--bar-h) - 3rem);
    overflow: visible;
  }

  path {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .ghost {
    stroke: var(--s-soft);
    stroke-width: 3;
  }

  .measure {
    stroke: none;
  }

  .run {
    stroke-width: 5;
  }

  .end circle {
    fill: #fff;
  }

  .end text {
    fill: #fff;
    font-weight: 700;
    font-size: 17px;
    font-family: var(--sans);
  }

  .head {
    fill: #fff;
    stroke-width: 4;
  }

  /* ---- B: Railjet ---- */
  .railjet {
    position: absolute;
    inset: 0;
    z-index: 10;
    padding: calc(var(--bar-h) + 1.25rem) var(--pad) clamp(1.5rem, 4vh, 3rem);
    display: grid;
    grid-template-columns: minmax(0, 6fr) minmax(0, 5fr);
    align-items: center;
    column-gap: clamp(1rem, 4vw, 4rem);
    background: #e7e9eb;
    color: #2a2d31;
    font-family: "Source Sans 3", var(--sans);
  }

  .rj-copy {
    display: grid;
    gap: clamp(0.9rem, 2.6vh, 1.6rem);
    min-width: 0;
  }

  .rj-say {
    font-family: "Source Sans 3", var(--display);
    font-weight: 700;
    font-size: clamp(2rem, 4.6vw, 4.4rem);
    line-height: 1;
    letter-spacing: -0.01em;
    text-transform: uppercase;
  }

  .ticket {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) auto minmax(0, 1fr);
    max-width: 44rem;
    background: #fff;
    border-radius: var(--r);
    box-shadow: 0 0 0 1px #c3c7cc;
  }

  .route {
    display: grid;
    align-content: center;
    gap: 0.1rem;
    padding: 1.1rem 1.4rem;
  }

  .lbl {
    font-size: 0.74rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #565c64;
  }

  .route b {
    font-size: clamp(1.4rem, 2.8vw, 2.2rem);
    font-weight: 700;
    line-height: 1.1;
    margin-bottom: 0.4rem;
  }

  .perf {
    width: 0;
    border-left: 2px dashed #c3c7cc;
    margin-block: 0.8rem;
  }

  .meta {
    display: grid;
    align-content: center;
    gap: 0.55rem;
    padding: 1.1rem 1.4rem;
  }

  .meta dt {
    font-size: 0.74rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #565c64;
  }

  .meta dd {
    font-size: 1.2rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  /* Anbieter des Jahres: ein Balken, jede Farbe ein Anbieter */
  .mix {
    display: grid;
    gap: 0.5rem;
    max-width: 44rem;
  }

  .mix-title {
    font-size: 0.74rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #565c64;
  }

  .bar {
    display: flex;
    gap: 0.1875rem;
    height: clamp(1.4rem, 3.4vh, 2rem);
    overflow: hidden;
  }

  .bar i {
    display: block;
    border-radius: 0.25rem;
    min-width: 0.375rem;
  }

  .legend {
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1.2rem;
    font-size: 0.95rem;
    font-weight: 600;
  }

  .legend li {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .legend i {
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 0.1875rem;
  }

  .rj-fine {
    font-size: 0.82rem;
    color: #565c64;
  }

  .rj-path {
    width: 100%;
    max-height: calc(100svh - var(--bar-h) - 3rem);
    overflow: visible;
  }

  .rj-ghost {
    stroke: #c9cdd1;
  }

  .rj-run {
    stroke: #d5001c;
  }

  .rj-head {
    fill: #fff;
    stroke: #2a2d31;
  }

  @media (max-width: 860px) {
    .sc-stage,
    .railjet {
      grid-template-columns: 1fr;
      grid-template-rows: auto minmax(0, 1fr);
      align-content: start;
    }

    /* Die Zeichnung füllt nur die Fläche unter dem Text, sie ragt nicht darüber hinaus */
    .rj-path {
      max-height: none;
      height: 100%;
      min-height: 0;
      overflow: hidden;
    }

    .railjet {
      overflow: hidden;
    }

    .ticket {
      grid-template-columns: 1fr;
    }

    .perf {
      width: auto;
      height: 0;
      border-left: none;
      border-top: 2px dashed #c3c7cc;
      margin: 0 0.9rem;
    }
  }
</style>
