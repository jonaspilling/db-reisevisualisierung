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
// "Swoosh": Die Seite wird unscharf, Streifen rauschen in Fahrtrichtung durchs Bild, und dahinter springt die Seite
// sofort ans Ziel. Danach löst sich der Schleier wieder auf. Nahe Ziele (weniger als zwei Bildschirme) fliegen wie bisher.
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
  // Beim Runterspringen fliegt der Inhalt nach oben vorbei, beim Hochspringen nach unten
  const dir = down ? -1 : 1;
  const el = document.createElement("div");
  el.className = "swoosh";
  el.setAttribute("aria-hidden", "true");
  el.style.setProperty("--sw-dir", down ? "0deg" : "180deg");

  const COLORS = ["rgba(236,0,22,0.85)", "rgba(40,45,55,0.55)", "rgba(236,0,22,0.5)", "rgba(40,45,55,0.35)", "rgba(255,255,255,0.95)"];
  const streaks = [];
  const N = window.innerWidth < 560 ? 16 : 28;
  for (let i = 0; i < N; i++) {
    const s = document.createElement("i");
    s.style.setProperty("--x", `${(i / N) * 100 + Math.random() * (100 / N)}%`);
    s.style.setProperty("--w", `${2 + Math.random() * 5}px`);
    s.style.setProperty("--h", `${28 + Math.random() * 46}vh`);
    s.style.setProperty("--c", COLORS[i % COLORS.length]);
    el.append(s);
    streaks.push(s);
  }
  document.body.append(el);

  const ease = "cubic-bezier(0.55, 0, 0.25, 1)";
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const H = window.innerHeight;

  // Streifen: jeder fliegt einmal komplett durchs Bild, versetzt und unterschiedlich schnell
  const runs = streaks.map((s, i) =>
    s.animate(
      [{ transform: `translateY(${-dir * 130}vh)` }, { transform: `translateY(${dir * 130}vh)` }],
      { duration: 520 + (i % 5) * 70, delay: (i % 7) * 35, easing: ease, fill: "both", iterations: 2 }
    )
  );

  el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: "ease-out", fill: "forwards" })
    .finished.then(async () => {
      // Hinter dem Schleier an die Zielstelle springen; ein noch auslaufendes Wischen (Handy) wird dafür kurz angehalten
      const prevOv = root.style.overflow;
      root.style.scrollBehavior = "auto";
      root.style.overflow = "hidden";
      const setY = () => {
        const y = dest();
        window.scrollTo(0, y);
        root.scrollTop = y;
        document.body.scrollTop = y;
      };
      setY();
      for (let i = 0; i < 6; i++) {
        await frame();
        if (Math.abs(window.scrollY - dest()) > 2) setY();
        else if (i >= 2) break;
      }
      root.style.overflow = prevOv;
      await frame();
      if (Math.abs(window.scrollY - dest()) > 2) setY();
      root.style.scrollBehavior = "";
      // Der Schleier löst sich auf und gibt die Zielstelle frei
      await el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 460, easing: "ease-in", fill: "forwards" }).finished;
    })
    .catch(() => {})
    .finally(() => {
      runs.forEach((r) => r.cancel());
      el.remove();
      warping = false;
    });
}
