<script>
  import { onMount, tick } from "svelte";
  import { loadData } from "./lib/data.js";
  import { router, initRouter, isHomePath } from "./lib/router.svelte.js";
  import Header from "./lib/Header.svelte";
  import Footer from "./lib/Footer.svelte";
  import { isPhone } from "./lib/scenes.js";
  import StatsPage from "./pages/StatsPage.svelte";
  import AboutPage from "./pages/AboutPage.svelte";
  import HomePage from "./pages/HomePage.svelte";
  import MapPage from "./pages/MapPage.svelte";

  // Handy: der schwebende Sprungknopf überdeckt Text, dort gibt es stattdessen den Link im Hero
  const phoneUi = isPhone();
  let data = $state.raw(null);
  let error = $state("");

  // Karte und Projekt sind eine einzige Seite (Home); der Schlüssel verhindert, dass sie dazwischen neu aufgebaut wird
  const isHome = $derived(isHomePath(router.path));
  const pageKey = $derived(isHome ? "home" : router.path);

  // Startseite und Kartenseite sind schwer (Szenen, WebGL-Karte). Nach dem ersten Besuch bleiben sie aufgebaut und
  // werden nur ausgeblendet: der Wechsel ist sofort da, nichts baut sich neu auf, die Scroll-Position bleibt erhalten.
  const visited = $state({ home: false, "/karte": false });
  $effect(() => {
    if (pageKey in visited) visited[pageKey] = true;
  });

  // Am Rechner wird die Kartenseite im Hintergrund vorbereitet, sobald die Startseite steht und der Browser Pause hat:
  // der erste Wechsel zur Karte ist dann sofort da statt einer leeren Seite, bis sich die Karte aufgebaut hat.
  // Auf dem Handy bleibt es beim Aufbau beim ersten Besuch (zwei WebGL-Karten gleichzeitig wären dort zu viel).
  $effect(() => {
    if (!data || phoneUi) return;
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 4000));
    const cancel = window.cancelIdleCallback || clearTimeout;
    const id = idle(() => (visited["/karte"] = true), { timeout: 7000 });
    return () => cancel(id);
  });

  // Scroll-Position der Startseite merken und beim Zurückkommen wiederherstellen
  let homeY = 0;
  onMount(() => {
    const onScroll = () => {
      if (pageKey === "home") homeY = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  });
  let lastKey = null;
  $effect(() => {
    const key = pageKey;
    const prev = lastKey;
    lastKey = key;
    if (prev === null || prev === key) return;
    tick().then(() => {
      if (key === "home") window.scrollTo({ top: homeY, behavior: "instant" });
      else if (key === "/karte") window.scrollTo({ top: 0, behavior: "instant" });
    });
  });

  onMount(() => {
    const stop = initRouter();
    loadData()
      .then((d) => (data = d))
      .catch((e) => (error = String(e.message || e)));
    return stop;
  });
</script>

<Header path={router.path} />

{#if error}
  <div class="state">
    <h1>Das hat nicht geklappt.</h1>
    <p class="lead">{error}</p>
  </div>
{:else if !data}
  <div class="state" aria-live="polite">
    <div class="loader" aria-hidden="true"><i></i></div>
    <p class="muted">Fahrten werden geladen …</p>
  </div>
{:else}
  {#if visited.home || pageKey === "home"}
    <div class="page home" class:off={pageKey !== "home"}>
      <HomePage trips={data.trips} stations={data.stations} />
    </div>
  {/if}
  {#if visited["/karte"] || pageKey === "/karte"}
    <div class="page full" class:off={pageKey !== "/karte"}>
      <MapPage full active={pageKey === "/karte"} trips={data.trips} stations={data.stations} />
    </div>
  {/if}
  {#if pageKey === "/statistik" || pageKey === "/ueber"}
    {#key pageKey}
      <div class="page">
        {#if pageKey === "/statistik"}
          <StatsPage trips={data.trips} stations={data.stations} />
        {:else}
          <AboutPage trips={data.trips} stations={data.stations} />
        {/if}
      </div>
    {/key}
  {/if}
  {#if router.path !== "/karte"}<Footer />{/if}
{/if}

<style>
  .state {
    min-height: calc(100svh - var(--header-h));
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1.2rem;
    text-align: center;
    padding: var(--pad);
  }

  .state h1 {
    font-size: clamp(2.2rem, 5vw, 3.6rem);
  }

  .muted {
    color: var(--muted);
  }

  /* Ladebalken in DB-Rot */
  .loader {
    width: 9rem;
    height: 0.25rem;
    border-radius: var(--r);
    background: var(--panel-2);
    overflow: hidden;
  }

  .loader i {
    display: block;
    width: 40%;
    height: 100%;
    border-radius: var(--r);
    background: var(--red);
    animation: slide 1.1s var(--ease) infinite;
  }

  @keyframes slide {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(260%);
    }
  }

  .page {
    min-height: calc(100svh - var(--header-h));
  }

  /* Ausgeblendete Seite bleibt im Speicher, nimmt aber keinen Platz und kostet nichts */
  .page.off {
    display: none;
  }

  /* Die Karte behält ihre Größe auch im Hintergrund (nur unsichtbar und aus dem Fluss genommen): beim Zurückkommen
     muss sie sich nicht neu einmessen und einpassen, sie ist sofort da */
  .page.full.off {
    display: block;
    position: fixed;
    inset: 0;
    width: 100%;
    /* weit nach links aus dem Bild geschoben (Größe bleibt gleich): so bleibt auch nichts Kleines davon stehen,
       etwa die Quellenangabe der Karte, die sonst über der Startseite klebte */
    transform: translate3d(-150%, 0, 0);
    visibility: hidden;
    pointer-events: none;
    animation: none;
  }

  /* Eigene Seiten bleiben unter der schwebenden Menü-Pille; die Startseite läuft bis ganz nach oben */
  .page:not(.home):not(.full):not(.off) {
    padding-top: var(--bar-h);
  }

  /* Die Kartenseite füllt den ganzen Bildschirm, die Pille schwebt darüber */
  .page.full {
    height: 100svh;
  }
</style>
