<script>
  // Schätz mal: vier Fragen zu meinem Bahnjahr. Die Lösungen werden aus den Daten berechnet.
  import { tick } from "svelte";
  import { gsap, reduce } from "../lib/motion.js";
  import { confetti } from "../lib/fx.js";
  import { nf } from "../lib/format.js";

  let { stats } = $props();

  const qs = [
    { q: "Wie lang war meine längste Fahrt?", unit: "km", min: 100, max: 1500, step: 10, truth: Math.round(stats.longest.km), note: `${stats.longest.von} → ${stats.longest.nach}` },
    { q: `Wie oft war ich am ${stats.top.name}?`, unit: "×", min: 1, max: 30, step: 1, truth: stats.top.visits, note: "Der meistbesuchte Bahnhof" },
    { q: "Wie viele verschiedene Bahnhöfe waren es?", unit: "", min: 10, max: 80, step: 1, truth: stats.stations, note: "Mit allen Zwischenhalten" },
    { q: "Wie schnell war ich im Schnitt unterwegs?", unit: "km/h", min: 50, max: 250, step: 1, truth: Math.round(stats.kmh), note: "Gesamtstrecke durch Zeit im Zug" },
  ];

  let i = $state(0);
  let guess = $state(qs[0].min + (qs[0].max - qs[0].min) / 2);
  let revealed = $state(false);
  let pts = $state([]);
  let card;

  const q = $derived(qs[i]);
  const finished = $derived(pts.length === qs.length && !revealed);
  const total = $derived(pts.reduce((a, b) => a + b, 0));
  const pos = (val) => ((val - q.min) / (q.max - q.min)) * 100;

  function score(g, t) {
    const e = Math.abs(g - t) / Math.max(t, 1);
    return e <= 0.05 ? 3 : e <= 0.15 ? 2 : e <= 0.3 ? 1 : 0;
  }

  const msg = (p) => ["Weit daneben. Zeit für ein Bier.", "Immerhin in der Nähe.", "Ziemlich gut!", "Volltreffer!"][p];

  async function reveal() {
    const p = score(guess, q.truth);
    revealed = true;
    pts = [...pts, p];
    await tick();
    if (!reduce) {
      gsap.fromTo(".truth-mark", { y: -50, opacity: 0, scale: 1.8 }, { y: 0, opacity: 1, scale: 1, duration: 0.7, ease: "bounce.out" });
      gsap.fromTo(".res", { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, delay: 0.3, ease: "power3.out" });
    }
    if (p === 3 && card) {
      const r = card.getBoundingClientRect();
      confetti(r.left + r.width / 2, r.top + 120, 50);
    }
  }

  async function next() {
    revealed = false;
    if (pts.length < qs.length) {
      i = pts.length;
      guess = qs[i].min + (qs[i].max - qs[i].min) / 2;
      await tick();
      if (!reduce) gsap.from(".qbody", { x: 40, opacity: 0, duration: 0.5, ease: "power3.out" });
    }
  }

  function again() {
    pts = [];
    i = 0;
    revealed = false;
    guess = qs[0].min + (qs[0].max - qs[0].min) / 2;
  }

  const verdict = $derived(total >= 11 ? "Du hättest den Bon schreiben können." : total >= 8 ? "Fast schon Stammgast." : total >= 5 ? "Mitfahrer mit Gespür." : "Neu im Zug? Setz dich, ich erzähl's dir.");
</script>

