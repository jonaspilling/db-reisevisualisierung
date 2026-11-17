<script>
  import { onMount } from "svelte";
  import { loadData } from "./lib/data.js";
  import { router, initRouter, isHomePath } from "./lib/router.svelte.js";
  import Header from "./lib/Header.svelte";
  import Footer from "./lib/Footer.svelte";
  import StatsPage from "./pages/StatsPage.svelte";
  import AboutPage from "./pages/AboutPage.svelte";
  import HomePage from "./pages/HomePage.svelte";
  import MapPage from "./pages/MapPage.svelte";

  let data = $state.raw(null);
  let error = $state("");

  // Karte und Projekt sind eine einzige Seite (Home); der Schlüssel verhindert, dass sie dazwischen neu aufgebaut wird
  const isHome = $derived(isHomePath(router.path));
  const pageKey = $derived(isHome ? "home" : router.path);

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
  {#key pageKey}
    <div class="page" class:home={isHome} class:full={router.path === "/karte"}>
      {#if isHome}
        <HomePage trips={data.trips} stations={data.stations} />
      {:else if router.path === "/karte"}
        <MapPage full trips={data.trips} stations={data.stations} />
      {:else if router.path === "/statistik"}
        <StatsPage trips={data.trips} stations={data.stations} />
      {:else}
        <AboutPage trips={data.trips} stations={data.stations} />
      {/if}
    </div>
  {/key}
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
    height: 4px;
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

  /* Eigene Seiten bleiben unter der schwebenden Menü-Pille; die Startseite läuft bis ganz nach oben */
  .page:not(.home):not(.full) {
    padding-top: var(--bar-h);
  }

  /* Die Kartenseite füllt den ganzen Bildschirm, die Pille schwebt darüber */
  .page.full {
    height: 100svh;
  }
</style>
