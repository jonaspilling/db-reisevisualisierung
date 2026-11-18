<script>
  import { scene } from "../lib/scenes.js";
  import { EARTH_KM, nf } from "../lib/story.js";
  import Words from "./Words.svelte";

  let { story } = $props();

  const trips = story.trips;
  const N = trips.length;
  const clamp = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

  // Jede Fahrt ist ein Stück auf dem Maßband "einmal um die Erde"
  let before = 0;
  const segments = trips.map((t) => {
    const seg = { left: (before / EARTH_KM) * 100, width: (t.km / EARTH_KM) * 100 };
    before += t.km;
    return seg;
  });

  let p = $state(0);
  const f = $derived(clamp((p - 0.04) / 0.8));
  const pct = $derived((story.km / EARTH_KM) * 100 * f);
  const rest = Math.round(EARTH_KM - story.km);
  const times = nf(EARTH_KM / story.km, 1);
</script>

<section class="scene t-red" style="--dwell:1.2" data-ms="3000" use:scene={(v) => (p = v)}>
  <div class="sc-stage">
    <h2 class="say wide">
      <Words text="Das sind" />
      <span class="w" style="--i:2"><span class="wi pct">{nf(pct, 1)}&nbsp;%</span></span>
      <Words text="der Strecke einmal um die Erde." from={3} />
    </h2>

    <div class="ruler">
      <div class="track" role="img" aria-label="{nf(story.km)} von {nf(EARTH_KM)} Kilometern Erdumfang">
        {#each segments as s, j}
          <i style="left:{s.left}%;width:{s.width}%;transform:scaleX({clamp(f * N - j)})"></i>
        {/each}
      </div>
      <div class="ends"><span>0 km</span><span>{nf(EARTH_KM)} km: einmal rum</span></div>
    </div>

    <p class="sub fade" style="--a:0.72;--b:0.92">
      Für die ganze Runde fehlen noch <b>{nf(rest)} km</b>. Dafür bräuchte ich dieses Jahr noch {times}-mal.
    </p>
  </div>
</section>

<style>
  .pct {
    min-width: 5.4ch;
    text-align: left;
  }

  .ruler {
    display: grid;
    gap: 0.7rem;
  }

  .track {
    position: relative;
    height: clamp(3rem, 9vh, 5.5rem);
    border-radius: var(--r-sm);
    background: var(--s-soft);
    overflow: hidden;
  }

  .track i {
    position: absolute;
    top: 0;
    bottom: 0;
    background: #fff;
    transform-origin: 0 50%;
    /* feine Fuge zwischen den Fahrten */
    border-right: 1px solid var(--red);
    box-sizing: border-box;
  }

  .ends {
    display: flex;
    justify-content: space-between;
    font-weight: 700;
    font-size: 1rem;
  }
</style>
