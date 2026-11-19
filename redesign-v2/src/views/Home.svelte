<script>
  // Startseite "Die Fahrt": du fährst durch dein Jahr, jeder Abschnitt ist ein Halt mit Bahnhofsschild.
  // Alle Zahlen kommen aus deinen Daten (routes.geojson, stations.json).
  import { onMount } from "svelte";
  import { gsap, ScrollTrigger, reduce, countTo, magnet, tilt, reveal } from "../lib/motion.js";
  import { nf } from "../lib/format.js";
  import { makeNet } from "../lib/net.js";
  import Odometer from "../components/Odometer.svelte";
  import Train3D from "../components/Train3D.svelte";
  import StationSign from "../components/StationSign.svelte";
  import Radar from "../components/Radar.svelte";
  import Pour from "../components/Pour.svelte";
  import Quiz from "../components/Quiz.svelte";

  let { data } = $props();
  const { trips, stations, stats } = data;
  const net = makeNet(trips, stations, 34);
  const EARTH = 40075; // Erdumfang in km (bekannte Konstante)
  const pct = stats.km / EARTH;
  const RING = 2 * Math.PI * 120;
  const hourCells = Math.round(stats.hours);
  const days = Math.floor(stats.hours / 24);
  const restH = Math.round(stats.hours - days * 24);
  const marquee = [...stations].sort((a, b) => b.visits - a.visits);

  let root;
  let km = $state(reduce ? stats.km : 0);
  let heroLens = $state([]);
  let heroPaths = [];
  let ringPct = $state(reduce ? pct : 0);
  const ringLabel = $derived(ringPct >= 0.1 ? String(Math.round(ringPct * 100)) : (Math.round(ringPct * 1000) / 10).toFixed(1).replace(".", ","));

  onMount(() => {
    heroLens = heroPaths.map((e) => e.getTotalLength());
    const ctx = gsap.context(() => {
      if (!reduce) {
        // ---- Hero ----
        gsap.from(".hw", { yPercent: 118, duration: 1.1, ease: "power4.out", stagger: 0.08, delay: 0.1 });
        gsap.from(".hf", { opacity: 0, y: 22, duration: 0.9, ease: "power3.out", stagger: 0.12, delay: 0.9 });
        gsap.from(".hero-3d", { opacity: 0, x: 90, duration: 1.5, ease: "power4.out", delay: 0.4 });
        countTo(stats.km, (v) => (km = v), { duration: 2.8, delay: 0.5 });
        gsap.fromTo(".hero .net", { strokeDashoffset: (i) => heroLens[i] }, { strokeDashoffset: 0, duration: 2.6, ease: "power2.inOut", stagger: 0.09, delay: 0.3 });
        // Beim Wegscrollen schiebt sich der Text nach oben und blasst aus, der Zug fährt nach rechts hinaus
        gsap.to(".hero-copy", { yPercent: -16, opacity: 0.1, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
        gsap.to(".hero-3d", { xPercent: 70, opacity: 0, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom 30%", scrub: true } });
      }

      // kleine Züge auf dem Netz
      let raf = 0;
      const trains = [...root.querySelectorAll(".hero .train")];
      const T0 = performance.now();
      const frame = (now) => {
        raf = requestAnimationFrame(frame);
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
          for (let k = 0; k <= 5; k++) {
            const pt = heroPaths[i].getPointAtLength((a + ((b - a) * k) / 5) * len);
            d += (k ? "L" : "M") + pt.x.toFixed(1) + " " + pt.y.toFixed(1);
          }
          el.setAttribute("d", d);
        });
      };
      if (!reduce) {
        raf = requestAnimationFrame(frame);
        ScrollTrigger.create({
          trigger: ".hero",
          start: "top top",
          end: "bottom top",
          onToggle: (self) => {
            cancelAnimationFrame(raf);
            if (self.isActive) raf = requestAnimationFrame(frame);
          },
        });
      }

      if (!reduce) {
        // ---- Bahnhofsband: Tempo und Neigung folgen dem Scrollen ----
        const a = gsap.to(".row-a", { xPercent: -50, ease: "none", duration: 70, repeat: -1 });
        const b = gsap.fromTo(".row-b", { xPercent: -50 }, { xPercent: 0, ease: "none", duration: 80, repeat: -1 });
        const skew = gsap.quickTo(".band", "skewY", { duration: 0.5, ease: "power3.out" });
        ScrollTrigger.create({
          trigger: ".band-wrap",
          start: "top bottom",
          end: "bottom top",
          onUpdate: (self) => {
            const v = self.getVelocity();
            skew(Math.max(-4, Math.min(4, v / -400)));
            gsap.to([a, b], { timeScale: 1 + Math.min(6, Math.abs(v) / 300), duration: 0.3, overwrite: true });
            gsap.to([a, b], { timeScale: 1, duration: 1.2, delay: 0.3 });
          },
        });

        // ---- Strecke: Ring füllt sich ----
        const o = { v: 0 };
        gsap.to(o, { v: pct, ease: "none", onUpdate: () => (ringPct = o.v), scrollTrigger: { trigger: ".ring-sec", start: "top 70%", end: "bottom 50%", scrub: 0.6 } });
        gsap.from(".fact", { y: 50, opacity: 0, duration: 0.9, ease: "power3.out", stagger: 0.12, scrollTrigger: { trigger: ".facts", start: "top 88%", once: true } });

        // ---- Zeit: Stundenfenster leuchten nacheinander ----
        gsap.fromTo(".hcell", { scale: 0.2, opacity: 0.15 }, { scale: 1, opacity: 1, stagger: 0.03, ease: "back.out(2)", scrollTrigger: { trigger: ".hours", start: "top 80%", end: "bottom 55%", scrub: 0.8 } });

        // ---- Karte-Vorschau: kippt beim Erscheinen auf ----
        gsap.from(".peek", { rotationX: 55, y: 80, opacity: 0, transformPerspective: 1100, transformOrigin: "50% 100%", duration: 1.4, ease: "power4.out", scrollTrigger: { trigger: ".peek", start: "top 90%", once: true } });
      }
    }, root);

    document.fonts?.ready.then(() => ScrollTrigger.refresh());
    return () => ctx.revert();
  });
</script>

<main class="page" bind:this={root}>
  <!-- ============ Abfahrt ============ -->
  <section class="hero">
    <svg class="net-bg" viewBox={net.viewBox} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {#each net.paths as d, i}
        <path {d} class="net" bind:this={heroPaths[i]} style:stroke-dasharray={heroLens[i] || 99999} />
      {/each}
      {#each net.paths as _}<path d="" class="train" />{/each}
    </svg>

    <div class="hero-copy">
      <p class="mono kick hf">Bahnjahr 2026 · Jonas' Bordbistro</p>
      <h1>
        <span class="mask"><span class="hw">Ich bin</span></span>
        <span class="mask"><span class="hw red num"><Odometer value={km} digits={4} label="{nf(stats.km)} " /></span></span>
        <span class="mask"><span class="hw">Kilometer</span></span>
        <span class="mask"><span class="hw"><span class="acc">Zug</span> gefahren.</span></span>
      </h1>
      <p class="lead hf">{stats.trips} Fahrten, {stats.stations} Bahnhöfe, ein Jahr. Setz dich, ich erzähl's dir beim Bier.</p>
      <div class="cta hf">
        <a class="btn" href="#/karte" use:magnet data-cursor="Los">Zur Karte <span aria-hidden="true">→</span></a>
        <a class="btn ghost" href="#/fahrten" use:magnet>Zum Tisch</a>
      </div>
    </div>

    <div class="hero-3d"><Train3D size={1} /></div>
    <p class="mono scroll-hint hf">Weiterscrollen ↓</p>
  </section>

  <!-- ============ Bahnhofsband ============ -->
  <section class="band-wrap" aria-label="Bahnhöfe, nach Besuchen sortiert">
    <div class="band" aria-hidden="true">
      <div class="row row-a">
        {#each [0, 1] as _}{#each marquee as s, i}{#if i % 2 === 0}<span class:big={s.visits >= 5}>{s.name}<sup>{s.visits}×</sup></span>{/if}{/each}{/each}
      </div>
      <div class="row row-b">
        {#each [0, 1] as _}{#each marquee as s, i}{#if i % 2 === 1}<span class:big={s.visits >= 5}>{s.name}<sup>{s.visits}×</sup></span>{/if}{/each}{/each}
      </div>
    </div>
  </section>

  <!-- ============ Halt 1: Knoten ============ -->
  <section class="halt knot">
    <div class="hcopy">
      <StationSign no={1} name={stats.top.name} sub="Mein Knoten" />
      <h2 use:reveal>{stats.top.visits}× <span class="acc red">hier.</span></h2>
      <p class="lead" use:reveal>Von hier aus startet fast alles. Jeder Strahl ist eine Fahrt: die Richtung zeigt, wohin sie am weitesten führt, die Länge sind die Kilometer.</p>
    </div>
    <Radar {trips} center={stats.top.coords} />
  </section>

  <!-- ============ Halt 2: Strecke ============ -->
  <section class="halt ring-sec">
    <div class="ring-wrap">
      <svg viewBox="0 0 300 300" class="ring-svg" role="img" aria-label="{Math.round(pct * 100)} Prozent vom Erdumfang">
        <circle cx="150" cy="150" r="120" class="rtrack" />
        <circle cx="150" cy="150" r="120" class="rfill" stroke-dasharray={RING} stroke-dashoffset={RING * (1 - ringPct)} transform="rotate(-90 150 150)" />
        <text x="150" y="158" text-anchor="middle" class="rnum">{ringLabel} %</text>
        <text x="150" y="186" text-anchor="middle" class="rsub">vom Erdumfang</text>
      </svg>
    </div>
    <div class="hcopy">
      <StationSign no={2} name="Strecke" sub="Kilometer des Jahres" />
      <h2 use:reveal>{nf(stats.km)} <span class="acc red">Kilometer.</span></h2>
      <p class="lead" use:reveal>Der Erdumfang am Äquator misst {nf(EARTH)} km. Mein Jahr füllt davon {Math.round(pct * 100)} Prozent.</p>
      <div class="facts">
        <div class="fact"><b>{stats.trips}</b><span class="mono">Fahrten</span></div>
        <div class="fact"><b>{nf(stats.longest.km)}</b><span class="mono">km längste Fahrt</span></div>
        <div class="fact"><b>{nf(stats.kmh)}</b><span class="mono">km/h im Schnitt</span></div>
      </div>
    </div>
  </section>

  <!-- ============ Halt 3: Zeit ============ -->
  <section class="halt hours">
    <div class="hcopy">
      <StationSign no={3} name="Zeit" sub="Stunden im Zug" />
      <h2 use:reveal>{days} Tage, {restH} <span class="acc red">Stunden.</span></h2>
      <p class="lead" use:reveal>Jedes Fenster ist eine Stunde, die ich im Zug saß: {nf(stats.hours, 0)} Stunden insgesamt.</p>
    </div>
    <div class="hgrid" aria-hidden="true">
      {#each Array(hourCells) as _, k}<i class="hcell" class:day={k % 24 === 23}></i>{/each}
    </div>
  </section>

  <!-- ============ Halt 4: Bier ============ -->
  <section class="halt pour-sec">
    <StationSign no={4} name="Bordbistro" sub="Gleis 1 · Getränkewagen" />
    <h2 use:reveal>Schenk das <span class="acc red">Jahr</span> ein.</h2>
    <Pour total={stats.km} tripsCount={stats.trips} />
  </section>

  <!-- ============ Halt 5: Schätzen ============ -->
  <section class="halt quiz-sec">
    <StationSign no={5} name="Schätz mal" sub="Vier Fragen" />
    <h2 use:reveal>Wie gut kennst du <span class="acc red">mein Jahr?</span></h2>
    <Quiz {stats} />
  </section>

  <!-- ============ Halt 6: Karte ============ -->
  <section class="halt final">
    <StationSign no={6} name="Endstation: Karte" sub="Alles auf einen Blick" />
    <h2 use:reveal>Und jetzt: <span class="acc red">fahren.</span></h2>
    <a class="peek" href="#/karte" use:tilt={7} data-cursor="Öffnen" aria-label="Zur Karte">
      <span class="shine"></span>
      <svg viewBox={net.viewBox} aria-hidden="true">
        {#each net.paths as d}<path {d} class="pnet" />{/each}
        {#each net.dots.filter((s) => s.visits > 3) as s}<circle cx={s.xy[0]} cy={s.xy[1]} r={3 + s.visits * 0.3} class="dot" />{/each}
      </svg>
      <span class="peek-btn btn">Karte öffnen <span aria-hidden="true">→</span></span>
    </a>
  </section>
</main>

<style>
  .ghost {
    visibility: hidden;
  }

  /* ---------- Hero ---------- */
  .hero {
    position: relative;
    min-height: 100svh;
    display: grid;
    grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
    align-items: end;
    gap: 2rem;
    padding: calc(var(--bar-h) + 1.5rem) var(--pad) clamp(2.5rem, 8vh, 5rem);
    overflow: hidden;
    isolation: isolate;
  }

  .net-bg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: -1;
    opacity: 0.6;
  }

  .net {
    fill: none;
    stroke: #5b7266;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .train {
    fill: none;
    stroke: var(--red);
    stroke-width: 3.8;
  }

  .kick {
    color: var(--ink-2);
    margin-bottom: 1.1rem;
  }

  .hero h1 {
    font-size: calc(var(--ds) * clamp(3rem, min(9.5vw, 17vh), 11rem));
    line-height: 0.9;
  }

  .hw {
    display: inline-block;
  }

  .num {
    font-variant-numeric: tabular-nums;
  }

  .lead {
    margin-top: clamp(1.2rem, 3vh, 2rem);
    max-width: 32rem;
    color: var(--ink-2);
    font-size: clamp(1.05rem, 1.5vw, 1.3rem);
  }

  .cta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
    margin-top: 1.6rem;
  }

  .hero-3d {
    align-self: center;
    justify-self: center;
  }

  .scroll-hint {
    position: absolute;
    right: var(--pad);
    bottom: 1.4rem;
    color: var(--ink-2);
  }

  /* ---------- Band ---------- */
  .band-wrap {
    position: relative;
    z-index: 1;
    overflow: hidden;
    padding: clamp(2.5rem, 7vh, 5rem) 0;
    background: var(--bg-2);
    border-block: 1px solid var(--line);
  }

  .band {
    display: grid;
    gap: clamp(0.3rem, 1.2vw, 1rem);
    will-change: transform;
  }

  .row {
    display: flex;
    gap: clamp(1.5rem, 4vw, 4rem);
    width: max-content;
    font-family: var(--font-display);
    font-weight: var(--fw);
    font-size: calc(var(--ds) * clamp(2.6rem, 8vw, 8rem));
    letter-spacing: var(--ls);
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

  /* ---------- Halte ---------- */
  .halt {
    position: relative;
    z-index: 1;
    padding: clamp(5rem, 14vh, 9rem) var(--pad);
    max-width: 84rem;
    margin: 0 auto;
  }

  .halt h2 {
    font-size: calc(var(--ds) * clamp(2.8rem, 8vw, 8rem));
    margin: 1.4rem 0 1.2rem;
  }

  .halt .lead {
    margin-top: 0;
  }

  .knot,
  .ring-sec,
  .hours {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: clamp(2rem, 5vw, 5rem);
    align-items: center;
  }

  /* Ring */
  .ring-svg {
    width: min(100%, 28rem);
    display: block;
    margin: 0 auto;
    filter: drop-shadow(0 16px 30px rgba(0, 0, 0, 0.4));
  }

  .rtrack {
    fill: none;
    stroke: var(--bg-3);
    stroke-width: 26;
  }

  .rfill {
    fill: none;
    stroke: var(--red);
    stroke-width: 26;
    stroke-linecap: round;
  }

  .rnum {
    font: 800 58px var(--font-display);
    letter-spacing: -0.03em;
    fill: var(--ink);
  }

  .rsub {
    font: 500 11px var(--font-mono);
    letter-spacing: 0.1em;
    fill: var(--ink-2);
    text-transform: uppercase;
  }

  .facts {
    display: grid;
    grid-template-columns: repeat(3, auto);
    justify-content: start;
    gap: 1rem 2.4rem;
    margin-top: 2rem;
  }

  .fact b {
    display: block;
    font-family: var(--font-display);
    font-weight: var(--fw);
    font-size: calc(var(--ds) * clamp(2rem, 3.6vw, 3.2rem));
    letter-spacing: var(--ls);
    line-height: 1;
  }

  .fact span {
    color: var(--ink-2);
  }

  /* Stunden */
  .hgrid {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 0.5rem;
  }

  .hcell {
    aspect-ratio: 1;
    border-radius: 0.5rem 0.5rem 0.25rem 0.25rem;
    background: linear-gradient(160deg, #3b4f7a, #1a2340);
    box-shadow: inset 0 0 0 2px #0e1424, 0 0 0 1px rgba(243, 234, 215, 0.2);
  }

  .hcell.day {
    background: linear-gradient(160deg, #ff6a78, var(--red));
  }

  /* Bier, Quiz, Finale */
  .pour-sec,
  .quiz-sec,
  .final {
    display: grid;
    justify-items: start;
  }

  .pour-sec :global(.pour) {
    width: 100%;
    margin-top: 1rem;
  }

  .peek {
    position: relative;
    display: block;
    width: min(100%, 60rem);
    margin-top: 2rem;
    padding: clamp(1rem, 3vw, 2.4rem);
    border-radius: 2rem;
    background: var(--paper);
    box-shadow: 0 40px 80px rgba(0, 0, 0, 0.5), inset 0 0 0 3px var(--paper), inset 0 0 0 5px #d9ccaa;
    text-decoration: none;
    overflow: hidden;
    transform-style: preserve-3d;
  }

  .peek svg {
    width: 100%;
    max-height: 26rem;
    display: block;
  }

  .pnet {
    fill: none;
    stroke: var(--red);
    stroke-width: 3.2;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.85;
  }

  .peek .dot {
    fill: var(--paper);
    stroke: var(--paper-ink);
    stroke-width: 2;
  }

  .shine {
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at var(--gx, 50%) var(--gy, 0%), rgba(255, 255, 255, 0.55), transparent 55%);
    pointer-events: none;
    z-index: 1;
  }

  .peek-btn {
    position: absolute;
    left: 50%;
    bottom: 1.6rem;
    translate: -50% 0;
    z-index: 2;
  }

  @media (max-width: 860px) {
    .hero {
      grid-template-columns: minmax(0, 1fr);
      align-items: start;
      padding-bottom: 5rem;
    }

    .hero-3d {
      order: -1;
      margin-top: 0.5rem;
      transform: scale(0.8);
      justify-self: start;
      margin-bottom: -2rem;
    }

    .hero h1 {
      font-size: calc(var(--ds) * clamp(2.8rem, 13.5vw, 6rem));
    }

    .hero-copy,
    .lead {
      min-width: 0;
      max-width: 100%;
      overflow-wrap: break-word;
    }

    .knot,
    .ring-sec,
    .hours {
      grid-template-columns: minmax(0, 1fr);
    }

    .hgrid {
      grid-template-columns: repeat(8, minmax(0, 1fr));
    }

    .facts {
      grid-template-columns: repeat(2, auto);
    }
  }
</style>
