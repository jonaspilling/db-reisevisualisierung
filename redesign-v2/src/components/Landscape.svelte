<script>
  // Der Hintergrund: eine Landschaft, die beim Scrollen vorbeizieht, als säßest du im Zug.
  // Sonne und Mond wandern über den Himmel, die Farbe am Horizont wechselt vom Morgen über den Tag zum Abend.
  // Alles wird mit einem einzigen Scroll-Handler bewegt (nur transform), die Karte lässt ihn ruhen.
  import { onMount } from "svelte";
  import { gsap, reduce } from "../lib/motion.js";

  let { off = false } = $props();
  let sky, glow, orb, far, mid, near, poles, rail, stars;

  const TILE = 1600;
  // Hügel: Summe von Sinuswellen mit ganzzahliger Periode, damit sich die Kachel nahtlos wiederholt
  function hills(base, amps, phase, h) {
    const pts = [];
    for (let x = 0; x <= TILE * 2; x += 16) {
      let y = base;
      amps.forEach(([k, a], i) => (y += Math.sin(((x / TILE) * k + phase + i) * Math.PI * 2) * a));
      pts.push(`${x} ${y.toFixed(1)}`);
    }
    return `M0 ${h}L${pts.join("L")}L${TILE * 2} ${h}Z`;
  }
  const hFar = hills(150, [[2, 34], [5, 12]], 0.1, 320);
  const hMid = hills(210, [[3, 30], [7, 9]], 0.45, 320);
  const hNear = hills(262, [[4, 22], [9, 7]], 0.8, 320);

  // Strommasten mit hängenden Leitungen
  const wires = Array.from({ length: 8 }, (_, i) => {
    const x0 = i * 400, x1 = x0 + 400;
    return `M${x0} 70Q${(x0 + x1) / 2} 112 ${x1} 70M${x0} 84Q${(x0 + x1) / 2} 124 ${x1} 84`;
  }).join("");
  const mastX = Array.from({ length: 8 }, (_, i) => i * 400);

  const starDots = Array.from({ length: 46 }, (_, i) => ({
    x: (i * 137.5) % 100,
    y: (i * 61.8) % 56,
    r: 0.8 + ((i * 7) % 5) * 0.35,
    d: (i * 0.37) % 3,
  }));

  const HORIZON = ["#c9602f", "#2f7a78", "#8f3550"]; // Morgenrot, Tag (Blaugrün), Abendrot
  const ORB = ["#ffb36b", "#f3ead7", "#ff7a66"];

  onMount(() => {
    if (reduce) {
      gsap.set(glow, { background: `linear-gradient(transparent 40%, ${HORIZON[0]}55)` });
      return;
    }
    let raf = 0;
    const wrap = (v, m) => ((v % m) + m) % m;
    const mix = gsap.utils.interpolate;
    function frame() {
      raf = 0;
      const y = scrollY;
      const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
      const p = Math.min(1, y / max);
      const w = innerWidth;
      gsap.set(far, { x: -wrap(y * 0.06, w) });
      gsap.set(mid, { x: -wrap(y * 0.16, w) });
      gsap.set(near, { x: -wrap(y * 0.34, w) });
      gsap.set(poles, { x: -wrap(y * 0.9, w) });
      gsap.set(rail, { x: -wrap(y * 2.2, 56) });
      // Sonne/Mond
      const ox = 8 + 84 * p;
      const oy = 72 - 56 * Math.sin(Math.PI * p);
      const col = p < 0.5 ? mix(ORB[0], ORB[1], p * 2) : mix(ORB[1], ORB[2], (p - 0.5) * 2);
      orb.style.transform = `translate3d(${ox}vw, ${oy}vh, 0)`;
      orb.style.background = col;
      orb.style.boxShadow = `0 0 80px 24px ${col}55`;
      const hz = p < 0.5 ? mix(HORIZON[0], HORIZON[1], p * 2) : mix(HORIZON[1], HORIZON[2], (p - 0.5) * 2);
      glow.style.background = `linear-gradient(transparent 38%, ${hz}33 78%, ${hz}66)`;
    }
    const req = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    frame();
    addEventListener("scroll", req, { passive: true });
    addEventListener("resize", req);
    return () => {
      removeEventListener("scroll", req);
      removeEventListener("resize", req);
      cancelAnimationFrame(raf);
    };
  });
