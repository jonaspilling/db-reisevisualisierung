// Minimaler Hash-Router: funktioniert auf jedem Webspace ohne Server-Konfiguration
// (z. B. GitHub Pages), Adressen sehen aus wie  #/fahrten  oder  #/?fahrt=5

export const router = $state({ path: "/", params: {} });

// Die Startseite ("Projekt") ist eine einzige lange Seite: "/" ist der Anfang, "/projekt" springt zu den Fakten.
// Eigene Seiten sind die interaktive Karte, die Statistik und die Erklärung.
export const isHomePath = (p) => !["/karte", "/statistik", "/ueber"].includes(p);

// Wo auf der Startseite man gerade ist (für den Schalter im Menü) und der letzte Sprungbefehl
// zone: "top" (Anfang) oder "facts" (die Fakten); cmd: letzter Sprungbefehl innerhalb der Startseite
export const view = $state({ zone: "top", cmd: null });
let cmdId = 0;

// "map" ist die Kartenszene auf der Startseite (kein eigener Eintrag in der Adresse)
const HASH = { top: "#/", map: "#/", facts: "#/projekt" };

export function goSection(section) {
  view.cmd = { section, id: ++cmdId };
  replaceHash(HASH[section]);
}

function parse() {
  const raw = location.hash.replace(/^#/, "") || "/";
  const [path, query = ""] = raw.split("?");
  router.path = path || "/";
  router.params = Object.fromEntries(new URLSearchParams(query));
}

import { tick } from "svelte";

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function initRouter() {
  parse();
  const canVT = typeof document.startViewTransition === "function" && !reduceMotion();
  if (canVT) document.documentElement.classList.add("has-vt");

  const onChange = () => {
    // Zwischen Karte und Projekt wird nur gescrollt: keine neue Seite, keine Überblendung
    const stayHome = isHomePath(router.path) && isHomePath(location.hash.replace(/^#/, "").split("?")[0] || "/");
    const apply = async () => {
      parse();
      await tick();
      if (!stayHome) window.scrollTo({ top: 0, behavior: "instant" });
    };
    if (stayHome) {
      apply();
    } else if (canVT) {
      // Wird der Übergang abgebrochen (z. B. Fenstergröße ändert sich), läuft die Seite trotzdem weiter
      const vt = document.startViewTransition(apply);
      vt.ready.catch(() => {});
      vt.finished.catch(() => {});
      vt.updateCallbackDone.catch(() => {});
    } else apply();
  };
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

// Adresse aktualisieren, ohne die Seite neu aufzubauen
export function replaceHash(hash) {
  history.replaceState(null, "", hash);
}
