// Bordbistro V3: mein Bahnjahr als Reise in Linien.
// Man schaut schräg von oben auf den Bahnhof der ersten Fahrt (schwarz-weiße Outlines, echte Gebäude aus OSM),
// löst die Fahrkarte, fährt in den Bahnhof hinein, sieht die Strecke und kommt am Zielbahnhof wieder heraus.
// Daten: data/routes.geojson, data/stations.json und die Stadtausschnitte in data/city (aus den OSM-Dateien im Projekt).
import { loadCity, stationCluster } from "./city.js";
import { buildICE, CAR, GAP } from "./train.js";

const ICE = buildICE();

// ================================================================ Daten
const R = 6371, LAT0 = (50 * Math.PI) / 180, COS0 = Math.cos(LAT0);
const proj = ([lon, lat]) => [((R * lon * Math.PI) / 180) * COS0, (R * lat * Math.PI) / 180];
const nice = (s) => s.replace(/([a-zäöü])\(/gi, "$1 (").replace(/\)([A-Za-zÄÖÜ])/g, ") $1");
const nf = (n) => Math.round(n).toLocaleString("de-DE");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const hm = (min) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
const DAYS = ["So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."];

function stamp(datum, zeit) {
  const [d, m, y] = datum.split(".").map(Number);
  const [hh, mm] = (zeit || "00:00").split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm).getTime();
}
function flatten(g) {
  if (g.type === "LineString") return g.coordinates;
  const out = [];
  for (const part of g.coordinates)
    for (const pt of part) {
      const last = out[out.length - 1];
      if (!last || last[0] !== pt[0] || last[1] !== pt[1]) out.push(pt);
    }
  return out;
}

const [routes, stationsRaw] = await Promise.all([
  fetch("data/routes.geojson").then((r) => r.json()),
  fetch("data/stations.json").then((r) => r.json()),
]);

const stations = new Map(
  stationsRaw.map((s) => {
    const lat = s.coords[1];
    return [s.name, { key: s.name, name: nice(s.name), w: proj(s.coords), visits: s.visits, kx: COS0 / Math.cos((lat * Math.PI) / 180), terminal: false, city: null }];
  })
);

const trips = routes.features
  .map((f) => {
    const p = f.properties;
    const pts = flatten(f.geometry).map(proj);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const t0 = stamp(p.datum, p.abfahrt);
    let t1 = stamp(p.datum, p.ankunft);
    if (t1 < t0) t1 += 86400000;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return { p, pts, g: Float64Array.from(pts.flat()), cum, len: cum[cum.length - 1], km: p.distanz_km, t0, t1, minutes: Math.round((t1 - t0) / 60000), bbox: [x0, y0, x1, y1] };
  })
  .sort((a, b) => a.t0 - b.t0);
// Lille: Die Strecke aus den Daten endet auf den Gleisen vor Lille Flandres. Lille Europe liegt laut OSM
// rund 400 m nordöstlich (Bahnsteige bei etwa x +30…+110, y +340…+430 m vom Stationspunkt). Für die Darstellung
// wird das letzte Stück auf die Einfahrt nach Lille Europe gelegt (Kilometer und Zeiten bleiben aus den Daten).
const LILLE_IN = [[400, -240], [300, -60], [215, 150], [150, 290], [105, 360], [60, 420]];
function lilleFix(t) {
  const s = stations.get("Lille Europe");
  const toW = ([x, y]) => [s.w[0] + (x / 1000) * s.kx, s.w[1] + y / 1000];
  const anchor = toW(LILLE_IN[0]);
  const near = (pts) => { let bi = 0, bd = Infinity; pts.forEach((p, i) => { const d = (p[0] - anchor[0]) ** 2 + (p[1] - anchor[1]) ** 2; if (d < bd) { bd = d; bi = i; } }); return bi; };
  if (t.p.ziel === s.key) { const k = near(t.pts); t.pts = [...t.pts.slice(0, k + 1), ...LILLE_IN.slice(1).map(toW)]; }
  if (t.p.start === s.key) { const k = near(t.pts); t.pts = [...LILLE_IN.slice(1).reverse().map(toW), ...t.pts.slice(k)]; }
  t.cum = [0];
  for (let i = 1; i < t.pts.length; i++) t.cum.push(t.cum[i - 1] + Math.hypot(t.pts[i][0] - t.pts[i - 1][0], t.pts[i][1] - t.pts[i - 1][1]));
  t.len = t.cum[t.cum.length - 1];
  t.g = Float64Array.from(t.pts.flat());
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of t.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  t.bbox = [x0, y0, x1, y1];
}
trips.forEach((t) => { if (t.p.ziel === "Lille Europe" || t.p.start === "Lille Europe") lilleFix(t); });

trips.forEach((t, i) => {
  t.no = i;
  t.from = stations.get(t.p.start);
  t.to = stations.get(t.p.ziel);
  t.from.terminal = t.to.terminal = true;
  // an welcher Stelle der Linie liegt welcher Halt (für das Auftauchen beim Zeichnen)
  t.haltAt = t.p.halte.map((h) => {
    const s = stations.get(h);
    if (!s) return null;
    let best = 0, bd = Infinity;
    for (let i = 0; i < t.pts.length; i++) { const d = (t.pts[i][0] - s.w[0]) ** 2 + (t.pts[i][1] - s.w[1]) ** 2; if (d < bd) { bd = d; best = i; } }
    return { s, at: t.cum[best] / t.len };
  }).filter(Boolean);
});
const totalKm = trips.reduce((a, t) => a + t.km, 0);

// ================================================================ Kamera
const cv = document.getElementById("map");
const ctx = cv.getContext("2d");
let W = 0, H = 0, FOC = 1, FOC0 = 1;
const NEAR = 0.0005; // 50 cm vor der Kamera wird abgeschnitten
const cam = { tx: 0, ty: 0, tz: 0, dist: 1000, pitch: 0.78, bearing: 0 };
const view = { ...cam };
const sway = { b: 0, p: 0 }, swayTo = { b: 0, p: 0 };

// ================================================================ Leistung
// Vier Stufen (0 = sparsam … 3 = alles). Die Stufe wird beim Start aus dem Gerät geschätzt und danach im Betrieb
// an die gemessene Bildrate angepasst (ruckelt es, geht es eine Stufe runter; läuft es lange flüssig, wieder hoch).
// Festlegen mit ?q=0 … ?q=3, Bildrate und Stufe anzeigen mit ?fps.
const QUAL = [
  // dpr: Pixeldichte der Zeichenfläche · roadMin/roadPx: kleinste Straßenklasse / Breite in px · cull: Gebäude unter dieser
  // Größe (px) weglassen (bewegt / ruhig) · calmFaces: im ruhigen Blick alle Gebäude Fläche für Fläche · windows: 0 aus,
  // 1 nur Bahnhof, 2 alle · roofPx: darunter nur Dachumriss · stride: Linienpunkte überspringen (nur in Bewegung) ·
  // maxBusy: höchstens so viele Nebengebäude pro Bild während Kamerafahrten (die größten bleiben)
  { dpr: 1, roadMin: 3, roadPx: 1.6, waterEdge: false, cullBusy: 7, cullIdle: 3, calmFaces: false, windows: 0, floors: false, roofPx: 40, stride: 3, trainDetail: false, tracks: false, chunk: 80, minArea: 60, maxBusy: 250, orderMax: 40 },
  { dpr: 1, roadMin: 2, roadPx: 0.9, waterEdge: false, cullBusy: 4.5, cullIdle: 2, calmFaces: false, windows: 1, floors: false, roofPx: 26, stride: 2, trainDetail: true, tracks: false, chunk: 120, minArea: 30, maxBusy: 500, orderMax: 100 },
  { dpr: 1.5, roadMin: 0, roadPx: 0.5, waterEdge: true, cullBusy: 3, cullIdle: 1.2, calmFaces: true, windows: 2, floors: true, roofPx: 14, stride: 1, trainDetail: true, tracks: true, chunk: 200, minArea: 0, maxBusy: 900, orderMax: 160 },
  { dpr: 2, roadMin: 0, roadPx: 0.35, waterEdge: true, cullBusy: 3, cullIdle: 1.2, calmFaces: true, windows: 2, floors: true, roofPx: 14, stride: 1, trainDetail: true, tracks: true, chunk: 250, minArea: 0, maxBusy: 1600, orderMax: 220 },
];
const store = {
  get() { try { return localStorage.getItem("bb-q"); } catch { return null; } },
  set(v) { try { localStorage.setItem("bb-q", String(v)); } catch { /* egal */ } },
};
function guessQuality() {
  const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 4;
  const touch = matchMedia("(pointer: coarse)").matches;
  let q = 3;
  if (cores <= 4 || mem <= 4 || touch) q = 2;
  if (cores <= 2 || mem <= 2 || navigator.connection?.saveData) q = 1;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) q = Math.min(q, 2);
  return q;
}
const qParams = new URLSearchParams(location.search);
const qForced = /^[0-3]$/.test(qParams.get("q") ?? "x");
const qSaved = store.get();
let qLevel = qForced ? +qParams.get("q") : /^[0-3]$/.test(qSaved ?? "x") ? +qSaved : guessQuality();
let qMax = 3; // höher nur, solange es dort nicht wieder ruckelt
let Q = QUAL[qLevel];
const perf = { last: 0, n: 0, sum: 0, good: 0, quiet: 0, upAt: 0, fps: 0 };
const SHOW_FPS = qParams.has("fps");
// Die Übersichtskarte (nur Linien und Punkte) ist billig und bleibt scharf: volle Pixeldichte, außer auf Stufe 0
const curDpr = () => Math.min(devicePixelRatio || 1, typeof mode !== "undefined" && mode === "map" && qLevel >= 1 ? 2 : Q.dpr);
let appliedDpr = 0;
function setQuality(l) {
  const before = curDpr();
  qLevel = l;
  Q = QUAL[l];
  store.set(l);
  perf.quiet = performance.now() + 1200; // nach dem Wechsel kurz nicht messen (Umbau der Zeichenfläche)
  perf.n = perf.sum = perf.good = 0;
  for (const s of stations.values()) s._sb = null;
  if (curDpr() !== before) resize();
  need();
}
// Bildzeit messen, solange durchgehend gezeichnet wird (Kamerafahrt, Ziehen); Einzelbilder zählen nicht
function sampleFrame(now) {
  const dt = now - perf.last;
  perf.last = now;
  if (dt > 0 && dt < 120) perf.fps += (1000 / dt - perf.fps) * 0.1;
  if (qForced || !(anim || drag) || dt <= 0 || dt > 120 || now < perf.quiet) { perf.n = perf.sum = 0; return; }
  perf.sum += dt;
  if (++perf.n < 24) return;
  const avg = perf.sum / perf.n;
  perf.n = perf.sum = 0;
  if (avg > 27 && qLevel > 0) {
    // kurz nach einem Hochschalten wieder ruckelig: diese Stufe ist zu viel für das Gerät
    if (perf.upAt && now - perf.upAt < 9000) qMax = qLevel - 1;
    setQuality(qLevel - 1);
  } else if (avg < 18.5 && qLevel < qMax) {
    if (++perf.good >= 5) { perf.upAt = now; setQuality(qLevel + 1); }
  } else perf.good = 0;
}

let cb, sb, cp, sp, Cy, Cz, camX, camY, camZ;
function setup() {
  cb = Math.cos(view.bearing); sb = Math.sin(view.bearing);
  cp = Math.cos(view.pitch); sp = Math.sin(view.pitch);
  Cy = -view.dist * sp; Cz = view.dist * cp;
  camX = view.tx + Cy * sb; camY = view.ty + Cy * cb; camZ = view.tz + Cz;
}
const HY = () => H * 0.48;
function cs(x, y, z) {
  const dx = x - view.tx, dy = y - view.ty;
  const x1 = dx * cb - dy * sb, y1 = dx * sb + dy * cb;
  const vy = y1 - Cy, vz = z - view.tz - Cz;
  return [x1, vy * cp + vz * sp, vy * sp - vz * cp];
}
const sx = (c) => W / 2 + (FOC * c[0]) / c[2];
const sy = (c) => HY() - (FOC * c[1]) / c[2];
function unproject(X, Y) {
  const a = (X - W / 2) / FOC, b = -(Y - HY()) / FOC;
  const dy = sp + b * cp, dz = -cp + b * sp;
  if (dz > -1e-4) return null;
  const t = (-view.tz - Cz) / dz;
  if (t <= 0) return null;
  const x1 = t * a, y1 = Cy + t * dy;
  return [view.tx + x1 * cb + y1 * sb, view.ty - x1 * sb + y1 * cb];
}
function applyView() {
  Object.assign(view, cam, { bearing: cam.bearing + sway.b, pitch: clamp(cam.pitch + sway.p, 0, 1.75) });
  // nah am Boden ein Weitwinkel, von oben ein normales Objektiv
  FOC = FOC0 * (1 - 0.42 * clamp((view.pitch - 1.15) / 0.35, 0, 1));
  setup();
}

