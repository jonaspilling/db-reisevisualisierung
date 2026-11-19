<script>
  import { scene } from "../lib/scenes.js";
  import { MOON_KM, nf } from "../lib/story.js";
  import Words from "./Words.svelte";

  let { story } = $props();

  const clamp = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const share = (story.km / MOON_KM) * 100;

  let p = $state(0);
  const f = $derived(clamp((p - 0.05) / 0.7));
  const years = $derived(Math.round(story.moonYears * f));
</script>

<section class="scene t-light" style="--dwell:1" data-ms="2800" use:scene={(v) => (p = v)}>
  <div class="sc-stage">
    <h2 class="say wide">
      <Words text="Bis zum *Mond sind es noch" />
      <span class="w" style="--i:6"><span class="wi hl">{years}</span></span>
      <Words text="Jahre." from={7} />
    </h2>

    <div class="ruler">
      <div class="track" role="img" aria-label="{nf(story.km)} von {nf(MOON_KM)} Kilometern bis zum Mond">
        <i style="width:{share}%;transform:scaleX({f})"></i>
      </div>
      <div class="ends">
        <span>Erde</span>
        <span>Mond, {nf(MOON_KM)} km</span>
      </div>
      <p class="mark" style="--share:{share}%">
        <span>mein Jahr: {nf(story.km)} km</span>
      </p>
    </div>

    <p class="sub fade" style="--a:0.7;--b:0.9">
      Wenn ich jedes Jahr so viel fahre. Die Strecke gibt es leider noch nicht, ein Baustellenschild steht wahrscheinlich
      trotzdem schon.
    </p>
  </div>
</section>

<style>
  .hl {
    color: var(--red);
    min-width: 1.2ch;
  }

  .ruler {
    position: relative;
    display: grid;
    gap: 0.7rem;
    padding-top: 2.4rem;
  }

  .track {
    height: clamp(3rem, 9vh, 5.5rem);
    border-radius: var(--r-sm);
    background: var(--panel-2);
    overflow: hidden;
  }

  .track i {
    display: block;
    height: 100%;
    background: var(--red);
    transform-origin: 0 50%;
  }

  .ends {
    display: flex;
    justify-content: space-between;
    font-weight: 700;
  }

  /* Beschriftung am Anfang des Balkens, mit einem Strich nach unten */
  .mark {
    position: absolute;
    top: 0;
    left: 0;
    font-weight: 700;
    white-space: nowrap;
    opacity: clamp(0, calc((var(--p) - 0.15) * 6), 1);
  }

  .mark::after {
    content: "";
    position: absolute;
    left: 0;
    top: 1.6rem;
    width: 2px;
    height: 0.8rem;
    background: var(--text);
  }
</style>
