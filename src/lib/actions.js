// Svelte-Actions: Einblenden beim Scrollen und hochzählende Zahlen.

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function reveal(node, delay = 0) {
  node.classList.add("reveal");
  node.style.setProperty("--d", `${delay}ms`);
  const io = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        node.classList.add("in");
        io.disconnect();
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -5% 0px" }
  );
  io.observe(node);
  return { destroy: () => io.disconnect() };
}

export function countUp(node, { to, decimals = 0, duration = 1800 }) {
  const fmt = new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  if (reduceMotion()) {
    node.textContent = fmt.format(to);
    return;
  }
  node.textContent = fmt.format(0);
  let raf;
  const io = new IntersectionObserver(
    ([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - t0) / duration);
        node.textContent = fmt.format(to * (1 - Math.pow(1 - p, 4)));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    },
    { threshold: 0.4 }
  );
  io.observe(node);
  return {
    destroy() {
      io.disconnect();
      cancelAnimationFrame(raf);
    },
  };
}
