// Studio: Schrift und Logo zum Ausprobieren. Die Wahl bleibt im Browser gemerkt.
export const FONTS = [
  { id: "bricolage", name: "Bricolage Grotesque", css: '"Bricolage Grotesque"' },
  { id: "funnel", name: "Funnel Display", css: '"Funnel Display"' },
  { id: "unbounded", name: "Unbounded", css: '"Unbounded"' },
  { id: "syne", name: "Syne", css: '"Syne"' },
  { id: "space", name: "Space Grotesk", css: '"Space Grotesk"' },
  { id: "fraunces", name: "Fraunces", css: '"Fraunces"' },
];

export const LOGOS = ["ICE-Front mit Schaumkrone", "ICE im Kreis", "Tulpe mit Gleisen", "Zugfenster mit B"];

export const studio = $state({ font: "bricolage", logo: 0 });

try {
  const f = localStorage.getItem("bb-font");
  const l = Number(localStorage.getItem("bb-logo"));
  if (FONTS.some((x) => x.id === f)) studio.font = f;
  if (l >= 0 && l < LOGOS.length) studio.logo = l;
} catch {}

document.documentElement.dataset.font = studio.font;

export function setFont(id) {
  studio.font = id;
  document.documentElement.dataset.font = id;
  try {
    localStorage.setItem("bb-font", id);
  } catch {}
}

export function setLogo(i) {
  studio.logo = i;
  try {
    localStorage.setItem("bb-logo", String(i));
  } catch {}
}
