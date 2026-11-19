// Hash-Routing: #/ (Start), #/karte, #/fahrten, #/bahnhoefe, #/info
export const PAGES = [
  { path: "/", label: "Start" },
  { path: "/karte", label: "Karte" },
  { path: "/fahrten", label: "Fahrten" },
  { path: "/bahnhoefe", label: "Bahnhöfe" },
  { path: "/info", label: "Info" },
];

const read = () => {
  const p = location.hash.replace(/^#/, "").split("?")[0] || "/";
  return PAGES.some((x) => x.path === p) ? p : "/";
};

// route.path ist die Adresse, route.shown die Seite, die gerade zu sehen ist (wechselt mitten im Übergang)
export const route = $state({ path: read(), shown: read() });
window.addEventListener("hashchange", () => (route.path = read()));
