<script>
  import { onMount, tick } from "svelte";
  import { route, PAGES } from "../lib/route.svelte.js";
  import { gsap, magnet } from "../lib/motion.js";
  import Logo from "./Logo.svelte";

  let nav, pill;
  let open = $state(false);
  let scrolled = $state(false);
  const active = $derived(route.path);

  // Die rote Pille gleitet unter den aktiven Link
  async function movePill(instant = false) {
    await tick();
    const a = nav?.querySelector("a.on");
    if (!a || !pill) return;
    const n = nav.getBoundingClientRect();
    const r = a.getBoundingClientRect();
    const to = { x: r.left - n.left, width: r.width, opacity: 1 };
    instant ? gsap.set(pill, to) : gsap.to(pill, { ...to, duration: 0.55, ease: "power4.out" });
  }

  $effect(() => {
    active;
    movePill();
  });

  onMount(() => {
    movePill(true);
    const onResize = () => movePill(true);
    const onScroll = () => (scrolled = scrollY > 24);
    addEventListener("resize", onResize);
    addEventListener("scroll", onScroll, { passive: true });
    document.fonts?.ready.then(() => movePill(true));
    return () => {
      removeEventListener("resize", onResize);
      removeEventListener("scroll", onScroll);
    };
  });

  $effect(() => {
    document.documentElement.style.overflow = open ? "hidden" : "";
  });

  const go = () => (open = false);
</script>

<header class="bar" class:scrolled={scrolled && active !== "/karte"} class:map={active === "/karte"}>
  <a class="brand" href="#/" aria-label="Jonas' Bordbistro: zur Startseite" use:magnet={0.25}>
    <Logo size={34} />
    <span class="name">Bord<b>bistro</b></span>
  </a>

  <nav class="nav" aria-label="Hauptnavigation" bind:this={nav}>
    <i class="pill" bind:this={pill} aria-hidden="true"></i>
    {#each PAGES as p}
      <a href={"#" + p.path} class:on={active === p.path} aria-current={active === p.path ? "page" : undefined}>{p.label}</a>
    {/each}
  </nav>

  <button class="burger" type="button" aria-expanded={open} aria-label="Menü" onclick={() => (open = !open)}>
    <i></i><i></i>
  </button>
</header>

{#if open}
  <div class="sheet" role="dialog" aria-label="Menü">
    {#each PAGES as p, i}
      <a href={"#" + p.path} onclick={go} style="--i:{i}" class:on={active === p.path}><span class="mono">0{i + 1}</span>{p.label}</a>
    {/each}
  </div>
{/if}

<style>
  .bar {
    position: fixed;
    inset: 0 0 auto 0;
    z-index: 100;
    height: var(--bar-h);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--pad);
    transition: background-color 300ms var(--ease), box-shadow 300ms var(--ease);
  }

  .bar.scrolled {
    background: color-mix(in srgb, var(--bg) 82%, transparent);
    backdrop-filter: blur(14px);
    box-shadow: 0 1px 0 var(--line);
  }

  /* Auf der Karte schwebt die Leiste: keine Fläche, nur Logo und Navigation als eigene Pillen */
  .bar.map {
    pointer-events: none;
  }

  .bar.map .brand,
  .bar.map .nav,
  .bar.map .burger {
    pointer-events: auto;
  }

  .bar.map .brand {
    padding: 0.35rem 0.9rem 0.35rem 0.4rem;
    border-radius: 99px;
    background: color-mix(in srgb, var(--bg) 82%, transparent);
    backdrop-filter: blur(12px);
    box-shadow: 0 0 0 1px var(--line);
  }

  .bar.map .burger {
    background: color-mix(in srgb, var(--bg) 82%, transparent);
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    text-decoration: none;
  }

  .name {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 1.25rem;
    letter-spacing: -0.03em;
  }

  .name b {
    color: var(--red-ink);
  }

  .nav {
    position: relative;
    display: flex;
    padding: 0.25rem;
    border-radius: 99px;
    border: 1px solid var(--line);
    background: color-mix(in srgb, var(--bg) 60%, transparent);
    backdrop-filter: blur(10px);
  }

  .pill {
    position: absolute;
    left: 0;
    top: 0.25rem;
    bottom: 0.25rem;
    width: 0;
    opacity: 0;
    border-radius: 99px;
    background: var(--red);
  }

  .nav a {
    position: relative;
    z-index: 1;
    padding: 0.45rem 1rem;
    border-radius: 99px;
    text-decoration: none;
    font-weight: 600;
    font-size: 0.93rem;
    color: var(--ink-2);
    transition: color 250ms var(--ease);
  }

  .nav a:hover {
    color: var(--ink);
  }

  .nav a.on {
    color: var(--on-red);
  }

  .burger {
    display: none;
    width: 2.8rem;
    height: 2.8rem;
    border-radius: 50%;
    border: 1px solid var(--line);
    position: relative;
  }

  .burger i {
    position: absolute;
    left: 0.8rem;
    right: 0.8rem;
    height: 2px;
    background: var(--ink);
    transition: transform 300ms var(--ease);
  }

  .burger i:first-child {
    top: 1.05rem;
  }

  .burger i:last-child {
    bottom: 1.05rem;
  }

  .burger[aria-expanded="true"] i:first-child {
    transform: translateY(0.3rem) rotate(45deg);
  }

  .burger[aria-expanded="true"] i:last-child {
    transform: translateY(-0.3rem) rotate(-45deg);
  }

  .sheet {
    position: fixed;
    inset: 0;
    z-index: 99;
    background: var(--bg);
    display: grid;
    align-content: center;
    gap: 0.4rem;
    padding: 6rem var(--pad) 2rem;
    animation: sheet-in 450ms var(--ease) both;
  }

  .sheet a {
    display: flex;
    align-items: baseline;
    gap: 1rem;
    padding: 0.4rem 0;
    text-decoration: none;
    font-family: var(--font-display);
    font-weight: 800;
    font-size: clamp(2.6rem, 13vw, 4.6rem);
    letter-spacing: -0.04em;
    line-height: 1;
    animation: link-in 600ms var(--ease) both;
    animation-delay: calc(var(--i) * 60ms + 100ms);
  }

  .sheet a .mono {
    color: var(--ink-2);
    font-size: 0.8rem;
  }

  .sheet a.on {
    color: var(--red-ink);
  }

  @keyframes sheet-in {
    from {
      clip-path: circle(0% at calc(100% - 2.5rem) 2.5rem);
    }
    to {
      clip-path: circle(150% at calc(100% - 2.5rem) 2.5rem);
    }
  }

  @keyframes link-in {
    from {
      opacity: 0;
      transform: translateY(1.4rem);
    }
  }

  @media (max-width: 860px) {
    .nav {
      display: none;
    }

    .burger {
      display: block;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .sheet,
    .sheet a {
      animation: none;
    }
  }
</style>