</script>

<div class="land" class:off aria-hidden="true">
  <div class="sky" bind:this={sky}></div>
  <div class="stars" bind:this={stars}>
    {#each starDots as s}<i style="left:{s.x}%;top:{s.y}%;width:{s.r}px;height:{s.r}px;animation-delay:{s.d}s"></i>{/each}
  </div>
  <div class="glow" bind:this={glow}></div>
  <div class="orb" bind:this={orb}></div>

  <svg class="layer far" bind:this={far} viewBox="0 0 {TILE * 2} 320" preserveAspectRatio="none"><path d={hFar} /></svg>
  <svg class="layer mid" bind:this={mid} viewBox="0 0 {TILE * 2} 320" preserveAspectRatio="none"><path d={hMid} /></svg>
  <svg class="layer near" bind:this={near} viewBox="0 0 {TILE * 2} 320" preserveAspectRatio="none"><path d={hNear} /></svg>

  <svg class="poles" bind:this={poles} viewBox="0 0 {TILE * 2} 300" preserveAspectRatio="none">
    <path d={wires} class="wire" />
    {#each mastX as x}
      <g transform="translate({x} 0)">
        <rect x="-4" y="60" width="8" height="240" />
        <rect x="-34" y="66" width="68" height="6" />
        <rect x="-26" y="80" width="52" height="5" />
      </g>
    {/each}
  </svg>

  <div class="railbed"><div class="sleepers" bind:this={rail}></div></div>
</div>

<style>
  .land {
    position: fixed;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    pointer-events: none;
    transition: opacity 400ms var(--ease);
  }

  .land.off {
    opacity: 0;
    visibility: hidden;
  }

  .sky {
    position: absolute;
    inset: 0;
    background: linear-gradient(#0a110e, var(--bg) 60%);
  }

  .glow {
    position: absolute;
    inset: 0;
  }

  .stars {
    position: absolute;
    inset: 0 0 40% 0;
  }

  .stars i {
    position: absolute;
    border-radius: 50%;
    background: #fff;
    opacity: 0.5;
    animation: twinkle 3.2s ease-in-out infinite;
  }

  @keyframes twinkle {
    50% {
      opacity: 0.08;
    }
  }

  .orb {
    position: absolute;
    left: 0;
    top: 0;
    width: 7.5rem;
    height: 7.5rem;
    margin: -3.75rem 0 0 -3.75rem;
    border-radius: 50%;
    opacity: 0.85;
    will-change: transform;
  }

  .layer {
    position: absolute;
    left: 0;
    bottom: 0;
    width: 200vw;
    height: 38vh;
    will-change: transform;
  }

  .far path {
    fill: #15231c;
  }

  .mid path {
    fill: #112019;
  }

  .near path {
    fill: #0c1712;
  }

  .poles {
    position: absolute;
    left: 0;
    bottom: 6vh;
    width: 200vw;
    height: 30vh;
    opacity: 0.55;
    will-change: transform;
  }

  .poles rect {
    fill: #060b09;
  }

  .wire {
    fill: none;
    stroke: #060b09;
    stroke-width: 2.4;
  }

  .railbed {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 6vh;
    background: linear-gradient(#0a110d, #050806);
    border-top: 3px solid #2c3a33;
    overflow: hidden;
  }

  .sleepers {
    position: absolute;
    left: 0;
    top: 10px;
    width: calc(100% + 112px);
    height: 12px;
    background: repeating-linear-gradient(90deg, #1c2822 0 14px, transparent 14px 56px);
    will-change: transform;
  }
</style>