function clipPoly(C) {
  const out = [];
  for (let i = 0; i < C.length; i++) {
    const a = C[i], b = C[(i + 1) % C.length];
    const ain = a[2] >= NEAR, bin = b[2] >= NEAR;
    if (ain) out.push(a);
    if (ain !== bin) {
      const t = (NEAR - a[2]) / (b[2] - a[2]);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR]);
    }
  }
  return out;
}
function pathPoly(C) {
  for (let i = 0; i < C.length; i++) (i ? ctx.lineTo(sx(C[i]), sy(C[i])) : ctx.moveTo(sx(C[i]), sy(C[i])));
  ctx.closePath();
}
function pathLine(g, z = 0, upTo = Infinity) {
  let prev = null, pen = false, lx = 0, ly = 0;
  const n = Math.min(g.length, upTo);
  const step = 2 * (BUSY ? Q.stride : 1); // in Bewegung auf schwachen Geräten nur jeden n-ten Punkt (letzter bleibt)
  for (let i = 0; i < n; i = i + step >= n && i < n - 2 ? n - 2 : i + step) {
    const c = cs(g[i], g[i + 1], z);
    if (prev) {
      let a = prev, b = c;
      if (a[2] < NEAR && b[2] < NEAR) { pen = false; prev = c; continue; }
      if (a[2] < NEAR) { const t = (NEAR - a[2]) / (b[2] - a[2]); a = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR]; pen = false; }
      let cut = false;
      if (b[2] < NEAR) { const t = (NEAR - a[2]) / (b[2] - a[2]); b = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR]; cut = true; }
      if (!pen) { lx = sx(a); ly = sy(a); ctx.moveTo(lx, ly); pen = true; }
      const X = sx(b), Y = sy(b);
      if (Math.abs(X - lx) + Math.abs(Y - ly) > 0.6 || cut || i >= n - 2) { ctx.lineTo(X, Y); lx = X; ly = Y; }
      if (cut) pen = false;
    }
    prev = c;
  }
}

function resize() {
  const dpr = (appliedDpr = curDpr());
  W = innerWidth; H = innerHeight;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  cv.style.width = W + "px"; cv.style.height = H + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  FOC0 = FOC = Math.max(W, H) * 0.9;
  if (typeof mode !== "undefined" && mode === "map" && !anim && typeof overviewView === "function" && trips.length) Object.assign(cam, overviewView());
  need();
}

// ================================================================ Bahnhöfe
// Je Bahnhof (Meter relativ zum Stationspunkt, x = Osten, y = Norden), abgelesen aus Draufsichten der OSM-Daten:
// welche Gebäude zum Bahnhof gehören (Kreis c/r oder Rechteck), Standpunkt auf dem Vorplatz, Eingang,
// Höhenkorrekturen (boost) für Gebäude, die in OSM zu niedrig erfasst sind.
const SPOT = {
  // Dächer nach dem echten Vorbild: rise = Bogenhöhe der Hallen (Anteil der Breite), halls = Bogenhallen ja/nein,
  // hips = Walmdächer am Empfangsgebäude, lanterns = Oberlicht-Aufbauten auf flachem Hallendach
  "Frankfurt(Main)Hbf": {
    c: [-20, 20], r: 230, cam: [168, -12], door: [92, -12], city: "Frankfurt am Main", rise: 0.48,
    boost: [{ c: [38, 40], r: 12, h: 27, roof: 2, rh: 6 }, { c: [80, -60], r: 45, h: 24 }],
    // Mittelbau mit Giebel über dem Haupteingang, darauf Atlas mit der Weltkugel (wie am echten Empfangsgebäude)
    pavilion: { c: [84, -12], w: 38, d: 20, h: 38, atlas: true },
  },
  "Köln Hbf": { c: [-10, 10], r: 200, cam: [-98, -112], door: [-32, -58], city: "Köln", rise: 0.38 },
  "München Hbf": { c: [40, 0], r: 200, rect: [-125, -105, 206, 100], all: true, cam: [258, 64], door: [198, 56], city: "München", halls: false, lanterns: true },
  "Berlin Südkreuz": { c: [25, 60], r: 175, all: true, cam: [150, -64], door: [66, -26], city: "Berlin", halls: false, hips: false },
  "Augsburg Hbf": { c: [35, 5], r: 120, cam: [131, 41], door: [69, 8], city: "Augsburg", halls: false },
  Bamberg: { c: [-20, -30], r: 70, all: true, cam: [-112, -40], door: [-50, -38], city: "Bamberg", halls: false },
  "Innsbruck Hbf": { c: [-35, -20], r: 110, all: true, cam: [-140, -33], door: [-59, -31], city: "Innsbruck · Österreich", halls: false, hips: false },
  // Lille Europe (nicht Flandres): Bahnhof laut OSM um (+100, +350); Blick von Westen über den Vorplatz
  "Lille Europe": { c: [110, 360], r: 130, all: true, cam: [-90, 330], door: [40, 350], city: "Lille · Frankreich", halls: false, hips: false },
};

function ensureCity(s) {
  if (s.city) return s.cityPromise;
  s.city = "loading";
  const spot = SPOT[s.key];
  s.cityPromise = loadCity(s.key, s.w, s.kx, spot || {}, { chunk: Q.chunk, minArea: Q.minArea }).then((c) => {
    if (!c) { s.city = "none"; return; }
    const cl = stationCluster(c, spot);
    let top = 0;
    for (const b of cl) { b.spot = spot; top = Math.max(top, b.h); }
    s.spot = spot;
    s.top = top; // höchster Punkt des Bahnhofs (km), für das Schild
    s._sb = null;
    s.city = c;
    need();
  });
  return s.cityPromise;
}

// Ansichten: schräg von oben (Modell), vor der Tür (zum Hinein- und Herausfahren)
function viewFrom(s, horiz, eye, lookZ) {
  const p = s.spot, W2 = (x, y) => [s.w[0] + (x / 1000) * s.kx, s.w[1] + y / 1000];
  if (!p) return { tx: s.w[0], ty: s.w[1], tz: 0, dist: 0.5, pitch: 1.1, bearing: 0 };
  const [dx, dy] = W2(...p.door), [cx2, cy2] = W2(...p.cam);
  const tz = lookZ / 1000, e = eye / 1000, hd = horiz / 1000;
  return { tx: dx, ty: dy, tz, dist: Math.hypot(hd, e - tz), pitch: Math.atan2(hd, e - tz), bearing: Math.atan2(-(cx2 - dx), -(cy2 - dy)) };
}
const modelView = (s) => viewFrom(s, 250, 85, 10); // wie auf eine Modellbahn schauen
const doorView = (s) => viewFrom(s, 5, 2.4, 3); // direkt vor dem Eingang

// ================================================================ Ablauf
let mode = "stand"; // "stand" (am Bahnhof), "travel" (unterwegs), "map" (Übersicht)
let leg = 0;
let here = trips[0].from;
const done = new Set();
let anim = null;
let reveal = { s: here, t0: 0 };
let arrivedTrip = null; // die gerade beendete Fahrt (für "Angekommen")

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
// Kamerafahrt: Entfernung logarithmisch; das Ziel wird so mitgeführt, dass der Zielpunkt im Bild ruhig bleibt
// (kein seitlicher Bogen beim Heranzoomen)
function camTween(from, to, k) {
  const e = ease(k);
  const o = {};
  o.dist = Math.exp(Math.log(from.dist) + (Math.log(to.dist) - Math.log(from.dist)) * e);
  const wgt = Math.abs(from.dist - to.dist) > 1e-6 ? (from.dist - o.dist) / (from.dist - to.dist) : e;
  o.tx = from.tx + (to.tx - from.tx) * wgt;
  o.ty = from.ty + (to.ty - from.ty) * wgt;
  o.tz = from.tz + (to.tz - from.tz) * e;
  o.pitch = from.pitch + (to.pitch - from.pitch) * e;
  let db = to.bearing - from.bearing;
  db = Math.atan2(Math.sin(db), Math.cos(db));
  o.bearing = from.bearing + db * e;
  return o;
}
function frameBox([x0, y0, x1, y1], pitch = 0.72, fw = 0.5, fh = 0.34) {
  const w = Math.max(x1 - x0, 1), h = Math.max(y1 - y0, 1);
  const ppk = Math.min((W * fw) / w, (H * fh) / (h * Math.cos(pitch * 0.8)));
  return { tx: (x0 + x1) / 2, ty: (y0 + y1) / 2 - h * 0.04, tz: 0, dist: FOC0 / ppk, pitch, bearing: 0 };
}
// die Übersicht füllt das Bild (zwischen Kopfzeile und Zeitleiste)
function overviewView() {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of trips) { x0 = Math.min(x0, t.bbox[0]); y0 = Math.min(y0, t.bbox[1]); x1 = Math.max(x1, t.bbox[2]); y1 = Math.max(y1, t.bbox[3]); }
  const v = frameBox([x0, y0, x1, y1], 0.5, W < 700 ? 0.66 : 0.74, 0.56);
  v.ty -= (y1 - y0) * 0.02;
  return v;
}
// Animationen laufen in einer "Epoche"; wird unterbrochen (anderer Fahrtpunkt), endet die alte Reise sofort
let epoch = 0;
const run = (steps, extra = {}) => new Promise((res) => {
  const my = epoch;
  anim = { t0: performance.now(), prog: 0, steps, ...extra, done1: () => res(my === epoch) };
  need();
});
function interrupt() {
  epoch++;
  const fn = anim && anim.done1;
  anim = null;
  if (fn) fn();
}
const fadeEl = document.getElementById("fade");
const setFade = (v) => (fadeEl.style.opacity = v);

// ---------- Punkt und Richtung auf der Fahrtlinie (s in Welt-km ab Start) ----------
function posAt(t, s) {
  const n = t.pts.length;
  if (s <= 0) {
    const [ax, ay] = t.pts[0], [bx, by] = t.pts[Math.min(3, n - 1)];
    const l = Math.hypot(bx - ax, by - ay) || 1;
    return [ax + ((bx - ax) / l) * s, ay + ((by - ay) / l) * s];
  }
  if (s >= t.len) {
    const [ax, ay] = t.pts[Math.max(0, n - 4)], [bx, by] = t.pts[n - 1];
    const l = Math.hypot(bx - ax, by - ay) || 1;
    return [bx + ((bx - ax) / l) * (s - t.len), by + ((by - ay) / l) * (s - t.len)];
  }
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t.cum[m] < s) lo = m; else hi = m; }
  const k = (s - t.cum[lo]) / (t.cum[hi] - t.cum[lo] || 1);
  return [t.pts[lo][0] + (t.pts[hi][0] - t.pts[lo][0]) * k, t.pts[lo][1] + (t.pts[hi][1] - t.pts[lo][1]) * k];
}
function dirAt(t, s) {
  const a = posAt(t, s - 0.12), b = posAt(t, s + 0.05);
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
}
// Kamera, die den Zug schräg von der Seite filmt
function followView(t, s) {
  // schräg vor und über dem Zug, mit Abstand: man sieht den ganzen ICE und die Gleise drumherum
  const p = posAt(t, s - 0.07), [tx2, ty2] = dirAt(t, s - 0.07);
  let dx = -ty2 * 0.8 + tx2 * 0.6, dy = tx2 * 0.8 + ty2 * 0.6;
  const l = Math.hypot(dx, dy);
  dx /= l; dy /= l;
  return { tx: p[0], ty: p[1], tz: 0.003, dist: 0.26, pitch: 1.05, bearing: Math.atan2(-dx, -dy) };
}

