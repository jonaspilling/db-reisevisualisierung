<script>
  // Die Stempelkarte: alle Bahnhöfe als Stempelfelder, Zahl = Besuche. Klick zeigt die Fahrten über den Bahnhof.
  import { onMount, tick } from "svelte";
  import { gsap, ScrollTrigger, reduce, reveal, magnet } from "../lib/motion.js";
  import { nf } from "../lib/format.js";

  let { data } = $props();
  const { trips, stations, stats } = data;

  let sort = $state("visits");
  let sel = $state(null);
  let root;

  const list = $derived(
    [...stations].sort((a, b) => (sort === "visits" ? b.visits - a.visits || a.name.localeCompare(b.name, "de") : a.name.localeCompare(b.name, "de")))
  );
  const through = (key) => trips.filter((t) => t.halte.includes(key));
  const maxV = Math.max(...stations.map((s) => s.visits));
  // erste und letzte Fahrt über den Bahnhof (für die Rückseite des Stempels)
  const range = new Map(
    stations.map((s) => {
      const ts = trips.filter((t) => t.halte.includes(s.key));
      return [s.key, ts.length ? { first: ts[0].datum.slice(0, 5), last: ts[ts.length - 1].datum.slice(0, 5) } : null];
    })
  );
  const rot = (i) => ((i * 37) % 13) - 6;

  onMount(() => {
    const ctx = gsap.context(() => {
      if (reduce) return;
      gsap.from(".title .l", { yPercent: 115, duration: 1.1, ease: "power4.out", stagger: 0.1, delay: 0.1 });
      stamp();
    }, root);
    document.fonts?.ready.then(() => ScrollTrigger.refresh());
    return () => ctx.revert();
  });

  // Stempel schlagen nacheinander auf
  function stamp() {
    gsap.fromTo(
      ".stamp",
      { scale: 2.4, opacity: 0, rotation: (i) => rot(i) + 30 },
      { scale: 1, opacity: 1, rotation: (i) => rot(i), duration: 0.5, ease: "back.out(2.2)", stagger: 0.04, delay: 0.5, overwrite: true }
    );
  }

  async function setSort(s) {
    if (s === sort) return;
    sort = s;
    await tick();
    if (!reduce) stamp();
  }

  async function pick(s) {
    sel = sel?.key === s.key ? null : s;
    if (sel && !reduce) {
      await tick();
      gsap.fromTo(".panel", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: "power3.out" });
      gsap.from(".panel li", { x: -20, opacity: 0, stagger: 0.05, duration: 0.5, ease: "power3.out", delay: 0.1 });
    }
  }
</script>

