// Packt den fertigen Build (dist-portable/) in EINE HTML-Datei: Skripte, Styles, Daten und der Karten-Worker
// stehen direkt darin. Die Datei lässt sich verschicken und per Doppelklick oder auf dem iPad öffnen.
// Nur die Kartenkacheln und die Schrift kommen weiter aus dem Netz (Internet nötig).
//
// Aufruf:  npm run build:portable   ->  portable/Bordbistro.html
import fs from "node:fs";
import path from "node:path";

const dist = "dist-portable";
const read = (p) => fs.readFileSync(p, "utf-8");
// Alles, was in ein <script> kommt, darf kein "</script" und kein "<!--" enthalten
const safe = (s) => s.replace(/<\/(script)/gi, "<\/$1").replace(/<!--/g, "<\!--");

let html = read(path.join(dist, "index.html"));
const assets = fs.readdirSync(path.join(dist, "assets"));
const jsFile = assets.find((f) => f.startsWith("index-") && f.endsWith(".js"));
const cssFile = assets.find((f) => f.startsWith("index-") && f.endsWith(".css"));
const workerFile = assets.find((f) => f.startsWith("maplibre-gl-worker"));
if (!jsFile || !cssFile || !workerFile) throw new Error("Build unvollständig: JS, CSS oder Worker fehlt in " + dist);

let js = read(path.join(dist, "assets", jsFile));
const css = read(path.join(dist, "assets", cssFile));
const worker = read(path.join(dist, "assets", workerFile));

const data = {};
for (const f of ["routes.geojson", "stations.json", "urban.geojson", "rails_eu.geojson"]) {
  data[f] = JSON.parse(read(path.join(dist, "data", f)));
}
data.worker = null; // wird unten aus dem Quelltext zu einer Blob-Adresse

// Der Karten-Worker läuft aus einer Blob-Adresse statt aus einer Datei (Dateien daneben gibt es nicht)
const boot = `<script>
window.__TRASSE__ = ${safe(JSON.stringify(data))};
window.__TRASSE__.worker = URL.createObjectURL(new Blob([${safe(JSON.stringify(worker))}], { type: "text/javascript" }));
</script>`;

html = html
  .replace(/<script type="module"[^>]*><\/script>\s*/, "")
  .replace(/<link rel="stylesheet" crossorigin href="\.\/assets\/[^"]+">\s*/, "")
  .replace("</head>", `${boot}\n<style>${css}</style>\n</head>`)
  .replace("</body>", `<script type="module">${safe(js)}</script>\n</body>`);

fs.mkdirSync("portable", { recursive: true });
const out = path.join("portable", "Bordbistro.html");
fs.writeFileSync(out, html);
console.log(`${out}: ${(fs.statSync(out).size / 1024 / 1024).toFixed(1)} MB`);
