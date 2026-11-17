// Scroll-Szenen: jede Szene ist ein hoher Block mit einer angehefteten Bühne (.stage).
// Beim Scrollen setzt die Engine drei CSS-Variablen auf die Szene:
//   --p    Fortschritt der angehefteten Phase, 0 bis 1 (hier läuft die Animation)
//   --in   wie weit die Szene von unten hereingeschoben ist, 0 bis 1
//   --out  wie weit die nächste Szene sie überdeckt, 0 bis 1
// Ein einziger Scroll-Listener für alle Szenen, ein Layout-Lesen pro Frame.

const entries = new Set();
let raf = 0;
let bound = false;

const clamp = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export const prefersReducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function update() {
  raf = 0;
  const vh = window.innerHeight;
  for (const e of entries) {
    const r = e.node.getBoundingClientRect();
    // Die angeheftete Phase dauert Höhe minus zwei Bildschirme
    // (ein Bildschirm kommt von oben dazu, einer gehört dem Überdecken durch die nächste Szene).
    const p = clamp(-r.top / Math.max(1, r.height - 2 * vh));
    const inn = clamp(1 - r.top / vh);
    let out = 0;
    const next = e.node.nextElementSibling;
    if (next && next.classList.contains("scene")) out = clamp(1 - next.getBoundingClientRect().top / vh);

    if (p === e.p && inn === e.inn && out === e.out) continue;
    e.p = p;
    e.inn = inn;
    e.out = out;
    const s = e.node.style;
    s.setProperty("--p", p.toFixed(4));
    s.setProperty("--in", inn.toFixed(4));
    s.setProperty("--out", out.toFixed(4));
    e.cb?.(p, inn, out);
  }
}

const schedule = () => {
  if (!raf) raf = requestAnimationFrame(update);
};

function bind() {
  if (bound) return;
  bound = true;
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
}

function unbind() {
  if (!bound || entries.size) return;
  bound = false;
  window.removeEventListener("scroll", schedule);
  window.removeEventListener("resize", schedule);
}

// Svelte-Action:  <section class="scene" use:scene={(p, inn, out) => ...}>
export function scene(node, cb) {
  if (prefersReducedMotion()) {
    // Ohne Bewegung: jede Szene steht fertig da (Layout regelt .still am Container).
    node.style.setProperty("--p", "1");
    node.style.setProperty("--in", "1");
    node.style.setProperty("--out", "0");
    cb?.(1, 1, 0);
    return {};
  }
  const entry = { node, cb, p: -1, inn: -1, out: -1 };
  entries.add(entry);
  bind();
  schedule();
  return {
    destroy() {
      entries.delete(entry);
      unbind();
    },
  };
}
