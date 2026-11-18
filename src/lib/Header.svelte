<script>
  import { onMount } from "svelte";
  import { isHomePath, goSection } from "./router.svelte.js";
  import { jumpToInfo } from "./jump.js";

  let { path } = $props();

  // Platzhalter für Name und Logo: hier an einer Stelle austauschbar
  const BRAND = { name: "Trasse", suffix: "26" };

  // Zwei Ziele: die interaktive Karte (eigene Seite) und das Projekt (Startseite mit allem anderen).
  // Statistik und Erklärung zählen zum Projekt.
  const home = $derived(isHomePath(path));
  const onMap = $derived(path === "/karte");
  const index = $derived(onMap ? 0 : 1);

  let hidden = $state(false);
  let prog = $state(0);

  // Auf der Startseite wird gescrollt statt neu geladen
  function go(e, section) {
    if (!home) return;
    e.preventDefault();
    goSection(section);
  }

  function info(e) {
    if (!home) return; // sonst normaler Link zur Erklärungsseite
    e.preventDefault();
    jumpToInfo();
  }

  // Beim Runterscrollen verschwindet die Leiste, beim Hochscrollen kommt sie sofort zurück.
  // Die Schiene darunter zeigt, wie weit man auf der Seite ist.
  onMount(() => {
    let last = window.scrollY;
    let raf = 0;
    const update = () => {
      raf = 0;
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      prog = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;
      const dy = y - last;
      if (onMap || y < 90) hidden = false;
      else if (dy > 8) hidden = true;
      else if (dy < -8) hidden = false;
      if (Math.abs(dy) > 8) last = y;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  });
</script>

<header class="header" class:hidden class:onmap={onMap}>
  <!-- Verlauf: der Inhalt darunter wird nach oben hin milchig-unscharf, statt hart abgeschnitten zu werden -->
  <div class="veil" aria-hidden="true"></div>

  <div class="bar">
    <a class="brand glass" href="#/" onclick={(e) => go(e, "top")} aria-label="{BRAND.name} {BRAND.suffix}: zum Anfang">
      <span class="name">{BRAND.name}<b>{BRAND.suffix}</b></span>
    </a>

    <nav class="switch glass" style="--i:{index}" aria-label="Hauptnavigation">
      <span class="thumb" aria-hidden="true"></span>
      <a href="#/karte" class:on={index === 0} aria-current={index === 0 ? "page" : undefined}>Karte</a>
      <a href="#/" onclick={(e) => go(e, "top")} class:on={index === 1} aria-current={index === 1 ? "page" : undefined}>Projekt</a>
    </nav>

    <a class="info glass" href="#/ueber" onclick={info}>Info</a>
  </div>

  <!-- Die Schiene: dünne Linie über die ganze Breite, ein kleiner roter Zug fährt mit dem Scrollen mit -->
  {#if !onMap}
    <div class="rail" aria-hidden="true" style="--prog:{prog}">
      <i class="done"></i>
      <i class="train"></i>
    </div>
  {/if}
</header>

<style>
  /* Kein fester Balken: Glasstücke schweben über dem Inhalt, die Leiste braucht keinen Platz */
  .header {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 3000;
    height: 0;
    pointer-events: none;
    transition: transform 520ms var(--ease);
    animation: drop 700ms var(--ease) both;
  }

  .header.hidden {
    transform: translateY(-5.5rem);
  }

  @keyframes drop {
    from {
      opacity: 0;
      transform: translateY(-1.125rem);
    }
  }

  /* Der Schleier: Unschärfe, die nach unten hin ausläuft (nur auf scrollenden Seiten, die Karte soll klar bleiben) */
  .veil {
    position: absolute;
    inset: 0 0 auto 0;
    height: 5.75rem;
    backdrop-filter: blur(14px) saturate(1.25);
    -webkit-backdrop-filter: blur(14px) saturate(1.25);
    mask-image: linear-gradient(to bottom, #000 0%, #000 38%, transparent 100%);
    -webkit-mask-image: linear-gradient(to bottom, #000 0%, #000 38%, transparent 100%);
    background: linear-gradient(to bottom, rgba(255, 255, 255, 0.34), rgba(255, 255, 255, 0));
    transition: opacity 400ms var(--ease);
  }

  .header.onmap .veil {
    opacity: 0;
  }

  .bar {
    position: relative;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding: 0.75rem var(--pad) 0;
  }

  /* Glas: durchscheinend, mit feiner heller Kante oben und weichem Schatten */
  .glass {
    pointer-events: auto;
    background: rgba(255, 255, 255, 0.62);
    backdrop-filter: blur(18px) saturate(1.6);
    -webkit-backdrop-filter: blur(18px) saturate(1.6);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.85),
      inset 0 0 0 1px rgba(255, 255, 255, 0.35),
      0 0 0 1px rgba(40, 45, 55, 0.07),
      0 0.75rem 1.75rem -0.9rem rgba(40, 45, 55, 0.45);
  }

  .brand {
    justify-self: start;
    display: inline-flex;
    align-items: center;
    height: 2.75rem;
    padding-inline: 1rem;
    border-radius: 62.4375rem;
    text-decoration: none;
    transition: transform 160ms var(--ease);
  }

  .brand:active {
    transform: scale(0.96);
  }

  .name {
    font-family: var(--display);
    font-size: 1.15rem;
    font-weight: 900;
    letter-spacing: -0.02em;
    text-transform: uppercase;
    line-height: 1;
  }

  .name b {
    color: var(--red);
    margin-left: 0.2em;
  }

  .info {
    justify-self: end;
    display: inline-flex;
    align-items: center;
    height: 2.75rem;
    padding-inline: 1.1rem;
    border-radius: 62.4375rem;
    text-decoration: none;
    font-weight: 700;
    font-size: 0.95rem;
    color: var(--text);
    transition: transform 160ms var(--ease), background-color 200ms var(--ease);
  }

  .info:hover {
    background: rgba(255, 255, 255, 0.85);
  }

  .info:active {
    transform: scale(0.95);
  }

  /* Der Schalter: eine rote Glaslinse gleitet zwischen den beiden Zielen */
  .switch {
    position: relative;
    display: grid;
    grid-template-columns: 1fr 1fr;
    height: 2.75rem;
    padding: 0.25rem;
    border-radius: 62.4375rem;
    isolation: isolate;
  }

  .thumb {
    position: absolute;
    inset: 0.25rem auto 0.25rem 0.25rem;
    width: calc(50% - 0.25rem);
    border-radius: 62.4375rem;
    background: linear-gradient(180deg, #ff2f45 0%, var(--red) 100%);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.5),
      0 0.4rem 0.9rem -0.4rem rgba(236, 0, 22, 0.7);
    transform: translateX(calc(var(--i, 0) * 100%));
    transition: transform 460ms cubic-bezier(0.34, 1.32, 0.5, 1);
    z-index: -1;
  }

  .switch a {
    display: grid;
    place-items: center;
    padding-inline: 1.25rem;
    min-width: 5.4rem;
    border-radius: 62.4375rem;
    text-decoration: none;
    font-weight: 700;
    font-size: 0.98rem;
    color: var(--muted);
    transition:
      color 260ms var(--ease),
      transform 160ms var(--ease);
  }

  .switch a:hover {
    color: var(--text);
  }

  .switch a:active {
    transform: scale(0.95);
  }

  .switch a.on {
    color: #fff;
  }

  /* Die Schiene unter der Leiste */
  .rail {
    position: absolute;
    left: var(--pad);
    right: var(--pad);
    top: 4.15rem;
    height: 0.1875rem;
    border-radius: 0.125rem;
    background: rgba(40, 45, 55, 0.14);
    transition: opacity 300ms var(--ease);
  }

  .rail i {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    border-radius: inherit;
  }

  .rail .done {
    width: calc(var(--prog) * 100%);
    background: var(--red);
  }

  /* Der Zug an der Spitze: ein kleiner roter Klotz mit weißem Rand */
  .rail .train {
    left: calc(var(--prog) * (100% - 1.1rem));
    width: 1.1rem;
    top: -0.1875rem;
    bottom: -0.1875rem;
    background: var(--red);
    box-shadow: 0 0 0 0.125rem #fff;
  }

  @media (max-width: 560px) {
    .bar {
      grid-template-columns: auto 1fr;
      gap: 0.5rem;
      padding-top: 0.6rem;
    }

    .info {
      display: none;
    }

    .brand {
      height: 2.5rem;
      padding-inline: 0.8rem;
    }

    .name {
      font-size: 1rem;
    }

    .switch {
      justify-self: end;
      height: 2.5rem;
    }

    .thumb {
      inset-block: 0.25rem;
    }

    .switch a {
      min-width: 4.2rem;
      padding-inline: 0.8rem;
      font-size: 0.9rem;
    }

    .rail {
      top: 3.55rem;
    }

    .header.hidden {
      transform: translateY(-5rem);
    }
  }

  @media (max-width: 380px) {
    .brand {
      padding-inline: 0.65rem;
    }

    .name {
      font-size: 0.9rem;
    }

    .switch a {
      min-width: 3.6rem;
      padding-inline: 0.55rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .header {
      animation: none;
      transition: none;
    }

    .thumb {
      transition-duration: 0.01ms;
    }
  }
</style>
