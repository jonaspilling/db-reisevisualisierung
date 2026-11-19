<script>
  // Bier einschenken: Knopf (oder Glas, oder Leertaste) gedrückt halten. Das Glas füllt sich bis zur Gesamtstrecke.
  import { onDestroy } from "svelte";
  import { gsap, reduce } from "../lib/motion.js";
  import { confetti } from "../lib/fx.js";
  import { nf } from "../lib/format.js";
  import Beer from "./Beer.svelte";

  let { total, tripsCount } = $props();
  let v = $state(0); // 0..1
  let pouring = $state(false);
  let done = $state(false);
  let shake;
  let raf = 0;
  let last = 0;
  let glassEl;

  const km = $derived(v * total);
  // Der Strahl endet an der Schaumoberkante (Maße wie in Beer.svelte)
  const pourTo = $derived(322 - v * 244 - (v > 0.02 ? 12 + 36 * v : 0) + 12);
  const pct = $derived(Math.round(v * 100));

  const quip = $derived(
    done
      ? `Voll! ${nf(total)} km, kein Tropfen verschüttet. Prost!`
      : v === 0
        ? "Gedrückt halten zum Einschenken."
        : v < 0.34
          ? `${nf(km)} km … das Jahr beginnt.`
          : v < 0.67
            ? `${nf(km)} km. Es läuft.`
            : v < 0.97
              ? `${nf(km)} km. Gleich ist es voll!`
              : "Achtung, Schaum!"
  );

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(now - last, 60) / 1000;
    last = now;
    if (!pouring || done) return;
    v = Math.min(1, v + dt * 0.2);
    if (v >= 1) finish();
  }

  function start() {
    if (done) return;
    pouring = true;
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }
  function stop() {
    pouring = false;
    cancelAnimationFrame(raf);
  }

  function finish() {
    done = true;
    stop();
    const r = glassEl?.getBoundingClientRect();
    if (r) confetti(r.left + r.width / 2, r.top + r.height * 0.25, 70);
    if (!reduce) gsap.fromTo(shake, { rotation: -3 }, { rotation: 0, duration: 0.9, ease: "elastic.out(1,0.25)" });
  }

  function reset() {
    done = false;
    v = 0;
    stop();
  }

  const key = (e) => {
    if (e.code === "Space" || e.key === "Enter") {
      e.preventDefault();
      if (e.type === "keydown" && !e.repeat) start();
      if (e.type === "keyup") stop();
    }
  };

  onDestroy(() => cancelAnimationFrame(raf));
</script>

<div class="pour">
  <div class="glass-wrap" bind:this={shake}>
    <button
      type="button"
      class="glass"
      bind:this={glassEl}
      class:on={pouring}
      aria-label="Glas füllen: gedrückt halten"
      data-cursor="Halten"
      onpointerdown={start}
      onpointerup={stop}
      onpointerleave={stop}
      onpointercancel={stop}
      onkeydown={key}
      onkeyup={key}
    >
      <Beer fill={v} id="pour" stroke={5} bubbles={7} over={done}>
        <!-- Zapfhahn mit Strahl -->
        <rect x="92" y="-10" width="36" height="14" rx="5" fill="#8a8f94" />
        <path d="M100 2H120V16C120 20 116 22 110 22C104 22 100 20 100 16Z" fill="#6f757a" />
        {#if pouring}<rect class="stream" x="106" y="22" width="8" height={Math.max(0, pourTo - 22)} rx="3" fill="#ffc61a" />{/if}
      </Beer>
    </button>
  </div>

  <div class="side">
    <p class="big"><span class="ghost" aria-hidden="true">{nf(total)}</span><span class="live">{nf(km)}</span><small>km</small></p>
    <div class="meter" aria-hidden="true"><i style="width:{pct}%"></i></div>
    <p class="quip" aria-live="polite">{quip}</p>
    <div class="row">
      <button type="button" class="btn" class:ghost={!pouring} onpointerdown={start} onpointerup={stop} onpointerleave={stop} onkeydown={key} onkeyup={key} disabled={done}>
        {pouring ? "Läuft …" : "Halten zum Einschenken"}
      </button>
      {#if v > 0}<button type="button" class="btn ghost" onclick={reset}>Leeren</button>{/if}
    </div>
    <p class="mono note">Das Glas steht für {tripsCount} Fahrten.</p>
  </div>
</div>

<style>
  .pour {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: clamp(1.5rem, 5vw, 4rem);
    align-items: center;
  }

  .glass-wrap {
    transform-origin: 50% 100%;
  }

  .glass {
    display: block;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    border-radius: 1rem;
  }

  .glass :global(svg) {
    width: clamp(9rem, 22vw, 14rem);
    height: auto;
    overflow: visible;
    filter: drop-shadow(0 18px 24px rgba(0, 0, 0, 0.45));
    transition: transform 300ms var(--ease);
  }

  .glass.on :global(svg) {
    transform: scale(1.03) rotate(-1.5deg);
  }

  .stream {
    animation: flow 0.3s linear infinite;
  }

  @keyframes flow {
    50% {
      opacity: 0.75;
    }
  }

  .big {
    display: inline-grid;
    grid-template-columns: auto auto;
    column-gap: 0.4rem;
    align-items: baseline;
    font-family: var(--font-display);
    font-weight: var(--fw);
    font-size: calc(var(--ds) * clamp(3.4rem, 9vw, 8rem));
    letter-spacing: var(--ls);
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .ghost {
    visibility: hidden;
  }

  .big .ghost,
  .big .live {
    grid-area: 1 / 1;
  }

  .big small {
    grid-area: 1 / 2;
    font-size: 0.26em;
    color: var(--ink-2);
    letter-spacing: 0;
    font-weight: 600;
  }

  .meter {
    height: 0.7rem;
    margin: 1.2rem 0 0.9rem;
    border-radius: 99px;
    background: var(--bg-3);
    overflow: hidden;
    max-width: 30rem;
  }

  .meter i {
    display: block;
    height: 100%;
    background: var(--beer);
    border-radius: 99px;
  }

  .quip {
    min-height: 3.2rem;
    max-width: 28rem;
    font-size: 1.15rem;
    color: var(--ink);
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.7rem;
    margin-top: 0.8rem;
  }

  .row .btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .note {
    margin-top: 1.2rem;
    color: var(--ink-2);
  }

  @media (max-width: 680px) {
    .pour {
      grid-template-columns: 1fr;
      justify-items: center;
      text-align: center;
    }

    .meter {
      margin-inline: auto;
    }

    .row {
      justify-content: center;
    }
  }
</style>
