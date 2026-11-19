export const nf = (n, d = 0) => n.toLocaleString("de-DE", { maximumFractionDigits: d, minimumFractionDigits: d });

// Bahnhofsname wie in den Daten, nur mit Leerzeichen um die Klammern ("Frankfurt (Main) Hbf")
export const stationName = (name) => name.replace(/(\S)\(/g, "$1 (").replace(/\)(\S)/g, ") $1");

export const hm = (minutes) => `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
