<script>
  // Die Startseite: ganz oben die Karte, darunter nahtlos die Fakten.
  import { onMount } from "svelte";
  import "../projekt/projekt.css";
  import { buildStory } from "../lib/story.js";
  import { prefersReducedMotion } from "../lib/scenes.js";
  import { router, view, replaceHash } from "../lib/router.svelte.js";
  import Hero from "../projekt/Hero.svelte";
  import KartenScene from "../projekt/KartenScene.svelte";
  import LineScene from "../projekt/LineScene.svelte";
  import Earth from "../projekt/Earth.svelte";
  import Moon from "../projekt/Moon.svelte";
  import Time from "../projekt/Time.svelte";
  import Walk from "../projekt/Walk.svelte";
  import Route from "../projekt/Route.svelte";
  import Clock from "../projekt/Clock.svelte";
  import Longest from "../projekt/Longest.svelte";
  import Places from "../projekt/Places.svelte";
  import Kulissen from "../projekt/Kulissen.svelte";
  import Outro from "../projekt/Outro.svelte";

  let { trips, stations } = $props();

  const story = $derived(buildStory(trips, stations));
  // Wer Bewegung abgeschaltet hat, bekommt dieselben Szenen als ruhige Abschnitte untereinander
  const still = prefersReducedMotion();

  let stackEl;

  // Die Szenen der Reihe nach: 0 Anfang, 1 Karte, 2 Fakten (die erste Fakten-Szene).
  // Eine Szene steht ganz oben, wenn ihr Block den Bildschirmrand erreicht hat.
  function sceneY(i) {
    const el = stackEl?.querySelectorAll(":scope > .scene")[i];
    return el ? el.getBoundingClientRect().top + window.scrollY : 0;
  }

  function scrollToSection(section, smooth) {
    const y = section === "facts" ? sceneY(2) : section === "map" ? sceneY(1) : 0;
    window.scrollTo({ top: y, behavior: smooth ? "smooth" : "instant" });
  }

  onMount(() => {
    // Direkter Einstieg über #/projekt: gleich zu den Fakten, sobald das Layout steht
    if (router.path === "/projekt") {
      requestAnimationFrame(() => requestAnimationFrame(() => scrollToSection("facts", false)));
    }

    // Der Schalter im Menü folgt der Scroll-Position
    let raf = 0;
    const spy = () => {
      raf = 0;
      const y = window.scrollY;
      const y1 = sceneY(1);
      const y2 = sceneY(2);
      const zone = y > y1 + (y2 - y1) * 0.6 ? "facts" : "top";
      if (zone !== view.zone) {
        view.zone = zone;
        // Adresse folgt dem Scrollen, ohne die Seite neu aufzubauen
        replaceHash(zone === "facts" ? "#/projekt" : "#/");
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(spy);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    spy();
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
      view.zone = "top";
    };
  });

  // Sprungbefehle aus dem Menü (und vom Abschluss): sanft scrollen
  $effect(() => {
    const cmd = view.cmd;
    if (cmd) scrollToSection(cmd.section, !still);
  });

  // Wechsel von Hand in der Adresszeile (#/ und #/projekt)
  let first = true;
  $effect(() => {
    const path = router.path;
    if (first) {
      first = false;
      return;
    }
    scrollToSection(path === "/projekt" ? "facts" : "top", !still);
  });
</script>

<div class="stack" class:still bind:this={stackEl}>
  <Hero {story} />
  <KartenScene {trips} {stations} />
  <LineScene {story} />
  <Earth {story} />
  <Moon {story} />
  <Time {story} />
  <Walk {story} />
  <Route {story} />
  <Clock {story} />
  <Longest {story} />
  <Places {story} />
  <Kulissen {story} />
</div>
<Outro {story} />
