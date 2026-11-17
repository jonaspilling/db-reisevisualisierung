// Sprünge auf der langen Startseite: ein weicher, schneller Flug statt minutenlangem Scrollen.
// Je weiter das Ziel, desto länger, aber nie länger als gut zwei Sekunden.
// Das Ziel wird in jedem Bild neu berechnet und am Ende exakt gesetzt: Auf dem Handy ändert sich die Höhe
// der Seite beim Scrollen (Adressleiste fährt ein und aus), das eingebaute Smooth-Scrolling bleibt dann zu kurz stehen.
let stop = null;
const INPUTS = ["wheel", "touchstart", "keydown", "pointerdown"];

export function flyTo(target) {
  const root = document.documentElement;
  const dest = () => {
    const y = typeof target === "function" ? target() : target;
    return Math.max(0, Math.min(root.scrollHeight - window.innerHeight, y));
  };
  const from = window.scrollY;

  if (stop) stop();
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    root.style.scrollBehavior = "auto";
    window.scrollTo(0, dest());
    root.style.scrollBehavior = "";
    return;
  }

  const ms = Math.max(800, Math.min(2300, 700 + Math.abs(dest() - from) / 38));
  const t0 = performance.now();
  let raf = 0;
  root.style.scrollBehavior = "auto"; // das CSS-Smooth-Scrolling würde sonst gegen die Animation arbeiten

  const end = () => {
    cancelAnimationFrame(raf);
    root.style.scrollBehavior = "";
    for (const ev of INPUTS) window.removeEventListener(ev, end);
    stop = null;
  };
  stop = end;
  // jede Eingabe der Person bricht den Flug ab
  for (const ev of INPUTS) window.addEventListener(ev, end, { passive: true });

  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const step = (now) => {
    const k = Math.min(1, (now - t0) / ms);
    const to = dest();
    window.scrollTo(0, k < 1 ? from + (to - from) * ease(k) : to);
    if (k < 1) {
      raf = requestAnimationFrame(step);
    } else {
      // noch ein Bild später prüfen: hat sich die Seite verschoben, nachsetzen
      raf = requestAnimationFrame(() => {
        const last = dest();
        if (Math.abs(window.scrollY - last) > 2) window.scrollTo(0, last);
        end();
      });
    }
  };
  raf = requestAnimationFrame(step);
}

// Ans Ende der Startseite: Projektbeschreibung und Kontakt
export function jumpToInfo() {
  const el = document.getElementById("info");
  if (el) goTo(() => el.getBoundingClientRect().top + window.scrollY);
}


// ---------------------------------------------------------------------------------------------------------------
// Weiter weg liegende Ziele: kein Durchscrollen (dabei würde jede Szene dazwischen abgespielt), sondern ein
// Übergang. Eine rote Fläche schiebt sich über die Seite, darunter springt die Seite sofort ans Ziel, dann schiebt
// sich die Fläche weiter und gibt das Ziel frei. Nahe Ziele (weniger als zwei Bildschirme) fliegen wie bisher.
let warping = false;

export function goTo(target) {
  const root = document.documentElement;
  const dest = () => Math.max(0, Math.min(root.scrollHeight - window.innerHeight, typeof target === "function" ? target() : target));
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dist = dest() - window.scrollY;

  if (reduce) {
    root.style.scrollBehavior = "auto";
    window.scrollTo(0, dest());
    root.style.scrollBehavior = "";
    return;
  }
  if (Math.abs(dist) < window.innerHeight * 2) return flyTo(target);
  if (warping) return;
  warping = true;
  if (stop) stop();

  const down = dist > 0;
  const el = document.createElement("div");
  el.className = "warp";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = '<span class="warp-mark"><i></i><i></i><i></i><i></i></span>';
  document.body.append(el);

  const ease = "cubic-bezier(0.7, 0, 0.3, 1)";
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  el.animate([{ transform: `translateY(${down ? 100 : -100}%)` }, { transform: "translateY(0)" }], { duration: 420, easing: ease, fill: "forwards" })
    .finished.then(async () => {
      root.style.scrollBehavior = "auto";
      window.scrollTo(0, dest());
      await frame();
      window.scrollTo(0, dest()); // nach dem ersten Bild noch einmal: Höhe und Szenen haben sich eingestellt
      await frame();
      root.style.scrollBehavior = "";
      await el.animate([{ transform: "translateY(0)" }, { transform: `translateY(${down ? -100 : 100}%)` }], { duration: 520, easing: ease, fill: "forwards" }).finished;
    })
    .catch(() => {})
    .finally(() => {
      el.remove();
      warping = false;
    });
}
