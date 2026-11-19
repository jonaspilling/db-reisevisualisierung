<script>
  // Radar um den Knotenbahnhof: jede Fahrt ein Strahl. Richtung = wohin die Fahrt am weitesten wegführt,
  // Länge = Kilometer der Fahrt. Die Strahlen schießen beim Scrollen hinaus, Hover zeigt die Fahrt.
  import { onMount } from "svelte";
  import { gsap, reduce } from "../lib/motion.js";
  import { nf } from "../lib/format.js";

  let { trips, center } = $props();
  const C = 280, R = 232;
  const maxKm = Math.max(...trips.map((t) => t.km));

  const spokes = trips.map((t, i) => {
    let far = t.path[0], d = -1;
    for (const p of t.path) {
      const dx = (p[0] - center[0]) * 0.64, dy = p[1] - center[1];
      const dd = dx * dx + dy * dy;
      if (dd > d) { d = dd; far = p; }
    }
    const a = Math.atan2((far[0] - center[0]) * 0.64, far[1] - center[1]);
    const r = (t.km / maxKm) * R;
    return { i, r, x: C + Math.sin(a) * r, y: C - Math.cos(a) * r, label: `${t.von} → ${t.nach}`, km: t.km, datum: t.datum };
  });

  let hover = $state(-1);
  let root;
  const read = $derived(hover >= 0 ? spokes[hover] : null);

  onMount(() => {
    if (reduce) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(".sp", { strokeDashoffset: (i) => spokes[i].r }, {
        strokeDashoffset: 0,
        ease: "none",
        stagger: 0.06,
        scrollTrigger: { trigger: root, start: "top 78%", end: "bottom 42%", scrub: 0.7 },
      });
      gsap.from(".sp-dot", { scale: 0, transformOrigin: "50% 50%", stagger: 0.06, ease: "back.out(2)", scrollTrigger: { trigger: root, start: "top 70%", end: "bottom 40%", scrub: 0.7 } });
      gsap.to(".sweep", { rotation: 360, transformOrigin: `${C}px ${C}px`, duration: 7, ease: "none", repeat: -1 });
    }, root);
    return () => ctx.revert();
  });
</script>

<div class="radar" bind:this={root}>
  <svg viewBox="0 0 {C * 2} {C * 2}" role="img" aria-label="Alle Fahrten als Strahlen um den Frankfurter Hbf">
    <defs>
      <radialGradient id="rg"><stop offset="0" stop-color="#ec0016" stop-opacity=".0" /><stop offset="1" stop-color="#ec0016" stop-opacity=".5" /></radialGradient>
    </defs>
    {#each [1, 2, 3] as k}
      <circle cx={C} cy={C} r={(R * k) / 3} class="ring" />
      <text x={C + 6} y={C - (R * k) / 3 - 6} class="rl">{nf((maxKm * k) / 3)} km</text>
    {/each}
    <line x1={C} y1={C - R - 10} x2={C} y2={C + R + 10} class="axis" />
    <line x1={C - R - 10} y1={C} x2={C + R + 10} y2={C} class="axis" />
    <text x={C} y="14" text-anchor="middle" class="rl">N</text>
    <path class="sweep" d="M{C} {C}L{C} {C - R}A{R} {R} 0 0 1 {C + R * Math.sin(0.5)} {C - R * Math.cos(0.5)}Z" fill="url(#rg)" />
    {#each spokes as s}
      <g role="presentation" onpointerenter={() => (hover = s.i)} onpointerleave={() => (hover = -1)}>
        <line x1={C} y1={C} x2={s.x} y2={s.y} class="hit" />
        <line x1={C} y1={C} x2={s.x} y2={s.y} class="sp" class:on={hover === s.i} style:stroke-dasharray={s.r} />
        <circle cx={s.x} cy={s.y} r={hover === s.i ? 9 : 6} class="sp-dot" class:on={hover === s.i} />
      </g>
    {/each}
    <circle cx={C} cy={C} r="11" class="core" />
  </svg>
  <p class="readout">
    {#if read}
      <b>{read.label}</b><span class="mono">{read.datum} · {nf(read.km)} km</span>
    {:else}
      <span class="mono">Fahr mit der Maus über einen Strahl</span>
    {/if}
  </p>
</div>

<style>
  .radar {
    display: grid;
    gap: 1rem;
    justify-items: center;
  }

  svg {
    width: min(100%, 36rem);
    height: auto;
    overflow: visible;
  }

  .ring {
    fill: none;
    stroke: var(--line);
    stroke-width: 1.5;
    stroke-dasharray: 3 6;
  }

  .axis {
    stroke: var(--line);
    stroke-width: 1;
  }

  .rl {
    font: 500 11px var(--font-mono);
    fill: var(--ink-2);
  }

  .sp {
    stroke: var(--red-ink);
    stroke-width: 4;
    stroke-linecap: round;
    transition: stroke-width 250ms var(--ease);
  }

  .sp.on {
    stroke-width: 7;
  }

  .hit {
    stroke: transparent;
    stroke-width: 22;
    cursor: pointer;
  }

  .sp-dot {
    fill: var(--bg);
    stroke: var(--red-ink);
    stroke-width: 3;
    transition: r 250ms var(--ease), fill 250ms var(--ease);
  }

  .sp-dot.on {
    fill: var(--red);
  }

  .core {
    fill: var(--ink);
    stroke: var(--bg);
    stroke-width: 4;
  }

  .readout {
    min-height: 3.4rem;
    display: grid;
    justify-items: center;
    gap: 0.2rem;
    text-align: center;
    color: var(--ink-2);
  }

  .readout b {
    color: var(--ink);
    font-family: var(--font-display);
    font-weight: var(--fw);
    letter-spacing: var(--ls);
    font-size: 1.4rem;
  }
</style>
