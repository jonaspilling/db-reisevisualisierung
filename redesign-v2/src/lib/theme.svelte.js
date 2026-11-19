// Dunkel oder hell: beide Richtungen des Redesigns, umschaltbar im Header. Die Wahl bleibt im Browser gemerkt.
export const theme = $state({ mode: "dark" });

try {
  const saved = localStorage.getItem("bb-theme");
  if (saved === "light" || saved === "dark") theme.mode = saved;
} catch {}

export function setTheme(mode) {
  theme.mode = mode;
  document.documentElement.dataset.theme = mode;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", mode === "dark" ? "#0c0e13" : "#f3efe6");
  try {
    localStorage.setItem("bb-theme", mode);
  } catch {}
}

setTheme(theme.mode);
