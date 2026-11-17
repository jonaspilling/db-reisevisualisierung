<script>
  import { onMount } from "svelte";
  import { jumpToInfo } from "./jump.js";

  // Schwebender Knopf auf der Startseite: springt ans Ende zu Projektbeschreibung und Kontakt.
  // Er verschwindet, sobald dieses Ende im Bild ist.
  let atEnd = $state(false);
  let started = $state(false);

  onMount(() => {
    const el = document.getElementById("info");
    const io = el ? new IntersectionObserver(([e]) => (atEnd = e.isIntersecting), { threshold: 0.15 }) : null;
    io?.observe(el);
    const onScroll = () => (started = window.scrollY > window.innerHeight * 0.5);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io?.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  });
</script>

<button type="button" class="jump" class:show={started && !atEnd} onclick={jumpToInfo} aria-label="Zum Ende: Projektbeschreibung und Kontakt" tabindex={started && !atEnd ? 0 : -1}>
  <span>Projekt &amp; Kontakt</span>
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 4v14m0 0-6-6m6 6 6-6M5 21h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none" /></svg>
</button>

<style>
  .jump {
    position: fixed;
    z-index: 900;
    right: 1.25rem;
    bottom: 1.25rem;
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.7rem 1rem 0.7rem 1.2rem;
    background: var(--text);
    color: #fff;
    border-radius: 999px;
    font-weight: 800;
    font-size: 0.9rem;
    box-shadow: var(--shadow-lg);
    opacity: 0;
    transform: translateY(1rem) scale(0.96);
    pointer-events: none;
    transition:
      opacity 260ms var(--ease),
      transform 260ms var(--ease),
      background-color 140ms var(--ease);
  }

  .jump.show {
    opacity: 1;
    transform: none;
    pointer-events: auto;
  }

  .jump:hover {
    background: var(--red);
  }

  .jump.show:active {
    transform: scale(0.96);
  }

  @media (max-width: 560px) {
    .jump span {
      display: none;
    }

    .jump {
      padding: 0.8rem;
    }
  }
</style>
