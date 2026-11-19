<script>
  // Ein ICE-Triebkopf als echtes 3D-Modell (Canvas, kein WebGL). Er schwankt langsam hin und her,
  // folgt der Maus und lässt sich mit gedrückter Maustaste drehen. Die Räder drehen, die Schwellen laufen vorbei.
  import { onMount } from "svelte";
  import { reduce } from "../lib/motion.js";
  import { buildTrain, drawTrain } from "../lib/ice.js";

  let { size = 1 } = $props();
  let cv;

  onMount(() => {
    const model = buildTrain();
    const ctx = cv.getContext("2d");
    let w = 0, h = 0, raf = 0, running = true, visible = true;
    let mx = 0, my = 0; // Mausposition -1..1
    let drag = false, lastX = 0, spin = 0; // spin = vom Nutzer gedrehter Winkel (klingt langsam ab)

    const fit = () => {
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const paint = (t) => {
      const idle = reduce ? 0 : Math.sin(t * 0.42);
      const yaw = (26 + 17 * idle + mx * 8) * (Math.PI / 180) + spin;
      const pitch = (13 - my * 5) * (Math.PI / 180);
      drawTrain(ctx, model, w, h, { yaw, pitch, time: reduce ? 0 : t });
    };

    const T0 = performance.now();
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      if (!drag) spin *= 0.94;
      paint((now - T0) / 1000);
    };

    fit();
    paint(0);
    if (!reduce) raf = requestAnimationFrame(frame);

    const ro = new ResizeObserver(() => {
      fit();
      paint(0);
    });
    ro.observe(cv);
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(cv);

    const move = (e) => {
      mx = (e.clientX / innerWidth) * 2 - 1;
      my = (e.clientY / innerHeight) * 2 - 1;
      if (drag) {
        spin += (e.clientX - lastX) * 0.012;
        lastX = e.clientX;
      }
    };
    const down = (e) => {
      drag = true;
      lastX = e.clientX;
    };
    const up = () => (drag = false);
    cv.addEventListener("pointerdown", down);
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      cv.removeEventListener("pointerdown", down);
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
    };
  });
</script>

<canvas
  bind:this={cv}
  class="train"
  style="--s:{size}"
  aria-hidden="true"
  data-cursor="Drehen"
></canvas>

<style>
  .train {
    display: block;
    width: calc(clamp(300px, 38vw, 560px) * var(--s));
    aspect-ratio: 2.3 / 1;
    touch-action: pan-y;
    cursor: grab;
  }

  .train:active {
    cursor: grabbing;
  }
</style>