// Eine Fahrt als Kamerafahrt: der ICE fährt aus, die Kamera filmt von der Seite, zoomt hoch auf die Strecke,
// die sich zieht, und am Ziel wieder herunter, wo der Zug einfährt; dann der Blick auf den Zielbahnhof.
async function ride(t) {
  mode = "travel";
  ui();
  const ready = ensureCity(t.to);
  const L = t.len;
  // Abfahrt = Spiegelbild der Ankunft (gleiche Zeiten, gleiche Bewegung, rückwärts gedacht)
  const s0 = 0.17, s1 = s0 + 0.57, s2 = s1 + 1.0;
  const ex = { trip: t, train: s0, prog: s0 / L };
  // zum Zug schwenken
  if (!(await run([{ dur: 0.9, from: { ...cam }, to: followView(t, s0) }], ex))) return false;
  // Ausfahrt, die Kamera begleitet den Zug (2,6 s, sanft beschleunigend; Ankunft: sanft bremsend)
  if (!(await run([{ dur: 2.6, dyn: (k) => { const s = s0 + 0.57 * k ** 2.4; anim.train = s; anim.prog = s / L; return followView(t, s); } }], ex))) return false;
  // Herauszoomen, während der Zug weiterfährt (2,8 s; Ankunft: Hereinzoomen in 2,8 s)
  const fr = frameBox(t.bbox), sB = Math.max(s2, L - 1.6);
  if (!(await run([{ dur: 2.8, dyn: (k) => { const s = s1 + (s2 - s1) * k; anim.train = s; anim.prog = s / L; return camTween(followView(t, s), fr, k ** 1.6); } }], { ...ex, train: s1, prog: s1 / L }))) return false;
  // die Karte steht, die Linie zieht sich weiter bis kurz vor das Ziel
  const D = clamp(1.4 + t.km / 300, 1.8, 4.5);
  if (!(await run([{ dur: D, dyn: (k) => { const s = s2 + (sB - s2) * k; anim.train = s; anim.prog = s / L; return fr; } }], { ...ex, train: s2, prog: s2 / L }))) return false;
  await ready;
  reveal = { s: t.to, t0: performance.now() - 6000 };
  // Hereinzoomen, während der Zug schon auf das Ziel zufährt, dann langsam einfahren
  const sC = L - 0.6;
  const C1 = 2.8;
  if (!(await run([{ dur: C1, dyn: (k) => { const s = sB + (sC - sB) * k; anim.train = s; anim.prog = s / L; return camTween(fr, followView(t, s), 1 - (1 - k) ** 1.6); } }], { ...ex, train: sB, prog: sB / L }))) return false;
  if (!(await run([{ dur: 2.6, dyn: (k) => { const s = sC + 0.57 * (1 - (1 - k) ** 2.4); anim.train = s; anim.prog = Math.min(1, s / L); return followView(t, s); } }], { ...ex, train: sC, prog: sC / L }))) return false;
  reveal = { s: t.to, t0: performance.now() - 300 };
  if (!(await run([{ dur: 1.4, from: { ...cam }, to: modelView(t.to) }], { ...ex, train: L - 0.03, prog: 1 }))) return false;
  anim = null;
  return true;
}

async function depart() {
  const t = trips[leg];
  if (!t || mode !== "stand" || t.from !== here) return;
  stampTicket();
  const my = epoch;
  await new Promise((r) => setTimeout(r, 550));
  if (my !== epoch) return;
  arrivedTrip = null;
  if (!(await ride(t))) return; // unterbrochen (anderer Fahrtpunkt gewählt)
  done.add(t.no);
  arrivedTrip = t;
  arrive(t.to);
}
// Zu einem anderen Bahnhof springen (Lücke in den Daten: gestrichelt), ohne Zug
async function hop(s) {
  if (mode !== "stand" && mode !== "map") return;
  if (s === here) { arrive(here); return; }
  arrivedTrip = null;
  mode = "travel";
  ui();
  const ready = ensureCity(s);
  const box = [Math.min(here.w[0], s.w[0]), Math.min(here.w[1], s.w[1]), Math.max(here.w[0], s.w[0]), Math.max(here.w[1], s.w[1])];
  const fr = frameBox(box);
  if (!(await run([{ dur: 1.8, from: { ...cam }, to: fr }, { dur: 1.2, draw: true, from: fr, to: fr }], { hop: [here, s] }))) return;
  await ready;
  reveal = { s, t0: performance.now() - 300 };
  if (!(await run([{ dur: 2.2, from: { ...cam }, to: modelView(s) }], { hop: [here, s], prog: 1 }))) return;
  anim = null;
  arrive(s);
}
function arrive(s) {
  here = s;
  leg = Math.max(leg, [...done].reduce((a, i) => Math.max(a, i + 1), 0));
  mode = "stand";
  document.body.classList.remove("mapmode");
  tidyCities();
  const nxt = trips[leg];
  if (nxt) { ensureCity(nxt.from); ensureCity(nxt.to); }
  ui();
  need();
}
// Fahrtpunkt angeklickt: auch mitten in einer Fahrt; kurzer Übergang (kurz abblenden, Startbahnhof aufblenden)
async function jumpTo(i) {
  interrupt();
  const my = epoch;
  for (let k = 0; k < trips.length; k++) (k < i ? done.add(k) : done.delete(k));
  leg = i;
  arrivedTrip = null;
  mode = "travel";
  document.body.classList.remove("mapmode");
  ui();
  const target = trips[i].from;
  const ready = ensureCity(target);
  const c0 = { ...cam };
  const f0 = Number(fadeEl.style.opacity || 0);
  if (!(await run([{ dur: 0.35, from: c0, to: { ...c0, dist: c0.dist * 0.92 }, fade: [f0, 1] }]))) return;
  await ready;
  if (my !== epoch) return;
  here = target;
  reveal = { s: target, t0: performance.now() - 2000 };
  const m = modelView(target);
  if (!(await run([{ dur: 0.6, from: { ...m, dist: m.dist * 1.12 }, to: m, fade: [1, 0] }]))) return;
  anim = null;
  setFade(0);
  arrive(target);
}
function tidyCities() {
  const keep = new Set([here]);
  const nxt = trips[leg];
  if (nxt) { keep.add(nxt.from); keep.add(nxt.to); }
  for (const s of stations.values()) if (!keep.has(s) && s.city && s.city !== "loading" && s.city !== "none") { s.city = null; s.cityPromise = null; }
}
async function toMap() {
  if (mode !== "stand" || anim) return;
  mode = "map";
  document.body.classList.add("mapmode");
  ui();
  await run([{ dur: 1.8, from: { ...cam }, to: overviewView() }]);
  anim = null;
}
async function fromMap(target = here) {
  if (mode !== "map" || anim) return;
  // passende Fahrt zum Bahnhof wählen, wenn die vorgemerkte nicht dort startet
  if (!trips[leg] || trips[leg].from !== target) {
    const i = trips.findIndex((t) => t.from === target);
    if (i >= 0) { leg = i; for (let k = 0; k < trips.length; k++) (k < i ? done.add(k) : done.delete(k)); }
  }
  mode = "travel";
  document.body.classList.remove("mapmode");
  ui();
  await ensureCity(target);
  reveal = { s: target, t0: performance.now() };
  if (!(await run([{ dur: 2.2, from: { ...cam }, to: modelView(target) }]))) return;
  anim = null;
  arrivedTrip = null;
  arrive(target);
}

// ================================================================ Oberfläche: Fahrkarte und Punkte
const el = {
  ticket: document.getElementById("ticket"),
  tmain: document.getElementById("tmain"),
  go: document.getElementById("go"),
  stampEl: document.getElementById("stamp"),
  mapBtn: document.getElementById("mapbtn"),
  tip: document.getElementById("tip"),
};
const dayOf = (datum) => { const [d, m, y] = datum.split(".").map(Number); return DAYS[new Date(y, m - 1, d).getDay()]; };
let goAction = null;
el.go.addEventListener("click", () => goAction && goAction());

function routeHTML(t, leftTime, kmText) {
  return `<p class="t-top"><span>Fahrt ${t.no + 1} von ${trips.length}</span><span>${dayOf(t.p.datum)} ${t.p.datum}</span></p>
    <div class="t-route">
      <div class="t-end"><b class="t-time">${leftTime}</b><span>${nice(t.p.start)}</span></div>
      <div class="t-line"><i>${t.p.zuege}</i></div>
      <div class="t-end r"><b class="t-time">${t.p.ankunft}</b><span>${nice(t.p.ziel)}</span></div>
    </div>
    <p class="t-meta">${kmText}</p>`;
}
function ui() {
  if (appliedDpr && curDpr() !== appliedDpr) resize(); // Wechsel zwischen Übersicht (scharf) und Bahnhofsansicht (sparsam)
  el.mapBtn.textContent = mode === "map" ? "Zurück" : "Übersicht";
  el.ticket.classList.toggle("away", mode === "map");
  if (mode !== "travel") el.stampEl.classList.remove("on");
  const t = trips[leg];
  const arrivedLine = arrivedTrip
    ? `<p class="t-arr">Angekommen in ${nice(arrivedTrip.p.ziel)} · ${arrivedTrip.p.ankunft} Uhr · ${nf(arrivedTrip.km)} km in ${hm(arrivedTrip.minutes)}</p>`
    : "";
  if (mode === "travel") {
    el.go.hidden = true;
    return;
  }
  el.go.hidden = false;
  if (!t) {
    el.tmain.innerHTML = `${arrivedLine}<p class="t-top"><span>Ende</span></p><p class="t-big">Das war mein Bahnjahr.</p><p class="t-meta">${trips.length} Fahrten · ${nf(totalKm)} km</p>`;
    el.go.textContent = "Übersicht";
    goAction = toMap;
  } else if (t.from === here) {
    el.tmain.innerHTML = arrivedLine + routeHTML(t, t.p.abfahrt, `${nf(t.km)} km · ${hm(t.minutes)} · ${Math.max(0, t.haltAt.length - 2)} Halte`);
    el.go.textContent = "Einsteigen";
    goAction = depart;
  } else {
    el.tmain.innerHTML = `${arrivedLine}<p class="t-top"><span>Fahrt ${t.no + 1} von ${trips.length}</span><span>${dayOf(t.p.datum)} ${t.p.datum}</span></p>
      <p class="t-big">Weiter geht's ab ${nice(t.p.start)}</p>
      <p class="t-meta">Wie ich dorthin kam, steht nicht in den Daten.</p>`;
    el.go.textContent = "Hinfahren";
    goAction = () => hop(t.from);
  }
  yearUI();
}

// ---------- Das Jahr in Zahlen und als Zeitleiste ----------
const totalMin = trips.reduce((a, t) => a + t.minutes, 0);
const longest = trips.reduce((a, t) => (t.km > a.km ? t : a), trips[0]);
const topStation = [...stations.values()].reduce((a, s) => (s.visits > a.visits ? s : a));
const maxKm = longest.km;
const doy = (t) => { const [d, m, y] = t.p.datum.split(".").map(Number); return (new Date(y, m - 1, d) - new Date(y, 0, 1)) / 86400000; };
document.getElementById("stats").innerHTML = [
  ["Fahrten", trips.length],
  ["Kilometer", `<span id="kmcount">0</span>`],
  ["Stunden im Zug", nf(totalMin / 60)],
  ["Bahnhöfe", stations.size],
].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
const kmEl = document.getElementById("kmcount");
const ycap = document.getElementById("ycap"), ytrack = document.getElementById("ytrack");
const DEFAULT_CAP = `Längste Fahrt: <b>${nice(longest.p.start)} → ${nice(longest.p.ziel)}</b>, ${nf(longest.km)} km · am häufigsten: <b>${topStation.name}</b>, ${topStation.visits}×`;
let hoverTrip = -1;
// Fahrten an benachbarten Tagen leicht auseinanderrücken, damit jede einzeln greifbar bleibt
const GAPF = 0.012;
const barPos = [];
trips.forEach((t, i) => { barPos.push(Math.max(doy(t) / 365, i ? barPos[i - 1] + GAPF : 0)); });
function setHover(i) {
  if (hoverTrip === i) return;
  hoverTrip = i;
  ycap.innerHTML = i >= 0 ? tripCap(trips[i]) : defaultCap();
  yearUI();
  need();
}
const bars = trips.map((t, i) => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "y-bar";
  b.style.left = `${barPos[i] * 100}%`;
  b.style.width = `${GAPF * 100}%`;
  b.style.marginLeft = `${-GAPF * 50}%`;
  b.style.height = "46px";
  b.style.setProperty("--h", `${6 + 38 * (t.km / maxKm)}px`);
  b.setAttribute("aria-label", `${t.p.datum}: ${nice(t.p.start)} nach ${nice(t.p.ziel)}, ${nf(t.km)} km`);
  // Tastatur: Fokus zeigt die Fahrt, Enter wählt sie (Maus und Finger laufen über die ganze Leiste, siehe unten)
  b.addEventListener("focus", () => setHover(i));
  b.addEventListener("blur", () => { if (hoverTrip === i) setHover(-1); });
  ytrack.appendChild(b);
  return b;
});
// Maus und Finger: die ganze Leiste ist die Fläche, es zählt die nächste Fahrt (kein genaues Treffen der dünnen Striche)
const nearestTrip = (e) => {
  const r = ytrack.getBoundingClientRect(), x = (e.clientX - r.left) / r.width;
  let best = 0, bd = Infinity;
  barPos.forEach((p, i) => { const d = Math.abs(p - x); if (d < bd) { bd = d; best = i; } });
  return best;
};
ytrack.addEventListener("pointermove", (e) => setHover(nearestTrip(e)));
ytrack.addEventListener("pointerleave", () => setHover(-1));
ytrack.addEventListener("click", (e) => playTrip(e.detail === 0 && e.target.classList.contains("y-bar") ? bars.indexOf(e.target) : nearestTrip(e)));
function tripCap(t) {
  return `<b>${t.p.datum.slice(0, 6)} ${nice(t.p.start)} → ${nice(t.p.ziel)}</b> · ${nf(t.km)} km · ${hm(t.minutes)} · ${t.p.zuege}`;
}
function defaultCap() {
  return mode === "map" ? DEFAULT_CAP : ""; // am Bahnhof steht alles auf der Fahrkarte
}
function yearUI() {
  const cur = mode !== "map" ? (anim && anim.trip ? anim.trip.no : leg) : -1;
  bars.forEach((b, i) => { b.classList.toggle("on", i === hoverTrip); b.classList.toggle("cur", i === cur); });
  if (hoverTrip < 0) ycap.innerHTML = defaultCap();
}
// Fahrt aus der Zeitleiste: zum Startbahnhof dieser Fahrt (die Fahrkarte zeigt sie, "Einsteigen" fährt los)
function playTrip(i) {
  hoverTrip = -1;
  if (mode === "map" && !anim) {
    for (let k = 0; k < trips.length; k++) (k < i ? done.add(k) : done.delete(k));
    leg = i;
    fromMap(trips[i].from);
  } else jumpTo(i);
}
function stampTicket() {
  el.stampEl.classList.add("on");
  el.go.hidden = true;
}
// während der Fahrt: Uhrzeit und Kilometer laufen mit der Linie mit
let lastLive = "";
function liveTicket() {
  if (!anim || !anim.trip) return;
  const t = anim.trip, k = anim.prog;
  const now = new Date(t.t0 + (t.t1 - t.t0) * k);
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const key = time + "|" + Math.round(t.km * k);
  if (key === lastLive) return;
  lastLive = key;
  el.tmain.innerHTML = routeHTML(t, time, `${nf(t.km * k)} von ${nf(t.km)} km`);
}

