<script>
  import { scene } from "../lib/scenes.js";
  import { shortName } from "../lib/facts.js";
  import Words from "./Words.svelte";

  let { story } = $props();

  const names = story.byVisits.map((s) => ({ name: shortName(s.name), visits: s.visits }));
  // Zwei Bänder, die gegenläufig durchs Bild laufen; jedes doppelt, damit kein Loch entsteht
  const rowA = names.filter((_, i) => i % 2 === 0);
  const rowB = names.filter((_, i) => i % 2 === 1);
  const top = story.byVisits[0];
  const countryCount = story.countries.length;
</script>

<section class="scene t-light" style="--dwell:1.2" data-ms="26000" use:scene>
  <div class="sc-stage">
    <h2 class="say wide">
      <span class="w" style="--i:0"><span class="wi hl">{story.stations.length}</span></span>
      <Words text="*Bahnhöfe in" from={1} />
      <span class="w" style="--i:3"><span class="wi hl">{countryCount}</span></span>
      <Words text={countryCount === 1 ? "*Land." : "*Ländern."} from={4} />
    </h2>

    <div class="bands" aria-hidden="true">
      <div class="band a">
        <div class="run">
          {#each [0, 1] as _}
            {#each rowA as n}
              <span class:big={n.visits >= 5}>{n.name}{#if n.visits > 1}<sup>{n.visits}×</sup>{/if}</span>
            {/each}
          {/each}
        </div>
      </div>
      <div class="band b">
        <div class="run">
          {#each [0, 1] as _}
            {#each rowB as n}
              <span class:big={n.visits >= 5}>{n.name}{#if n.visits > 1}<sup>{n.visits}×</sup>{/if}</span>
            {/each}
          {/each}
        </div>
      </div>
    </div>

    <p class="sub fade" style="--a:0.3;--b:0.5">
      <b>{shortName(top.name)}</b> war {top.visits}× auf meinem Weg, öfter als jeder andere.
      {#each story.countries as [land, n], i}{i ? ", " : " Davon "}{n} in {land}{/each}.
    </p>
  </div>
</section>

<style>
  .hl {
    color: var(--red);
  }

  .bands {
    display: grid;
    gap: clamp(0.6rem, 2vh, 1.4rem);
    margin-inline: calc(var(--pad) * -1);
    overflow: hidden;
  }

  .band {
    overflow: hidden;
  }

  .run {
    display: flex;
    gap: clamp(1.5rem, 3vw, 3rem);
    width: max-content;
    font-family: var(--display);
    font-weight: 800;
    letter-spacing: -0.035em;
    font-size: clamp(2.4rem, 7vw, 6rem);
    line-height: 1.05;
    white-space: nowrap;
    color: transparent;
    -webkit-text-stroke: 2px var(--text);
  }

  .run span.big {
    color: var(--red);
    -webkit-text-stroke: 0;
  }

  .run sup {
    font-size: 0.32em;
    letter-spacing: 0;
    margin-left: 0.2em;
    vertical-align: top;
    line-height: 1;
    -webkit-text-stroke: 0;
    color: var(--muted);
  }

  /* Die Bänder laufen langsam mit dem Scrollen (am Handy mit der Zeit): A nach links, B nach rechts */
  .a .run {
    transform: translateX(calc(var(--p, 0) * -22%));
  }

  .b .run {
    transform: translateX(calc(-22% + var(--p, 0) * 22%));
  }
</style>
