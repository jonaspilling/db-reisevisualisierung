// Kleine Effekte: Bierblasen und Konfetti an einer Stelle des Bildschirms.
import { gsap, reduce } from "./motion.js";

function spawn(x, y, n, make, anim) {
  if (reduce) return;
  for (let i = 0; i < n; i++) {
    const el = document.createElement("i");
    Object.assign(el.style, { position: "fixed", left: x + "px", top: y + "px", pointerEvents: "none", zIndex: 999, willChange: "transform, opacity" });
    make(el, i);
    document.body.append(el);
    anim(el, i).then?.(() => el.remove());
  }
}

export function bubbles(x, y, n = 6) {
  const cols = ["#f2b705", "#fff8e8", "#ffd166"];
  spawn(
    x,
    y,
    n,
    (el, i) => {
      const s = 5 + Math.random() * 9;
      Object.assign(el.style, { width: s + "px", height: s + "px", borderRadius: "50%", background: cols[i % 3], opacity: 0.9, margin: `${-s / 2}px 0 0 ${-s / 2}px` });
    },
    (el) =>
      gsap.to(el, {
        x: (Math.random() - 0.5) * 70,
        y: -50 - Math.random() * 90,
        opacity: 0,
        scale: 0.4 + Math.random(),
        duration: 0.9 + Math.random() * 0.6,
        ease: "power2.out",
      })
  );
}

export function confetti(x, y, n = 46) {
  const cols = ["#ec0016", "#f2b705", "#f3ead7", "#ff4a5a", "#ffd166"];
  spawn(
    x,
    y,
    n,
    (el, i) => {
      const w = 6 + Math.random() * 8;
      Object.assign(el.style, { width: w + "px", height: w * 0.45 + "px", background: cols[i % cols.length], borderRadius: "2px" });
    },
    (el) =>
      gsap.to(el, {
        x: (Math.random() - 0.5) * 520,
        y: -120 - Math.random() * 260,
        rotation: (Math.random() - 0.5) * 900,
        opacity: 0,
        duration: 1.5 + Math.random() * 0.9,
        ease: "power3.out",
      })
  );
}
