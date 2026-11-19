// Bewegungs-Helfer (GSAP): Einblenden beim Scrollen, Zahlen hochzählen, magnetische Knöpfe, 3D-Neigung.
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
export const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

// <el use:reveal> oder use:reveal={{ y: 40, delay: 0.1 }}: blendet beim Erscheinen ein
export function reveal(node, opts = {}) {
  if (reduce) return;
  const { y = 36, delay = 0, duration = 0.9, x = 0, scale = 1 } = opts;
  gsap.set(node, { opacity: 0, y, x, scale });
  const tween = gsap.to(node, {
    opacity: 1,
    y: 0,
    x: 0,
    scale: 1,
    duration,
    delay,
    ease: "power3.out",
    paused: true,
  });
  const st = ScrollTrigger.create({ trigger: node, start: "top 88%", once: true, onEnter: () => tween.play() });
  return {
    destroy() {
      st.kill();
      tween.kill();
    },
  };
}

// Stapel: mehrere Kinder nacheinander einblenden: <ul use:stagger={{ selector: "li" }}>
export function stagger(node, opts = {}) {
  if (reduce) return;
  const { selector = ":scope > *", y = 30, each = 0.07, duration = 0.8 } = opts;
  const items = node.querySelectorAll(selector);
  gsap.set(items, { opacity: 0, y });
  const st = ScrollTrigger.create({
    trigger: node,
    start: "top 85%",
    once: true,
    onEnter: () => gsap.to(items, { opacity: 1, y: 0, duration, ease: "power3.out", stagger: each }),
  });
  return { destroy: () => st.kill() };
}

// Magnet: ein Element zieht sich leicht zum Mauszeiger
export function magnet(node, strength = 0.35) {
  if (reduce || coarse) return;
  const x = gsap.quickTo(node, "x", { duration: 0.5, ease: "power3.out" });
  const y = gsap.quickTo(node, "y", { duration: 0.5, ease: "power3.out" });
  const move = (e) => {
    const r = node.getBoundingClientRect();
    x((e.clientX - (r.left + r.width / 2)) * strength);
    y((e.clientY - (r.top + r.height / 2)) * strength);
  };
  const leave = () => {
    x(0);
    y(0);
  };
  node.addEventListener("pointermove", move);
  node.addEventListener("pointerleave", leave);
  return {
    destroy() {
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerleave", leave);
    },
  };
}

// 3D-Neigung: Karte neigt sich zur Maus, mit Glanz
export function tilt(node, max = 9) {
  if (reduce || coarse) return;
  gsap.set(node, { transformPerspective: 900 });
  const rx = gsap.quickTo(node, "rotationX", { duration: 0.5, ease: "power3.out" });
  const ry = gsap.quickTo(node, "rotationY", { duration: 0.5, ease: "power3.out" });
  const move = (e) => {
    const r = node.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    ry(px * max * 2);
    rx(-py * max * 2);
    node.style.setProperty("--gx", `${(px + 0.5) * 100}%`);
    node.style.setProperty("--gy", `${(py + 0.5) * 100}%`);
  };
  const leave = () => {
    rx(0);
    ry(0);
  };
  node.addEventListener("pointermove", move);
  node.addEventListener("pointerleave", leave);
  return {
    destroy() {
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerleave", leave);
    },
  };
}

// Zahl hochzählen, schreibt in einen Callback
export function countTo(to, set, { duration = 1.8, delay = 0, ease = "power3.out" } = {}) {
  if (reduce) return set(to);
  const o = { v: 0 };
  return gsap.to(o, { v: to, duration, delay, ease, onUpdate: () => set(o.v) });
}

// Hängendes Schild: schwingt beim Erscheinen wie ein Bahnhofsschild an der Kette
export function swing(node) {
  if (reduce) return;
  gsap.set(node, { transformOrigin: "50% 0%", transformPerspective: 900, rotationX: -88, opacity: 0 });
  const st = ScrollTrigger.create({
    trigger: node,
    start: "top 92%",
    once: true,
    onEnter: () => gsap.to(node, { rotationX: 0, opacity: 1, duration: 1.9, ease: "elastic.out(1, 0.32)" }),
  });
  return { destroy: () => st.kill() };
}

export { gsap, ScrollTrigger };
