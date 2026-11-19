<script>
  import { route } from "../lib/route.svelte.js";
  import { theme, setTheme } from "../lib/theme.svelte.js";
  import Logo from "./Logo.svelte";

  const onMap = $derived(route.path === "/karte");
</script>

<header class="bar" class:solid={onMap}>
  <a class="brand" href="#/" aria-label="Jonas' Bordbistro: zur Startseite">
    <Logo size={30} />
    <span class="name">Bord<b>bistro</b></span>
  </a>

  <nav class="nav" aria-label="Hauptnavigation">
    <a href="#/" class:on={!onMap} aria-current={!onMap ? "page" : undefined}>Geschichte</a>
    <a href="#/karte" class:on={onMap} aria-current={onMap ? "page" : undefined}>Karte</a>
  </nav>

  <div class="mode" role="group" aria-label="Darstellung">
    <button type="button" class:on={theme.mode === "dark"} onclick={() => setTheme("dark")} aria-pressed={theme.mode === "dark"}>Dunkel</button>
    <button type="button" class:on={theme.mode === "light"} onclick={() => setTheme("light")} aria-pressed={theme.mode === "light"}>Hell</button>
  </div>
</header>

<style>
  .bar {
    position: fixed;
    inset: 0 0 auto 0;
    z-index: 100;
    height: var(--bar-h);
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding: 0 var(--pad);
    background: linear-gradient(var(--bg), transparent);
    pointer-events: none;
  }

  .bar.solid {
    background: var(--bg);
    border-bottom: 1px solid var(--line);
  }

  .bar > * {
    pointer-events: auto;
  }

  .brand {
    justify-self: start;
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    text-decoration: none;
  }

  .name {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 1.2rem;
    letter-spacing: -0.03em;
  }

  .name b {
    color: var(--red-ink);
  }

  .nav {
    display: flex;
    gap: 0.25rem;
  }

  .nav a {
    padding: 0.5rem 1rem;
    border-radius: 99px;
    text-decoration: none;
    font-weight: 600;
    font-size: 0.95rem;
    color: var(--ink-2);
    transition: color 200ms var(--ease), background-color 200ms var(--ease);
  }

  .nav a:hover {
    color: var(--ink);
  }

  .nav a.on {
    color: var(--on-red);
    background: var(--red);
  }

  .mode {
    justify-self: end;
    display: flex;
    padding: 0.2rem;
    border-radius: 99px;
    border: 1px solid var(--line);
    background: color-mix(in srgb, var(--bg) 70%, transparent);
    backdrop-filter: blur(10px);
  }

  .mode button {
    padding: 0.3rem 0.75rem;
    border-radius: 99px;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--ink-2);
    transition: color 200ms var(--ease), background-color 200ms var(--ease);
  }

  .mode button.on {
    background: var(--ink);
    color: var(--bg);
  }

  @media (max-width: 560px) {
    .name {
      display: none;
    }

    .bar {
      grid-template-columns: auto 1fr auto;
      gap: 0.5rem;
    }

    .nav {
      justify-self: center;
    }

    .nav a {
      padding: 0.45rem 0.8rem;
    }
  }
</style>