<main class="page" bind:this={root}>
  <section class="hero">
    <p class="mono kick">Bonuskarte</p>
    <h1 class="title">
      <span class="mask"><span class="l">Meine</span></span>
      <span class="mask"><span class="l"><span class="acc red">Stempel.</span></span></span>
    </h1>
    <p class="lead">{stats.stations} Bahnhöfe auf {trips.length} Fahrten. Die Zahl im Stempel: wie oft ich dort war. {stats.top.name} ist mit {stats.top.visits}× unangefochten.</p>
  </section>

  <section class="card-sec">
    <div class="tools">
      <div class="seg" role="group" aria-label="Sortierung">
        <button type="button" class:on={sort === "visits"} onclick={() => setSort("visits")}>Nach Besuchen</button>
        <button type="button" class:on={sort === "az"} onclick={() => setSort("az")}>A–Z</button>
      </div>
      <p class="mono">{stations.length} Stempel</p>
    </div>

    <div class="card">
      {#each list as s, i (s.key)}
        <button type="button" class="stamp" class:on={sel?.key === s.key} style="--r:{rot(i)}deg; --w:{s.visits / maxV}" onclick={() => pick(s)} aria-label="{s.name}, {s.visits} Besuche">
          <span class="flip">
            <span class="ring front"><b>{s.visits}</b></span>
            <span class="ring back"><small>erstmals</small><em>{range.get(s.key)?.first}</em><small>zuletzt</small><em>{range.get(s.key)?.last}</em></span>
          </span>
          <span class="nm">{s.name}</span>
        </button>
      {/each}
    </div>

    {#if sel}
      <aside class="panel" aria-live="polite">
        <div>
          <p class="mono">Gestempelt</p>
          <h2>{sel.name}</h2>
          <p class="sub">{sel.visits}× besucht · {through(sel.key).length} Fahrten halten dort</p>
        </div>
        <ul>
          {#each through(sel.key) as t}
            <li><span class="mono">{t.datum.slice(0, 5)}</span><b>{t.von}</b> → <b>{t.nach}</b><i>{nf(t.km)} km</i></li>
          {/each}
        </ul>
        <button type="button" class="close mono" onclick={() => (sel = null)}>Schließen ×</button>
      </aside>
    {/if}
  </section>
</main>

<style>
  .hero {
    padding: calc(var(--bar-h) + 4rem) var(--pad) 2rem;
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
    max-width: 38rem;
    color: var(--ink-2);
    font-size: clamp(1.05rem, 1.5vw, 1.25rem);
  }

  .card-sec {
    padding: 2rem var(--pad) clamp(4rem, 10vh, 8rem);
    max-width: 82rem;
    margin: 0 auto;
  }

  .tools {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.2rem;
    color: var(--ink-2);
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

  .card {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(8.4rem, 1fr));
    gap: 1.6rem 0.8rem;
    padding: clamp(1.4rem, 3vw, 2.4rem);
    border-radius: 1.8rem;
    background: var(--paper);
    color: var(--paper-ink);
    background-image: radial-gradient(circle at 10% 0%, rgba(160, 120, 60, 0.14), transparent 45%);
    box-shadow: inset 0 0 0 3px var(--paper), inset 0 0 0 5px #d9ccaa;
  }

  .stamp {
    display: grid;
    justify-items: center;
    gap: 0.5rem;
    text-align: center;
    transform: rotate(var(--r));
    transition: transform 300ms var(--ease);
  }

  .stamp {
    perspective: 600px;
  }

  .stamp:hover,
  .stamp.on {
    transform: rotate(0deg) scale(1.08);
  }

  .flip {
    display: block;
    width: 5.4rem;
    height: 5.4rem;
    position: relative;
    transform-style: preserve-3d;
    transition: transform 700ms var(--ease);
  }

  .stamp:hover .flip,
  .stamp:focus-visible .flip,
  .stamp.on .flip {
    transform: rotateY(180deg);
  }

  .ring.front,
  .ring.back {
    position: absolute;
    inset: 0;
    backface-visibility: hidden;
  }

  .ring.back {
    transform: rotateY(180deg);
    align-content: center;
    justify-items: center;
    gap: 0;
    background: var(--red);
    color: #fff;
    box-shadow: inset 0 0 0 5px var(--red), inset 0 0 0 7px #fff;
  }

  .ring.back small {
    font: 500 0.52rem var(--font-mono);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.85;
  }

  .ring.back em {
    font: 700 0.95rem var(--font-display);
    font-style: normal;
    line-height: 1.1;
  }

  .ring {
    display: grid;
    place-items: center;
    width: 5.4rem;
    height: 5.4rem;
    border-radius: 50%;
    border: 4px solid var(--red);
    color: var(--red);
    background: radial-gradient(circle, transparent 58%, rgba(236, 0, 22, calc(0.05 + var(--w) * 0.25)) 59%);
    box-shadow: inset 0 0 0 5px var(--paper), inset 0 0 0 7px var(--red);
    transition: background-color 300ms var(--ease);
  }

  .stamp.on .ring {
    background-color: rgba(236, 0, 22, 0.14);
  }

  .ring b {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 1.9rem;
    letter-spacing: -0.04em;
  }

  .nm {
    font: 600 0.74rem var(--font-mono);
    line-height: 1.25;
    color: var(--paper-ink-2);
    overflow-wrap: anywhere;
  }

  .panel {
    margin-top: 1.6rem;
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    gap: 2rem;
    padding: clamp(1.2rem, 3vw, 2.2rem);
    border-radius: 1.6rem;
    background: var(--bg-3);
    border: 1px solid var(--line);
    position: relative;
  }

  .panel .mono {
    color: var(--ink-2);
  }

  .panel h2 {
    font-size: clamp(2rem, 4.4vw, 4rem);
    margin: 0.4rem 0 0.8rem;
  }

  .sub {
    color: var(--ink-2);
  }

  .panel ul {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 0.3rem;
    align-content: start;
  }

  .panel li {
    display: grid;
    grid-template-columns: 3.6rem 1fr auto;
    gap: 0.6rem;
    align-items: baseline;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--line);
  }

  .panel li b {
    font-weight: 600;
  }

  .panel li i {
    font: 400 0.82rem var(--font-mono);
    font-style: normal;
    color: var(--beer);
  }

  .close {
    position: absolute;
    right: 1.2rem;
    top: 1rem;
    color: var(--ink-2);
  }

  .close:hover {
    color: var(--ink);
  }

  @media (max-width: 760px) {
    .panel {
      grid-template-columns: 1fr;
    }

    .panel li {
      grid-template-columns: 3.2rem 1fr;
    }

    .panel li i {
      grid-column: 2;
    }
  }
</style>
