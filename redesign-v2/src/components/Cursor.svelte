<script>
  // Eigener Zeiger (nur mit Maus): ein Ring, der der Maus nachläuft, über klickbaren Dingen wächst und ein Wort zeigt.
  import { onMount } from "svelte";
  import { gsap, reduce } from "../lib/motion.js";

  let ring, dot, lbl;
  let on = $state(false);

  onMount(() => {
    if (reduce || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    on = true;
    const rx = gsap.quickTo(ring, "x", { duration: 0.38, ease: "power3.out" });
    const ry = gsap.quickTo(ring, "y", { duration: 0.38, ease: "power3.out" });
    const move = (e) => {
      rx(e.clientX);
      ry(e.clientY);
      gsap.set(dot, { x: e.clientX, y: e.clientY });
      ring.style.opacity = 1;
      dot.style.opacity = 1;
    };
    const over = (e) => {
      const t = e.target.closest?.("[data-cursor], a, button, input[type=range], summary");
      const text = t?.getAttribute?.("data-cursor") || "";
      lbl.textContent = text;
      ring.classList.toggle("big", !!t);
      ring.classList.toggle("txt", !!text);
    };
    const down = () => ring.classList.add("press");
    const up = () => ring.classList.remove("press");
    const out = () => {
      ring.style.opacity = 0;
      dot.style.opacity = 0;
    };
    addEventListener("pointermove", move);
    addEventListener("pointerover", over);
    addEventListener("pointerdown", down);
    addEventListener("pointerup", up);
    document.addEventListener("pointerleave", out);
    return () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerover", over);
      removeEventListener("pointerdown", down);
      removeEventListener("pointerup", up);
      document.removeEventListener("pointerleave", out);
    };
  });
</script>

<div class="ring" class:hide={!on} bind:this={ring} aria-hidden="true"><span bind:this={lbl}></span></div>
<div class="dot" class:hide={!on} bind:this={dot} aria-hidden="true"></div>

<style>
  .ring,
  .dot {
    position: fixed;
    left: 0;
    top: 0;
    z-index: 998;
    pointer-events: none;
    opacity: 0;
  }

  .hide {
    display: none;
  }

  .ring {
    width: 2.4rem;
    height: 2.4rem;
    margin: -1.2rem 0 0 -1.2rem;
    border-radius: 50%;
    border: 1.5px solid var(--ink);
    display: grid;
    place-items: center;
    mix-blend-mode: difference;
    transition: width 350ms var(--ease), height 350ms var(--ease), margin 350ms var(--ease), background-color 250ms, opacity 250ms;
  }

  .ring :global(span) {
    font: 600 0.7rem var(--font-mono);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #fff;
    opacity: 0;
    transition: opacity 200ms;
  }

  .ring.big {
    width: 3.6rem;
    height: 3.6rem;
    margin: -1.8rem 0 0 -1.8rem;
    background: rgba(255, 255, 255, 0.14);
  }

  .ring.txt {
    width: 5.6rem;
    height: 5.6rem;
    margin: -2.8rem 0 0 -2.8rem;
  }

  .ring.txt :global(span) {
    opacity: 1;
  }

  .ring.press {
    transform: scale(0.8);
  }

  .dot {
    width: 6px;
    height: 6px;
    margin: -3px 0 0 -3px;
    border-radius: 50%;
    background: var(--red-ink);
  }
</style>