el.mapBtn.addEventListener("click", () => (mode === "map" ? fromMap() : toMap()));

// ================================================================ Zeichnen
let raf = 0;
function need() { if (!raf) raf = requestAnimationFrame(frame); }
let busyUntil = 0, idleTimer = 0, lastInput = performance.now();
function poke() {
  busyUntil = performance.now() + 160;
  lastInput = performance.now();
  clearTimeout(idleTimer);
  idleTimer = setTimeout(need, 190);
}

function stepAnim(now) {
  if (!anim) return;
  let t = (now - anim.t0) / 1000;
  for (const st of anim.steps) {
    if (t <= st.dur) {
      const k = clamp(t / st.dur, 0, 1);
      Object.assign(cam, st.dyn ? st.dyn(k) : camTween(st.from, st.to, k));
      if (st.draw) anim.prog = k;
      if (st.fade) setFade(st.fade[0] + (st.fade[1] - st.fade[0]) * k);
      return;
    }
    t -= st.dur;
    if (st.draw) anim.prog = 1;
  }
  const last = anim.steps[anim.steps.length - 1];
  Object.assign(cam, last.dyn ? last.dyn(1) : last.to);
  if (last.fade) setFade(last.fade[1]);
  const fn = anim.done1;
  anim.done1 = null;
  if (fn) fn();
}

// Liegt ein Weltpunkt unter einem Bahnhofsgebäude (Halle)?
function underRoof(s, w) {
  if (!s || !s.city || typeof s.city !== "object") return false;
  const x = ((w[0] - s.w[0]) * 1000) / s.kx, y = (w[1] - s.w[1]) * 1000;
  if (Math.hypot(x, y) > 700) return false;
  s._sb ||= s.city.buildings.filter((b) => b.station);
  for (const b of s._sb) {
    if (Math.abs(b.lc[0] - x) > b.rad * 1000 || Math.abs(b.lc[1] - y) > b.rad * 1000) continue;
    const p = b.lo;
    let r = false;
    for (let i = 0, j = p.length / 2 - 1; i < p.length / 2; j = i++) {
      const xi = p[2 * i], yi = p[2 * i + 1], xj = p[2 * j], yj = p[2 * j + 1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi) r = !r;
    }
    if (r) return true;
  }
  return false;
}

// Der ICE auf der Linie: jeder Eckpunkt einzeln entlang der Strecke gesetzt (der Zug biegt sich durch Kurven).
// Die Flächen kommen in dieselbe Tiefenliste wie die Gebäude, damit Hallen den Zug richtig verdecken.
function trainItems(t, sHead, list) {
  const a = cs(...posAt(t, sHead), 0), b = cs(...posAt(t, sHead - 0.15), 0);
  if (a[2] < NEAR && b[2] < NEAR) return;
  // klein werdend weich ausblenden (statt plötzlich zu verschwinden)
  let alpha = 1;
  if (a[2] > NEAR && b[2] > NEAR) alpha = clamp((Math.hypot(sx(a) - sx(b), sy(a) - sy(b)) - 8) / 40, 0, 1);
  if (alpha <= 0) return;
  const toWorld = (sf, x, y, z) => {
    const s = sf - (CAR - x) / 1000;
    const p = posAt(t, s), q = posAt(t, s + 0.002), r = posAt(t, s - 0.002);
    let dx = q[0] - r[0], dy = q[1] - r[1];
    const l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    return [p[0] - dy * (y / 1000), p[1] + dx * (y / 1000), z / 1000];
  };
  for (let ci = 0; ci < ICE.length; ci++) {
    const car = ICE[ci], V = car.V, nv = V.length / 3;
    const sf = sHead - (ci * (CAR + GAP)) / 1000;
    // Wagen unter einem Hallendach: nur durchscheinend (man sieht ihn durch das Glasdach)
    const mid = posAt(t, sf - CAR / 2000);
    const carAlpha = alpha * (underRoof(t.from, mid) || underRoof(t.to, mid) ? 0.28 : 1);
    const Wp = new Array(nv);
    for (let i = 0; i < nv; i++) Wp[i] = toWorld(sf, V[3 * i], V[3 * i + 1], V[3 * i + 2]);
    for (const f of car.F) {
      const pts = f.i.map((i) => Wp[i]);
      // Normale aus den gebogenen Weltpunkten, zur Kamera gewandt?
      let nx = 0, ny = 0, nz = 0;
      for (let k = 0; k < pts.length; k++) {
        const p = pts[k], q = pts[(k + 1) % pts.length];
        nx += (p[1] - q[1]) * (p[2] + q[2]); ny += (p[2] - q[2]) * (p[0] + q[0]); nz += (p[0] - q[0]) * (p[1] + q[1]);
      }
      if (nx * (camX - pts[0][0]) + ny * (camY - pts[0][1]) + nz * (camZ - pts[0][2]) <= 0) continue;
      const C = pts.map((p) => cs(p[0], p[1], p[2]));
      let d = 0;
      for (const c of C) d += c[2];
      const lines = !Q.trainDetail ? [] : f.lines.map(([p, q]) => [cs(...toWorld(sf, ...p)), cs(...toWorld(sf, ...q))]);
      const polys = !Q.trainDetail ? [] : (f.polys || []).map((pg) => ({ fill: pg.fill, C: pg.pts.map((p) => cs(...toWorld(sf, ...p))) }));
      list.push({ train: true, C, lines, polys, alpha: carAlpha, d: d / C.length });
    }
  }
}
function drawTrainFace(it) {
  const P = it.C.some((c) => c[2] < NEAR) ? clipPoly(it.C) : it.C;
  if (P.length < 3) return;
  ctx.globalAlpha = it.alpha;
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  pathPoly(P);
  ctx.fill();
  ctx.stroke();
  // Fensterband (hellgrau) und Frontscheibe (dunkel) als Flächen
  for (const pg of it.polys) {
    if (pg.C.some((c) => c[2] < NEAR)) continue;
    ctx.fillStyle = pg.fill;
    ctx.beginPath();
    pathPoly(pg.C);
    ctx.fill();
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }
  if (it.lines.length) {
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (const [p, q] of it.lines) {
      if (p[2] < NEAR || q[2] < NEAR) continue;
      ctx.moveTo(sx(p), sy(p));
      ctx.lineTo(sx(q), sy(q));
    }
    ctx.stroke();
  }
}

// Teil einer Fahrtlinie (0..prog) als Pfad anlegen
function pathPartial(t, prog) {
  if (prog >= 1) { pathLine(t.g); return; }
  const L = t.len * prog;
  let i = 1;
  while (i < t.pts.length && t.cum[i] < L) i++;
  if (i >= t.pts.length) { pathLine(t.g); return; }
  const k = (L - t.cum[i - 1]) / (t.cum[i] - t.cum[i - 1] || 1);
  pathLine(t.g, 0, i * 2);
  const hc = cs(t.pts[i - 1][0] + (t.pts[i][0] - t.pts[i - 1][0]) * k, t.pts[i - 1][1] + (t.pts[i][1] - t.pts[i - 1][1]) * k, 0);
  if (hc[2] > NEAR) ctx.lineTo(sx(hc), sy(hc));
}

// Übersicht: das ganze Jahr. Beim ersten Öffnen zeichnen sich alle Fahrten nacheinander (in echter Reihenfolge).
let introT0 = 0;
const INTRO_MS = 7000;
const introP = () => (introT0 ? clamp((performance.now() - introT0) / INTRO_MS, 0, 1) : 1);
const tripProg = (t, P) => clamp((P * totalKm - t.kmBefore) / t.km, 0, 1);
{
  let acc = 0;
  for (const t of trips) { t.kmBefore = acc; acc += t.km; }
  for (const s of stations.values()) s.introAt = 1;
  for (const t of trips) for (const h of t.haltAt) h.s.introAt = Math.min(h.s.introAt, (t.kmBefore + h.at * t.km) / totalKm);
}
function drawOverview(lw) {
  const P = introP();
  const hov = hoverTrip >= 0 ? trips[hoverTrip] : null;
  ctx.strokeStyle = hov ? "#d2d2d2" : "rgba(17,17,17,.6)";
  ctx.lineWidth = lw;
  ctx.beginPath();
  for (const t of trips) { const tp = tripProg(t, P); if (tp > 0 && t !== hov) pathPartial(t, tp); }
  ctx.stroke();
  if (hov) {
    ctx.strokeStyle = "#111";
    ctx.lineWidth = lw + 1.6;
    ctx.beginPath();
    pathLine(hov.g);
    ctx.stroke();
  }
  if (kmEl) kmEl.textContent = nf(P * totalKm);
}

