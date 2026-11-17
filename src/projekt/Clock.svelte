<script>
  import { scene } from "../lib/scenes.js";
  import Words from "./Words.svelte";

  let { story } = $props();

  const clamp = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const toMin = (hhmm) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };

  const C = 200; // Mittelpunkt
  const R = 150; // Radius des Zifferblatts
  const at = (min, r = R) => {
    const a = (min / 1440) * Math.PI * 2 - Math.PI / 2;
    return [C + Math.cos(a) * r, C + Math.sin(a) * r];
  };

  // Abfahrten nach Tageszeit sortiert: der Zeiger streicht sie der Reihe nach an
  const dots = story.trips
    .map((t) => ({ min: toMin(t.abfahrt), time: t.abfahrt, id: t.id }))
    .sort((a, b) => a.min - b.min);
  const earliest = toMin(story.earliest.abfahrt);
  const ticks = Array.from({ length: 24 }, (_, h) => ({ h, a: at(h * 60, R), b: at(h * 60, R - (h % 6 === 0 ? 20 : 9)) }));
  const names = [0, 6, 12, 18].map((h) => ({ h, pos: at(h * 60, R - 40) }));

  let p = $state(0);
  const f = $derived(clamp((p - 0.05) / 0.8));
  const hand = $derived(at(f * 1440, R - 4));

  const hour = Number(story.earliest.abfahrt.split(":")[0]);
  const joke =
    hour < 5
      ? "Da schläft sogar die Bahnhofstaube noch."
      : hour < 7
        ? "Der Wecker war vor dem ersten Kaffee wach."
        : "Frühstück am Bahnsteig inklusive.";
</script>

<section class="scene t-light" style="--dwell:1.3" use:scene={(v) => (p = v)}>
  <div class="sc-stage">
    <div class="copy">
      <h2 class="say">
        <Words text="Früheste Abfahrt:" />
        <span class="w" style="--i:2"><span class="wi hl">{story.earliest.abfahrt}&nbsp;Uhr.</span></span>
      </h2>
      <p class="sub">
        {joke} <b>{story.before8} von {story.trips.length} Fahrten</b> starteten vor 8 Uhr. Der häufigste Reisetag war
        <b>{story.topDay}</b> ({story.topDayCount}×).
      </p>
    </div>

    <svg class="dial" viewBox="0 0 400 400" role="img" aria-label="Abfahrtszeiten auf einem 24-Stunden-Zifferblatt">
      <circle cx={C} cy={C} r={R} class="face" />
      {#each ticks as t}
        <line x1={t.a[0]} y1={t.a[1]} x2={t.b[0]} y2={t.b[1]} class="tick" class:major={t.h % 6 === 0} />
      {/each}
      {#each names as n}
        <text x={n.pos[0]} y={n.pos[1]} class="num" text-anchor="middle" dominant-baseline="central">{String(n.h).padStart(2, "0")}</text>
      {/each}

      <line x1={C} y1={C} x2={hand[0]} y2={hand[1]} class="hand" style="opacity:{f > 0.985 ? 0 : 1}" />
      <circle cx={C} cy={C} r="6" class="hub" />

      {#each dots as d}
        {@const [x, y] = at(d.min)}
        {@const seen = f * 1440 >= d.min}
        {@const early = d.min === earliest}
        <circle cx={x} cy={y} r={early ? 11 : 7} class="dot" class:seen class:early />
        {#if early && seen}
          <text x={x} y={y + (y < C ? 28 : -20)} class="tag" text-anchor="middle">{d.time}</text>
        {/if}
      {/each}
    </svg>
  </div>
</section>

<style>
  .sc-stage {
    grid-template-columns: minmax(0, 6fr) minmax(0, 5fr);
    align-items: center;
    column-gap: clamp(1rem, 4vw, 4rem);
  }

  .copy {
    display: grid;
    gap: clamp(1rem, 3vh, 2rem);
  }

  .hl {
    color: var(--red);
  }

  .dial {
    width: 100%;
    max-height: calc(100svh - var(--bar-h) - 3rem);
    justify-self: center;
  }

  .face {
    fill: var(--panel);
    stroke: var(--text);
    stroke-width: 3;
  }

  .tick {
    stroke: var(--muted);
    stroke-width: 2;
    stroke-linecap: round;
  }

  .tick.major {
    stroke: var(--text);
    stroke-width: 4;
  }

  .num {
    font-family: var(--display);
    font-weight: 800;
    font-size: 26px;
    fill: var(--text);
  }

  .hand {
    stroke: var(--text);
    stroke-width: 4;
    stroke-linecap: round;
  }

  .hub {
    fill: var(--text);
  }

  .dot {
    fill: var(--red);
    stroke: #fff;
    stroke-width: 3;
    opacity: 0;
    transform-box: fill-box;
    transform-origin: center;
    transform: scale(0.2);
    transition:
      opacity 260ms var(--ease),
      transform 420ms var(--ease);
  }

  .dot.seen {
    opacity: 1;
    transform: scale(1);
  }

  .tag {
    font-family: var(--display);
    font-weight: 800;
    font-size: 24px;
    fill: var(--red);
    paint-order: stroke;
    stroke: var(--panel);
    stroke-width: 6px;
  }

  @media (max-width: 860px) {
    .sc-stage {
      grid-template-columns: 1fr;
      grid-template-rows: auto minmax(0, 1fr);
      align-content: start;
    }
  }
</style>