<div class="quiz" bind:this={card}>
  {#if finished}
    <div class="end">
      <p class="mono">Ergebnis</p>
      <p class="score"><b>{total}</b><span> von {qs.length * 3} Punkten</span></p>
      <p class="verdict">{verdict}</p>
      <button type="button" class="btn" onclick={again}>Nochmal raten</button>
    </div>
  {:else}
    <div class="qbody">
      <div class="top">
        <span class="mono">Frage {i + 1} von {qs.length}</span>
        <span class="dots" aria-hidden="true">{#each qs as _, k}<i class:on={k < pts.length}></i>{/each}</span>
      </div>
      <h3>{q.q}</h3>

      <p class="num"><span class="ghost" aria-hidden="true">{nf(q.max)}</span><span class="live">{nf(guess)}</span><small>{q.unit}</small></p>

      <div class="scale">
        <input
          type="range"
          min={q.min}
          max={q.max}
          step={q.step}
          bind:value={guess}
          disabled={revealed}
          aria-label="Deine Schätzung"
          data-cursor="Ziehen"
        />
        {#if revealed}
          <i class="truth-mark" style="left:{pos(q.truth)}%"><b>{nf(q.truth)}</b></i>
        {/if}
      </div>
      <div class="ends mono"><span>{nf(q.min)}</span><span>{nf(q.max)} {q.unit}</span></div>

      {#if revealed}
        <div class="res">
          <p><b>{nf(q.truth)} {q.unit}</b> <span class="mono">{q.note}</span></p>
          <p class="m">{msg(pts[pts.length - 1])} {pts[pts.length - 1] ? `+${pts[pts.length - 1]} Punkte` : ""}</p>
          <button type="button" class="btn" onclick={next}>{pts.length < qs.length ? "Weiter" : "Ergebnis"} <span aria-hidden="true">→</span></button>
        </div>
      {:else}
        <button type="button" class="btn" onclick={reveal}>Auflösen</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .quiz {
    padding: clamp(1.4rem, 3.4vw, 2.6rem);
    border-radius: 1.8rem;
    background: var(--paper);
    color: var(--paper-ink);
    box-shadow: inset 0 0 0 3px var(--paper), inset 0 0 0 5px #d9ccaa, 0 24px 60px rgba(0, 0, 0, 0.4);
    min-height: 26rem;
    max-width: 44rem;
  }

  .top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: var(--paper-ink-2);
    margin-bottom: 1rem;
  }

  .dots {
    display: flex;
    gap: 0.35rem;
  }

  .dots i {
    width: 1.6rem;
    height: 5px;
    border-radius: 5px;
    background: #d9ccaa;
  }

  .dots i.on {
    background: var(--red);
  }

  h3 {
    font-size: calc(var(--ds) * clamp(1.7rem, 3.4vw, 2.7rem));
    max-width: 30rem;
    margin-bottom: 1.4rem;
  }

  .num {
    display: inline-grid;
    grid-template-columns: auto auto;
    column-gap: 0.4rem;
    align-items: baseline;
    font-family: var(--font-display);
    font-weight: var(--fw);
    font-size: calc(var(--ds) * clamp(3.2rem, 8vw, 6rem));
    letter-spacing: var(--ls);
    line-height: 1;
    color: var(--red);
    font-variant-numeric: tabular-nums;
  }

  .ghost {
    visibility: hidden;
  }

  .num .ghost,
  .num .live {
    grid-area: 1 / 1;
  }

  .num small {
    grid-area: 1 / 2;
    font-size: 0.3em;
    color: var(--paper-ink-2);
    font-weight: 600;
    letter-spacing: 0;
  }

  .scale {
    position: relative;
    margin: 1.4rem 0 0.3rem;
    padding-top: 2.6rem;
  }

  input[type="range"] {
    width: 100%;
    height: 2rem;
    appearance: none;
    background: transparent;
    cursor: grab;
  }

  input[type="range"]::-webkit-slider-runnable-track {
    height: 10px;
    border-radius: 10px;
    background: #d9ccaa;
  }

  input[type="range"]::-moz-range-track {
    height: 10px;
    border-radius: 10px;
    background: #d9ccaa;
  }

  input[type="range"]::-webkit-slider-thumb {
    appearance: none;
    width: 2rem;
    height: 2rem;
    margin-top: -0.65rem;
    border-radius: 50%;
    background: var(--red);
    border: 5px solid var(--paper);
    box-shadow: 0 0 0 2px var(--red), 0 6px 14px rgba(0, 0, 0, 0.3);
  }

  input[type="range"]::-moz-range-thumb {
    width: 1.4rem;
    height: 1.4rem;
    border-radius: 50%;
    background: var(--red);
    border: 5px solid var(--paper);
    box-shadow: 0 0 0 2px var(--red);
  }

  input[type="range"]:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .truth-mark {
    position: absolute;
    top: 0;
    translate: -50% 0;
    pointer-events: none;
  }

  .truth-mark b {
    display: block;
    padding: 0.3rem 0.7rem;
    border-radius: 0.6rem;
    background: var(--paper-ink);
    color: var(--paper);
    font: 700 0.95rem var(--font-mono);
  }

  .truth-mark::after {
    content: "";
    display: block;
    width: 3px;
    height: 1.2rem;
    margin: 0 auto;
    background: var(--paper-ink);
  }

  .ends {
    display: flex;
    justify-content: space-between;
    color: var(--paper-ink-2);
    margin-bottom: 1.2rem;
  }

  .res {
    display: grid;
    gap: 0.6rem;
    justify-items: start;
  }

  .res b {
    font-family: var(--font-display);
    font-weight: var(--fw);
    font-size: 1.6rem;
    letter-spacing: var(--ls);
  }

  .res .mono {
    color: var(--paper-ink-2);
    margin-left: 0.4rem;
  }

  .m {
    font-size: 1.1rem;
  }

  .end {
    display: grid;
    gap: 0.9rem;
    justify-items: start;
    align-content: center;
    min-height: 22rem;
  }

  .end .mono {
    color: var(--paper-ink-2);
  }

  .score {
    font-family: var(--font-display);
    font-weight: var(--fw);
    letter-spacing: var(--ls);
    color: var(--paper-ink);
  }

  .score b {
    font-size: calc(var(--ds) * clamp(5rem, 14vw, 9rem));
    color: var(--red);
    line-height: 0.9;
  }

  .score span {
    font-size: 1.6rem;
  }

  .verdict {
    font-size: 1.3rem;
    max-width: 24rem;
  }
</style>