function drawTrips(ppk) {
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const lw = clamp(1 + Math.log2(ppk + 1) * 0.35, 1.2, 3);
  if (mode === "map") { drawOverview(lw); return; }
  ctx.strokeStyle = "rgba(17,17,17,.45)";
  ctx.lineWidth = lw;
  ctx.beginPath();
  for (const i of done) pathLine(trips[i].g);
  ctx.stroke();
  if (anim && anim.trip) {
    const t = anim.trip;
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = "#b5b5b5";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    pathLine(t.g);
    ctx.stroke();
    ctx.setLineDash([]);
    // gezogene Linie bis zur aktuellen Stelle
    const L = t.len * anim.prog;
    let i = 1;
    while (i < t.pts.length && t.cum[i] < L) i++;
    const k = i < t.pts.length ? (L - t.cum[i - 1]) / (t.cum[i] - t.cum[i - 1] || 1) : 1;
    const hx = i < t.pts.length ? t.pts[i - 1][0] + (t.pts[i][0] - t.pts[i - 1][0]) * k : t.pts[t.pts.length - 1][0];
    const hy = i < t.pts.length ? t.pts[i - 1][1] + (t.pts[i][1] - t.pts[i - 1][1]) * k : t.pts[t.pts.length - 1][1];
    ctx.strokeStyle = "#111";
    ctx.lineWidth = lw + 0.8;
    ctx.beginPath();
    pathLine(t.g, 0, i * 2);
    const hc = cs(hx, hy, 0);
    if (hc[2] > NEAR) ctx.lineTo(sx(hc), sy(hc));
    ctx.stroke();
  }
  if (anim && anim.hop) {
    const [a, b] = anim.hop, k = anim.prog;
    const A = cs(a.w[0], a.w[1], 0), B = cs(a.w[0] + (b.w[0] - a.w[0]) * k, a.w[1] + (b.w[1] - a.w[1]) * k, 0);
    if (A[2] > NEAR && B[2] > NEAR) {
      ctx.setLineDash([5, 6]);
      ctx.strokeStyle = "#777";
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(sx(A), sy(A)); ctx.lineTo(sx(B), sy(B)); ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

// Übersicht: alle Bahnhöfe, Größe nach Besuchen (Fläche ~ Anzahl); erscheinen, wenn die Linie sie erreicht
function drawOverviewStops(ppk) {
  const P = introP();
  const hov = hoverTrip >= 0 ? trips[hoverTrip] : null;
  const onHov = hov ? new Set(hov.p.halte) : null;
  const k = clamp(0.8 + ppk * 0.004, 0.8, 2);
  const out = [];
  const list = [...stations.values()].sort((a, b) => a.visits - b.visits);
  for (const s of list) {
    if (s.introAt > P + 1e-6) continue;
    const c = cs(s.w[0], s.w[1], 0);
    if (c[2] < NEAR) continue;
    const X = sx(c), Y = sy(c);
    if (X < -40 || X > W + 40 || Y < -40 || Y > H + 40) continue;
    const pop = clamp((P - s.introAt) * 40, 0, 1);
    const r = (2.2 + Math.sqrt(s.visits) * 1.9) * k * (pop < 1 ? 0.3 + 0.7 * pop + Math.sin(pop * Math.PI) * 0.4 : 1);
    const dim = onHov && !onHov.has(s.key);
    ctx.globalAlpha = dim ? 0.3 : 1;
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = "#111";
    ctx.fillStyle = s.terminal ? "#111" : "#fff";
    ctx.beginPath();
    ctx.arc(X, Y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 1;
    out.push({ s, X, Y, r });
  }
  return out;
}

function drawStops(ppk) {
  if (mode === "map") return drawOverviewStops(ppk);
  const show = new Set();
  for (const i of done) for (const h of trips[i].p.halte) show.add(h);
  if (anim && anim.trip) for (const h of anim.trip.haltAt) if (h.at <= anim.prog + 0.002) show.add(h.s.key);
  if (anim && anim.trip) { show.add(anim.trip.p.start); show.add(anim.trip.p.ziel); }
  if (anim && anim.hop) { show.add(anim.hop[0].key); show.add(anim.hop[1].key); }
  show.add(here.key);
  const r = clamp(2 + ppk * 0.01, 2.6, 4.4);
  const out = [];
  for (const k of show) {
    const s = stations.get(k);
    if (!s) continue;
    const c = cs(s.w[0], s.w[1], 0);
    if (c[2] < NEAR) continue;
    const X = sx(c), Y = sy(c);
    if (X < -40 || X > W + 40 || Y < -40 || Y > H + 40) continue;
    if (FOC / c[2] / 1000 > 0.12 && s.city && typeof s.city === "object") continue; // nah dran: das Gebäude ersetzt den Punkt
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = "#111";
    ctx.fillStyle = s.terminal ? "#111" : "#fff";
    ctx.beginPath();
    ctx.arc(X, Y, s.terminal ? r * 1.1 : r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    out.push({ s, X, Y });
  }
  return out;
}

// Umgrenzungsrahmen einer Linie (einmal berechnet) und grobe Sichtprüfung, bevor Punkte einzeln umgerechnet werden
function bboxOf(g) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < g.length; i += 2) { x0 = Math.min(x0, g[i]); x1 = Math.max(x1, g[i]); y0 = Math.min(y0, g[i + 1]); y1 = Math.max(y1, g[i + 1]); }
  return [x0, y0, x1, y1];
}
// liefert null (außerhalb des Bildes) oder die kleinste mögliche Tiefe des Rahmens (größte mögliche Pixelgröße)
function boxDepth(bb) {
  const rad = Math.hypot(bb[2] - bb[0], bb[3] - bb[1]) / 2;
  const c = cs((bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2, 0);
  const dmin = c[2] - rad;
  if (dmin < NEAR) return NEAR;
  const X = sx(c), Y = sy(c), pr = (rad * FOC) / dmin + 50;
  return X + pr < 0 || X - pr > W || Y + pr < 0 || Y - pr > H ? null : dmin;
}
// Schienen: Versatz links und rechts der Gleisachse (Spurweite 1,435 m, Welt in km)
function railOffsets(l) {
  if (l.o) return l.o;
  const g = l.g, n = g.length / 2, L = new Float64Array(g.length), R = new Float64Array(g.length), off = 0.0007175;
  for (let i = 0; i < n; i++) {
    const p = Math.max(0, i - 1), q = Math.min(n - 1, i + 1);
    const dx = g[2 * q] - g[2 * p], dy = g[2 * q + 1] - g[2 * p + 1], len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len * off, ny = dx / len * off;
    L[2 * i] = g[2 * i] + nx; L[2 * i + 1] = g[2 * i + 1] + ny;
    R[2 * i] = g[2 * i] - nx; R[2 * i + 1] = g[2 * i + 1] - ny;
  }
  return (l.o = { L, R });
}
// Schwellen alle ~1,7 m, nur im ruhigen Bild und nah dran (höchstens 5000 pro Bild)
function drawSleepers(lines) {
  let budget = 5000;
  ctx.strokeStyle = "#bdbdbd";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  const step = 0.0017, half = 0.0009;
  for (const l of lines) {
    const g = l.g, n = g.length / 2;
    let carry = 0;
    for (let i = 1; i < n && budget > 0; i++) {
      const x0 = g[2 * i - 2], y0 = g[2 * i - 1], dx = g[2 * i] - x0, dy = g[2 * i + 1] - y0, len = Math.hypot(dx, dy);
      if (len < 1e-9) continue;
      const nx = -dy / len * half, ny = dx / len * half;
      for (let t = step - carry; t < len; t += step) {
        const px = x0 + (dx / len) * t, py = y0 + (dy / len) * t;
        const a = cs(px + nx, py + ny, 0), b = cs(px - nx, py - ny, 0);
        if (a[2] < NEAR || b[2] < NEAR) continue;
        const X = sx(a), Y = sy(a);
        if (X < -20 || X > W + 20 || Y < -20 || Y > H + 20) continue;
        ctx.moveTo(X, Y); ctx.lineTo(sx(b), sy(b));
        if (--budget <= 0) break;
      }
      carry = (carry + len) % step;
    }
  }
  ctx.stroke();
}
// Durchgehender Boden: hellgraue Fläche vom Horizont bis zum unteren Bildrand (am Horizont in Weiß auslaufend),
// darauf liegen Straßen (weiß), Wasser (dunkler) und Gebäude
function drawFloor(a) {
  const yh = sp < 0.02 ? -1e5 : HY() - (FOC * cp) / sp; // Horizont im Bild
  if (yh >= H) return;
  ctx.globalAlpha = a;
  if (yh < -2000) ctx.fillStyle = "#eeeeee";
  else {
    const g = ctx.createLinearGradient(0, yh, 0, yh + Math.max(60, (H - yh) * 0.3));
    g.addColorStop(0, "rgba(238,238,238,0)");
    g.addColorStop(1, "#eeeeee");
    ctx.fillStyle = g;
  }
  ctx.fillRect(0, Math.max(0, yh), W, H - Math.max(0, yh));
  ctx.globalAlpha = 1;
}
function drawGround(c, a) {
  ctx.globalAlpha = a;
  ctx.fillStyle = "#e2e2e2";
  ctx.strokeStyle = "#cfcfcf";
  ctx.lineWidth = 0.7;
  for (const rings of c.wa) {
    rings.bb ||= bboxOf(rings[0]);
    if (boxDepth(rings.bb) === null) continue;
    ctx.beginPath();
    for (const g of rings) {
      const C = [];
      for (let i = 0; i < g.length; i += 2) C.push(cs(g[i], g[i + 1], 0));
      const P = clipPoly(C);
      if (P.length > 2) pathPoly(P);
    }
    ctx.fill("evenodd");
    if (Q.waterEdge) ctx.stroke();
  }
  const WID = [3, 6, 9, 13, 18];
  const buckets = new Map();
  for (const l of c.road) {
    if (l.cls < Q.roadMin) continue;
    const g = l.g, wm = WID[l.cls] || 6;
    const dmin = boxDepth(l.bb ||= bboxOf(g));
    if (dmin === null || (wm * FOC) / (dmin * 1000) < Q.roadPx) continue; // außerhalb oder selbst nah dran zu schmal
    let prev = null;
    for (let i = 0; i < g.length; i += 2) {
      const p = cs(g[i], g[i + 1], 0);
      if (prev && (prev[2] >= NEAR || p[2] >= NEAR)) {
        let A = prev, B = p;
        if (A[2] < NEAR) { const t = (NEAR - A[2]) / (B[2] - A[2]); A = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, NEAR]; }
        if (B[2] < NEAR) { const t = (NEAR - A[2]) / (B[2] - A[2]); B = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, NEAR]; }
        const X1 = sx(A), Y1 = sy(A), X2 = sx(B), Y2 = sy(B);
        if (!((X1 < -50 && X2 < -50) || (X1 > W + 50 && X2 > W + 50) || (Y1 < -50 && Y2 < -50) || (Y1 > H + 50 && Y2 > H + 50))) {
          const px = (wm * FOC) / (((A[2] + B[2]) / 2) * 1000);
          if (px >= Q.roadPx) {
            const k = clamp(Math.round(Math.log2(px) * 3), -6, 30);
            let arr = buckets.get(k);
            if (!arr) buckets.set(k, (arr = []));
            arr.push(X1, Y1, X2, Y2);
          }
        }
      }
      prev = p;
    }
  }
  ctx.strokeStyle = "#fbfbfb";
  ctx.lineCap = "round";
  for (const [k, arr] of buckets) {
    ctx.lineWidth = Math.min(400, 2 ** (k / 3));
    ctx.beginPath();
    for (let i = 0; i < arr.length; i += 4) { ctx.moveTo(arr[i], arr[i + 1]); ctx.lineTo(arr[i + 2], arr[i + 3]); }
    ctx.stroke();
  }
  ctx.strokeStyle = "#a3a3a3";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  const sleepers = [];
  for (const l of c.rail) {
    const dmin = boxDepth(l.bb ||= bboxOf(l.g));
    if (dmin === null) continue;
    const ppm = FOC / (dmin * 1000); // größte mögliche Pixel je Meter
    if (Q.tracks && ppm > 1.1) {
      const o = railOffsets(l); // zwei Schienen im Normalspurabstand
      pathLine(o.L); pathLine(o.R);
      if (!BUSY && ppm > 3) sleepers.push(l);
    } else pathLine(l.g);
  }
  ctx.stroke();
  if (sleepers.length) drawSleepers(sleepers);
  ctx.globalAlpha = 1;
}

// ---------- Gebäude ----------
// Eckpunkte einmal pro Bild in Kamera- und Bildschirmkoordinaten (im Gebäude zwischengespeichert)
function projectB(b) {
  const V = b.V, nv = V.length / 3;
  if (!b._C || b._C.length < nv * 3) { b._C = new Float64Array(nv * 3); b._S = new Float64Array(nv * 2); }
  const C = b._C, S = b._S, hy = HY(), w2 = W / 2;
  let behind = false;
  for (let i = 0; i < nv; i++) {
    const dx = V[3 * i] - view.tx, dy = V[3 * i + 1] - view.ty;
    const x1 = dx * cb - dy * sb, y1 = dx * sb + dy * cb;
    const vy = y1 - Cy, vz = V[3 * i + 2] - view.tz - Cz;
    const d = vy * sp - vz * cp, s2 = vy * cp + vz * sp;
    C[3 * i] = x1; C[3 * i + 1] = s2; C[3 * i + 2] = d;
    if (d < NEAR) behind = true;
    else { S[2 * i] = w2 + (FOC * x1) / d; S[2 * i + 1] = hy - (FOC * s2) / d; }
  }
  b._behind = behind;
}
const facing = (b, f) => {
  const V = b.V, i0 = f.i[0], n = f.n;
  if (f.kind === 2) return camZ >= V[3 * i0 + 2];
  return n[0] * (camX - V[3 * i0]) + n[1] * (camY - V[3 * i0 + 1]) + n[2] * (camZ - V[3 * i0 + 2]) > 0;
};

// eine Fläche zeichnen (mit Rippen, Fenstern, Türen)
function drawFace(b, f, alpha, detail, dash) {
  const S = b._S, C = b._C;
  const station = b.station;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = station ? "#111" : "#8c8c8c";
  ctx.lineWidth = station ? 1 : 0.6;
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  if (!b._behind) {
    const idx = f.i;
    ctx.moveTo(S[2 * idx[0]], S[2 * idx[0] + 1]);
    for (let k = 1; k < idx.length; k++) ctx.lineTo(S[2 * idx[k]], S[2 * idx[k] + 1]);
    ctx.closePath();
    if (f.holes) for (const hr of f.holes) {
      ctx.moveTo(S[2 * hr[0]], S[2 * hr[0] + 1]);
      for (let k = 1; k < hr.length; k++) ctx.lineTo(S[2 * hr[k]], S[2 * hr[k] + 1]);
      ctx.closePath();
    }
  } else {
    const CC = (i) => [C[3 * i], C[3 * i + 1], C[3 * i + 2]];
    const pts = clipPoly(f.i.map(CC));
    if (pts.length < 3) { if (dash) ctx.setLineDash([]); return; }
    pathPoly(pts);
    if (f.holes) for (const hr of f.holes) { const hp = clipPoly(hr.map(CC)); if (hp.length > 2) pathPoly(hp); }
  }
  if (f.holes && f.holes.length) ctx.fill("evenodd"); else ctx.fill();
  ctx.stroke();
  if (dash) ctx.setLineDash([]);
  if (b._behind) return;
  if (f.lines) {
    ctx.lineWidth *= 0.6;
    ctx.beginPath();
    for (const [p, q] of f.lines) { ctx.moveTo(S[2 * p], S[2 * p + 1]); ctx.lineTo(S[2 * q], S[2 * q + 1]); }
    ctx.stroke();
  }
  if (detail && f.kind === 0) {
    const [a, bb, , d] = f.i;
    const wpx = Math.hypot(S[2 * bb] - S[2 * a], S[2 * bb + 1] - S[2 * a + 1]);
    const hpx = Math.hypot(S[2 * d] - S[2 * a], S[2 * d + 1] - S[2 * a + 1]);
    if (Q.windows && (Q.windows === 2 || station) && wpx > 36 && hpx > 22 && f.len > 4 && f.wh > 4) drawWindows(b, f, alpha, station);
    else if (Q.floors && b.floors > 1 && hpx > 10) drawFloors(b, f, alpha, station);
  } else if (detail && station && Q.windows && f.kind === 1 && !f.lines && f.i.length === 4) drawRoofTiles(b, f, alpha);
}
function drawFloors(b, f, alpha, station) {
  const S = b._S, [a, bb, c, d] = f.i, nfl = Math.min(b.floors, 40);
  ctx.globalAlpha = alpha * (station ? 0.5 : 0.3);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (let k = 1; k < nfl; k++) {
    const t = k / nfl;
    ctx.moveTo(S[2 * a] + (S[2 * d] - S[2 * a]) * t, S[2 * a + 1] + (S[2 * d + 1] - S[2 * a + 1]) * t);
    ctx.lineTo(S[2 * bb] + (S[2 * c] - S[2 * bb]) * t, S[2 * bb + 1] + (S[2 * c + 1] - S[2 * bb + 1]) * t);
  }
  ctx.stroke();
  ctx.globalAlpha = alpha;
}
// Fensterraster; an der Eingangswand des Bahnhofs im Erdgeschoss ein Portal mit Türen
function drawWindows(b, f, alpha, station) {
  const S = b._S, [ia, ib, ic, id] = f.i;
  const ax = S[2 * ia], ay = S[2 * ia + 1], bx = S[2 * ib], by = S[2 * ib + 1];
  const cx = S[2 * ic], cy = S[2 * ic + 1], dx = S[2 * id], dy = S[2 * id + 1];
  const P = (u, v) => [ax * (1 - u) * (1 - v) + bx * u * (1 - v) + cx * u * v + dx * (1 - u) * v, ay * (1 - u) * (1 - v) + by * u * (1 - v) + cy * u * v + dy * (1 - u) * v];
  const rect = (u0, v0, u1, v1) => {
    const p1 = P(u0, v0), p2 = P(u1, v0), p3 = P(u1, v1), p4 = P(u0, v1);
    ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.lineTo(p4[0], p4[1]); ctx.closePath();
  };
  let doorU = -1;
  const spot = b.spot;
  if (station && spot) {
    const [x0, y0] = f.a, [x1, y1] = f.b, [px, py] = spot.door;
    const L2 = (x1 - x0) ** 2 + (y1 - y0) ** 2 || 1;
    const u = clamp(((px - x0) * (x1 - x0) + (py - y0) * (y1 - y0)) / L2, 0, 1);
    if (Math.hypot(px - (x0 + (x1 - x0) * u), py - (y0 + (y1 - y0) * u)) < 14) doorU = u;
  }
  const cols = Math.min(60, Math.max(1, Math.floor(f.len / (station ? 4.2 : 3.4))));
  const rows = Math.min(30, Math.max(1, Math.floor(f.wh / (station ? 4.6 : 3.2))));
  ctx.globalAlpha = alpha * (station ? 0.75 : 0.42);
  ctx.lineWidth = station ? 0.7 : 0.5;
  ctx.beginPath();
  const cellPx = Math.hypot(bx - ax, by - ay) / cols;
  const rich = station && cellPx > 13; // nah genug für Fensterbänke, Stürze und Pfosten
  const fine = []; // Gliederung der Fassade (feiner gezeichnet)
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const u0 = (c + 0.28) / cols, u1 = (c + 0.72) / cols;
      if (r === 0 && doorU >= 0 && Math.abs((u0 + u1) / 2 - doorU) * f.len < 14) continue;
      const v0 = (r + 0.22) / rows, v1 = (r + (station ? 0.78 : 0.7)) / rows;
      rect(u0, v0, u1, v1);
      if (rich) {
        const e = 0.07 / cols, um = (u0 + u1) / 2;
        fine.push([u0 - e, v0, u1 + e, v0]); // Fensterbank
        fine.push([u0 - e * 0.5, v1 + 0.05 / rows, u1 + e * 0.5, v1 + 0.05 / rows]); // Sturz
        fine.push([um, v0, um, v1]); // Mittelpfosten
        if (cellPx > 22) fine.push([u0, (v0 + v1) / 2 + 0.1 / rows, u1, (v0 + v1) / 2 + 0.1 / rows]); // Kämpfer
      }
    }
  ctx.stroke();
  if (station) {
    // Sockel, Geschossbänder, Pilaster und Kranzgesims
    const sock = Math.min(0.12, 1.1 / f.wh);
    fine.push([0, sock, 1, sock]);
    if (rows > 1) for (let r = 1; r < rows; r++) fine.push([0, r / rows, 1, r / rows]);
    if (cols > 5) for (let c = 4; c < cols; c += 4) fine.push([c / cols, sock, c / cols, 0.94]);
    fine.push([0, 0.965, 1, 0.965]);
    ctx.globalAlpha = alpha * 0.6;
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    for (const [u0, v0, u1, v1] of fine) { const p1 = P(u0, v0), p2 = P(u1, v1); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); }
    ctx.stroke();
    ctx.globalAlpha = alpha * 0.75;
  }
  // Gesims oben
  if (station) {
    ctx.beginPath();
    const g1 = P(0, 0.94), g2 = P(1, 0.94);
    ctx.moveTo(g1[0], g1[1]); ctx.lineTo(g2[0], g2[1]);
    ctx.stroke();
  }
  if (doorU >= 0) {
    const hDoor = Math.min(0.9, 4.2 / f.wh), wU = 2.6 / f.len, gap = 4.4 / f.len;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (let k = -2; k <= 2; k++) {
      const uc = doorU + k * gap;
      if (uc - wU / 2 < 0.01 || uc + wU / 2 > 0.99) continue;
      rect(uc - wU / 2, 0, uc + wU / 2, hDoor);
      const m1 = P(uc, 0), m2 = P(uc, hDoor);
      ctx.moveTo(m1[0], m1[1]); ctx.lineTo(m2[0], m2[1]);
    }
    const e1 = P(clamp(doorU - 3 * gap, 0, 1), hDoor * 1.18), e2 = P(clamp(doorU + 3 * gap, 0, 1), hDoor * 1.18);
    ctx.moveTo(e1[0], e1[1]); ctx.lineTo(e2[0], e2[1]);
    ctx.stroke();
  }
  ctx.globalAlpha = alpha;
}
// Geneigte Bahnhofsdächer: Deckreihen parallel zur Traufe
function drawRoofTiles(b, f, alpha) {
  const S = b._S, [a, bb, c, d] = f.i;
  const wpx = Math.hypot(S[2 * bb] - S[2 * a], S[2 * bb + 1] - S[2 * a + 1]);
  const hpx = Math.hypot(S[2 * d] - S[2 * a], S[2 * d + 1] - S[2 * a + 1]);
  if (wpx < 40 || hpx < 14) return;
  const n = Math.min(26, Math.floor(hpx / 5));
  ctx.globalAlpha = alpha * 0.5;
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  for (let k = 1; k < n; k++) {
    const t = k / n;
    ctx.moveTo(S[2 * a] + (S[2 * d] - S[2 * a]) * t, S[2 * a + 1] + (S[2 * d + 1] - S[2 * a + 1]) * t);
    ctx.lineTo(S[2 * bb] + (S[2 * c] - S[2 * bb]) * t, S[2 * bb + 1] + (S[2 * c + 1] - S[2 * bb + 1]) * t);
  }
  ctx.stroke();
  ctx.globalAlpha = alpha;
}
// weit weg: nur der Dachumriss
function drawRoofOnly(b, alpha) {
  const S = b._S, idx = b.top;
  if (b._behind) return;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = b.station ? "#111" : "#9a9a9a";
  ctx.lineWidth = b.station ? 0.9 : 0.5;
  ctx.beginPath();
  ctx.moveTo(S[2 * idx[0]], S[2 * idx[0] + 1]);
  for (let k = 1; k < idx.length; k++) ctx.lineTo(S[2 * idx[k]], S[2 * idx[k] + 1]);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

// Bahnhofsschild über dem Bahnhof: Name und Stadt, springt beim Ankommen herein
function drawSign(s, now) {
  if (!s.spot || mode === "map") return;
  const [dx, dy] = s.spot.door;
  const c = cs(s.w[0] + (dx / 1000) * s.kx, s.w[1] + dy / 1000, (s.top || 0.03) + 0.022);
  if (c[2] < NEAR) return;
  const X = sx(c), Y = Math.max(96, sy(c));
  const t = clamp((now - reveal.t0) / 1000 - (reveal.s === s ? 0.6 : 0), 0, 1);
  if (t <= 0) return;
  const k = t < 1 ? 1 + Math.sin(t * Math.PI) * 0.12 * (1 - t) : 1; // kleiner Sprung
  const a = Math.min(1, t * 2.5);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(X, Y);
  ctx.scale(0.7 + 0.3 * Math.min(1, t * 1.6) * k, 0.7 + 0.3 * Math.min(1, t * 1.6) * k);
  ctx.font = '800 22px "Schibsted Grotesk", system-ui, sans-serif';
  const name = s.name;
  const w = Math.max(ctx.measureText(name).width, 120) + 34;
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -30, w, 44, 6);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(-w / 2 + 4, -26, w - 8, 36, 4);
  ctx.lineWidth = 0.7;
  ctx.stroke();
  ctx.fillStyle = "#111";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name, 0, -8);
  // Stange nach unten und Untertitel
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(0, 14); ctx.lineTo(0, 34); ctx.stroke();
  ctx.font = '500 11px "IBM Plex Mono", ui-monospace, monospace';
  const sub = `${s.spot.city} · ${s.visits}× war ich hier`.toUpperCase();
  ctx.lineJoin = "round";
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#fff";
  ctx.strokeText(sub, 0, 48);
  ctx.fillStyle = "#555";
  ctx.fillText(sub, 0, 48);
  ctx.restore();
}

