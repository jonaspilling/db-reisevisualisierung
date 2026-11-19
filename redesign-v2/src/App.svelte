<script>
  import { onMount } from "svelte";
  import { loadData } from "./lib/data.js";
  import { route } from "./lib/route.svelte.js";
  import Header from "./components/Header.svelte";
  import Story from "./views/Story.svelte";
  import MapView from "./views/MapView.svelte";

  let data = $state.raw(null);
  let error = $state("");

  onMount(() => {
    loadData().then((d) => (data = d), (e) => (error = String(e.message || e)));
  });
</script>

<Header />

{#if error}
  <main class="state"><h1>Das hat nicht geklappt.</h1><p>{error}</p></main>
{:else if !data}
  <main class="state" aria-live="polite"><p class="mono">Fahrten werden geladen …</p></main>
{:else if route.path === "/karte"}
  <MapView {data} />
{:else}
  <Story {data} />
{/if}

<style>
  .state {
    min-height: 100svh;
    display: grid;
    place-content: center;
    gap: 1rem;
    text-align: center;
    padding: var(--pad);
    color: var(--ink-2);
  }
</style>
