<script>
  // Die Karte als eigenes Fenster: das Fenster eines Waggons, der beim Runterscrollen von links hereinrollt.
  // Die Karte selbst wird erst aufgebaut, wenn die Szene in Sicht kommt (oder der Browser Pause hat),
  // damit der Start der Seite flüssig bleibt.
  import { onMount } from "svelte";
  import { scene } from "../lib/scenes.js";
  import MapPage from "../pages/MapPage.svelte";

  let { trips, stations } = $props();

  let mapOn = $state(false);

  function onProgress(p, inn) {
    if (inn > 0.02) mapOn = true;
  }

  onMount(() => {
    // Vorwärmen, sobald der Start der Seite fertig ist
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 2500));
    const cancel = window.cancelIdleCallback || clearTimeout;
    const id = idle(() => (mapOn = true), { timeout: 4500 });
    return () => cancel(id);
  });
</script>

<section class="scene karte t-light" style="--dwell:1" use:scene={onProgress}>
  <div class="sc-stage">
    <div class="top">
      <h2 class="say">
        <span class="w" style="--i:0"><span class="wi">Fahrt</span></span>
        <span class="w" style="--i:1"><span class="wi">für</span></span>
        <span class="w" style="--i:2"><span class="wi">Fahrt.</span></span>
      </h2>
      <div class="aside">
        <p class="sub">Spiel das Jahr ab, zieh an der Zeitleiste oder fahr mit der Maus über eine Mauer.</p>
        <a class="open" href="#/karte">
          Karte im Vollbild
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 12h14m0 0-6-6m6 6-6 6" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none" /></svg>
        </a>
      </div>
    </div>

    <!-- Der Waggon: Fenster mit Karte, roter Zierstreifen, zwei Drehgestelle auf einer Schiene -->
    <div class="train">
      <div class="consist">
        <div class="car">
          <div class="glass">
            {#if mapOn}
              <MapPage {trips} {stations} />
            {:else}
              <div class="wait">Karte wird aufgebaut …</div>
            {/if}
          </div>
          <div class="livery">
            <i class="stripe" aria-hidden="true"></i>
            <div class="plate"><b>Trasse 26</b><span>Fahrten 2026</span></div>
          </div>
        </div>
        <div class="bogies" aria-hidden="true"><i></i><i></i></div>
      </div>
      <div class="rail" aria-hidden="true"></div>
    </div>
  </div>
</section>

<style>
  .sc-stage {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr);
    align-content: stretch;
    row-gap: clamp(1rem, 3vh, 2rem);
    padding-bottom: clamp(1rem, 2.5vh, 1.75rem);
  }

  .top {
    display: grid;
    grid-template-columns: minmax(0, 8fr) minmax(0, 4fr);
    align-items: end;
    column-gap: clamp(1.5rem, 4vw, 4rem);
  }

  .karte :global(.say) {
    font-size: clamp(2.1rem, 4.3vw, 4.4rem);
    max-width: none;
  }

  .aside {
    display: grid;
    gap: 0.8rem;
    justify-items: start;
    padding-bottom: 0.3rem;
  }

  .aside .sub {
    font-size: clamp(1rem, 1.2vw, 1.15rem);
  }

  .open {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.6rem 1rem 0.6rem 1.15rem;
    border-radius: var(--r);
    background: var(--red);
    color: #fff;
    font-weight: 700;
    text-decoration: none;
    transition: background-color 140ms var(--ease);
  }

  .open:hover {
    background: var(--red-dark);
  }

  .open:active {
    transform: scale(0.97);
  }

  /* ---- Der Waggon: rollt mit dem Scrollen herein, am Ende der Einfahrt steht er ---- */
  .train {
    --arrive: clamp(0, calc(var(--in, 1) * 1.3), 1);
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    min-height: 0;
  }

  .consist {
    position: relative;
    min-height: 0;
    transform: translateX(calc((1 - var(--arrive)) * -112%));
  }

  .car {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    height: 100%;
    padding: 0.75rem 0.75rem 0;
    background: var(--panel-2);
    border-radius: 2.875rem 2.875rem 1rem 1rem;
    box-shadow: 0 0 0 1px var(--line);
  }

  /* Das Fenster: dunkler Rahmen, runde Ecken, die Karte füllt es ganz aus */
  .glass {
    position: relative;
    min-height: 0;
    border: 0.375rem solid var(--text);
    border-radius: 2.125rem 2.125rem 1.25rem 1.25rem;
    overflow: hidden;
    background: var(--bg);
  }

  .wait {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--muted);
  }

  .livery {
    display: grid;
    gap: 0.5rem;
    padding: 0.75rem 0.5rem 0.8rem;
  }

  /* Der Zierstreifen: eine flache rote Fläche über die ganze Länge */
  .stripe {
    height: 0.5625rem;
    background: var(--red);
    border-radius: 0.3125rem;
  }

  .plate {
    display: flex;
    justify-content: space-between;
    padding-inline: 0.5rem;
    font-size: 0.74rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .plate b {
    color: var(--text);
    font-weight: 800;
  }

  /* Zwei Drehgestelle: dunkle Räder mit rotem Ring, sie drehen sich mit der Einfahrt */
  .bogies i {
    position: absolute;
    bottom: -0.9375rem;
    width: 1.875rem;
    height: 1.875rem;
    border-radius: 50%;
    background: radial-gradient(circle, #fff 0 18%, var(--red) 18% 34%, var(--text) 34%);
    transform: rotate(calc((1 - var(--arrive)) * -1100deg));
  }

  .bogies i:first-child {
    left: 12%;
  }

  .bogies i:last-child {
    right: 12%;
  }

  /* Die Schiene: eine Linie mit Schwellen darunter, über die volle Breite bis an den Rand */
  .rail {
    height: 1.75rem;
    margin-inline: calc(var(--pad) * -1);
    background:
      linear-gradient(var(--muted), var(--muted)) 0 0.875rem / 100% 0.1875rem no-repeat,
      repeating-linear-gradient(90deg, #c8ced6 0 0.3125rem, transparent 0.3125rem 1.25rem) 0 1.0625rem / 100% 0.4375rem no-repeat;
  }

  @media (max-width: 860px) {
    .top {
      grid-template-columns: 1fr;
      row-gap: 0.5rem;
    }

    .aside .sub {
      display: none;
    }

    .open {
      display: none;
    }

    .car {
      border-radius: 2rem 2rem 0.875rem 0.875rem;
      padding: 0.5625rem 0.5625rem 0;
    }

    .glass {
      border-width: 0.3125rem;
      border-radius: 1.5rem 1.5rem 0.875rem 0.875rem;
    }

    .livery {
      padding: 0.55rem 0.3rem 0.6rem;
    }

    .bogies i {
      width: 1.625rem;
      height: 1.625rem;
      bottom: -0.8125rem;
    }

    .rail {
      height: 1.5rem;
      background:
        linear-gradient(var(--muted), var(--muted)) 0 0.75rem / 100% 0.1875rem no-repeat,
        repeating-linear-gradient(90deg, #c8ced6 0 0.3125rem, transparent 0.3125rem 1.25rem) 0 0.9375rem / 100% 0.375rem no-repeat;
    }
  }
</style>