function label(text, X, Y, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.font = '600 10.5px "IBM Plex Mono", ui-monospace, monospace';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#fff";
  ctx.strokeText(text, X, Y);
  ctx.fillStyle = "#111";
  ctx.fillText(text, X, Y);
  ctx.globalAlpha = 1;
}

// ---------- Zeichenreihenfolge nach Grundriss ----------
// Konvexe Hülle des Grundrisses (lokale Meter), einmal je Gebäude
function hullOf(b) {
  if (b._hull) return b._hull;
  const p = b.lo, pts = [];
  for (let i = 0; i < p.length; i += 2) pts.push([p[i], p[i + 1]]);
  pts.sort((a, c) => a[0] - c[0] || a[1] - c[1]);
  const cr = (o, a, c) => (a[0] - o[0]) * (c[1] - o[1]) - (a[1] - o[1]) * (c[0] - o[0]);
  const lo = [], up = [];
  for (const q of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = pts.length - 1; i >= 0; i--) { const q = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop();
  return (b._hull = lo.concat(up));
}
// Trennt eine Kante von H alle Punkte von G ab? Dann +1, wenn die Kamera auf der Seite von H liegt, sonst -1; 0 = nein
function sepSide(H, G, cx, cy) {
  if (H.length < 3) return 0;
  for (let i = 0; i < H.length; i++) {
    const a = H[i], c = H[(i + 1) % H.length];
    const ex = c[0] - a[0], ey = c[1] - a[1], len = Math.hypot(ex, ey);
    if (len < 1e-6) continue;
    let ok = true;
    for (const q of G) if (ex * (q[1] - a[1]) - ey * (q[0] - a[0]) > 0.08 * len) { ok = false; break; }
    if (ok) return ex * (cy - a[1]) - ey * (cx - a[0]) > 0 ? 1 : -1;
  }
  return 0;
}
// Gebäude, die sich in der Draufsicht nicht überlappen, haben eine eindeutige Reihenfolge (das der Kamera nähere
// kommt später); überlappende (Hallen mit Anbauten, Bauteile) bleiben eine Gruppe und werden Fläche für Fläche nach
// Tiefe sortiert. Die Gruppen werden dann topologisch geordnet, sonst nach Tiefe (wie bisher).
// Kürzeste Entfernung des Punkts (cx, cy) zum Grundriss p
function distToRing(p, cx, cy) {
  let best = Infinity;
  const n = p.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, ax = p[2 * i], ay = p[2 * i + 1], dx = p[2 * j] - ax, dy = p[2 * j + 1] - ay, L = dx * dx + dy * dy;
    const u = L ? clamp(((cx - ax) * dx + (cy - ay) * dy) / L, 0, 1) : 0;
    best = Math.min(best, Math.hypot(cx - ax - u * dx, cy - ay - u * dy));
  }
  return best;
}
// Überlappen sich zwei Grundrisse wirklich (nicht nur ihre konvexen Hüllen)?
function polysOverlap(P, Q) {
  const np = P.length / 2, nq = Q.length / 2;
  const side = (ax, ay, bx, by, px, py) => (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  for (let i = 0; i < np; i++) {
    const a = i, b = (i + 1) % np;
    for (let j = 0; j < nq; j++) {
      const c = j, d = (j + 1) % nq;
      const o1 = side(P[2 * a], P[2 * a + 1], P[2 * b], P[2 * b + 1], Q[2 * c], Q[2 * c + 1]), o2 = side(P[2 * a], P[2 * a + 1], P[2 * b], P[2 * b + 1], Q[2 * d], Q[2 * d + 1]);
      const o3 = side(Q[2 * c], Q[2 * c + 1], Q[2 * d], Q[2 * d + 1], P[2 * a], P[2 * a + 1]), o4 = side(Q[2 * c], Q[2 * c + 1], Q[2 * d], Q[2 * d + 1], P[2 * b], P[2 * b + 1]);
      if (o1 * o2 < -1e-6 && o3 * o4 < -1e-6) return true;
    }
  }
  const inside = (x, y, R) => {
    let c = false;
    for (let i = 0, j = R.length / 2 - 1; i < R.length / 2; j = i++) {
      const xi = R[2 * i], yi = R[2 * i + 1], xj = R[2 * j], yj = R[2 * j + 1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi) c = !c;
    }
    return c;
  };
  return inside(P[0], P[1], Q) || inside(Q[0], Q[1], P);
}
let ordCache = { sig: "", rank: new Map() };
function orderByFootprint(list, limit = Infinity) {
  const bs = [], idx = new Map();
  for (const it of list) if (!idx.has(it.b)) { idx.set(it.b, bs.length); bs.push(it.b); }
  if (bs.length > limit) return false;
  // unveränderter Blick und gleiche Gebäude: Ergebnis der letzten Rechnung wiederverwenden (die Ansicht am Bahnhof steht fest)
  const sig = [view.tx, view.ty, view.tz, view.dist, view.pitch, view.bearing, W, H, bs.length].join("|");
  if (ordCache.sig === sig && bs.every((b) => ordCache.rank.has(b))) {
    for (const it of list) it._r = ordCache.rank.get(it.b);
    list.sort((p, q) => p._r - q._r || q.d - p.d);
    return true;
  }
  const n = bs.length, parent = Array.from({ length: n }, (_, i) => i);
  const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  const cell = 160, grid = new Map();
  bs.forEach((b, i) => {
    if (!b._bb) return;
    const [x0, y0, x1, y1] = b._bb;
    const gx0 = Math.floor(clamp(x0, -400, W + 400) / cell), gx1 = Math.floor(clamp(x1, -400, W + 400) / cell);
    const gy0 = Math.floor(clamp(y0, -400, H + 400) / cell), gy1 = Math.floor(clamp(y1, -400, H + 400) / cell);
    for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) { const k = gx * 4099 + gy; (grid.get(k) || grid.set(k, []).get(k)).push(i); }
  });
  const seen = new Set(), edges = []; // [vorn, hinten]
  for (const cellList of grid.values())
    for (let a = 0; a < cellList.length; a++)
      for (let c = a + 1; c < cellList.length; c++) {
        const i = Math.min(cellList[a], cellList[c]), j = Math.max(cellList[a], cellList[c]), key = i * n + j;
        if (seen.has(key)) continue;
        seen.add(key);
        const A = bs[i], B = bs[j];
        if (A._city !== B._city || A._bb[2] < B._bb[0] || B._bb[2] < A._bb[0] || A._bb[3] < B._bb[1] || B._bb[3] < A._bb[1]) continue;
        const s = A._city, cx = ((camX - s.w[0]) * 1000) / s.kx, cy = (camY - s.w[1]) * 1000;
        const HA = hullOf(A), HB = hullOf(B);
        const r = sepSide(HA, HB, cx, cy) || -sepSide(HB, HA, cx, cy);
        if (r !== 0) edges.push(r > 0 ? [i, j] : [j, i]);
        else if (polysOverlap(A.lo, B.lo)) parent[find(i)] = find(j); // wirklich ineinander: Fläche für Fläche nach Tiefe
        else edges.push(distToRing(A.lo, cx, cy) < distToRing(B.lo, cx, cy) ? [i, j] : [j, i]); // nur Hüllen überlappen (L-Formen): das nähere liegt vorn
      }
  const deps = new Map(), gd = new Map(), gn = new Map();
  for (let i = 0; i < n; i++) { const g = find(i); gd.set(g, (gd.get(g) || 0) + bs[i]._dc); gn.set(g, (gn.get(g) || 0) + 1); }
  for (const [f, k] of edges) { const gf = find(f), gk = find(k); if (gf !== gk) (deps.get(gf) || deps.set(gf, []).get(gf)).push(gk); }
  const groups = [...gd.keys()].sort((p, q) => gd.get(q) / gn.get(q) - gd.get(p) / gn.get(p)); // fern zuerst
  const rank = new Map(), state = new Set();
  const visit = (g) => {
    if (state.has(g)) return;
    state.add(g);
    for (const d of deps.get(g) || []) visit(d); // was hinter g liegt, wird zuerst gezeichnet
    rank.set(g, rank.size);
  };
  for (const g of groups) visit(g);
  for (const it of list) it._r = rank.get(find(idx.get(it.b)));
  ordCache = { sig, rank: new Map(bs.map((b, i) => [b, rank.get(find(i))])) };
  list.sort((p, q) => p._r - q._r || q.d - p.d);
  return true;
}

