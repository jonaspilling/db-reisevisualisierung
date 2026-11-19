<script>
  // "Der Tisch": 16 Biergläser (Füllstand = Kilometer), Fahrplan zum Aufklappen, Kalender-Heatmap, 24-Stunden-Uhr.
  import { onMount, tick } from "svelte";
  import { gsap, ScrollTrigger, reduce, reveal, stagger, countTo } from "../lib/motion.js";
  import { nf, hm } from "../lib/format.js";
  import { makeMini } from "../lib/net.js";
  import Beer from "../components/Beer.svelte";

  let { data } = $props();
  const { trips, stations, stats } = data;
  const maxKm = Math.max(...trips.map((t) => t.km));

  let root;
  let sel = $state(-1); // gewählte Fahrt (Index)
  let open = $state(-1); // aufgeklappte Zeile im Fahrplan
  let hover = $state(-1);
  const MARKS = [250, 500, 750]; // Eichstriche im Glas, in Kilometern
  const markFrac = MARKS.map((m) => m / maxKm);
  let gsort = $state("date");
  const order = $derived(
    trips.map((_, i) => i).sort((a, b) => (gsort === "km" ? trips[b].km - trips[a].km || a - b : a - b))
  );
  let grow = $state(trips.map(() => (reduce ? 1 : 0))); // Füllgrad der Gläser beim Einlaufen (0 bis 1)
  const minis = trips.map((t) => makeMini(t, stations));

  // ---- Kalender: Tage des Jahres 2026 (Mo oben) ----
  const dayOf = (t) => { const [d, m] = t.datum.split("."); return Math.floor((new Date(2026, +m - 1, +d) - new Date(2026, 0, 1)) / 86400000); };
  const byDay = new Map(trips.map((t, i) => [dayOf(t), i]));
  const jan1 = (new Date(2026, 0, 1).getDay() + 6) % 7; // Wochentag des 1. Januar, Mo = 0
  const cells = Array.from({ length: 53 * 7 }, (_, k) => {
    const day = k - jan1;
    const w = Math.floor(k / 7), d = k % 7;
    return { w, d, day, trip: byDay.has(day) ? byDay.get(day) : -1, valid: day >= 0 && day < 365 };
  });
  const months = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  const monthX = months.map((_, m) => Math.floor((Math.floor((new Date(2026, m, 1) - new Date(2026, 0, 1)) / 86400000) + jan1) / 7));
  let calTip = $state(null);

  // ---- 24-Stunden-Uhr ----
  const clock = trips.map((t, i) => {
    const [h, m] = t.abfahrt.split(":").map(Number);
    const a = ((h + m / 60) / 24) * Math.PI * 2 - Math.PI / 2;
    return { i, a, h, m };
  });
  const earliest = clock.reduce((a, c) => (c.h + c.m / 60 < a.h + a.m / 60 ? c : a), clock[0]);

  onMount(() => {
    const ctx = gsap.context(() => {
      if (!reduce) {
        gsap.from(".title .l", { yPercent: 115, duration: 1.1, ease: "power4.out", stagger: 0.1, delay: 0.1 });
        // Gläser füllen sich nacheinander
        // Ein einziger Zeitstrahl füllt die Gläser nacheinander (statt 16 einzelner Tweens)
        const o = { p: 0 };
        const each = 0.06, dur = 1.4, total = dur + each * (trips.length - 1);
        const ease = gsap.parseEase("power3.out");
        gsap.to(o, {
          p: total,
          duration: total,
          ease: "none",
          delay: 0.5,
          onUpdate: () => (grow = trips.map((_, i) => ease(Math.min(1, Math.max(0, (o.p - i * each) / dur))))),
        });
        // Kalender-Zellen
        gsap.from(".cal rect.d", { scale: 0, opacity: 0, transformOrigin: "50% 50%", duration: 0.5, stagger: { each: 0.0015, from: "start" }, ease: "power2.out", scrollTrigger: { trigger: ".cal", start: "top 80%", once: true } });
        // Uhr: Striche wachsen
        gsap.from(".clk-hand", { attr: { x2: 160, y2: 160 }, duration: 1.2, ease: "power3.out", stagger: 0.07, scrollTrigger: { trigger: ".clock", start: "top 75%", once: true } });
        gsap.from(".clock .ring", { scale: 0.6, opacity: 0, transformOrigin: "50% 50%", duration: 1, ease: "power3.out", scrollTrigger: { trigger: ".clock", start: "top 80%", once: true } });
      }
    }, root);
    document.fonts?.ready.then(() => ScrollTrigger.refresh());
    return () => ctx.revert();
  });

  async function pick(i) {
    sel = sel === i ? -1 : i;
    if (sel >= 0 && !reduce) {
      await tick();
      gsap.fromTo(".detail", { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: "power3.out" });
      // Länge messen und in Pixeln zeichnen (nicht über pathLength, das manche Handys falsch umsetzen)
      const line = root.querySelector(".detail .mini-line");
      const len = line.getTotalLength();
      gsap.fromTo(line, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 1.2, ease: "power2.inOut" });
    }
  }
