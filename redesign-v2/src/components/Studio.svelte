<script>
  // Studio: Schrift und Logo live ausprobieren. Öffnet sich über den Knopf "Aa" unten links.
  import { studio, FONTS, LOGOS, setFont, setLogo } from "../lib/studio.svelte.js";
  import { gsap, reduce } from "../lib/motion.js";
  import Logo from "./Logo.svelte";

  let open = $state(false);
  let panel;

  $effect(() => {
    if (open && panel && !reduce) gsap.fromTo(panel, { y: 20, opacity: 0, scale: 0.96 }, { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: "power3.out" });
  });
</script>

<div class="studio">
  {#if open}
    <div class="panel" bind:this={panel} role="dialog" aria-label="Schrift und Logo">
      <p class="mono h">Schrift der Überschriften</p>
      <ul class="fonts">
        {#each FONTS as f}
          <li>
            <button type="button" class:on={studio.font === f.id} onclick={() => setFont(f.id)} style="font-family:{f.css}">
              <span>{f.name}</span><em>Jonas' Bordbistro</em>
            </button>
          </li>
        {/each}
      </ul>
      <p class="mono h">Logo</p>
      <ul class="logos">
        {#each LOGOS as l, i}
          <li>
            <button type="button" class:on={studio.logo === i} onclick={() => setLogo(i)} aria-label={l} title={l}>
              <Logo size={46} v={i} />
            </button>
          </li>
        {/each}
      </ul>
      <p class="note">Deine Wahl bleibt im Browser gespeichert.</p>
    </div>
  {/if}
  <button type="button" class="fab" aria-expanded={open} aria-label="Schrift und Logo wählen" onclick={() => (open = !open)} data-cursor={open ? "Zu" : "Studio"}>
    {open ? "×" : "Aa"}
  </button>
</div>

<style>
  .studio {
    position: fixed;
    left: 1rem;
    bottom: 1rem;
    z-index: 500;
  }

  .fab {
    width: 3.2rem;
    height: 3.2rem;
    border-radius: 50%;
    background: var(--ink);
    color: var(--bg);
    font: 800 1.1rem var(--font-display);
    letter-spacing: -0.03em;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
    transition: transform 250ms var(--ease), background-color 250ms var(--ease);
  }

  .fab:hover {
    transform: rotate(-8deg) scale(1.06);
    background: var(--red);
    color: #fff;
  }

  .panel {
    position: absolute;
    left: 0;
    bottom: 4rem;
    width: min(21rem, calc(100vw - 2rem));
    padding: 1.1rem;
    border-radius: 1.4rem;
    background: color-mix(in srgb, var(--bg-2) 92%, transparent);
    backdrop-filter: blur(16px);
    border: 1px solid var(--line);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
    transform-origin: 0 100%;
  }

  .h {
    color: var(--ink-2);
    margin-bottom: 0.6rem;
  }

  ul {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 0.35rem;
    margin-bottom: 1.1rem;
  }

  .fonts button {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.6rem;
    padding: 0.55rem 0.8rem;
    border-radius: 0.8rem;
    text-align: left;
    font-weight: 700;
    transition: background-color 200ms var(--ease);
  }

  .fonts button em {
    font-style: normal;
    color: var(--ink-2);
    font-size: 0.85rem;
    white-space: nowrap;
  }

  .fonts button:hover {
    background: var(--bg-3);
  }

  .fonts button.on {
    background: var(--red);
    color: #fff;
  }

  .fonts button.on em {
    color: rgba(255, 255, 255, 0.85);
  }

  .logos {
    grid-template-columns: repeat(4, 1fr);
  }

  .logos button {
    width: 100%;
    display: grid;
    place-items: center;
    padding: 0.6rem 0;
    border-radius: 0.9rem;
    box-shadow: inset 0 0 0 1px var(--line);
    transition: transform 250ms var(--ease), box-shadow 250ms var(--ease);
  }

  .logos button:hover {
    transform: translateY(-3px);
  }

  .logos button.on {
    box-shadow: inset 0 0 0 2px var(--ink);
  }

  .note {
    color: var(--ink-2);
    font-size: 0.8rem;
  }
</style>
