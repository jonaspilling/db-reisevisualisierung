<script>
  import { scene } from "../lib/scenes.js";
  import { daysAndHours, plural } from "../lib/story.js";

  let { story } = $props();

  const clamp = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const total = Math.round(story.hours);
  const rows = Math.ceil(total / 24);
  const films = Math.round(story.hours / 2);

  let p = $state(0);
  // Eine Zelle = eine Stunde im Zug, eine Zeile = ein ganzer Tag
  const filled = $derived(Math.round(total * clamp((p - 0.05) / 0.8)));
  const dh = $derived(daysAndHours(filled));
  // Der fertige Text reserviert den Platz, damit die Überschrift beim Hochzählen nicht umbricht und springt
  const fin = daysAndHours(total);
  const label = (d) => `${d.days} ${plural(d.days, "Tag", "Tage")} und ${d.hours} ${plural(d.hours, "Stunde", "Stunden")}`;
</script>

<section class="scene t-dark" style="--dwell:1.2" use:scene={(v) => (p = v)}>
  <div class="sc-stage">
    <h2 class="say wide">
      <span class="w" style="--i:0"><span class="wi sized"><span class="ghost" aria-hidden="true">{label(fin)}</span><span class="live">{label(dh)}</span></span></span>
      <span class="w" style="--i:2"><span class="wi">im <span class="special">Zug</span>.</span></span>
    </h2>

    <div class="days" role="img" aria-label="{total} Stunden im Zug, jede Zeile ein ganzer Tag">
      {#each Array(rows) as _, r}
        <div class="day">
          <span class="lbl">Tag {r + 1}</span>
          <div class="hours">
            {#each Array(24) as _, h}
              {@const idx = r * 24 + h}
              <i class:on={idx < filled} class:void={idx >= total}></i>
            {/each}
          </div>
        </div>
      {/each}
    </div>

    <p class="sub fade" style="--a:0.75;--b:0.92">
      Genug Zeit für <b>{films} Spielfilme</b> à 2 Stunden. Mit Popcorn.
    </p>
  </div>
</section>

<style>
  .sized {
    display: inline-grid;
    font-variant-numeric: tabular-nums;
  }

  .sized > * {
    grid-area: 1 / 1;
  }

  .ghost {
    visibility: hidden;
  }

  .days {
    display: grid;
    gap: clamp(0.5rem, 1.4vh, 0.9rem);
    max-width: 62rem;
  }

  .day {
    display: grid;
    grid-template-columns: 4.2rem minmax(0, 1fr);
    align-items: center;
    gap: 0.9rem;
  }

  .lbl {
    font-weight: 700;
    color: var(--s-mute);
    font-size: 0.95rem;
  }

  .hours {
    display: grid;
    grid-template-columns: repeat(24, 1fr);
    gap: clamp(0.1875rem, 0.5vw, 0.4375rem);
  }

  .hours i {
    aspect-ratio: 1;
    border-radius: 0.25rem;
    background: var(--s-soft);
  }

  .hours i.on {
    background: #fff;
  }

  .hours i.void {
    background: transparent;
    outline: 1px dashed var(--s-line);
    outline-offset: -1px;
  }

  @media (max-width: 640px) {
    .day {
      grid-template-columns: 3rem minmax(0, 1fr);
      gap: 0.5rem;
    }
  }
</style>
