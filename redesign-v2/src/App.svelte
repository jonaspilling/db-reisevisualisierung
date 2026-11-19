<script>
  import { onMount } from "svelte";
  import { loadData } from "./lib/data.js";
  import { route } from "./lib/route.svelte.js";
  import { gsap, ScrollTrigger, reduce } from "./lib/motion.js";
  import { bubbles } from "./lib/fx.js";
  import Header from "./components/Header.svelte";
  import Footer from "./components/Footer.svelte";
  import Landscape from "./components/Landscape.svelte";
  import Cursor from "./components/Cursor.svelte";
  import Studio from "./components/Studio.svelte";
  import Logo from "./components/Logo.svelte";
  import Home from "./views/Home.svelte";
  import Fahrten from "./views/Fahrten.svelte";
  import MapView from "./views/MapView.svelte";
  import Bahnhoefe from "./views/Bahnhoefe.svelte";
  import Info from "./views/Info.svelte";

  let data = $state.raw(null);
  let error = $state("");
  let curtain;
  let busy = false;

  onMount(() => {
    loadData().then((d) => (data = d), (e) => (error = String(e.message || e)));
    // Jeder Klick lässt ein paar Bierblasen aufsteigen
    const click = (e) => {
      if (e.target.closest?.("input, textarea, select, .maplibregl-canvas")) return;
      bubbles(e.clientX, e.clientY, 6);
    };
    addEventListener("pointerdown", click);
    return () => removeEventListener("pointerdown", click);
  });

  // Seitenwechsel: ein roter Vorhang fährt wie ein Zug durchs Bild, dahinter wechselt die Seite
  $effect(() => {
    const next = route.path;
    if (next === route.shown) return;
    if (reduce || !curtain || busy) {
      route.shown = next;
      scrollTo(0, 0);
      return;
    }
    busy = true;
    const tl = gsap.timeline({ onComplete: () => (busy = false) });
    tl.set(curtain, { xPercent: -100, display: "block" })
      .to(curtain, { xPercent: 0, duration: 0.5, ease: "power4.inOut" })
      .add(() => {
        route.shown = route.path;
        scrollTo({ top: 0, behavior: "instant" });
        ScrollTrigger.getAll().forEach((s) => s.kill());
      })
      .to(curtain, { xPercent: 100, duration: 0.55, ease: "power4.inOut", delay: 0.12 })
      .set(curtain, { display: "none" });
  });

  const pages = { "/": Home, "/karte": MapView, "/fahrten": Fahrten, "/bahnhoefe": Bahnhoefe, "/info": Info };
  const Page = $derived(pages[route.shown]);
</script>

<Landscape off={route.shown === "/karte"} />
<Header />

<div class="curtain" bind:this={curtain} aria-hidden="true">
  <div class="mark"><Logo size={120} /><span>Bordbistro</span></div>
</div>

{#if error}
  <main class="state"><h1>Das hat nicht geklappt.</h1><p>{error}</p></main>
{:else if !data}
  <main class="state" aria-live="polite"><p class="mono">Fahrten werden geladen …</p></main>
{:else}
  {#key route.shown}
    <Page {data} />
  {/key}
  {#if route.shown !== "/karte"}<Footer />{/if}
{/if}

<Studio />
<Cursor />

<style>
  .state {
    position: relative;
    z-index: 1;
    min-height: 100svh;
    display: grid;
    place-content: center;
    gap: 1rem;
    text-align: center;
    padding: var(--pad);
    color: var(--ink-2);
  }

  .curtain {
    position: fixed;
    inset: 0;
    z-index: 300;
    display: none;
    background: var(--red);
    pointer-events: none;
    overflow: hidden;
  }

  .mark {
    position: absolute;
    right: 5vw;
    bottom: 6vh;
    display: flex;
    align-items: center;
    gap: 1.2rem;
    font: var(--fw) clamp(2.4rem, 9vw, 7rem) var(--font-display);
    letter-spacing: var(--ls);
    color: rgba(255, 255, 255, 0.95);
  }
</style>
