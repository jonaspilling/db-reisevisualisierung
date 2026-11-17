// Eingebettete Dateien: In der Einzeldatei-Version (npm run build:portable) stehen Daten und Karten-Worker
// direkt in der HTML-Datei (window.__TRASSE__), sonst werden sie ganz normal geladen.
export const embedded = (name) => (typeof window !== "undefined" && window.__TRASSE__ ? window.__TRASSE__[name] : undefined);
