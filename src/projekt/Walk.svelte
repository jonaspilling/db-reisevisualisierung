<script>
  import { scene } from "../lib/scenes.js";
  import { WALK_KMH, daysAndHours, nf } from "../lib/story.js";
  import Words from "./Words.svelte";

  let { story } = $props();

  const clamp = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const walk = story.walkHours;
  const train = story.hours;
  const walkDays = Math.round(walk / 24);

  let p = $state(0);
  // Beide Läufer starten gleichzeitig. Auf der Zeitachse ist der Zug nach kurzer Zeit am Ziel.
  const elapsed = $derived(walk * clamp((p - 0.05) / 0.85));
  const trainW = $derived((Math.min(elapsed, train) / walk) * 100);
  const walkW = $derived((elapsed / walk) * 100);
  const trainDone = $derived(elapsed >= train);
  const now = $derived(daysAndHours(elapsed));
  const t = daysAndHours(train);
</script>

<section class="scene t-light" style="--dwell:1.6" use:scene={(v) => (p = v)}>
  <div class="sc-stage">
    <h2 class="say wide">
      <Words text="Zu Fuß wären es" />
      <span class="w" style="--i:4"><span class="wi hl">{walkDays}&nbsp;Tage</span></span>
      <Words text="gewesen." from={5} />
    </h2>

    <div class="lanes" role="img" aria-label="Zug: {t.days} Tage {t.hours} Stunden. Zu Fuß: {walkDays} Tage.">
      <div class="lane">
        <span class="who">Zug</span>
        <div class="bar"><i class="train" style="width:{trainW}%"></i></div>
        <span class="val" class:done={trainDone}>{t.days} Tage {t.hours} Std.</span>
      </div>
      <div class="lane">
        <span class="who">Zu Fuß</span>
        <div class="bar"><i class="foot" style="width:{walkW}%"></i></div>
        <span class="val">Tag {now.days + 1}</span>
      </div>
    </div>

    <p class="fine fade" style="--a:0.8;--b:0.95">
      Gerechnet mit {WALK_KMH} km/h, Tag und Nacht, ohne Schlaf und ohne Umwege: {nf(story.km)} km zu Fuß.
    </p>
  </div>
</section>

<style>
  .hl {
    color: var(--red);
  }

  .lanes {
    display: grid;
    gap: clamp(1rem, 3vh, 1.8rem);
  }

  .lane {
    display: grid;
    grid-template-columns: 5.4rem minmax(0, 1fr) 9rem;
    align-items: center;
    gap: 1rem;
  }

  .who {
    font-weight: 800;
    font-size: 1.15rem;
  }

  .bar {
    height: clamp(2.2rem, 6vh, 3.4rem);
    border-radius: var(--r-sm);
    background: var(--panel-2);
    overflow: hidden;
  }

  .bar i {
    display: block;
    height: 100%;
  }

  .train {
    background: var(--red);
  }

  .foot {
    background: var(--text);
  }

  .val {
    font-weight: 700;
    text-align: right;
    white-space: nowrap;
  }

  .val.done {
    color: var(--red);
  }

  @media (max-width: 640px) {
    .lane {
      grid-template-columns: 1fr auto;
      gap: 0.35rem 0.8rem;
    }

    .bar {
      grid-column: 1 / -1;
      grid-row: 2;
    }
  }
</style>
