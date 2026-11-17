<script>
  import { view, isHomePath, goSection } from "./router.svelte.js";

  let { path } = $props();

  // Platzhalter für Name und Logo: hier an einer Stelle austauschbar
  const BRAND = { name: "Trasse", suffix: "26" };

  // Zwei Ziele: die interaktive Karte (eigene Seite) und das Projekt (Startseite mit allem anderen).
  // Statistik und Erklärung zählen zum Projekt.
  const home = $derived(isHomePath(path));
  const index = $derived(path === "/karte" ? 0 : 1);

  // Auf der Startseite wird gescrollt statt neu geladen
  function go(e, section) {
    if (!home) return;
    e.preventDefault();
    goSection(section);
  }
</script>

<header class="header">
  <div class="pill" style="--i:{index}">
    <a class="brand" href="#/" onclick={(e) => go(e, "top")} aria-label="{BRAND.name} {BRAND.suffix}: zur Karte">
      <span class="logo" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18">
          <path d="M5 19v-6m5 6V9m5 10V5m5 14v-8" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" fill="none" />
        </svg>
      </span>
      <span class="name">{BRAND.name}<b>{BRAND.suffix}</b></span>
    </a>

    <span class="rule" aria-hidden="true"></span>

    <nav class="switch" aria-label="Hauptnavigation">
      <span class="thumb" aria-hidden="true"></span>
      <a href="#/karte" class:on={index === 0} aria-current={index === 0 ? "page" : undefined}>Karte</a>
      <a href="#/" onclick={(e) => go(e, "top")} class:on={index === 1} aria-current={index === 1 ? "page" : undefined}>Projekt</a>
    </nav>
  </div>
</header>

<style>
  /* Kein Header: die Pille schwebt über dem Inhalt und braucht keinen Platz */
  .header {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 3000;
    height: 0;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 0.75rem;
    pointer-events: none;
  }

  .pill {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    height: 3rem;
    padding: 0.3125rem 0.3125rem 0.3125rem 0.5rem;
    border-radius: 62.4375rem;
    background: #fff;
    box-shadow:
      0 0 0 1px rgba(40, 45, 55, 0.08),
      0 0.5rem 1.5rem -0.625rem rgba(40, 45, 55, 0.35);
    animation: drop 700ms var(--ease) both;
  }

  @keyframes drop {
    from {
      opacity: 0;
      transform: translateY(-1.125rem) scale(0.96);
    }
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    padding-right: 0.35rem;
    text-decoration: none;
    border-radius: 62.4375rem;
    transition: transform 160ms var(--ease);
  }

  .brand:active {
    transform: scale(0.96);
  }

  .logo {
    width: 2.125rem;
    height: 2.125rem;
    border-radius: 50%;
    background: var(--red);
    color: var(--on-red);
    display: grid;
    place-items: center;
    transition: transform 420ms var(--ease);
  }

  .brand:hover .logo {
    transform: rotate(-12deg) scale(1.06);
  }

  .name {
    font-size: 1.1rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1;
  }

  .name b {
    color: var(--red);
    margin-left: 0.15em;
  }

  .rule {
    width: 1px;
    height: 1.375rem;
    background: var(--line);
  }

  /* Der Schalter: eine rote Kapsel gleitet zwischen den beiden Zielen */
  .switch {
    position: relative;
    display: grid;
    grid-template-columns: 1fr 1fr;
    height: 2.375rem;
    border-radius: 62.4375rem;
    background: var(--panel-2);
    isolation: isolate;
  }

  .thumb {
    position: absolute;
    inset: 0.1875rem auto 0.1875rem 0.1875rem;
    width: calc(50% - 0.1875rem);
    border-radius: 62.4375rem;
    background: var(--red);
    transform: translateX(calc(var(--i, 0) * 100%));
    transition: transform 460ms cubic-bezier(0.34, 1.32, 0.5, 1);
    z-index: -1;
  }

  .switch a {
    display: grid;
    place-items: center;
    padding-inline: 1.15rem;
    min-width: 5.2rem;
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

  @media (max-width: 560px) {
    .name {
      display: none;
    }

    .brand {
      padding-right: 0;
    }

    .switch a {
      min-width: 4.4rem;
      padding-inline: 0.8rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pill {
      animation: none;
    }

    .thumb {
      transition-duration: 0.01ms;
    }
  }
</style>