</script>

<main class="page table" bind:this={root}>
  <section class="hero">
    <p class="mono kick">Der Tisch</p>
    <h1 class="title">
      <span class="mask"><span class="l">Auf den</span></span>
      <span class="mask"><span class="l"><span class="acc red">Tisch.</span></span></span>
    </h1>
    <p class="lead">Ein Glas pro Fahrt. Je länger die Strecke, desto voller das Glas. Das längste (928 km) ist randvoll.</p>
  </section>

  <!-- ===== Gläser ===== -->
  <section class="glasses-sec" aria-label="Die Fahrten als Biergläser">
    <div class="gtools">
      <div class="seg" role="group" aria-label="Reihenfolge der Gläser">
        <button type="button" class:on={gsort === "date"} onclick={() => (gsort = "date")}>Nach Datum</button>
        <button type="button" class:on={gsort === "km"} onclick={() => (gsort = "km")}>Nach Länge</button>
      </div>
      <p class="mono legend">Gestrichelt im Glas: {MARKS.join(" · ")} km. Der Füllstand ist maßstabsgetreu.</p>
    </div>
    <div class="glasses">
      {#each order as i (i)}
        {@const t = trips[i]}
        {@const f = t.km / maxKm}
        <button
          type="button"
          class="glass-b"
          class:on={sel === i}
          onclick={() => pick(i)}
          onpointerenter={() => (hover = i)}
          onpointerleave={() => (hover = -1)}
          aria-label="{t.von} nach {t.nach}, {nf(t.km)} Kilometer"
        >
          <Beer fill={f * grow[i]} id="g{i}" stroke={7} bubbles={3} over={f === 1 && grow[i] === 1} marks={markFrac} />
          <b>{nf(t.km)}<small> km</small></b>
          <span class="mono">{t.datum.slice(0, 5)}</span>
        </button>
      {/each}
    </div>

    {#if sel >= 0}
      {@const t = trips[sel]}
      {@const m = minis[sel]}
      <div class="detail">
        <div class="d-text">
          <p class="mono">Fahrt {t.no} von {trips.length}</p>
          <h3>{t.von}<br /><span class="red">→</span> {t.nach}</h3>
          <dl>
            <div><dt class="mono">Datum</dt><dd>{t.datum}</dd></div>
            <div><dt class="mono">Zeit</dt><dd>{t.abfahrt}–{t.ankunft}</dd></div>
            <div><dt class="mono">Dauer</dt><dd>{hm(t.minutes)}</dd></div>
            <div><dt class="mono">Strecke</dt><dd>{nf(t.km)} km</dd></div>
            <div><dt class="mono">Zug</dt><dd>{t.zuege}</dd></div>
          </dl>
        </div>
        <svg viewBox={m.viewBox} class="mini" role="img" aria-label="Streckenverlauf">
          <path d={m.d} class="mini-line" />
          {#each m.stops as s}<circle cx={s.xy[0]} cy={s.xy[1]} r="3" class="stop" />{/each}
        </svg>
      </div>
    {:else}
      <p class="hint hand">↑ ein Glas antippen: dann siehst du die Fahrt</p>
    {/if}
  </section>

  <!-- ===== Fahrplan ===== -->
  <section class="plan">
    <h2 use:reveal>Der <span class="acc red">Fahrplan.</span></h2>
    <ol use:stagger={{ selector: "li", each: 0.05 }}>
      {#each trips as t, i}
        <li class:on={open === i}>
          <button type="button" onclick={() => (open = open === i ? -1 : i)} aria-expanded={open === i}>
            <span class="mono no">{String(t.no).padStart(2, "0")}</span>
            <span class="when mono">{t.datum.slice(0, 5)} · {t.abfahrt}</span>
            <span class="route"><b>{t.von}</b> <i>→</i> <b>{t.nach}</b></span>
            <span class="km">{nf(t.km)} km</span>
            <span class="chev" aria-hidden="true">+</span>
          </button>
          <div class="more" aria-hidden={open !== i}>
            <div class="more-in">
              <p class="mono">{t.zuege} · {t.abfahrt}–{t.ankunft} · {hm(t.minutes)}</p>
              <p class="stops">{t.halte.map((h) => stations.find((s) => s.key === h)?.name ?? h).join("  ·  ")}</p>
            </div>
          </div>
        </li>
      {/each}
    </ol>
  </section>

  <!-- ===== Kalender ===== -->
  <section class="cal-sec">
    <h2 use:reveal>Das <span class="acc red">Jahr</span> im Kalender.</h2>
    <p class="lead" use:reveal>Jedes Kästchen ein Tag von Januar bis Dezember. Rot: an diesem Tag war ich unterwegs.</p>
    <div class="cal-wrap">
      <svg class="cal" viewBox="0 0 640 140" role="img" aria-label="Kalender 2026 mit Fahrtagen">
        {#each months as m, i}<text x={26 + monthX[i] * 11.7} y="10" class="ml">{m}</text>{/each}
        {#each ["Mo", "Mi", "Fr"] as w, i}<text x="0" y={34 + i * 2 * 15 + 9} class="ml">{w}</text>{/each}
        {#each cells as c}
          {#if c.valid}
            <rect
              class="d"
              class:hit={c.trip >= 0}
              x={26 + c.w * 11.7}
              y={18 + c.d * 15}
              width="10"
              height="13"
              rx="2.5"
              role="presentation"
              onpointerenter={() => c.trip >= 0 && (calTip = c.trip)}
              onpointerleave={() => (calTip = null)}
              onclick={() => c.trip >= 0 && pick(c.trip)}
            />
          {/if}
        {/each}
      </svg>
      <p class="cal-tip mono">{calTip !== null ? `${trips[calTip].datum} · ${trips[calTip].von} → ${trips[calTip].nach} · ${nf(trips[calTip].km)} km` : `${trips.length} Fahrtage in 365 Tagen`}</p>
    </div>
  </section>

  <!-- ===== Uhr ===== -->
  <section class="clock">
    <div class="clock-copy">
      <h2 use:reveal>Wann ich <span class="acc red">losfahre.</span></h2>
      <p class="lead" use:reveal>Jeder rote Strich ist eine Abfahrt auf dem 24-Stunden-Zifferblatt. Früheste: <b>{earliest.h}:{String(earliest.m).padStart(2, "0")} Uhr</b>.</p>
    </div>
    <svg class="clk" viewBox="0 0 320 320" role="img" aria-label="Abfahrtszeiten auf einem 24-Stunden-Zifferblatt">
      <circle class="ring" cx="160" cy="160" r="148" />
      {#each Array(24) as _, h}
        {@const a = (h / 24) * Math.PI * 2 - Math.PI / 2}
        <line x1={160 + Math.cos(a) * 134} y1={160 + Math.sin(a) * 134} x2={160 + Math.cos(a) * 146} y2={160 + Math.sin(a) * 146} class="tick" class:big={h % 6 === 0} />
        {#if h % 6 === 0}<text x={160 + Math.cos(a) * 118} y={166 + Math.sin(a) * 118} text-anchor="middle" class="hl">{h}</text>{/if}
      {/each}
      {#each clock as c}
        <line class="clk-hand" x1="160" y1="160" x2={160 + Math.cos(c.a) * 98} y2={160 + Math.sin(c.a) * 98} />
        <circle cx={160 + Math.cos(c.a) * 98} cy={160 + Math.sin(c.a) * 98} r="4" class="clk-dot" />
      {/each}
      <circle cx="160" cy="160" r="6" fill="var(--red)" />
    </svg>
  </section>
</main>

<style>
  .table {
    background: linear-gradient(var(--bg), var(--bg-2) 50%, var(--bg));
  }

  .hero {
    padding: calc(var(--bar-h) + 4rem) var(--pad) 3rem;
    position: relative;
    z-index: 1;
    max-width: 82rem;
    margin: 0 auto;
  }

  .kick {
    color: var(--ink-2);
    margin-bottom: 1rem;
  }

  .title {
    font-size: calc(var(--ds) * clamp(3.6rem, 13vw, 12rem));
    line-height: 0.88;
  }

  .l {
    display: inline-block;
  }

  .lead {
    margin-top: 1.4rem;
    max-width: 34rem;
    color: var(--ink-2);
    font-size: clamp(1.05rem, 1.5vw, 1.25rem);
  }

  .lead b {
    color: var(--ink);
  }

  /* ---- Gläser ---- */
  .glasses-sec {
    padding: 1rem var(--pad) clamp(4rem, 10vh, 7rem);
    max-width: 82rem;
    margin: 0 auto;
  }

  .gtools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem 1.4rem;
    margin-bottom: 1rem;
  }

  .seg {
    display: flex;
    padding: 0.25rem;
    border-radius: 99px;
    border: 1px solid var(--line);
  }

  .seg button {
    padding: 0.45rem 1rem;
    border-radius: 99px;
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--ink-2);
    transition: background-color 250ms var(--ease), color 250ms var(--ease);
  }

  .seg button.on {
    background: var(--ink);
    color: var(--bg);
  }

  .legend {
    color: var(--ink-2);
    font-size: 0.8rem;
  }

  .glasses {
    display: grid;
    grid-template-columns: repeat(16, minmax(0, 1fr));
    gap: 4px;
    align-items: end;
    padding: 2rem 1.2rem 1.4rem;
    border-radius: 1.6rem 1.6rem 0 0;
    background: linear-gradient(var(--bg-2), var(--bg-3));
    /* Die Holzplatte des Tresens: zwei Streifen unter den Gläsern (statt eines Rahmens an der runden Kante) */
    box-shadow: 0 14px 0 var(--wood-2), 0 28px 0 var(--wood);
    margin-bottom: 28px;
  }

  .glass-b {
    display: grid;
    justify-items: center;
    gap: 0.2rem;
    min-width: 0;
    padding: 0.2rem 0;
    transition: transform 300ms var(--ease);
  }

  .glass-b :global(svg) {
    width: 100%;
    height: auto;
    max-width: 74px;
    overflow: visible;
    transition: filter 300ms var(--ease);
  }

  .glass-b:hover,
  .glass-b.on {
    transform: translateY(-10px) rotate(-2deg);
  }

  .glass-b.on :global(svg) {
    filter: drop-shadow(0 0 10px rgba(242, 183, 5, 0.5));
  }

  .glass-b b {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: clamp(0.8rem, 1.5vw, 1.1rem);
    letter-spacing: -0.03em;
  }

  .glass-b b small {
    font-size: 0.6em;
    color: var(--ink-2);
    font-weight: 500;
  }

  .glass-b .mono {
    font-size: 0.6rem;
    color: var(--ink-2);
    letter-spacing: 0.02em;
  }

  .hint {
    margin-top: 2.2rem;
    text-align: center;
    color: var(--beer);
    font-size: 1.9rem;
  }

  .detail {
    margin-top: 2.2rem;
    display: grid;
    grid-template-columns: minmax(0, 6fr) minmax(0, 5fr);
    gap: 2rem;
    padding: clamp(1.2rem, 3vw, 2.2rem);
    border-radius: 1.6rem;
    background: var(--paper);
    color: var(--paper-ink);
    align-items: center;
  }

  .detail h3 {
    font-size: clamp(2rem, 4.4vw, 4rem);
    margin: 0.4rem 0 1.2rem;
  }

  .detail .mono {
    color: var(--paper-ink-2);
  }

  .detail dl {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
    gap: 0.8rem 1.4rem;
  }

  .detail dt {
    margin-bottom: 0.1rem;
  }

  .detail dd {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.25rem;
    letter-spacing: -0.02em;
  }

  .mini {
    width: 100%;
    max-height: 22rem;
  }

  .mini-line {
    fill: none;
    stroke: var(--red);
    stroke-width: 4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .stop {
    fill: var(--paper);
    stroke: var(--paper-ink);
    stroke-width: 2;
  }

  /* ---- Fahrplan ---- */
  .plan {
    padding: clamp(3rem, 8vh, 6rem) var(--pad);
    max-width: 82rem;
    margin: 0 auto;
  }

  .plan h2,
  .cal-sec h2,
  .clock h2 {
    font-size: calc(var(--ds) * clamp(2.4rem, 7vw, 7rem));
    margin-bottom: 1.6rem;
  }

  .plan ol {
    list-style: none;
    padding: 0;
    border-top: 1px solid var(--line);
  }

  .plan li {
    border-bottom: 1px solid var(--line);
  }

  .plan li button {
    width: 100%;
    display: grid;
    grid-template-columns: 2.4rem 9rem minmax(0, 1fr) auto 2rem;
    gap: 1rem;
    align-items: center;
    padding: 1.1rem 0.4rem;
    text-align: left;
    transition: background-color 250ms var(--ease), padding 250ms var(--ease);
  }

  .plan li button:hover {
    background: var(--bg-2);
    padding-inline: 1rem;
  }

  .no,
  .when {
    color: var(--ink-2);
  }

  .route {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: clamp(1.05rem, 2vw, 1.6rem);
    letter-spacing: -0.02em;
  }

  .route i {
    color: var(--red-ink);
    font-style: normal;
    margin: 0 0.2em;
  }

  .km {
    font-family: var(--font-mono);
    color: var(--beer);
  }

  .chev {
    font-size: 1.6rem;
    text-align: center;
    color: var(--red-ink);
    transition: transform 350ms var(--ease);
  }

  .plan li.on .chev {
    transform: rotate(45deg);
  }

  .more {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 450ms var(--ease);
  }

  .plan li.on .more {
    grid-template-rows: 1fr;
  }

  .more-in {
    overflow: hidden;
    display: grid;
    gap: 0.5rem;
    padding: 0 0.4rem 0 3.4rem;
    color: var(--ink-2);
  }

  .plan li.on .more-in {
    padding-bottom: 1.2rem;
  }

  .stops {
    max-width: 60rem;
    line-height: 1.7;
  }

  /* ---- Kalender ---- */
  .cal-sec {
    padding: clamp(3rem, 8vh, 6rem) var(--pad);
    max-width: 82rem;
    margin: 0 auto;
  }

  .cal-wrap {
    margin-top: 2rem;
    overflow-x: auto;
    padding-bottom: 0.6rem;
  }

  .cal {
    min-width: 640px;
    width: 100%;
    display: block;
  }

  .ml {
    font: 500 9px var(--font-mono);
    fill: var(--ink-2);
  }

  .cal .d {
    fill: var(--bg-3);
    transition: fill 200ms var(--ease);
  }

  .cal .d.hit {
    fill: var(--red);
    cursor: pointer;
  }

  .cal .d.hit:hover {
    fill: #ff6a78;
  }

  .cal-tip {
    margin-top: 1rem;
    min-height: 1.4em;
    color: var(--ink-2);
  }

  /* ---- Uhr ---- */
  .clock {
    display: grid;
    grid-template-columns: minmax(0, 6fr) minmax(0, 5fr);
    gap: 2rem;
    align-items: center;
    padding: clamp(3rem, 8vh, 6rem) var(--pad) clamp(4rem, 10vh, 8rem);
    max-width: 82rem;
    margin: 0 auto;
  }

  .clk {
    width: 100%;
    max-width: 30rem;
    justify-self: center;
  }

  .ring {
    fill: var(--bg-2);
    stroke: var(--line);
    stroke-width: 2;
  }

  .tick {
    stroke: var(--ink-2);
    stroke-width: 2;
  }

  .tick.big {
    stroke: var(--ink);
    stroke-width: 3;
  }

  .hl {
    font: 700 16px var(--font-display);
    fill: var(--ink);
  }

  .clk-hand {
    stroke: var(--red);
    stroke-width: 3;
    stroke-linecap: round;
    opacity: 0.85;
  }

  .clk-dot {
    fill: var(--bg);
    stroke: var(--red);
    stroke-width: 2.5;
  }

  @media (max-width: 860px) {
    .glasses {
      grid-template-columns: repeat(8, minmax(0, 1fr));
      row-gap: 1.6rem;
    }

    .detail,
    .clock {
      grid-template-columns: 1fr;
    }

    .plan li button {
      grid-template-columns: 2rem minmax(0, 1fr) auto;
      grid-template-areas: "no route km" "no when chev";
      gap: 0.2rem 0.8rem;
    }

    .no {
      grid-area: no;
    }

    .when {
      grid-area: when;
    }

    .route {
      grid-area: route;
    }

    .km {
      grid-area: km;
    }

    .chev {
      grid-area: chev;
    }

    .more-in {
      padding-left: 2.8rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .bub {
      animation: none;
    }
  }
</style>
