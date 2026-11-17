<script>
  import { scene } from "../lib/scenes.js";
  import { nf } from "../lib/story.js";
  import Words from "./Words.svelte";

  let { story } = $props();

  const fav = story.fav;
  const clamp = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const share = Math.round(fav.share * 100);

  // Zugnummer der Fahrt (bei mehreren Zügen der erste), dazu das Datum
  const trainLabel = (t) => t.zuege.split(",")[0].split("/")[0].trim();

  let p = $state(0);
  const f = $derived(clamp((p - 0.05) / 0.8));
</script>

<section class="scene t-red" style="--dwell:1.1" use:scene={(v) => (p = v)}>
  <div class="sc-stage">
    <h2 class="say wide">
      <span class="w" style="--i:0"><span class="wi">{fav.n}×</span></span>
      <Words text="{fav.a} – {fav.b}." from={1} />
    </h2>

    <!-- Ein Gleis pro Fahrt: je Gleis fährt ein kleiner Zug von links nach rechts -->
    <div class="tracks" role="img" aria-label="{fav.n} Fahrten auf der Strecke {fav.a} – {fav.b}">
      {#each Array(fav.n) as _, j}
        {@const run = clamp(f * (fav.n + 2.2) - j)}
        <div class="rail">
          <div class="line" style="transform:scaleX({run})"></div>
          <b class="loco" style="left:calc({run} * (100% - 3.4rem));opacity:{run > 0 && run < 1 ? 1 : 0}"></b>
          {#if fav.trips[j]}
            <span class="tag" style="opacity:{clamp((run - 0.92) * 12)}">{trainLabel(fav.trips[j])} · {fav.trips[j].datum.slice(0, 5)}</span>
          {/if}
        </div>
      {/each}
    </div>

    <p class="sub fade" style="--a:0.78;--b:0.95">
      Das sind <b>{share} % aller Fahrten</b>. Nach dem {fav.n}. Mal kannte ich jeden Tunnel beim Vornamen.
    </p>
  </div>
</section>

<style>
  .tracks {
    display: grid;
    gap: clamp(0.5rem, 1.6vh, 1rem);
    max-width: 70rem;
  }

  .rail {
    position: relative;
    height: clamp(1.3rem, 3.4vh, 2rem);
  }

  /* Zwei Schienen mit Schwellen dazwischen */
  .line {
    position: absolute;
    inset: 0;
    transform-origin: 0 50%;
    background:
      linear-gradient(#fff, #fff) top / 100% 3px no-repeat,
      linear-gradient(#fff, #fff) bottom / 100% 3px no-repeat,
      repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.85) 0 4px, transparent 4px 18px) center / 100% 70% no-repeat;
  }

  /* Zugnummer am Ende des Gleises */
  .tag {
    position: absolute;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    padding: 0.1rem 0.7rem;
    border-radius: var(--r-sm);
    background: var(--red);
    color: #fff;
    font-weight: 800;
    font-size: 0.82rem;
    letter-spacing: 0.02em;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .loco {
    position: absolute;
    top: -3px;
    bottom: -3px;
    width: 3.4rem;
    border-radius: 10px 18px 18px 10px;
    background: #fff;
  }

  .loco::after {
    content: "";
    position: absolute;
    right: 0.45rem;
    top: 28%;
    bottom: 28%;
    width: 0.9rem;
    border-radius: var(--r);
    background: var(--red);
  }
</style>