let stationHit = [], stopHit = [];
const pxmAtW = (w) => { const c = cs(w[0], w[1], 0); return c[2] > NEAR ? FOC / c[2] / 1000 : 0; };
let BUSY = false;
function frame(now) {
  raf = 0;
  sampleFrame(now);
  stepAnim(now);
  const idle = false; // die Ansicht am Bahnhof ist fest (so bleiben alle Details stehen)
  sway.b += (swayTo.b - sway.b) * 0.06;
  sway.p += (swayTo.p - sway.p) * 0.06;
  applyView();
  ctx.clearRect(0, 0, W, H);
  const ppk = FOC / view.dist;
  const busy = now < busyUntil || drag || anim;
  BUSY = !!busy;

  const near = [];
  for (const s of stations.values()) {
    if (!s.terminal) continue;
    const c = cs(s.w[0], s.w[1], 0);
    const dk = Math.hypot(camX - s.w[0], camY - s.w[1]);
    if (mode === "map" && c[2] > 0 && FOC / c[2] / 1000 > 0.02) ensureCity(s);
    if (s.city && typeof s.city === "object") {
      const pxm = c[2] > 0 ? FOC / c[2] / 1000 : 10;
      const a = Math.max(clamp((pxm - 0.04) / 0.12, 0, 1), dk < 3 ? 1 : 0);
      if (a > 0) near.push({ s, a });
    }
  }
  if (near.length && mode !== "map") drawFloor(near.reduce((mx, n) => Math.max(mx, n.a), 0));
  for (const { s, a } of near) drawGround(s.city, a);
  // im ruhigen Blick am Bahnhof keine Fernlinien (sie lägen sonst als Strich am Horizont)
  const flat = mode === "stand" && !anim;
  if (!flat) drawTrips(ppk);
  stopHit = flat ? [] : drawStops(ppk);

  // Gebäude: der Bahnhof immer Fläche für Fläche; im ruhigen Blick am Bahnhof auch die ganze Stadt
  // (sauberste Überdeckung, wird nur einmal gezeichnet)
  const list = [];
  const settled = mode === "stand" && !anim && (now - reveal.t0) / 1000 > 3.2;
  const calm = Q.calmFaces && settled;
  for (const { s, a } of near) {
    const rv = reveal.s === s ? (now - reveal.t0) / 1000 : 99;
    for (const b of s.city.buildings) {
      const c = cs(b.c[0], b.c[1], b.c[2]);
      const r = b.rad + b.h;
      if (c[2] < -r) continue;
      let px = 999;
      if (c[2] > NEAR) {
        const X = sx(c), Y = sy(c), pr = (r * FOC) / c[2];
        if (X + pr < 0 || X - pr > W || Y + pr < 0 || Y - pr > H) continue;
        if (pr < (busy ? Q.cullBusy : Q.cullIdle) && !b.station) continue;
        px = (Math.sqrt(b.area) * FOC) / (c[2] * 1000);
      }
      const dl = Math.hypot(b.lc[0], b.lc[1]);
      let ba = a, dash = null;
      if (rv < 3.2) {
        const k = clamp((rv * 480 - dl) / 160, 0, 1);
        if (k <= 0) continue;
        ba = a * (b.station ? 1 : k);
        if (b.station && k < 1) dash = [k * 400, 400];
      }
      projectB(b);
      b._city = s;
      b._dc = c[2];
      b._bb = c[2] > NEAR ? [sx(c) - (r * FOC) / c[2], sy(c) - (r * FOC) / c[2], sx(c) + (r * FOC) / c[2], sy(c) + (r * FOC) / c[2]] : null;
      if ((b.station || calm) && px > 8) {
        for (const f of b.F) {
          if (!facing(b, f)) continue;
          let d = 0;
          for (const i of f.i) d += b._C[3 * i + 2];
          list.push({ b, f, d: d / f.i.length, a: ba, dash, px });
        }
      } else list.push({ b, d: c[2], a: ba, dash, px });
    }
  }
  if (busy && list.length > Q.maxBusy) {
    const px = list.filter((it) => !it.b.station).map((it) => it.px).sort((p, q) => q - p);
    const min = px[Q.maxBusy] ?? 0;
    if (px.length > Q.maxBusy) for (let i = list.length - 1; i >= 0; i--) if (!list[i].b.station && list[i].px <= min) list.splice(i, 1);
  }
  // Der Zug wird nach allen Gebäuden gezeichnet (eigene Sortierung): so schneidet er nicht halb in Häuser
  // hinein, deren Mittelpunkt zufällig näher liegt; er bleibt immer ganz sichtbar
  const trainList = [];
  if (anim && anim.trip && anim.train != null) trainItems(anim.trip, anim.train, trainList);
  trainList.sort((p, q) => q.d - p.d);
  // Ruhiger Blick am Bahnhof: Gebäude nach ihrem Grundriss ordnen (statt nur nach Mittelpunkt-Tiefe), sonst schneiden
  // lange Häuser und Hallen scheinbar ineinander
  // (auch in Bewegung, solange es nicht zu viele Gebäude sind; sonst bleibt die schnelle Sortierung nach Tiefe)
  if (qParams.has("oldsort") || !orderByFootprint(list, settled ? Infinity : Q.orderMax)) list.sort((p, q) => q.d - p.d);
  const hit = new Set();
  for (const it of list) {
    const b = it.b;
    if (b.station) hit.add(b);
    if (it.f) { drawFace(b, it.f, it.a, !busy && it.px > 40, it.dash); continue; }
    if (it.px < Q.roofPx && !b.station && !it.dash) drawRoofOnly(b, it.a);
    else for (const f of b.F) if (facing(b, f)) drawFace(b, f, it.a, !busy && it.px > 60, it.dash);
  }
  stationHit = [...hit];
  for (const it of trainList) drawTrainFace(it);
  ctx.globalAlpha = 1;
  if (reveal.s && (now - reveal.t0) / 1000 < 3.4) need(); // danach noch einmal in Ruhe (fein sortiert)

  // Schild über dem Bahnhof (am Standort und beim Herauskommen am Ziel)
  if (mode === "stand") drawSign(here, now);
  else if (anim && reveal.s && reveal.s !== here && pxmAtW(reveal.s.w) > 0.15) drawSign(reveal.s, now); // erst nah am Ziel

  // Namen der Bahnhöfe auf der Karte und während der Fahrt
  if (ppk < 400) {
    const named = new Set();
    for (const t of trips) for (const s of [t.from, t.to]) {
      if (named.has(s)) continue;
      if (mode !== "map" && !done.has(t.no) && s !== here && !(anim && anim.trip === t) && !(anim && anim.hop && anim.hop.includes(s))) continue;
      if (mode === "map" && s.introAt > introP()) continue;
      named.add(s);
      const c = cs(s.w[0], s.w[1], 0);
      if (c[2] < NEAR) continue;
      const X = sx(c), Y = sy(c);
      if (X < 0 || X > W || Y < 0 || Y > H) continue;
      if (mode === "map") {
        // Übersicht: Name und Besuche, bei einer gewählten Fahrt nur deren Start und Ziel kräftig
        const hov = hoverTrip >= 0 ? trips[hoverTrip] : null;
        const a = hov && hov.from !== s && hov.to !== s ? 0.3 : 1;
        const r = (2.2 + Math.sqrt(s.visits) * 1.9) * clamp(0.8 + ppk * 0.004, 0.8, 2);
        label(`${s.name.toUpperCase()} · ${s.visits}×`, X, Y + r + 10, a);
      } else label(s.name.toUpperCase(), X, Y + 15, clamp((400 - ppk) / 200, 0, 1));
    }
  }

  liveTicket();
  if (GRID) drawGrid();
  if (SHOW_FPS) {
    ctx.globalAlpha = 1;
    ctx.font = "11px ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#c00";
    ctx.fillText(`Stufe ${qLevel}${qForced ? " (fest)" : ""} · ${Math.round(perf.fps)} fps · dpr ${curDpr()}`, 12, H - 22);
  }
  if (anim || idle || (mode === "map" && introP() < 1) || Math.abs(swayTo.b - sway.b) > 1e-4 || Math.abs(swayTo.p - sway.p) > 1e-4) need();
}

// Entwicklungshilfe (?grid): Meter-Gitter um den Bahnhof, deine Strecken in Rot, Standpunkt und Eingang in Blau
const GRID = new URLSearchParams(location.search).has("grid");
function drawGrid() {
  const s = here, L = (x, y) => cs(s.w[0] + (x / 1000) * s.kx, s.w[1] + y / 1000, 0);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(220,0,0,.3)";
  ctx.fillStyle = "#c00";
  ctx.lineWidth = 0.6;
  ctx.font = "10px monospace";
  for (let k = -800; k <= 800; k += 100) {
    for (const [a, b] of [[L(k, -800), L(k, 800)], [L(-800, k), L(800, k)]]) {
      if (a[2] < NEAR || b[2] < NEAR) continue;
      ctx.beginPath(); ctx.moveTo(sx(a), sy(a)); ctx.lineTo(sx(b), sy(b)); ctx.stroke();
    }
    const c = L(k, -800), d = L(-800, k);
    if (c[2] > NEAR) ctx.fillText(String(k), sx(c), sy(c) + 10);
    if (d[2] > NEAR) ctx.fillText(String(k), sx(d) - 30, sy(d));
  }
  ctx.strokeStyle = "rgba(220,0,0,.85)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (const t of trips) if (t.p.halte.includes(s.key)) pathLine(t.g);
  ctx.stroke();
  if (s.spot) {
    const a = L(...s.spot.cam), b = L(...s.spot.door);
    ctx.strokeStyle = "#06c"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sx(a), sy(a)); ctx.lineTo(sx(b), sy(b)); ctx.stroke();
  }
}

// ================================================================ Bedienung
// Am Bahnhof: Ziehen dreht um den Bahnhof, Mausrad zoomt, Klick auf den Bahnhof = Einsteigen.
// In der Übersicht: Ziehen verschiebt, Shift/rechts dreht und kippt, Klick auf einen Bahnhof fliegt hin.
const pointers = new Map();
let drag = null;
cv.addEventListener("contextmenu", (e) => e.preventDefault());
cv.addEventListener("pointerdown", (e) => {
  if (anim) return;
  cv.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  const alt = e.button === 2 || e.shiftKey || e.ctrlKey;
  // Die Kamera ist festgestellt (am Bahnhof wie auf der Übersichtskarte): Klick wählt, die Karte lässt sich nur zoomen
  if (pointers.size === 1 || mode !== "map") drag = { mode: "click", x: e.clientX, y: e.clientY, moved: 0 };
  else drag = { mode: "pinch", ...pinchState() };
  // das langsame Drehen in die Kamera übernehmen, damit nichts springt
  cam.bearing += sway.b; sway.b = swayTo.b = 0;
  lastInput = performance.now();
});
function pinchState() {
  const [a, b] = [...pointers.values()];
  return { dist: Math.hypot(b[0] - a[0], b[1] - a[1]), ang: Math.atan2(b[1] - a[1], b[0] - a[0]), mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 };
}
cv.addEventListener("pointermove", (e) => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (drag && drag.mode === "click") { drag.moved += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0); return; }
  if (drag && drag.mode !== "pinch" && pointers.size === 1) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.mode === "pan") {
      const a = unproject(drag.x, drag.y), b = unproject(e.clientX, e.clientY);
      if (a && b) { cam.tx -= b[0] - a[0]; cam.ty -= b[1] - a[1]; }
    } else {
      cam.bearing += dx * 0.005;
      cam.pitch = clamp(cam.pitch + dy * 0.003, mode === "map" ? 0 : 0.7, mode === "map" ? 1.25 : 1.5);
    }
    drag.x = e.clientX; drag.y = e.clientY;
    poke(); need();
  } else if (drag && drag.mode === "pinch" && pointers.size === 2) {
    const s = pinchState();
    zoomAt(s.mx, s.my, drag.dist / s.dist); // nur Zoom, kein Verschieben oder Drehen
    Object.assign(drag, s);
    poke(); need();
  } else if (!drag && !anim) {
    const h = pickStation(e.clientX, e.clientY);
    cv.style.cursor = h && (h.kind === "here" || (h.s.terminal && mode === "map")) ? "pointer" : "default";
    el.tip.hidden = !h;
    if (h) {
      const t = trips[leg];
      el.tip.innerHTML = h.kind === "here"
        ? `<b>${here.name}</b><span>${t && t.from === here ? "Klick: einsteigen" : "hier stehst du"}</span>`
        : `<b>${h.s.name}</b><span>${h.s.visits}× dort gewesen${h.s.terminal && mode === "map" ? " · Klick: hinfliegen" : ""}</span>`;
      el.tip.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`;
    }
  }
});
function endPointer(e) {
  pointers.delete(e.pointerId);
  if (drag && drag.mode !== "pinch" && drag.moved < 5 && e.type === "pointerup") {
    const h = pickStation(e.clientX, e.clientY);
    if (h && h.kind === "here" && mode === "stand") depart();
    else if (h && h.kind === "stop" && mode === "map" && h.s.terminal) fromMap(h.s);
  }
  const rest = [...pointers.values()];
  drag = rest.length === 1 ? { mode: "click", x: rest[0][0], y: rest[0][1], moved: 99 } : null;
  if (!drag) { lastInput = performance.now(); need(); }
}
cv.addEventListener("pointerup", endPointer);
cv.addEventListener("pointercancel", endPointer);
cv.addEventListener("pointerleave", () => { el.tip.hidden = true; });

function inPoly(X, Y, P) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if (yi > Y !== yj > Y && X < ((xj - xi) * (Y - yi)) / (yj - yi + 1e-9) + xi) c = !c;
  }
  return c;
}
function pickStation(X, Y) {
  if (mode === "stand") {
    for (const b of stationHit) {
      if (b._behind || !b._S) continue;
      for (const f of b.F) {
        if (!facing(b, f)) continue;
        const P = f.i.map((i) => [b._S[2 * i], b._S[2 * i + 1]]);
        if (inPoly(X, Y, P)) return { kind: "here" };
      }
    }
  }
  // Übersicht: anklickbare Bahnhöfe (schwarz) haben Vorrang und eine großzügige Trefferfläche; der nächste gewinnt.
  // Nicht anklickbare gelten nur, wenn kein anklickbarer in Reichweite ist (dann gibt es nur den Hinweis, keinen Klick).
  let click = null, cd = Infinity, other = null, od = Infinity;
  for (const h of stopHit) {
    const d = Math.hypot(X - h.X, Y - h.Y);
    if (mode === "map" && h.s.terminal) { if (d < Math.max(20, (h.r || 0) + 10) && d < cd) { cd = d; click = h; } }
    else if (d < Math.max(10, (h.r || 0) + 3) && d < od) { od = d; other = h; }
  }
  const hit = click || other;
  return hit ? { kind: "stop", s: hit.s } : null;
}
function zoomAt(X, Y, factor) {
  // Übersicht: nicht weiter hinaus als das ganze Jahr, Zoom immer um die Bildmitte (die Karte wandert nicht)
  cam.dist = clamp(cam.dist * factor, mode === "map" ? 0.3 : 0.06, mode === "map" ? overviewView().dist : 1.5);
  applyView();
}
cv.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (anim || mode !== "map") return;
  // Trackpad-Pinch kommt als Mausrad mit gedrückter Strg-Taste und kleinen Werten: stärker gewichten
  zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * (e.deltaMode ? 0.05 : e.ctrlKey ? 0.01 : 0.0015)));
  poke(); need();
}, { passive: false });
// Safari meldet die Pinch-Geste am Trackpad als eigene Ereignisse (sonst zoomt dort die ganze Seite)
let gScale = 1;
cv.addEventListener("gesturestart", (e) => { e.preventDefault(); gScale = 1; });
cv.addEventListener("gesturechange", (e) => {
  e.preventDefault();
  if (anim || mode !== "map") return;
  zoomAt(e.clientX, e.clientY, gScale / e.scale);
  gScale = e.scale;
  poke(); need();
});
cv.addEventListener("gestureend", (e) => e.preventDefault());

addEventListener("resize", resize);
addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && mode === "stand" && document.activeElement === document.body) { e.preventDefault(); goAction && goAction(); }
  if (e.key === "Escape" && mode === "map") fromMap();
  // Pfeiltasten: vorige / nächste Fahrt (am Bahnhof)
  if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && mode === "stand" && !anim && document.activeElement === document.body) {
    e.preventDefault();
    playTrip(clamp(leg + (e.key === "ArrowRight" ? 1 : -1), 0, trips.length - 1));
  }
});

// ================================================================ Start
resize();
document.fonts?.ready.then(need);
const params = new URLSearchParams(location.search);
if (params.get("start")) {
  const s = [...stations.values()].find((x) => x.name.toLowerCase().startsWith(params.get("start").toLowerCase()));
  if (s) here = s;
}
if (params.get("start")) {
  // direkt an einen Bahnhof (z. B. ?start=München)
  mode = "stand";
  document.body.classList.remove("mapmode");
  Object.assign(cam, { tx: here.w[0], ty: here.w[1], tz: 0, dist: 3, pitch: 1.1, bearing: 0 });
  ui();
  ensureCity(here).then(() => {
    Object.assign(cam, modelView(here));
    reveal = { s: here, t0: performance.now() };
    document.body.classList.add("ready");
    need();
    const nxt = trips[leg];
    if (nxt) setTimeout(() => { ensureCity(nxt.to); ensureCity(nxt.from); }, 2500);
  });
} else {
  // Start in der Übersicht: das ganze Jahr zeichnet sich
  mode = "map";
  Object.assign(cam, overviewView());
  ui();
  introT0 = performance.now() + 400;
  document.body.classList.add("ready");
  // den Startbahnhof der ersten Fahrt schon vorbereiten (für den ersten Klick)
  setTimeout(() => ensureCity(trips[0].from), INTRO_MS + 800);
}
need();

// für Tests
window.__bb = { cam, need, stations, modelView, doorView, viewFrom, trips, depart, toMap, fromMap, jumpTo, get mode() { return mode; } };
