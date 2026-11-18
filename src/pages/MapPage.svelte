<script>
  import { onMount, untrack } from "svelte";
  import * as maplibregl from "maplibre-gl";
  import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
  import { embedded } from "../lib/assets.js";
  import "maplibre-gl/dist/maplibre-gl.css";
  import { DAY } from "../lib/data.js";
  import { shortName } from "../lib/facts.js";

  // full: die Kartenseite (ganzer Bildschirm). Sonst steckt die Karte in einem Fenster der Startseite.
  let { trips, stations, full = false, bare = false, active = true } = $props();

  // ---- Einstellungen ----------------------------------------------------
  const STYLE_URL = "https://tiles.openfreemap.org/styles/positron"; // freie Vektorkarte, kein Schlüssel nötig
  const SPEEDS = [0.5, 1, 2, 4];
  const UNIT_SECONDS = 0.7; // so lange dauert eine Zeiteinheit bei 1x
  const TRIP_UNITS = 3.4; // jede Fahrt bekommt gleich viel Wiedergabezeit, strikt nacheinander
  const LEAD_UNITS = 0.6;
  const TAIL_UNITS = 0.6;

  const CELL_KM = 3; // Raster, mit dem gezählt wird, wie oft ein Abschnitt befahren wurde
  const POLE_BASE = 2600; // Höhe in Metern für 1 Fahrt (nur 3D)
  const POLE_POW = 1.9; // mehr Fahrten wachsen überproportional: starker Unterschied zwischen den Stäben
  const POLE_MAX = 95000; // Obergrenze, damit Knotenpunkte nicht aus dem Bild ragen
  const SPR_K = 150; // Feder: Steifigkeit
  const SPR_D = 11; // Feder: Dämpfung (unterkritisch: die Stäbe schießen hoch und federn kurz nach)
  // Große Bildschirme: Linien, Schrift und Punkte der Karte wachsen mit (die Seite skaliert über rem)
  const SC = typeof window === "undefined" ? 1 : Math.min(2.6, Math.max(1, Math.min(window.innerWidth / 1920, window.innerHeight / 1080)));
  const zw = (...st) => ["interpolate", ["linear"], ["zoom"], ...st.map((v, i) => (i % 2 === 1 ? v * SC : v))];
  const PITCH_3D = 38;
  const BEARING_3D = -10;

  const TAU_IN = 70; // ms: so schnell wird eine Strecke hervorgehoben
  const TAU_OUT = 320; // ms: so weich läuft sie beim Verlassen wieder aus
  const TAU_UP = 180; // ms: Linien wachsen
  const TAU_DOWN = 260; // ms: Linien schrumpfen

  // Farbe der Linien auf heller Karte: von dunklem Schiefer (einmal) über Karmesin zum DB-Rot (am häufigsten)
  const HEAT = [
    [0, [58, 68, 98]],
    [0.35, [168, 34, 92]],
    [0.7, [226, 16, 48]],
    [1, [255, 40, 20]],
  ];
  const NEUTRAL = [205, 209, 216]; // abgeblendete Linien

  // ---- Zustand ----------------------------------------------------------
  let mapEl;
  let trackEl;
  let hoverEl;
  let map;
  let loaded = false;
  let tripsEng = []; // { ti, id, data, t0, path, dense, cum, total, seg, stops }
  let cells = []; // Abschnitte der Strecke (Zählraster)
  let stationEng = [];
  let segs = []; // Zeitleisten-Abschnitte (Fahrt oder Pause)
  let totalU = 1;
  let runFC; // Linienstücke
  let stationFC; // Orte (Punkte)
  let poleFC; // feine Stäbe (3D)
  let headFC = { type: "FeatureCollection", features: [] };
  let scaleMax = 2;
  let geoZoom = -1;
  let flat = 0; // 0 = 3D, 1 = 2D (weich übergeblendet)
  let pinnedCell = null; // angeklickter Abschnitt: seine Fahrten bleiben hervorgehoben
  let baseZoom = 5.4;
  let picked = $state.raw(null); // { title, sub, list } für das Detail-Panel
  let hoverCell = null;
  let clearTimer = 0;
  let visible = true;
  // Die Kartenseite bleibt nach dem ersten Besuch im Speicher: ist sie nicht die aktive Seite, ruht alles
  let isActive = true;
  let syncNow = null;
  $effect(() => {
    isActive = active;
    syncNow?.();
  });
  let autoPending = false;
  let autoTimer = 0;
  let fullyIn = false; // Handy: die Karte ist (fast) ganz im Bild
  // Einmaliger Start der Wiedergabe, sobald die Karte sichtbar ist
  function maybeAutoplay() {
    if (!autoPending || !visible || (bare && !fullyIn)) return;
    autoPending = false;
    clearTimeout(autoTimer);
    autoTimer = setTimeout(() => {
      if (u === 0 && !dragging && visible && (!bare || fullyIn)) playing = true;
      else if (u === 0 && !dragging) autoPending = true;
    }, 700);
  }
  let dragging = false;
  let resumeAfterDrag = false;
  let prevProg = [];
  let cx = 0; // geglättete Position der Hover-Karte
  let cy = 0;
  const colorCache = new Map();

  let ready = $state(false);
  let mapError = $state(false);
  let u = $state(0); // Position auf der Zeitleiste (0 .. totalU)
  let playing = $state(false);

  // Werkzeuge der Kartenseite (nur mit full): Mauerhöhe, Kamera folgt dem Zug, Rundflug
  let wallScale = $state(1);
  let settlements = $state(true); // Siedlungsflächen (Städte, Ballungsräume) einfärben
  let satellite = $state(false); // Satellitenbilder statt der Kartenflächen
  let network = $state(true); // Gleise: europäisches Netz in Hellgrau, auf Satellitenbildern in Weiß
  let placeNames = $state(true); // Städtenamen
  let countryNames = $state(true); // Ländernamen
  let stationNames = $state(true); // Bahnhofsnamen der besuchten Orte
  let borders = $state(true); // Ländergrenzen
  let showTrain = $state(true); // roter Punkt: der Zug beim Abspielen
  let lineW = $state(3.4); // Breite der flachen Linien
  let satShade = $state(0.2); // Satellitenbild abdunkeln, damit Linien und Namen lesbar bleiben
  let panelOpen = $state(true);
  let tab = $state("ebenen");
  let follow = $state(false);
  let orbit = $state(false);
  // Fahrten-Menü: ausgewählte Fahrten werden komplett gezeigt, die Zeitleiste pausiert
  let selected = $state([]); // Indizes in trips
  let selSet = null; // dasselbe als Set für applyU (nicht reaktiv)
  let tripsInit = false;
  let userMoved = false; // die Kamera wurde von Hand bewegt: nicht mehr automatisch einpassen
  let lastFollow = 0;
  let speed = $state(1);
  let is3D = $state(true);
  let maxLabel = $state(1);
  let totalUState = $state(1);
  let stats = $state({ trips: 0, km: 0, stations: 0 });
  let tripSegs = $state.raw([]);
  let monthMarks = $state.raw([]);

  // Hover-Karte: bleibt im DOM, damit sie weich ein- und ausblenden kann
  let hoverInfo = $state.raw(null);
  let hoverOn = $state(false);
  let hx = $state(0);
  let hy = $state(0);
  let stageW = $state(0);

  const fraction = $derived(totalUState > 0 ? u / totalUState : 0);
  const atEnd = $derived(u >= totalUState - 1e-6);
  // totalUState mitlesen: sobald die Strecken aufgebaut sind, wird das Datum neu berechnet (sonst bliebe "heute" stehen)
  const nowTime = $derived((totalUState, realAt(u)));
  const dateLabel = $derived(
    new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", year: "numeric" }).format(nowTime)
  );
  const flip = $derived(stageW > 0 && hx > stageW - 340);

  // ---- Hilfsfunktionen --------------------------------------------------
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const mix = (a, b, f) => a.map((v, k) => v + (b[k] - v) * f);
  const css = (c) => `rgb(${c.map(Math.round).join(",")})`;

  function heat(r) {
    let i = 1;
    while (i < HEAT.length - 1 && r > HEAT[i][0]) i++;
    const [r0, c0] = HEAT[i - 1];
    const [r1, c1] = HEAT[i];
    return mix(c0, c1, (r - r0) / (r1 - r0));
  }

  // Farbe pro (Stufe, Abblendung) vorberechnen
  function colorFor(r, lo) {
    const q = Math.round(lo * 12) / 12;
    const key = `${Math.round(r * 100)}|${q}`;
    let col = colorCache.get(key);
    if (!col) {
      col = css(mix(heat(r), NEUTRAL, 0.8 * q));
      colorCache.set(key, col);
    }
    return col;
  }

  // Mauerhöhe in Abhängigkeit vom Zoom; k ist der Faktor vom Regler "Mauerhöhe".
  // Beim Hineinzoomen schrumpfen die Mauern früh und sind bei WALL_GONE_ZOOM ganz weg: dann tragen flache Linien.
  const WALL_GONE_ZOOM = 9;
  const WALL_H = ["coalesce", ["feature-state", "h"], 0];
  const heightExpr = (k) => [
    "interpolate",
    ["linear"],
    ["zoom"],
    5,
    ["*", WALL_H, 1.15 * k],
    7,
    ["*", WALL_H, k],
    8,
    ["*", WALL_H, 0.4 * k],
    8.6,
    ["*", WALL_H, 0.1 * k],
    WALL_GONE_ZOOM,
    ["*", WALL_H, 0],
  ];

  // Linienbreite: In 3D weit weg fein (die Mauer trägt die Häufigkeit), ab Zoom 9 überall gleich dick.
  // In 2D ist jede Linie gleich dick, in jedem Zoom; die Häufigkeit zeigt nur die Farbe.
  // Die Breite aus dem Feature-State dient nur als Schalter (0 = Stück nicht gefahren, nicht zeichnen).
  const LINE_W = ["coalesce", ["feature-state", "w"], 0];
  const onW = (v, extra) => ["case", [">", LINE_W, 0], ["+", ["*", v, SC], extra * SC], 0];
  const LINE_3D = 3.4; // in 3D feste Breite: dort trägt die Mauer die Information, einstellbar ist die Breite nur in 2D
  const lineWidthExpr = (flatMode, extra = 0, fw = flatMode ? lineW : LINE_3D) =>
    flatMode
      ? onW(fw, extra)
      : [
          // 3D: weit weg etwas schmaler (die Mauer trägt die Information), ab Zoom 9 die volle Breite.
          // Der Regler "Linienbreite" wirkt in jedem Zoom.
          "interpolate",
          ["linear"],
          ["zoom"],
          4,
          onW(fw * 0.75, extra),
          7,
          onW(fw, extra),
          8.2,
          onW(fw, extra),
          9.2,
          onW(fw, extra),
        ];

  const HIDDEN = "rgba(0,0,0,0)"; // unsichtbar: statt die Teile per Filter auszublenden (Filter kennen keinen Feature-State)
  const M_LAT = 111200;
  const K = Math.cos((50.1 * Math.PI) / 180);
  const M_LON = M_LAT * K;
  const dLat = (CELL_KM * 1000) / M_LAT;
  const dLon = (CELL_KM * 1000) / M_LON;
  const keyOf = (p) => `${Math.floor(p[0] / dLon)},${Math.floor(p[1] / dLat)}`;

  function densify(path) {
    const out = [];
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      out.push(a);
      const steps = Math.floor(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / 0.004);
      for (let s = 1; s <= steps; s++) {
        const f = s / (steps + 1);
        out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
      }
    }
    out.push(path[path.length - 1]);
    return out;
  }

  // Die Mauer: pro Abschnitt eine Kette aus Kapseln (Rechteck mit runden Enden) entlang der Strecke.
  // Benachbarte Kapseln überlappen, so wirkt die Mauer durchgehend, an den Enden und Ecken ist sie abgerundet.
  const CAP_STEPS = 3;
  const WALL_STEP_M = 1100; // so fein folgt die Mauer der Strecke (weniger Ecken = flüssigere Karte)

  function capsule(a, b, hw) {
    // in Metern rechnen, dann zurück nach Länge/Breite
    const ax = a[0] * M_LON;
    const ay = a[1] * M_LAT;
    const bx = b[0] * M_LON;
    const by = b[1] * M_LAT;
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const ux = (bx - ax) / len;
    const uy = (by - ay) / len;
    const base = Math.atan2(uy, ux);
    const ring = [];
    const push = (x, y) => ring.push([x / M_LON, y / M_LAT]);
    // Kappe am Ende b (Halbkreis von links nach rechts der Fahrtrichtung)
    for (let i = 0; i <= CAP_STEPS; i++) {
      const t = base + Math.PI / 2 - (Math.PI * i) / CAP_STEPS;
      push(bx + Math.cos(t) * hw, by + Math.sin(t) * hw);
    }
    // Kappe am Anfang a
    for (let i = 0; i <= CAP_STEPS; i++) {
      const t = base - Math.PI / 2 - (Math.PI * i) / CAP_STEPS;
      push(ax + Math.cos(t) * hw, ay + Math.sin(t) * hw);
    }
    ring.push(ring[0]);
    return ring;
  }

  // Punkte einer Zelle ausdünnen, damit nicht jede Kleinigkeit ein eigenes Teilstück wird
  function thin(pts) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const last = out[out.length - 1];
      if (Math.hypot((pts[i][0] - last[0]) * M_LON, (pts[i][1] - last[1]) * M_LAT) >= WALL_STEP_M) out.push(pts[i]);
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  function wallFor(c, hw) {
    const pts = c.wall;
    const polys = [];
    if (pts.length < 2) {
      const p0 = pts[0] || [c.lon, c.lat];
      polys.push([capsule(p0, [p0[0] + 1e-6, p0[1]], hw)]);
    } else {
      for (let i = 0; i < pts.length - 1; i++) polys.push([capsule(pts[i], pts[i + 1], hw)]);
    }
    return { type: "MultiPolygon", coordinates: polys };
  }

  // ---- Zeitleiste: Fahrten strikt nacheinander, Pausen im Schnelldurchlauf ----
  function buildTimeline() {
    segs = [];
    let cur = 0;
    const add = (len, real0, real1, ti = -1) => {
      segs.push({ u0: cur, u1: cur + len, real0, real1, ti });
      cur += len;
    };
    add(LEAD_UNITS, tripsEng[0].t0 - 3 * DAY, tripsEng[0].t0);
    tripsEng.forEach((tr, i) => {
      if (i > 0) {
        const prev = tripsEng[i - 1];
        const gapDays = Math.max(0, (tr.t0 - prev.data.t1) / DAY);
        // je länger die Pause, desto mehr Zeit, aber nur logarithmisch: schnell zur nächsten Reise
        add(clamp(0.3 + 0.3 * Math.log2(1 + gapDays), 0.3, 1.8), prev.data.t1, tr.t0);
      }
      add(TRIP_UNITS, tr.t0, tr.data.t1, i);
      tr.seg = segs[segs.length - 1];
    });
    const last = tripsEng[tripsEng.length - 1];
    add(TAIL_UNITS, last.data.t1, last.data.t1 + 3 * DAY);
    totalU = cur;
    totalUState = cur;
  }

  function realAt(pos) {
    if (!segs.length) return Date.now();
    const x = clamp(pos, 0, totalU);
    const s = segs.find((g) => x <= g.u1) || segs[segs.length - 1];
    const f = (x - s.u0) / (s.u1 - s.u0 || 1);
    return s.real0 + (s.real1 - s.real0) * f;
  }

  function posOfTime(time) {
    if (time <= segs[0].real0) return 0;
    for (const s of segs) {
      if (time <= s.real1) return s.u0 + ((time - s.real0) / (s.real1 - s.real0 || 1)) * (s.u1 - s.u0);
    }
    return totalU;
  }

  // ---- Datenmodell: Strecken -> Abschnitte, Linienstücke und Orte ----------
  function buildModel() {
    tripsEng = trips.map((data, ti) => {
      const dense = densify(data.path);
      const cum = [0];
      for (let i = 1; i < dense.length; i++) {
        cum.push(cum[i - 1] + Math.hypot((dense[i][0] - dense[i - 1][0]) * K, dense[i][1] - dense[i - 1][1]));
      }
      return { ti, id: data.id, data, t0: data.t0, path: data.path, dense, cum, total: cum[cum.length - 1] || 1, seg: null, stops: [] };
    });
    buildTimeline();
    prevProg = tripsEng.map(() => 0);

    // Abschnitte: jede Zelle merkt sich, welche Fahrten wann (Anteil der Strecke) hindurchführen
    const byKey = new Map();
    for (const trip of tripsEng) {
      const seen = new Set();
      trip.dense.forEach((p, i) => {
        const key = keyOf(p);
        const prevP = i > 0 ? trip.dense[i - 1] : null;
        const prevKey = prevP ? keyOf(prevP) : null;
        let c = byKey.get(key);
        if (!c) {
          c = {
            id: byKey.size,
            owner: trip.ti, // die erste Fahrt zeichnet die Linie; spätere färben sie nur dunkler
            trips: [],
            visible: [],
            runs: [],
            count: 0,
            r: 0,
            hTar: 0,
            hCur: 0,
            pCur: 0, // Federwert der Stabhöhe
            pVel: 0,
            hi: 0,
            lo: 0,
            tHi: 0,
            tLo: 0,
            dirty: true,
            sH: 0,
            sW: 0,
            sPoleCol: "",
            sVis: 0,
            sLineCol: "",
            pts: [],
            sx: 0,
            sy: 0,
            n: 0,
          };
          byKey.set(key, c);
        }
        c.sx += p[0];
        c.sy += p[1];
        c.n++;
        // Die Mauer folgt der Strecke der ersten Fahrt; am Zellenrand reicht sie bis in die Nachbarzelle,
        // damit zwischen den Abschnitten keine Lücke bleibt.
        if (c.owner === trip.ti) {
          if (prevP && prevKey !== key) c.pts.push(prevP);
          c.pts.push(p);
        }
        if (prevKey && prevKey !== key) {
          const pc = byKey.get(prevKey);
          if (pc && pc.owner === trip.ti) pc.pts.push(p);
        }
        if (!seen.has(key)) {
          seen.add(key);
          c.trips.push({ ti: trip.ti, frac: trip.cum[i] / trip.total });
        }
      });
    }
    cells = [...byKey.values()];
    for (const c of cells) {
      c.lon = c.sx / c.n;
      c.lat = c.sy / c.n;
      c.wall = c.pts.length ? thin(c.pts) : [[c.lon, c.lat]];
    }

    // Skala am echten Maximum ausrichten, auch an Knoten wie München/Pasing: Sonst wären die meistbefahrenen
    // Stücke (hier 10 bis 14 Fahrten) so rot wie eine Strecke mit 6 Fahrten und nicht mehr zu unterscheiden.
    const peak = Math.max(1, ...cells.map((c) => c.trips.length));
    scaleMax = Math.max(2, peak);
    maxLabel = scaleMax;

    // Feines Raster (40 m): welche Fahrten benutzen genau dieses Gleisstück? Die Farbe einer Linie richtet sich
    // danach, nicht nach der groben 3-km-Zelle. Sonst färbt ein Abzweig, der nur einmal befahren wurde, sich so
    // rot wie das viel befahrene Gleis, mit dem er sich die Zelle teilt (z. B. südlich vom Münchner Hbf).
    const fLat = 40 / M_LAT;
    const fLon = 40 / M_LON;
    const fKey = (x, y) => `${Math.floor(x / fLon)},${Math.floor(y / fLat)}`;
    const fine = new Map();
    for (const trip of tripsEng) {
      const mark = (x, y) => {
        const k = fKey(x, y);
        let set = fine.get(k);
        if (!set) fine.set(k, (set = new Set()));
        set.add(trip.ti);
      };
      const d = trip.dense;
      for (let i = 0; i < d.length - 1; i++) {
        const n = Math.max(1, Math.ceil(Math.hypot((d[i + 1][0] - d[i][0]) * M_LON, (d[i + 1][1] - d[i][1]) * M_LAT) / 20));
        for (let s = 0; s <= n; s++) mark(d[i][0] + ((d[i + 1][0] - d[i][0]) * s) / n, d[i][1] + ((d[i + 1][1] - d[i][1]) * s) / n);
      }
    }
    // Fahrten am Ort (inkl. der 8 Nachbarfelder: parallele Gleise liegen dicht beieinander)
    const sharing = (p) => {
      const cx = Math.floor(p[0] / fLon);
      const cy = Math.floor(p[1] / fLat);
      const out = new Set();
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) fine.get(`${cx + dx},${cy + dy}`)?.forEach((t) => out.add(t));
      return [...out].sort((a, b) => a - b);
    };

    // Linienstücke: zusammenhängende Teile einer Fahrt innerhalb einer Zelle, getrennt nach den Fahrten, die dort fahren
    const feats = [];
    for (const trip of tripsEng) {
      let key = null;
      let runSig = null;
      let tis = [];
      let run = null;
      const flush = () => {
        const cell = key && byKey.get(key);
        // Jede Fahrt zeichnet ihren eigenen Weg (in Farbe und Breite der Zelle). Früher zeichnete nur die erste Fahrt
        // einer Zelle: wich eine spätere dort von ihr ab, fehlte ihr Stück bis zu 3 km lang.
        if (run && run.length > 1 && cell) {
          const id = feats.length;
          cell.runs.push({ id, ti: trip.ti, tis, w: 0, col: "" });
          feats.push({
            type: "Feature",
            id,
            properties: { cid: cell.id, w: 0, color: colorFor(0, 0) },
            geometry: { type: "LineString", coordinates: run },
          });
        }
      };
      trip.dense.forEach((p) => {
        const ck = keyOf(p);
        const sh = sharing(p);
        const k = ck + "|" + sh.join(",");
        if (k !== runSig) {
          const prev = run && run[run.length - 1];
          // Das neue Stück beginnt im letzten Punkt des alten: die Stücke stoßen exakt aneinander,
          // ohne in noch nicht gefahrene Abschnitte hineinzuragen.
          flush();
          key = ck;
          runSig = k;
          tis = sh;
          run = prev ? [prev, p] : [p];
        } else {
          run.push(p);
        }
      });
      flush();
    }
    runFC = { type: "FeatureCollection", features: feats };

    // Orte: erscheinen, sobald der Zug sie erreicht
    const byName = new Map(stations.map((s) => [s.name, s]));
    const visits = new Map();
    for (const trip of tripsEng) {
      const halte = trip.data.halte;
      let lastPlace = null;
      halte.forEach((name, k) => {
        const st = byName.get(name);
        if (!st) return;
        let best = 0;
        let bd = Infinity;
        trip.dense.forEach((p, i) => {
          const dd = Math.hypot((p[0] - st.coords[0]) * M_LON, (p[1] - st.coords[1]) * M_LAT);
          if (dd < bd) {
            bd = dd;
            best = i;
          }
        });
        const end = k === 0 || k === halte.length - 1;
        const frac = k === 0 ? 0 : k === halte.length - 1 ? 1 : trip.cum[best] / trip.total;
        const place = shortName(name);
        // Mehrere Bahnhöfe derselben Stadt hintereinander (z. B. Brüssel Nord und Midi): nur einmal nennen
        if (place !== lastPlace) trip.stops.push({ name: place, coords: st.coords, frac, kind: end ? "end" : "mid" });
        lastPlace = place;
        if (!visits.has(name)) visits.set(name, { name, place, coords: st.coords, at: [], shown: -1, endpoint: false });
        if (end) visits.get(name).endpoint = true;
        visits.get(name).at.push({ ti: trip.ti, frac });
      });
    }
    stationEng = [...visits.values()];
    // Beschriftet werden nur Start-, Ziel- und mehrfach besuchte Orte; kleine Zwischenhalte nennt nur das Abspielen
    stationFC = {
      type: "FeatureCollection",
      features: stationEng.map((s) => ({
        type: "Feature",
        properties: { name: s.place, n: 0, major: s.endpoint || s.at.length > 1 ? 1 : 0 },
        geometry: { type: "Point", coordinates: s.coords },
      })),
    };
    poleFC = {
      type: "FeatureCollection",
      features: cells.map((c) => ({
        type: "Feature",
        id: c.id,
        properties: { cid: c.id, h: 0, vis: 0, color: colorFor(0, 0) },
        geometry: wallFor(c, 600),
      })),
    };

        tripSegs = tripsEng.map((tr) => ({ u0: tr.seg.u0, u1: tr.seg.u1, trip: trips[tr.ti] }));
    const marks = [];
    const first = new Date(segs[0].real0);
    const cursor = new Date(first.getFullYear(), first.getMonth() + 1, 1);
    let lastFrac = -1;
    while (cursor.getTime() <= segs[segs.length - 1].real1) {
      const frac = posOfTime(cursor.getTime()) / totalU;
      if (frac - lastFrac > 0.085) {
        marks.push({ frac, label: new Intl.DateTimeFormat("de-DE", { month: "short" }).format(cursor) });
        lastFrac = frac;
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
    monthMarks = marks;
    u = 0; // beim Start läuft das Jahr einmal automatisch durch
  }

  function pointAt(trip, p) {
    const { dense, cum, total } = trip;
    const target = total * p;
    let lo = 0;
    let hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (cum[mid] <= target) lo = mid;
      else hi = mid - 1;
    }
    if (lo >= dense.length - 1) return dense[dense.length - 1];
    const f = (target - cum[lo]) / (cum[lo + 1] - cum[lo] || 1);
    const a = dense[lo];
    const b = dense[lo + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  }

  // ---- Ortsnamen: poppen auf und blenden nach oben aus ---------------------
  // Start und Ziel größer und länger, Zwischenhalte kleiner und kürzer.
  // Ist das Ziel einer Fahrt zugleich der Start der nächsten, bleibt das Ziel-Label stehen
  // und der Start poppt nicht ein zweites Mal auf.
  const activePops = new Map();
  function popLabel(stop) {
    if (!map || !visible) return;
    if (activePops.has(stop.name)) return;
    const el = document.createElement("div");
    el.className = `pop ${stop.kind}`;
    const span = document.createElement("span");
    span.textContent = stop.name;
    el.appendChild(span);
    const marker = new maplibregl.Marker({ element: el, anchor: "bottom", offset: [0, stop.kind === "end" ? -16 : -10] })
      .setLngLat(stop.coords)
      .addTo(map);
    activePops.set(stop.name, marker);
    const remove = () => {
      marker.remove();
      if (activePops.get(stop.name) === marker) activePops.delete(stop.name);
    };
    span.addEventListener("animationend", remove);
    setTimeout(remove, 4000);
  }

  // ---- Position auf der Zeitleiste anwenden -----------------------------
  function applyU(pos) {
    if (!loaded) return;
    // Fortschritt je Fahrt: da die Abschnitte nacheinander laufen, fährt immer nur eine
    const prog = tripsEng.map((tr, i) => (selSet ? (selSet.has(i) ? 1 : 0) : clamp((pos - tr.seg.u0) / (tr.seg.u1 - tr.seg.u0), 0, 1)));

    // Beim Abspielen: jeden Ort, den der Zug gerade erreicht, kurz benennen
    if (playing && !dragging) {
      tripsEng.forEach((tr, i) => {
        const p0 = prevProg[i];
        const p1 = prog[i];
        if (p1 <= p0 || p1 - p0 > 0.4) return;
        for (const s of tr.stops) {
          const crossed = s.frac === 0 ? p0 <= 0 && p1 > 0 : p0 < s.frac && p1 >= s.frac;
          if (crossed) popLabel(s);
        }
      });
    }
    prevProg = prog;

    let km = 0;
    let touched = 0;
    tripsEng.forEach((tr, i) => {
      km += tr.data.km * prog[i];
      if (prog[i] > 0) touched++;
    });

    for (const c of cells) {
      const vis = [];
      for (const tp of c.trips) {
        const p = prog[tp.ti];
        if (p > 0 && p >= tp.frac) vis.push(tp.ti);
      }
      const r = vis.length > 1 ? Math.pow(clamp((vis.length - 1) / (scaleMax - 1), 0, 1), 0.7) : 0;
      if (vis.length !== c.count || r !== c.r || vis.some((t, i) => t !== c.visible[i])) c.dirty = true;
      c.visible = vis;
      c.count = vis.length;
      c.hTar = vis.length;
      c.r = r;
    }

    const heads = [];
    tripsEng.forEach((tr, i) => {
      if (prog[i] > 0 && prog[i] < 1) {
        heads.push({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: pointAt(tr, prog[i]) } });
      }
    });
    headFC.features = heads;
    map.getSource("heads")?.setData(headFC);

    let visited = 0;
    let changed = false;
    stationEng.forEach((st, i) => {
      const count = st.at.filter((a) => prog[a.ti] > 0 && prog[a.ti] >= a.frac).length;
      if (count > 0) visited++;
      if (count !== st.shown) {
        st.shown = count;
        stationFC.features[i].properties.n = count;
        changed = true;
      }
    });
    if (changed) map.getSource("stations")?.setData(stationFC);

    stats = { trips: touched, km: Math.round(km), stations: visited };

    if (hoverCell && hoverOn) {
      if (hoverCell.count === 0) {
        hoverCell = null;
        hoverOn = false;
      } else {
        hoverInfo = cellInfo(hoverCell);
      }
    }
    setFocus();
  }

  $effect(() => {
    const pos = u;
    untrack(() => applyU(pos));
  });

  // ---- Weiche Animation: Linienbreite, Hervorhebung, Säulenhöhe -----------
  function stepAnim(dt) {
    const kUp = 1 - Math.exp(-dt / TAU_UP);
    const kDown = 1 - Math.exp(-dt / TAU_DOWN);
    const kIn = 1 - Math.exp(-dt / TAU_IN);
    const kOut = 1 - Math.exp(-dt / TAU_OUT);
    // 2D/3D-Übergang: im 3D-Modus tragen die Stäbe die Information, die Linien am Boden bleiben fein;
    // in 2D werden die Linien selbst deutlich breiter und tragen allein die Häufigkeit.
    const flatTar = is3D ? 0 : 1;
    let flatMoved = false;
    if (flat !== flatTar) {
      flat += (flatTar - flat) * (1 - Math.exp(-dt / 260));
      if (Math.abs(flatTar - flat) < 0.004) flat = flatTar;
      flatMoved = true;
    }
    const wf = 0.55 + 1.15 * flat;
    const visUpdates = [];
    for (const c of cells) {
      let moved = c.dirty || flatMoved;
      // Stabhöhe als Feder: schießt mit dem Zug hoch, überschwingt leicht und setzt sich
      const dts = Math.min(dt, 50) / 1000;
      const perr = c.hTar - c.pCur;
      if (Math.abs(perr) > 0.002 || Math.abs(c.pVel) > 0.01) {
        c.pVel += (perr * SPR_K - c.pVel * SPR_D) * dts;
        c.pCur += c.pVel * dts;
        moved = true;
      } else if (c.pCur !== c.hTar) {
        c.pCur = c.hTar;
        c.pVel = 0;
        moved = true;
      }
      const dh = c.hTar - c.hCur;
      if (Math.abs(dh) > 0.01) {
        c.hCur += dh * (dh > 0 ? kUp : kDown);
        moved = true;
      } else if (dh !== 0) {
        c.hCur = c.hTar;
        moved = true;
      }
      const dHi = c.tHi - c.hi;
      if (Math.abs(dHi) > 0.006) {
        c.hi += dHi * (dHi > 0 ? kIn : kOut);
        moved = true;
      } else if (dHi !== 0) {
        c.hi = c.tHi;
        moved = true;
      }
      const dLo = c.tLo - c.lo;
      if (Math.abs(dLo) > 0.006) {
        c.lo += dLo * (dLo > 0 ? kIn : kOut);
        moved = true;
      } else if (dLo !== 0) {
        c.lo = c.tLo;
        moved = true;
      }
      if (!moved) continue;
      c.dirty = false;
      // Breite wächst mit der Häufigkeit: einmal fein, am häufigsten deutlich breiter
      const base = c.hCur <= 0.02 ? 0 : 2.2 * Math.min(c.hCur, 1) + 1.7 * Math.max(0, c.hCur - 1);
      const w = Math.min(base, 9) * wf * (1 + 0.4 * c.hi);
      const color = colorFor(c.r, c.lo);
      // 3D: feine Stäbe wachsen mit dem Zug nach oben
      const ph = c.pCur <= 0.02 ? 0 : Math.min(POLE_MAX, POLE_BASE * Math.pow(c.pCur, POLE_POW)) * (1 - 0.5 * c.lo) * (1 + 0.1 * c.hi);
      // Höhe, Breite und Farbe laufen über Feature-State: die Geometrie bleibt unangetastet.
      // (Die Quelle neu zu schreiben hieße, bei jedem Bild alle Mauern neu in Kacheln zu zerlegen,
      // das wurde mit jeder gezogenen Mauer langsamer.)
      const hShown = ph > 1 ? ph : 0;
      const wShown = w > 0.2 ? w : 0;
      const colShown = hShown ? color : HIDDEN;
      const vis = hShown > 0 ? 1 : 0;
      if (vis !== c.sVis) {
        c.sVis = vis;
        poleFC.features[c.id].properties.vis = vis;
        visUpdates.push({ id: c.id, addOrUpdateProperties: [{ key: "vis", value: vis }] });
      }
      if (Math.abs(hShown - c.sH) > 0.02 || colShown !== c.sPoleCol) {
        c.sH = hShown;
        c.sPoleCol = colShown;
        map.setFeatureState({ source: "poles", id: c.id }, { h: hShown, color: colShown });
      }
      const lineCol = wShown ? color : HIDDEN;
      if (Math.abs(wShown - c.sW) > 0.01 || lineCol !== c.sLineCol) {
        c.sW = wShown;
        c.sLineCol = lineCol;
      }
      // Jedes Stück erscheint erst, wenn seine eigene Fahrt dort angekommen ist (sonst zeigte eine Fahrt
      // die Abzweige späterer Fahrten, die sich nur die Zelle teilen)
      for (const r of c.runs) {
        const on = wShown > 0 && c.visible.includes(r.ti);
        const w = on ? wShown : 0;
        // Farbe nach den Fahrten, die genau dieses Gleisstück benutzt haben (nicht nach der ganzen Zelle)
        let n = 0;
        for (const t of r.tis) if (c.visible.includes(t)) n++;
        const rr = n > 1 ? Math.pow(clamp((n - 1) / (scaleMax - 1), 0, 1), 0.7) : 0;
        const col = on ? colorFor(rr, c.lo) : HIDDEN;
        if (Math.abs(w - r.w) > 0.01 || col !== r.col) {
          r.w = w;
          r.col = col;
          map.setFeatureState({ source: "runs", id: r.id }, { w, color: col });
        }
      }
    }
    // Nur die wenigen Mauern, die gerade erscheinen oder verschwinden, gehen in die Quelle zurück
    if (visUpdates.length) {
      const src = map.getSource("poles");
      try {
        src.updateData({ update: visUpdates });
      } catch {
        src.setData(poleFC);
      }
    }

  }

  // ---- Hervorheben: Fahrten hinter der Linie unter dem Mauszeiger ----------
  function setFocus() {
    const fc = pinnedCell ?? hoverCell;
    const F = fc ? new Set(fc.trips.map((tp) => tp.ti)) : null;
    for (const c of cells) {
      const inF = !!F && c.trips.some((tp) => F.has(tp.ti));
      c.tHi = F && inF ? 1 : 0;
      c.tLo = F && !inF ? 1 : 0;
    }
  }

  function cellInfo(c) {
    const list = c.visible.map((ti) => trips[ti]);
    return { kind: "cell", n: list.length, list };
  }

  // ---- Kamera: fest eingestellt, nur 2D und 3D wechselbar ----------------
  // Die Karte lebt in einem Fenster: Maße kommen vom Fenster (stageW), nicht vom Bildschirm
  function padding() {
    if (full) {
      return stageW > 640
        ? { top: 90, left: 90, right: 90, bottom: 230 }
        : { top: 130, left: 20, right: 20, bottom: 270 };
    }
    // Handy ohne Bedienfelder: die ganze Fläche für die Strecken
    if (bare) return { top: 28, left: 12, right: 12, bottom: 28 };
    return stageW > 640
      ? { top: 24, left: 60, right: 60, bottom: 128 }
      : { top: 70, left: 20, right: 20, bottom: 215 };
  }

  function boundsOf(paths) {
    const b = new maplibregl.LngLatBounds();
    for (const path of paths) for (const pt of path) b.extend(pt);
    return b;
  }

  // Bei gekippter Karte ist fitBounds zu vorsichtig, deshalb wird der Ausschnitt etwas näher herangeholt.
  function frame(duration) {
    if (!tripsEng.length || !map) return;
    const pitch = is3D ? PITCH_3D : 0;
    const bearing = is3D ? BEARING_3D : 0;
    const cam = map.cameraForBounds(boundsOf(tripsEng.map((x) => x.path)), { padding: padding(), maxZoom: 9, pitch, bearing });
    if (!cam) return;
    baseZoom = Math.min(9, cam.zoom + (is3D && stageW > 640 ? 0.4 : 0));
    map.easeTo({
      center: cam.center,
      zoom: baseZoom,
      pitch,
      bearing,
      duration,
      essential: true,
    });
  }

  // Stabbreite: feste Größe auf dem Bildschirm
  function rebuildGeometry() {
    if (!loaded) return;
    const z = map.getZoom();
    if (Math.abs(z - geoZoom) < 0.05) return;
    geoZoom = z;
    const mpp = (156543.03 * Math.cos((50.1 * Math.PI) / 180)) / 2 ** z;
    // halbe Mauerbreite: knapp 1 Bildpunkt, damit sie in jeder Größe gleich kräftig wirkt
    const hw = clamp(0.85 * mpp, 120, 2400);
    poleFC.features.forEach((f, i) => (f.geometry = wallFor(cells[i], hw)));
    map.getSource("poles")?.setData(poleFC);
  }

  // 3D: Stäbe sichtbar. 2D: nur die flachen Linien.
  function applyMode() {
    if (!loaded) return;
    map.setLayoutProperty("poles", "visibility", is3D ? "visible" : "none");
    map.setPaintProperty("runs", "line-width", lineWidthExpr(!is3D));
    if (full) map.setPaintProperty("runs_case", "line-width", lineWidthExpr(!is3D, 2.8));
    // 3D: etwas kühlerer, gedämpfter Grund, damit die Stäbe leuchten; 2D: helles Papier
    map.setPaintProperty("background", "background-color", is3D ? "#e9ecf0" : "#f7f7f8");
  }

  // Klick auf einen Abschnitt oder Bahnhof: hineinzoomen, Fahrten hervorheben, Details zeigen
  function pick(info, lon, lat) {
    if (!info.list.length) return;
    picked = info;
    pinnedCell = info.cell ?? null;
    hoverOn = false;
    setFocus();
    const wide = stageW > 760;
    map.easeTo({
      center: [lon, lat],
      zoom: Math.min(11, baseZoom + 2.6),
      pitch: is3D ? PITCH_3D : 0,
      bearing: is3D ? BEARING_3D : 0,
      padding: full
        ? wide
          ? { top: 90, bottom: 220, left: 60, right: 400 }
          : { top: 220, bottom: 270, left: 20, right: 20 }
        : wide
          ? { top: 30, bottom: 130, left: 30, right: 330 }
          : { top: 200, bottom: 215, left: 20, right: 20 },
      duration: 1100,
      essential: true,
    });
  }

  function closePick() {
    if (!picked) return;
    picked = null;
    pinnedCell = null;
    setFocus();
    map.easeTo({ padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 0 });
    frame(1000);
  }

  function setMode(next) {
    if (is3D === next) return;
    if (picked) {
      picked = null;
      pinnedCell = null;
      setFocus();
      map.easeTo({ padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 0 });
    }
    is3D = next;
    applyMode();
    geoZoom = -1;
    rebuildGeometry();
    frame(900);
  }

  // ---- Wiedergabe -------------------------------------------------------
  let rafId;
  let lastFrame = 0;

  function tick(ts) {
    rafId = requestAnimationFrame(tick);
    const dt = lastFrame ? Math.min(ts - lastFrame, 100) : 16;
    lastFrame = ts;

    if (hoverEl && (hoverOn || Math.abs(hx - cx) > 0.3 || Math.abs(hy - cy) > 0.3)) {
      cx += (hx - cx) * 0.28;
      cy += (hy - cy) * 0.28;
      hoverEl.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0)`;
    }

    // Außerhalb des Bildes ruht die Animation: kein Zeichnen, keine Federn, keine Wiedergabe
    if (!loaded || !visible) return;
    stepAnim(dt);

    if (full && visible) {
      // Rundflug: etwa 6 Grad pro Sekunde
      if (orbit) map.setBearing(map.getBearing() + dt * 0.006);
      // Kamera folgt dem Zug: alle 0,65 s sanft zur Spitze des fahrenden Zuges
      if (follow && playing && headFC.features.length && ts - lastFollow > 650) {
        lastFollow = ts;
        map.easeTo({ center: headFC.features[0].geometry.coordinates, duration: 700, easing: (t) => t, essential: true });
      }
    }

    // Handy ohne Bedienfelder: die Kamera fährt dem Zug dicht hinterher, damit man die Strecke erkennt
    if (bare && playing && headFC.features.length && ts - lastFollow > 700) {
      lastFollow = ts;
      map.easeTo({
        center: headFC.features[0].geometry.coordinates,
        zoom: baseZoom + 1.9,
        duration: 900,
        easing: (t) => t,
        essential: true,
      });
    }

    if (!playing || dragging || !ready || !visible) return;
    const next = u + (dt / 1000) * (speed / UNIT_SECONDS);
    if (next >= totalU) {
      u = totalU;
      playing = false;
      if (bare) frame(1800); // am Ende wieder das ganze Jahr im Überblick
    } else {
      u = next;
    }
  }

  function togglePlay() {
    if (selected.length) clearSelection();
    if (!playing && atEnd) u = 0;
    playing = !playing;
  }

  function restart() {
    if (selected.length) clearSelection();
    u = 0;
    playing = true;
  }

  // ---- Zeitleiste: der ganze Bereich ist greifbar, nicht nur der dünne Strich ----
  function posFromEvent(e) {
    const rect = trackEl.getBoundingClientRect();
    return clamp((e.clientX - rect.left) / rect.width, 0, 1) * totalU;
  }

  function onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    if (selected.length) clearSelection();
    dragging = true;
    resumeAfterDrag = playing;
    e.currentTarget.setPointerCapture(e.pointerId);
    u = posFromEvent(e);
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (dragging) u = posFromEvent(e);
  }

  function onPointerUp(e) {
    if (!dragging) return;
    dragging = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* Zeiger bereits freigegeben */
    }
    playing = resumeAfterDrag && u < totalU;
  }

  function onKey(e) {
    const step = totalU / 60;
    if (e.key === "ArrowRight") u = Math.min(totalU, u + step);
    else if (e.key === "ArrowLeft") u = Math.max(0, u - step);
    else if (e.key === "Home") u = 0;
    else if (e.key === "End") u = totalU;
    else if (e.key === " ") togglePlay();
    else return;
    e.preventDefault();
  }

  // ---- Karte: stark vereinfachte Vektorkarte + eigene Ebenen -------------
  // Von der Grundkarte bleiben nur Land, Wasser und Grenzen. Straßen, Gebäude, Orts- und
  // Beschriftungsflut entfallen; Ortsnamen zeigt nur noch die eigene Ebene für besuchte Orte.
  const KEEP = new Set(["background", "water", "boundary_2", "boundary_3"]);
  const SETTLEMENT_COLOR = "#cdd2d9"; // Stadtflächen: neutrales Grau
  const WATER_COLOR = "#d2dde8"; // Wasserflächen: helles Grau-Blau
  const RIVER_COLOR = "#7fa9cf"; // Flüsse: klares Blau (die einzige Farbe mit Blauton auf der Karte)
  const BORDER_COUNTRY = "#8a6f8f"; // Ländergrenzen: gedecktes Malve, deutlich anders als Gleise (grau) und Flüsse (blau)
  const BORDER_REGION = "#cdbfd0";
  const TEXT_LIGHT = "#3c4452"; // Namen auf der hellen Karte
  const HALO_LIGHT = "rgba(255,255,255,0.92)";
  const TEXT_SAT = "#ffffff"; // Namen auf Satellitenbildern: weiß mit dunklem Rand
  const HALO_SAT = "rgba(8,12,20,0.88)";
  const RAIL_COLOR = "#9aa1ad"; // Gleisnetz: neutrales Grau, dünn // Streckennetz: helleres Grau, nur Hintergrund

  function simplify(base) {
    const style = JSON.parse(JSON.stringify(base));
    style.layers = style.layers.filter((l) => KEEP.has(l.id));
    delete style.sprite;
    for (const l of style.layers) {
      l.paint = l.paint || {};
      if (l.id === "background") l.paint["background-color"] = "#f5f6f7";
      if (l.id === "water") {
        l.paint["fill-color"] = WATER_COLOR;
        delete l.paint["fill-outline-color"];
      }
      if (l.id === "boundary_3") {
        l.paint["line-color"] = BORDER_REGION;
        l.paint["line-opacity"] = 0.9;
      }
      if (l.id === "boundary_2") {
        l.paint["line-color"] = BORDER_COUNTRY;
        l.paint["line-opacity"] = 1;
        l.paint["line-width"] = zw(3, 1.1, 7, 1.9, 11, 2.9);
      }
    }
    // Flüsse und Kanäle: schmale Linien im selben Hellgrau-Blau wie die Wasserflächen, etwas dunkler
    const waterAt0 = style.layers.findIndex((l) => l.id === "water");
    style.layers.splice(waterAt0 + 1, 0, {
      id: "rivers",
      type: "line",
      source: "openmaptiles",
      "source-layer": "waterway",
      minzoom: 5,
      filter: ["in", ["get", "class"], ["literal", ["river", "canal"]]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": RIVER_COLOR, "line-width": zw(5, 0.9, 9, 2.2, 13, 4.6) },
    });

    // Kartenseite: Stadtflächen (Ballungsräume) und das europäische Streckennetz als eigene Ebenen.
    // Beides stammt aus Natural Earth und liegt als schlanke Datei bei (siehe scripts/prepare_overlays.py):
    // glatte Umrisse in jedem Zoom, statt der Grundkarte, die beim Hineinzoomen in lauter Stadtviertel zerfällt.
    // Ab Zoom 9 übernimmt das genaue Netz der Grundkarte, damit es zu den Routen passt.
    if (full) {
      const dataUrl = (name) => new URL(`${import.meta.env.BASE_URL}data/${name}`, window.location.href).href;
      style.sources.urban = { type: "geojson", data: embedded("urban.geojson") ?? dataUrl("urban.geojson") };
      style.sources.rails = { type: "geojson", data: embedded("rails_eu.geojson") ?? dataUrl("rails_eu.geojson") };
      style.sources.sat = {
        type: "raster",
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        maxzoom: 18,
        attribution: "Satellitenbilder: Esri, Maxar, Earthstar Geographics",
      };
      style.layers.splice(1, 0, { id: "sat", type: "raster", source: "sat", layout: { visibility: "none" }, paint: { "raster-fade-duration": 250 } });
      const waterAt = style.layers.findIndex((l) => l.id === "water");
      style.layers.splice(
        waterAt + 1,
        0,
        { id: "urban", type: "fill", source: "urban", paint: { "fill-color": SETTLEMENT_COLOR, "fill-opacity": 1 } },
        // ein Rand in derselben Farbe rundet die Umrisse und schließt kleine Lücken zwischen Teilflächen
        {
          id: "urban_edge",
          type: "line",
          source: "urban",
          layout: { "line-join": "round" },
          paint: {
            "line-color": SETTLEMENT_COLOR,
            "line-width": zw(4, 0.6, 8, 2.4, 11, 5),
          },
        },
        {
          id: "rail_eu",
          type: "line",
          source: "rails",
          maxzoom: 9.8,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": RAIL_COLOR,
            "line-width": zw(3, 0.5, 6, 0.8, 9, 1.2),
            "line-opacity": ["interpolate", ["linear"], ["zoom"], 8.4, 1, 9.8, 0],
          },
        },
        {
          id: "rail_detail",
          type: "line",
          source: "openmaptiles",
          "source-layer": "transportation",
          minzoom: 8.4,
          filter: ["all", ["==", ["get", "class"], "rail"], ["!", ["has", "service"]]],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": RAIL_COLOR,
            "line-width": zw(8.4, 0.8, 12, 1.5, 15, 2.4),
            "line-opacity": ["interpolate", ["linear"], ["zoom"], 8.4, 0, 9.8, 1],
          },
        }
      );
    }

    style.sources.runs = { type: "geojson", data: runFC };
    style.sources.poles = { type: "geojson", data: poleFC };
    style.sources.stations = { type: "geojson", data: stationFC };
    style.sources.heads = { type: "geojson", data: headFC };

    style.layers.push(
      {
        id: "countries",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "place",
        filter: ["==", ["get", "class"], "country"],
        maxzoom: 7,
        layout: {
          "text-field": ["coalesce", ["get", "name:de"], ["get", "name"]],
          "text-font": ["Noto Sans Regular"],
          "text-size": zw(3, 10, 6, 13),
          "text-transform": "uppercase",
          "text-letter-spacing": 0.14,
        },
        paint: { "text-color": "#a3acb8", "text-halo-color": "#f5f6f7", "text-halo-width": 1.5 },
      },
      {
        // heller Saum unter den Linien: nur auf Satellitenbildern nötig, damit dunkle Strecken nicht untergehen
        id: "runs_case",
        type: "line",
        source: "runs",
        layout: { "line-cap": "butt", "line-join": "round", visibility: "none" },
        paint: { "line-color": "rgba(255,255,255,0.92)", "line-width": lineWidthExpr(is3D, 2.8) },
      },
      {
        id: "runs",
        type: "line",
        source: "runs",
        layout: { "line-cap": "butt", "line-join": "round" },
        paint: {
          // Farbe immer nach Häufigkeit (dunkel = einmal, rot = oft), auch nah dran ohne Mauern
          "line-color": ["to-color", ["coalesce", ["feature-state", "color"], HIDDEN]],
          "line-width": lineWidthExpr(is3D),
        },
      },
      {
        id: "poles",
        type: "fill-extrusion",
        source: "poles",
        // Ab dieser Nähe ist die Mauer auf null geschrumpft: die Ebene entfällt ganz (kein Streifen am Boden)
        maxzoom: WALL_GONE_ZOOM,
        filter: ["==", ["get", "vis"], 1],
        paint: {
          "fill-extrusion-color": ["to-color", ["coalesce", ["feature-state", "color"], HIDDEN]],
          "fill-extrusion-height": heightExpr(1),
          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": 0.92,
          "fill-extrusion-vertical-gradient": false,
        },
      },
      {
        id: "dots",
        type: "circle",
        source: "stations",
        filter: [">", ["get", "n"], 0],
        paint: {
          "circle-radius": ["min", 6 * SC, ["+", 2.4 * SC, ["*", 0.45 * SC, ["get", "n"]]]],
          "circle-color": "#ffffff",
          "circle-stroke-color": "#282d37",
          "circle-stroke-width": 1.5 * SC,
        },
      },
      {
        id: "labels",
        type: "symbol",
        source: "stations",
        filter: ["all", [">", ["get", "n"], 0], ["==", ["get", "major"], 1]],
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 12 * SC,
          "text-anchor": "top",
          "text-offset": [0, 0.75],
          "symbol-sort-key": ["-", 0, ["get", "n"]],
          "text-padding": 6,
        },
        paint: {
          "text-color": "#282d37",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.8,
        },
      },
      {
        id: "heads",
        type: "circle",
        source: "heads",
        paint: {
          "circle-radius": 6.5 * SC,
          "circle-color": "#ec0016",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2.5 * SC,
        },
      }
    );

    // Kartenseite: Städtenamen (Großstädte ab Zoom 3,5, Städte ab 7,5, Orte ab 10,5)
    if (full) {
      const place = (id, classes, minzoom, sizes) => ({
        id,
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "place",
        filter: ["in", ["get", "class"], ["literal", classes]],
        minzoom,
        layout: {
          "text-field": ["coalesce", ["get", "name:de"], ["get", "name"]],
          "text-font": ["Noto Sans Regular"],
          "text-size": zw(...sizes),
          "symbol-sort-key": ["coalesce", ["get", "rank"], 99],
          "text-padding": 4,
          "text-max-width": 7,
        },
        paint: { "text-color": TEXT_LIGHT, "text-halo-color": HALO_LIGHT, "text-halo-width": 1.5 },
      });
      const at = style.layers.findIndex((l) => l.id === "dots");
      style.layers.splice(
        at,
        0,
        place("places", ["city"], 3.5, [4, 10, 8, 13, 12, 16]),
        place("places_town", ["town"], 7.5, [7.5, 10, 12, 14]),
        place("places_village", ["village", "suburb"], 10.5, [10.5, 10, 14, 13])
      );
    }
    return style;
  }

  // Rechte (oder mittlere) Maustaste, oder Strg + Ziehen: Die Karte dreht und neigt sich um den Punkt unter dem
  // Mauszeiger, der dabei an seiner Stelle bleibt, und folgt der Hand weich statt ruckartig.
  // Ziehen nach rechts oder links dreht, nach oben neigt flacher zum Horizont, nach unten wieder zur Draufsicht.
  // Umschalt hält die Neigung fest (nur drehen), Alt hält die Drehung fest (nur neigen). In 2D wird nur gedreht.
  function setupRotateDrag() {
    const el = map.getCanvasContainer();
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener("auxclick", (e) => e.preventDefault());
    let g = null;
    const run = () => {
      if (!g) return;
      g.cb += (g.tb - g.cb) * 0.3;
      g.cp += (g.tp - g.cp) * 0.3;
      map.jumpTo({ bearing: g.cb, pitch: g.cp });
      // Den Drehpunkt unter dem Mauszeiger festhalten
      const pr = map.project(g.pivot);
      map.panBy([pr.x - g.pt.x, pr.y - g.pt.y], { animate: false });
      if (Math.abs(g.tb - g.cb) > 0.04 || Math.abs(g.tp - g.cp) > 0.04 || g.held) g.raf = requestAnimationFrame(run);
      else g.raf = 0;
    };
    el.addEventListener("pointerdown", (e) => {
      if (!(e.button === 2 || e.button === 1 || (e.button === 0 && (e.ctrlKey || e.metaKey)))) return;
      e.preventDefault();
      map.stop();
      const rect = el.getBoundingClientRect();
      const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      let pivot = map.unproject([pt.x, pt.y]);
      if (!Number.isFinite(pivot.lng) || !Number.isFinite(pivot.lat)) pivot = map.getCenter();
      g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, b0: map.getBearing(), p0: map.getPitch(), pt, pivot, cb: map.getBearing(), cp: map.getPitch(), tb: map.getBearing(), tp: map.getPitch(), held: true, raf: 0 };
      el.setPointerCapture(e.pointerId);
      userMoved = true;
      follow = false;
      orbit = false;
    });
    el.addEventListener("pointermove", (e) => {
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x0;
      const dy = e.clientY - g.y0;
      g.tb = e.altKey ? g.b0 : g.b0 + dx * 0.35;
      g.tp = !is3D || e.shiftKey ? g.p0 : Math.max(0, Math.min(75, g.p0 - dy * 0.32));
      if (!g.raf) g.raf = requestAnimationFrame(run);
    });
    const end = (e) => {
      if (!g || e.pointerId !== g.id) return;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      g.held = false; // die Bewegung läuft noch kurz aus
      g = null;
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  function createMap(style) {
    try {
      map = new maplibregl.Map({
        container: mapEl,
        style: simplify(style),
        center: [9.6, 50.2],
        zoom: 5.4,
        pitch: PITCH_3D,
        bearing: BEARING_3D,
        attributionControl: { compact: true },
        canvasContextAttributes: { antialias: true },
        // Hohe Pixeldichte kostet viel und sieht auf einer Karte kaum besser aus
        pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
        // Im Fenster der Startseite ist die Ansicht festgelegt (Seite scrollt über der Karte).
        // Auf der Kartenseite lässt sich alles frei bewegen: verschieben, zoomen, drehen, neigen.
        dragPan: full,
        dragRotate: false, // Drehen und Neigen übernimmt unten eine eigene Steuerung (Achsensperre)
        scrollZoom: full,
        boxZoom: false,
        keyboard: full,
        doubleClickZoom: full,
        touchZoomRotate: full,
        touchPitch: full,
        maxPitch: 75,
      });
      if (full) {
        map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
        // "Nach Norden ausrichten" setzt standardmäßig auch die Neigung zurück, die Karte wäre dann 2D, während
        // oben noch 3D gewählt ist. Stattdessen: nur nach Norden drehen, die Neigung des gewählten Modus bleibt.
        mapEl.querySelector(".maplibregl-ctrl-compass")?.addEventListener(
          "click",
          (e) => {
            e.stopImmediatePropagation();
            orbit = false;
            map.easeTo({ bearing: 0, pitch: is3D ? PITCH_3D : 0, duration: 700, essential: true });
          },
          true
        );
        // Von Hand bewegt: keine Automatik mehr dazwischenfunken
        map.on("movestart", (e) => {
          if (e.originalEvent) {
            userMoved = true;
            follow = false;
          }
        });
        setupRotateDrag();
      }
    } catch (e) {
      mapError = true;
      ready = true;
      return () => {};
    }

    map.on("error", (e) => {
      console.warn("Karte:", e && e.error && e.error.message);
      // fehlende Kacheln sind kein Grund, die Karte zu stoppen
      if (e && e.error && /WebGL/i.test(String(e.error.message))) mapError = true;
    });

    map.on("load", () => {
      try {
        map.setLight({ anchor: "viewport", color: "#ffffff", intensity: 0.5, position: [1.2, 210, 40] });
      } catch {
        /* Beleuchtung ist optional */
      }
      loaded = true;
      applyMode();
      applyWall();
      rebuildGeometry();
      frame(0);
      applyU(u);
      setFocus();
      ready = true;
      // Beim Laden einmal alles durchlaufen lassen (außer bei reduzierter Bewegung)
      // Die Wiedergabe startet erst, wenn die Karte wirklich im Bild ist (die Karte im Projekt wird schon vorher
      // aufgebaut, während man noch weiter oben ist)
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        autoPending = true;
        maybeAutoplay();
      } else {
        u = totalU;
      }
    });

    map.on("zoomend", rebuildGeometry);
    const placeHit = (point) => map.queryRenderedFeatures(point, { layers: ["dots"] })[0];

    // Die Linien sind schmal: Treffer in einem kleinen Umkreis um den Mauszeiger suchen
    function pickRun(point) {
      const r = 8;
      const hits = map.queryRenderedFeatures(
        [
          [point.x - r, point.y - r],
          [point.x + r, point.y + r],
        ],
        { layers: ["runs", "poles"] }
      );
      let best = null;
      let bd = Infinity;
      for (const f of hits) {
        const c = cells[f.properties.cid];
        if (!c.count) continue; // noch nicht gefahren: unsichtbar, also kein Treffer
        const p = map.project([c.lon, c.lat]);
        const d = Math.hypot(p.x - point.x, p.y - point.y);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      return best;
    }

    // beim Verlassen kurz warten: der Wechsel zwischen Nachbarstücken soll nicht flackern
    function scheduleClear() {
      clearTimeout(clearTimer);
      clearTimer = setTimeout(() => {
        clearTimer = 0;
        hoverCell = null;
        hoverOn = false;
        setFocus();
      }, 110);
    }

    const handleMove = (e) => {
      if (!loaded) return;
      const pl = placeHit(e.point);
      const run = pl ? null : pickRun(e.point);
      if (!pl && !run) {
        if (hoverOn && !clearTimer) scheduleClear();
        return;
      }
      clearTimeout(clearTimer);
      clearTimer = 0;
      hx = e.point.x;
      hy = e.point.y;
      if (!hoverOn) {
        cx = hx;
        cy = hy;
      }
      if (pl) {
        hoverInfo = { kind: "station", name: pl.properties.name, n: pl.properties.n };
        if (hoverCell) {
          hoverCell = null;
          setFocus();
        }
      } else {
        if (hoverCell !== run) {
          hoverCell = run;
          setFocus();
        }
        hoverInfo = cellInfo(run);
      }
      hoverOn = true;
    };
    // Höchstens einmal pro Bild abfragen und gar nicht, solange eine Maustaste gedrückt ist (Ziehen, Drehen)
    let moveEv = null;
    let moveRaf = 0;
    map.on("mousemove", (e) => {
      if (e.originalEvent && e.originalEvent.buttons) return;
      moveEv = e;
      if (!moveRaf) {
        moveRaf = requestAnimationFrame(() => {
          moveRaf = 0;
          if (moveEv) handleMove(moveEv);
          moveEv = null;
        });
      }
    });

    map.getCanvas().addEventListener("mouseleave", scheduleClear);

    // Klick: Abschnitt oder Bahnhof heranzoomen; Klick ins Leere geht zurück zur Übersicht
    map.on("click", (e) => {
      if (!loaded) return;
      const pl = placeHit(e.point);
      if (pl) {
        const st = stationEng.find((s) => s.name === pl.properties.name);
        if (st) {
          const list = [...new Set(st.at.map((a) => a.ti))].map((ti) => trips[ti]).sort((a, b) => a.t0 - b.t0);
          pick({ title: st.place, sub: `${list.length}× besucht`, list }, st.coords[0], st.coords[1]);
          return;
        }
      }
      const run = pickRun(e.point);
      if (run && run.visible.length) {
        const list = run.visible.map((ti) => trips[ti]).sort((a, b) => a.t0 - b.t0);
        pick({ title: `${list.length}× befahren`, sub: "Diese Fahrten laufen hier entlang", list, cell: run }, run.lon, run.lat);
      } else {
        closePick();
      }
    });
    const onKey = (e) => {
      if (e.key === "Escape") closePick();
    };
    window.addEventListener("keydown", onKey);

    // Wiedergabe und Beschriftungen laufen nur, solange die Karte zu sehen ist
    let docVisible = true;
    let inView = true;
    const syncVisible = () => {
      const was = visible;
      visible = docVisible && inView && isActive;
      // Wieder im Bild: den Stand nachholen, der in der Zwischenzeit ausgesetzt wurde
      if (visible && !was && map && loaded) applyU(u);
      if (visible && !was) maybeAutoplay();
    };
    syncNow = syncVisible;
    const onVis = () => {
      docVisible = !document.hidden;
      syncVisible();
    };
    document.addEventListener("visibilitychange", onVis);
    const io = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        syncVisible();
      },
      { threshold: 0.05 }
    );
    io.observe(mapEl);
    // Handy (nur die Karte, ohne Bedienfelder): die Wiedergabe startet erst, wenn die Karte fast ganz zu sehen ist
    const ioFull = bare
      ? new IntersectionObserver(
          ([entry]) => {
            fullyIn = entry.intersectionRatio >= 0.7;
            if (fullyIn) maybeAutoplay();
          },
          { threshold: [0, 0.7, 1], rootMargin: "0px 0px -25% 0px" }
        )
      : null;
    ioFull?.observe(mapEl);
    // Fenstergröße geändert: festen Ausschnitt neu einpassen
    let resizeTimer;
    const ro = new ResizeObserver(() => {
      if (!map) return;
      map.resize();
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!picked && !userMoved) frame(0);
      }, 120);
    });
    ro.observe(mapEl);

    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(resizeTimer);
      document.removeEventListener("visibilitychange", onVis);
      io.disconnect();
      ioFull?.disconnect();
      ro.disconnect();
      map.remove();
    };
  }

  onMount(() => {
    // Der Worker muss für den Bundler explizit benannt werden
    maplibregl.setWorkerUrl(embedded("worker") ?? workerUrl);
    buildModel();

    let disposed = false;
    let dispose = () => {};
    fetch(STYLE_URL)
      .then((r) => {
        if (!r.ok) throw new Error("Kartenstil nicht erreichbar");
        return r.json();
      })
      .then((style) => {
        if (!disposed) dispose = createMap(style);
      })
      .catch(() => {
        mapError = true;
        ready = true;
      });

    rafId = requestAnimationFrame(tick);
    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      clearTimeout(clearTimer);
      dispose();
    };
  });

  const fmtDay = (trip) => trip.datum.slice(0, 5);

  // Bahnhöfe zum Anspringen: ein Eintrag pro Ort, alphabetisch
  const jumpList = (() => {
    const seen = new Map();
    for (const s of stations) {
      const name = shortName(s.name);
      if (!seen.has(name)) seen.set(name, { name, coords: s.coords });
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
  })();

  const NAME_LAYERS = ["places", "places_town", "places_village", "countries", "labels"];

  function applyOverlays() {
    if (!map || !loaded || !full) return;
    const vis = (ids, on) => {
      for (const id of ids) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    };
    vis(["urban", "urban_edge"], settlements && !satellite);
    vis(["rail_eu", "rail_detail"], network);
    vis(["sat"], satellite);
    vis(["water", "rivers"], !satellite);
    vis(["runs_case"], satellite);
    vis(["places", "places_town", "places_village"], placeNames);
    vis(["countries"], countryNames);
    vis(["labels"], stationNames);
    vis(["heads"], showTrain);
    vis(["boundary_2", "boundary_3"], borders);

    // Auf Satellitenbildern: Gleise weiß, Namen weiß mit dunklem Rand, Grenzen hell
    for (const id of ["rail_eu", "rail_detail"]) {
      if (map.getLayer(id)) map.setPaintProperty(id, "line-color", satellite ? "#ffffff" : RAIL_COLOR);
    }
    for (const id of NAME_LAYERS) {
      if (!map.getLayer(id)) continue;
      map.setPaintProperty(id, "text-color", satellite ? TEXT_SAT : id === "countries" ? "#a3acb8" : id === "labels" ? "#282d37" : TEXT_LIGHT);
      map.setPaintProperty(id, "text-halo-color", satellite ? HALO_SAT : id === "countries" ? "#f5f6f7" : id === "labels" ? "#ffffff" : HALO_LIGHT);
      map.setPaintProperty(id, "text-halo-width", (satellite ? 2.2 : 1.6) * SC);
    }
    map.setPaintProperty("boundary_2", "line-color", satellite ? "#ffffff" : BORDER_COUNTRY);
    map.setPaintProperty("boundary_3", "line-color", satellite ? "rgba(255,255,255,0.6)" : BORDER_REGION);
    map.setPaintProperty("sat", "raster-brightness-max", 1 - satShade);
  }

  $effect(() => {
    settlements;
    network;
    satellite;
    placeNames;
    countryNames;
    stationNames;
    borders;
    showTrain;
    satShade;
    untrack(applyOverlays);
  });

  $effect(() => {
    lineW;
    untrack(() => {
      if (map && loaded) applyMode();
    });
  });

  function applyWall() {
    if (!map || !loaded) return;
    map.setPaintProperty("poles", "fill-extrusion-height", heightExpr(wallScale));
  }

  $effect(() => {
    wallScale;
    untrack(applyWall);
  });

  function jumpTo(e) {
    const name = e.currentTarget.value;
    const spot = jumpList.find((j) => j.name === name);
    if (!spot || !map) return;
    follow = false;
    userMoved = true;
    map.flyTo({
      center: spot.coords,
      zoom: 9.3,
      pitch: is3D ? 58 : 0,
      bearing: is3D ? BEARING_3D : 0,
      duration: 2400,
      essential: true,
    });
    e.currentTarget.value = "";
  }

  function toggleFollow() {
    follow = !follow;
    if (follow) {
      if (selected.length) clearSelection();
      orbit = false;
      userMoved = true;
      if (!playing && atEnd) u = 0;
      playing = true;
      map.easeTo({ zoom: Math.max(map.getZoom(), 7.4), duration: 1200, essential: true });
    }
  }

  // Kamera auf die ausgewählten Fahrten einpassen
  function fitSelection() {
    if (!map || !selected.length) return;
    const pitch = is3D ? PITCH_3D : 0;
    const bearing = is3D ? BEARING_3D : 0;
    const cam = map.cameraForBounds(boundsOf(selected.map((i) => tripsEng[i].path)), { padding: padding(), maxZoom: 9.5, pitch, bearing });
    if (!cam) return;
    userMoved = true;
    map.easeTo({
      center: cam.center,
      zoom: Math.min(9.5, cam.zoom + (is3D && stageW > 640 ? 0.3 : 0)),
      pitch,
      bearing,
      duration: 1300,
      essential: true,
    });
  }

  function toggleTrip(i) {
    const had = selected.includes(i);
    selected = had ? selected.filter((x) => x !== i) : [...selected, i];
    if (!had) {
      playing = false;
      follow = false;
    }
    if (selected.length) fitSelection();
    else {
      userMoved = false;
      frame(1000);
    }
  }

  function selectAll() {
    selected = trips.map((_, k) => k);
    playing = false;
    follow = false;
    userMoved = false;
    frame(1200);
  }

  function clearSelection() {
    if (!selected.length) return;
    selected = [];
    userMoved = false;
    frame(1000);
  }

  // Die Auswahl gilt sofort auf der Karte
  $effect(() => {
    const list = selected;
    selSet = list.length ? new Set(list) : null;
    untrack(() => {
      if (map && loaded) applyU(u);
    });
  });

  // Auf schmalen Bildschirmen startet das Menü zugeklappt
  $effect(() => {
    if (stageW && !tripsInit) {
      tripsInit = true;
      panelOpen = stageW > 640;
    }
  });

  function resetView() {
    follow = false;
    orbit = false;
    userMoved = false;
    wallScale = 1;
    selected = [];
    if (picked) closePick();
    else frame(1200);
  }
</script>


<div class="page-map" class:full class:bare>
  <div class="stage" bind:clientWidth={stageW}>
    <div class="map" bind:this={mapEl}></div>

    <!-- Oben links: Legende (und auf der Kartenseite darunter die Werkzeuge) -->
    {#snippet legendCard()}
      <div class="info">
        <div class="legend" aria-label="Streckenhäufigkeit">
          <span class="lt">Breite und Farbe: wie oft gefahren</span>
          <div class="bar"></div>
          <div class="labels"><span>1×</span><span>{maxLabel}×</span></div>
          {#if is3D}<p class="cols-note">3D: Die Mauer ist so hoch, wie oft gefahren</p>{/if}
          {#if full && settlements && !satellite}<p class="swatch"><i style="background:{SETTLEMENT_COLOR}"></i>Städte und Ballungsräume</p>{/if}
          {#if full && network && !satellite}<p class="swatch"><i class="line" style="background:{RAIL_COLOR}"></i>Streckennetz, Europa</p>{/if}
        </div>
      </div>
    {/snippet}

    {#snippet toggle(label, on, set)}
      <button type="button" class="row-sw" role="switch" aria-checked={on} onclick={() => set(!on)}>
        <span>{label}</span>
        <i class="sw" class:on></i>
      </button>
    {/snippet}

    {#if full}
      <div class="left">{@render legendCard()}</div>

      <!-- Rechts: ein einziges Fenster für alles, in drei Reitern -->
      <div class="side" class:open={panelOpen}>
        {#if !panelOpen}
          <button type="button" class="side-fab" onclick={() => (panelOpen = true)} aria-expanded="false">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
            <span class="lbl">Optionen</span>
            {#if selected.length}<b>{selected.length}</b>{/if}
          </button>
        {:else}
          <div class="side-head" role="tablist" aria-label="Kartenoptionen">
            {#each [["ebenen", "Ebenen"], ["ansicht", "Ansicht"], ["fahrten", "Fahrten"]] as [id, label]}
              <button type="button" role="tab" aria-selected={tab === id} class:on={tab === id} onclick={() => (tab = id)}>
                {label}{#if id === "fahrten"}<b>{selected.length ? selected.length : trips.length}</b>{/if}
              </button>
            {/each}
            <button type="button" class="side-x" aria-label="Optionen einklappen" onclick={() => (panelOpen = false)}>
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" /></svg>
            </button>
          </div>

          <div class="side-body">
            {#if tab === "ebenen"}
              <section class="grp">
                <h3>Kartenstil</h3>
                <div class="seg2" role="group" aria-label="Kartenstil">
                  <button type="button" class:on={!satellite} aria-pressed={!satellite} onclick={() => (satellite = false)}>Hell</button>
                  <button type="button" class:on={satellite} aria-pressed={satellite} onclick={() => (satellite = true)}>Satellit</button>
                </div>
                {#if satellite}
                  <label class="slide">
                    <span>Bild abdunkeln <b>{Math.round(satShade * 100)} %</b></span>
                    <input type="range" min="0" max="0.65" step="0.05" bind:value={satShade} aria-label="Satellitenbild abdunkeln" />
                  </label>
                {/if}
              </section>
              <section class="grp">
                <h3>Namen</h3>
                {@render toggle("Städte", placeNames, (v) => (placeNames = v))}
                {@render toggle("Länder", countryNames, (v) => (countryNames = v))}
                {@render toggle("Bahnhöfe", stationNames, (v) => (stationNames = v))}
              </section>
              <section class="grp">
                <h3>Karte</h3>
                {@render toggle("Gleisnetz Europa", network, (v) => (network = v))}
                {@render toggle("Ländergrenzen", borders, (v) => (borders = v))}
                {#if !satellite}{@render toggle("Städte einfärben", settlements, (v) => (settlements = v))}{/if}
                {@render toggle("Zug beim Abspielen", showTrain, (v) => (showTrain = v))}
              </section>
            {:else if tab === "ansicht"}
              <section class="grp">
                <h3>Perspektive</h3>
                <div class="seg2" role="group" aria-label="Perspektive">
                  <button type="button" class:on={!is3D} aria-pressed={!is3D} onclick={() => setMode(false)}>2D flach</button>
                  <button type="button" class:on={is3D} aria-pressed={is3D} onclick={() => setMode(true)}>3D Mauern</button>
                </div>
                {#if is3D}
                  <label class="slide">
                    <span>Mauerhöhe <b>{wallScale.toFixed(1)}×</b></span>
                    <input type="range" min="0.3" max="2.6" step="0.1" bind:value={wallScale} aria-label="Mauerhöhe" />
                  </label>
                {/if}
                {#if !is3D}
                  <label class="slide">
                    <span>Linienbreite <b>{lineW.toFixed(1)} px</b></span>
                    <input type="range" min="1" max="24" step="0.5" bind:value={lineW} aria-label="Linienbreite" />
                  </label>
                {/if}
              </section>
              <section class="grp">
                <h3>Kamera</h3>
                {@render toggle("Folgt dem Zug", follow, () => toggleFollow())}
                {@render toggle("Rundflug", orbit, (v) => { orbit = v; if (v) follow = false; })}
                <label class="jump">
                  <span>Springe zu</span>
                  <select onchange={jumpTo} aria-label="Zu einem Bahnhof springen">
                    <option value="">Bahnhof wählen …</option>
                    {#each jumpList as j}<option value={j.name}>{j.name}</option>{/each}
                  </select>
                </label>
                <button type="button" class="reset" onclick={resetView}>Ansicht zurücksetzen</button>
              </section>
              <p class="hint hint-mouse">Ziehen verschiebt, das Mausrad zoomt. Rechte Maustaste halten und ziehen: seitwärts dreht die Karte, hoch und runter neigt sie (mit Umschalt nur drehen, mit Alt nur neigen).</p>
              <p class="hint hint-touch">Mit einem Finger verschieben, mit zwei Fingern zoomen, drehen und neigen.</p>
            {:else}
              <div class="trips-actions">
                <button type="button" onclick={selectAll}>Alle zeigen</button>
                <button type="button" onclick={clearSelection} disabled={!selected.length}>Zur Zeitleiste</button>
              </div>
              <ul class="trip-list">
                {#each trips as trip, i}
                  <li>
                    <button type="button" class="trip" class:on={selected.includes(i)} aria-pressed={selected.includes(i)} onclick={() => toggleTrip(i)}>
                      <span class="chk" aria-hidden="true"></span>
                      <span class="tt">
                        <b>{shortName(trip.von)} → {shortName(trip.nach)}</b>
                        <i>{fmtDay(trip)} · {trip.abfahrt}–{trip.ankunft} · {Math.round(trip.km)} km</i>
                      </span>
                    </button>
                  </li>
                {/each}
              </ul>
              {#if !selected.length}<p class="hint">Wähle Fahrten aus: Die Karte zeigt dann nur diese.</p>{/if}
            {/if}
          </div>
        {/if}
      </div>
    {:else}
      {@render legendCard()}
    {/if}

    <!-- Oben rechts: Perspektive. Mehr lässt sich an der Karte nicht verstellen. -->
    {#if !full}
      <div class="mode" role="group" aria-label="Perspektive">
        <button class:on={!is3D} aria-pressed={!is3D} onclick={() => setMode(false)}>2D</button>
        <button class:on={is3D} aria-pressed={is3D} onclick={() => setMode(true)}>3D</button>
      </div>
    {/if}

    <!-- Detail-Panel: angeklickter Abschnitt oder Bahnhof -->
    {#if picked}
      <aside class="detail" aria-label="Details">
        <div class="d-head">
          <div>
            <h2>{picked.title}</h2>
            <p>{picked.sub}</p>
          </div>
          <button class="d-close" onclick={closePick} aria-label="Zurück zur Übersicht">Übersicht ✕</button>
        </div>
        <ul class="d-list">
          {#each picked.list as trip}
            <li>
              <span class="d-date">{fmtDay(trip)}</span>
              <span class="d-route">{shortName(trip.von)} → {shortName(trip.nach)}</span>
              <span class="d-meta">{trip.abfahrt}–{trip.ankunft} · {Math.round(trip.km)} km{trip.zuege ? ` · ${trip.zuege}` : ""}</span>
            </li>
          {/each}
        </ul>
      </aside>
    {/if}

    <!-- Hover-Karte -->
    <div class="hover" class:show={hoverOn} bind:this={hoverEl} aria-hidden="true">
      <div class="hover-inner" class:flip>
        {#if hoverInfo && hoverInfo.kind === "cell"}
          <h2>{hoverInfo.n}× befahren</h2>
          <ul class="hl-list">
            {#each hoverInfo.list.slice(0, 4) as trip}
              <li><span>{fmtDay(trip)}</span>{shortName(trip.von)} → {shortName(trip.nach)}</li>
            {/each}
          </ul>
          {#if hoverInfo.list.length > 4}<p class="more-n">+ {hoverInfo.list.length - 4} weitere</p>{/if}
        {:else if hoverInfo && hoverInfo.kind === "station"}
          <h2>{hoverInfo.name}</h2>
          <p class="more-n">{hoverInfo.n}× besucht</p>
        {/if}
      </div>
    </div>

    <!-- Zeitleiste unten -->
    <div class="dock" class:muted={selected.length > 0}>
      <div class="readout">
        <div class="date" aria-live="off">{#if selected.length}Auswahl: {selected.length} {selected.length === 1 ? "Fahrt" : "Fahrten"}{:else}{dateLabel}{/if}</div>
        <div class="counters">
          <span><b>{stats.trips}</b><i>von {trips.length} Fahrten</i></span>
          <span><b>{stats.km.toLocaleString("de-DE")}</b><i>Kilometer</i></span>
          <span><b>{stats.stations}</b><i>Bahnhöfe</i></span>
        </div>
      </div>

      <div class="row">
        <div class="transport">
          <button
            class="play"
            onclick={togglePlay}
            aria-label={playing ? "Pause" : atEnd ? "Jahr erneut abspielen" : "Abspielen"}
          >
            {#if playing}
              <svg viewBox="0 0 24 24" width="22" height="22"><path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor" /></svg>
            {:else if atEnd}
              <svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z" fill="currentColor" /></svg>
            {:else}
              <svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
            {/if}
          </button>
          <button class="ghost" onclick={restart} aria-label="Von vorn abspielen" title="Von vorn">
            <svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 6h2v12H6zM9.5 12 18 6v12z" fill="currentColor" /></svg>
          </button>
        </div>

        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div
          class="scrub"
          role="slider"
          tabindex="0"
          aria-label="Zeitleiste"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={Math.round(fraction * 100)}
          aria-valuetext={dateLabel}
          onkeydown={onKey}
        >
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="grab"
            bind:this={trackEl}
            onpointerdown={onPointerDown}
            onpointermove={onPointerMove}
            onpointerup={onPointerUp}
            onpointercancel={onPointerUp}
          >
            <div class="rail"></div>
            <div class="fill" style="width:{fraction * 100}%"></div>
            {#each tripSegs as s}
              <span
                class="seg"
                class:passed={u >= s.u1}
                class:current={u >= s.u0 && u < s.u1}
                style="left:{(s.u0 / totalUState) * 100}%; width:{((s.u1 - s.u0) / totalUState) * 100}%"
                title="{s.trip.datum}: {shortName(s.trip.von)} → {shortName(s.trip.nach)}"
              ></span>
            {/each}
            <div class="handle" style="left:{fraction * 100}%"></div>
          </div>
          <div class="months">
            {#each monthMarks as m}
              <span style="left:{m.frac * 100}%">{m.label}</span>
            {/each}
          </div>
        </div>

        <div class="speeds" role="group" aria-label="Geschwindigkeit">
          {#each SPEEDS as s}
            <button class:on={speed === s} onclick={() => (speed = s)}>{s}×</button>
          {/each}
        </div>
      </div>
    </div>

    {#if mapError}
      <div class="loading">
        <p>Die 3D-Karte braucht WebGL. Bitte aktiviere die Hardwarebeschleunigung im Browser oder nutze einen aktuellen Browser.</p>
      </div>
    {:else if !ready}
      <div class="loading">Karte wird aufgebaut …</div>
    {/if}
  </div>
</div>

<style>
  .page-map {
    height: 100%;
    background: var(--bg);
    /* Alles Responsive richtet sich nach der Breite des Fensters, nicht des Bildschirms */
    container: mapwin / inline-size;
  }

  .stage {
    position: relative;
    height: 100%;
    overflow: hidden;
  }

  .map {
    position: absolute;
    inset: 0;
    background: var(--bg);
  }

  .loading {
    position: absolute;
    inset: 0;
    z-index: 900;
    display: grid;
    place-items: center;
    padding: 2rem;
    text-align: center;
    background: var(--bg);
    color: var(--muted);
  }

  /* ---- Titel und Legende ---- */
  .info {
    position: absolute;
    z-index: 800;
    top: 0.8rem;
    left: 0.8rem;
    width: min(13.125rem, calc(100% - 7rem));
    padding: 0.55rem 0.7rem 0.6rem;
    background: var(--bg);
    border-radius: 0.875rem;
    box-shadow: 0 0 0 1px var(--line);
  }


  .legend {
    margin-top: 0;
  }

  .lt {
    font-size: 0.76rem;
    font-weight: 600;
    color: var(--muted);
  }

  .bar {
    height: 0.5rem;
    margin: 0.5rem 0 0.3rem;
    border-radius: 62.4375rem;
    background: linear-gradient(90deg, rgb(58, 68, 98), rgb(168, 34, 92) 35%, rgb(226, 16, 48) 70%, rgb(255, 40, 20));
    box-shadow: inset 0 0 0 1px rgba(40, 45, 55, 0.12);
    box-shadow: inset 0 0 0 1px rgba(40, 45, 55, 0.12);
  }

  .cols-note {
    margin-top: 0.4rem;
    padding-top: 0.4rem;
    border-top: 1px solid var(--line);
    font-size: 0.74rem;
    color: var(--muted);
  }

  .swatch {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.45rem;
    font-size: 0.74rem;
    color: var(--muted);
  }

  .swatch i.line {
    height: 0.1875rem;
    border-radius: 2px;
    box-shadow: none;
  }

  .swatch i {
    flex: none;
    width: 1.125rem;
    height: 0.75rem;
    border-radius: 0.1875rem;
    box-shadow: inset 0 0 0 1px rgba(40, 45, 55, 0.14);
  }

  .labels {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
    color: var(--muted);
  }

  /* ---- 2D / 3D ---- */
  .mode {
    position: absolute;
    z-index: 800;
    top: 0.8rem;
    right: 0.8rem;
    display: flex;
    padding: 0.1875rem;
    background: var(--bg);
    border-radius: 0.75rem;
    box-shadow: var(--shadow);
  }

  .mode button {
    min-width: 3.2rem;
    padding: 0.45rem 0.85rem;
    border-radius: 0.5625rem;
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--muted);
    transition: background-color 160ms var(--ease), color 160ms var(--ease), transform 160ms var(--ease);
  }

  .mode button:hover {
    color: var(--text);
  }

  .mode button:active {
    transform: scale(0.97);
  }

  .mode button.on {
    background: var(--red);
    color: var(--on-red);
  }

  /* ---- Detail-Panel ---- */
  .detail {
    position: absolute;
    z-index: 820;
    top: 3.6rem;
    right: 0.8rem;
    bottom: 10rem;
    width: 17.5rem;
    display: flex;
    flex-direction: column;
    padding: 1rem 1.1rem;
    background: var(--bg);
    border-radius: 1rem;
    box-shadow: 0 0 0 1px var(--line), 0 0.75rem 1.75rem -0.875rem rgba(40, 45, 55, 0.35);
    animation: d-in 380ms var(--ease);
  }

  @keyframes d-in {
    from {
      opacity: 0;
      transform: translateX(0.875rem);
    }
  }

  .d-head {
    display: flex;
    justify-content: space-between;
    gap: 0.8rem;
    margin-bottom: 0.8rem;
  }

  .d-head h2 {
    font-size: 1.4rem;
    font-weight: 800;
  }

  .d-head p {
    font-size: 0.9rem;
    color: var(--muted);
  }

  .d-close {
    align-self: flex-start;
    flex: none;
    padding: 0.35rem 0.6rem;
    border-radius: 0.5rem;
    font-size: 0.85rem;
    font-weight: 700;
    background: var(--panel);
    color: var(--text);
  }

  .d-close:hover {
    background: var(--red);
    color: var(--on-red);
  }

  .d-list {
    list-style: none;
    overflow-y: auto;
    display: grid;
    gap: 0.1rem;
  }

  .d-list li {
    display: grid;
    grid-template-columns: 3.2rem 1fr;
    padding: 0.5rem 0;
    border-top: 1px solid var(--line);
    font-size: 0.92rem;
  }

  .d-date {
    grid-row: span 2;
    color: var(--red);
    font-weight: 700;
  }

  .d-route {
    font-weight: 600;
  }

  .d-meta {
    font-size: 0.85rem;
    color: var(--muted);
  }

  @media (max-width: 900px) {
    .detail {
      top: 4.4rem;
      bottom: auto;
      left: 1rem;
      width: auto;
      max-height: 38%;
    }
  }

  /* ---- Hover-Karte ---- */
  .hover {
    position: absolute;
    z-index: 850;
    left: 0;
    top: 0;
    pointer-events: none;
    will-change: transform;
  }

  .hover-inner {
    width: 17.5rem;
    margin: 1.125rem 0 0 1.125rem;
    padding: 0.85rem 1rem 0.95rem;
    background: var(--bg);
    border-radius: 0.75rem;
    box-shadow: 0 0 0 1px var(--line), 0 0.75rem 1.75rem -0.875rem rgba(40, 45, 55, 0.35);
    opacity: 0;
    transform: translateY(0.375rem) scale(0.98);
    transform-origin: top left;
    transition: opacity 360ms ease, transform 420ms var(--ease);
  }

  .hover-inner.flip {
    margin-left: -18.625rem;
    transform-origin: top right;
  }

  .hover.show .hover-inner {
    opacity: 1;
    transform: none;
    transition: opacity 140ms ease, transform 220ms var(--ease);
  }

  .hover h2 {
    font-size: 1.3rem;
    font-weight: 800;
    margin-bottom: 0.5rem;
  }

  .hl-list {
    list-style: none;
    display: grid;
    gap: 0.25rem;
    font-size: 0.92rem;
  }

  .hl-list span {
    display: inline-block;
    min-width: 3rem;
    color: var(--red);
    font-weight: 700;
  }

  .more-n {
    margin-top: 0.3rem;
    font-size: 0.88rem;
    color: var(--muted);
  }

  /* ---- Zeitleiste: unten im Fenster angedockt, volle Breite ---- */
  .dock {
    position: absolute;
    z-index: 800;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 0.85rem 1.2rem 0.6rem;
    background: var(--bg);
    border-top: 1px solid var(--line);
    display: grid;
    gap: 0.15rem;
  }

  .readout {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 0.3rem 1.5rem;
  }

  .date {
    font-size: clamp(1.25rem, 2vw, 1.6rem);
    font-weight: 800;
    letter-spacing: -0.03em;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .counters {
    display: flex;
    gap: 1.4rem;
    font-variant-numeric: tabular-nums;
  }

  .counters span {
    display: grid;
    justify-items: end;
    line-height: 1.1;
  }

  .counters b {
    font-size: 1.15rem;
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  .counters i {
    font-style: normal;
    font-size: 0.74rem;
    color: var(--muted);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .transport {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    flex-shrink: 0;
  }

  /* Flaches Rot: eine Fläche, kein Schein */
  .play {
    width: 3rem;
    height: 3rem;
    border-radius: 50%;
    background: var(--red);
    color: var(--on-red);
    display: grid;
    place-items: center;
    transition:
      background-color 140ms var(--ease),
      transform 140ms var(--ease);
  }

  .play:hover {
    background: var(--red-dark);
  }

  .play:active {
    transform: scale(0.95);
  }

  .ghost {
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 50%;
    background: var(--panel);
    display: grid;
    place-items: center;
    color: var(--muted);
    transition:
      color 140ms var(--ease),
      background-color 140ms var(--ease),
      transform 140ms var(--ease);
  }

  .ghost:hover {
    color: var(--text);
    background: var(--panel-2);
  }

  .ghost:active {
    transform: scale(0.95);
  }

  .scrub {
    flex: 1;
    min-width: 0;
    outline: none;
  }

  .scrub:focus-visible .rail {
    outline: 2px solid var(--text);
    outline-offset: 0.1875rem;
  }

  /* Der ganze 40-Pixel-Streifen ist greifbar, nicht nur der dünne Strich */
  .grab {
    position: relative;
    height: 2.5rem;
    margin: 0 0.625rem;
    cursor: grab;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
  }

  .grab:active {
    cursor: grabbing;
  }

  .rail {
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: 0.3125rem;
    margin-top: -0.15625rem;
    border-radius: 62.4375rem;
    background: var(--panel-2);
  }

  .fill {
    position: absolute;
    left: 0;
    top: 50%;
    height: 0.3125rem;
    margin-top: -0.15625rem;
    border-radius: 62.4375rem;
    background: var(--red);
    pointer-events: none;
  }

  /* Jede Fahrt ist ein eigener Block; die laufende ist höher, Pausen sind nur der dünne Strich */
  .seg {
    position: absolute;
    top: 50%;
    height: 0.875rem;
    min-width: 0.3125rem;
    margin-top: -0.4375rem;
    border-radius: 0.3125rem;
    background: #cfd4db;
    pointer-events: none;
    transition:
      background-color 180ms var(--ease),
      height 180ms var(--ease),
      margin-top 180ms var(--ease);
  }

  .seg.passed {
    background: var(--red);
  }

  .seg.current {
    background: var(--red);
    height: 1.375rem;
    margin-top: -0.6875rem;
  }

  /* Der Griff: ein heller Knopf mit rotem Rand, ohne farbigen Schein */
  .handle {
    position: absolute;
    top: 50%;
    width: 1.625rem;
    height: 1.625rem;
    transform: translate(-50%, -50%);
    background: #fff;
    border: 0.3125rem solid var(--red);
    border-radius: 50%;
    box-shadow: 0 2px 0.375rem rgba(40, 45, 55, 0.28);
    pointer-events: none;
    transition: scale 140ms var(--ease);
  }

  .grab:hover .handle,
  .grab:active .handle {
    scale: 1.12;
  }

  .months {
    position: relative;
    height: 1rem;
    margin: 0 0.625rem;
    pointer-events: none;
  }

  .months span {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .speeds {
    display: flex;
    flex-shrink: 0;
    padding: 0.1875rem;
    border-radius: 62.4375rem;
    background: var(--panel);
  }

  .speeds button {
    padding: 0.3rem 0.7rem;
    border-radius: 62.4375rem;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--muted);
    transition:
      color 140ms var(--ease),
      background-color 140ms var(--ease);
  }

  .speeds button:hover {
    color: var(--text);
  }

  .speeds button.on {
    background: var(--bg);
    color: var(--text);
    box-shadow: 0 1px 0.25rem rgba(40, 45, 55, 0.28);
  }

  /* ---- Kartenseite: Legende links, ein Optionsfenster rechts ---- */
  .left {
    position: absolute;
    z-index: 800;
    top: 1rem;
    left: 1rem;
    width: min(15.625rem, calc(100% - 7rem));
  }

  .left .info {
    position: static;
    width: auto;
  }

  .full .info {
    width: auto;
    padding: 0.7rem 0.85rem 0.75rem;
  }

  .side {
    position: absolute;
    z-index: 810;
    top: 4.6rem;
    right: 1rem;
    width: min(20.75rem, calc(100% - 2rem));
    max-height: calc(100% - 16.4rem);
    display: flex;
    flex-direction: column;
    font-size: 0.86rem;
    background: var(--bg);
    border-radius: 1.125rem;
    box-shadow: 0 0 0 1px rgba(40, 45, 55, 0.06), 0 1.125rem 2.5rem -1.25rem rgba(40, 45, 55, 0.4);
    overflow: hidden;
  }

  .side:not(.open) {
    width: auto;
    background: none;
    box-shadow: none;
    overflow: visible;
  }

  .side-fab {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.62rem 1rem;
    background: var(--bg);
    border-radius: 62.4375rem;
    box-shadow: var(--shadow);
    font-weight: 800;
    font-size: 0.9rem;
    transition: transform 140ms var(--ease);
  }

  .side-fab:active {
    transform: scale(0.97);
  }

  .side-fab b,
  .side-head b {
    min-width: 1.4rem;
    padding: 0.05rem 0.4rem;
    border-radius: 62.4375rem;
    background: var(--panel-2);
    font-size: 0.72rem;
    text-align: center;
  }

  .side-head {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0.45rem;
    border-bottom: 1px solid var(--line);
  }

  .side-head > button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    flex: 1;
    padding: 0.5rem 0.4rem;
    border-radius: 0.6875rem;
    font-weight: 800;
    color: var(--muted);
    transition: background-color 140ms var(--ease), color 140ms var(--ease);
  }

  .side-head > button:hover {
    color: var(--text);
  }

  .side-head > button.on {
    background: var(--panel);
    color: var(--text);
    box-shadow: inset 0 -2px 0 var(--red);
  }

  .side-head > .side-x {
    flex: none;
    width: 2.1rem;
    height: 2.1rem;
    padding: 0;
  }

  .side-body {
    display: grid;
    gap: 1rem;
    align-content: start;
    padding: 0.85rem 0.95rem 1rem;
    overflow-y: auto;
    min-height: 0;
    overscroll-behavior: contain;
  }

  .grp {
    display: grid;
    gap: 0.35rem;
  }

  .grp h3 {
    margin-bottom: 0.15rem;
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .seg2 {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    padding: 0.1875rem;
    background: var(--panel);
    border-radius: 0.75rem;
  }

  .seg2 button {
    padding: 0.5rem 0.4rem;
    border-radius: 0.5625rem;
    font-weight: 800;
    color: var(--muted);
    transition: background-color 140ms var(--ease), color 140ms var(--ease);
  }

  .seg2 button.on {
    background: var(--bg);
    color: var(--text);
    box-shadow: 0 1px 0.25rem rgba(40, 45, 55, 0.18);
  }

  .row-sw {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0.4rem 0;
    font-weight: 700;
    text-align: left;
  }

  .sw {
    position: relative;
    flex: none;
    width: 2.25rem;
    height: 1.3125rem;
    border-radius: 62.4375rem;
    background: #cdd2d9;
    transition: background-color 160ms var(--ease);
  }

  .sw::after {
    content: "";
    position: absolute;
    top: 0.1875rem;
    left: 0.1875rem;
    width: 0.9375rem;
    height: 0.9375rem;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 0.1875rem rgba(40, 45, 55, 0.35);
    transition: transform 160ms var(--ease);
  }

  .sw.on {
    background: var(--red);
  }

  .sw.on::after {
    transform: translateX(0.9375rem);
  }

  .slide {
    display: grid;
    gap: 0.35rem;
    padding-top: 0.3rem;
  }

  .slide span,
  .jump span {
    display: flex;
    justify-content: space-between;
    font-weight: 700;
    color: var(--muted);
  }

  .slide b {
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }

  .slide input {
    width: 100%;
    accent-color: var(--red);
  }

  .jump {
    display: grid;
    gap: 0.35rem;
    padding-top: 0.3rem;
  }

  .jump select {
    width: 100%;
    padding: 0.45rem 0.6rem;
    border: 1px solid var(--line);
    border-radius: 0.625rem;
    background: var(--bg);
    font: inherit;
    color: var(--text);
  }

  .reset {
    justify-self: start;
    margin-top: 0.3rem;
    padding: 0.42rem 0.8rem;
    border-radius: 62.4375rem;
    background: var(--panel);
    font-weight: 700;
    font-size: 0.82rem;
    color: var(--text);
    transition: background-color 140ms var(--ease), transform 140ms var(--ease);
  }

  .reset:hover {
    background: var(--panel-2);
  }

  .reset:active {
    transform: scale(0.96);
  }

  .hint {
    font-size: 0.76rem;
    line-height: 1.4;
    color: var(--muted);
  }

  .hint-touch {
    display: none;
  }

  @media (pointer: coarse) {
    .hint-mouse {
      display: none;
    }

    .hint-touch {
      display: block;
    }
  }

  /* Fahrten-Reiter */
  .trips-actions {
    display: flex;
    gap: 0.4rem;
  }

  .trips-actions button {
    padding: 0.38rem 0.75rem;
    border-radius: 62.4375rem;
    background: var(--panel);
    font-size: 0.8rem;
    font-weight: 700;
    transition: background-color 140ms var(--ease), transform 140ms var(--ease);
  }

  .trips-actions button:hover:not(:disabled) {
    background: var(--panel-2);
  }

  .trips-actions button:active:not(:disabled) {
    transform: scale(0.96);
  }

  .trips-actions button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .trip-list {
    list-style: none;
    margin: 0 -0.4rem;
  }

  .trip {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 0.65rem;
    width: 100%;
    padding: 0.45rem 0.4rem;
    border-radius: 0.625rem;
    text-align: left;
    transition: background-color 140ms var(--ease);
  }

  .trip:hover {
    background: var(--panel);
  }

  .chk {
    position: relative;
    width: 1.125rem;
    height: 1.125rem;
    border: 2px solid #c3c9d0;
    border-radius: 0.375rem;
    transition: background-color 140ms var(--ease), border-color 140ms var(--ease);
  }

  .trip.on .chk {
    background: var(--red);
    border-color: var(--red);
  }

  .trip.on .chk::after {
    content: "";
    position: absolute;
    left: 0.25rem;
    top: 0;
    width: 0.3125rem;
    height: 0.625rem;
    border-right: 2px solid #fff;
    border-bottom: 2px solid #fff;
    transform: rotate(40deg);
  }

  .tt {
    display: grid;
    line-height: 1.25;
    min-width: 0;
  }

  .tt b {
    font-size: 0.86rem;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tt i {
    font-style: normal;
    font-size: 0.74rem;
    color: var(--muted);
  }

  /* Mit Auswahl pausiert die Zeitleiste: sichtbar zurückgenommen, ein Griff darauf beendet die Auswahl */
  .dock.muted .row {
    opacity: 0.5;
  }

  /* ---- Kartenseite (Vollbild): Zeitleiste schwebt ---- */
  .full .dock {
    left: 50%;
    right: auto;
    bottom: 1.5rem;
    width: min(65rem, calc(100% - 2rem));
    transform: translateX(-50%);
    padding: 0.95rem 1.4rem 0.7rem;
    border-top: none;
    border-radius: 1.5rem;
    box-shadow:
      0 0 0 1px rgba(40, 45, 55, 0.06),
      0 1.25rem 3rem -1.125rem rgba(40, 45, 55, 0.42);
  }

  /* Details: links unter der Legende, damit das Optionsfenster rechts frei bleibt */
  .full .detail {
    top: 9.6rem;
    bottom: 12.4rem;
    left: 1rem;
    right: auto;
    width: 19.375rem;
    animation-name: d-in-left;
  }

  @keyframes d-in-left {
    from {
      opacity: 0;
      transform: translateX(-0.875rem);
    }
  }

  /* Zoom- und Kompassknopf von MapLibre: links unten über der Zeitleiste */
  :global(.page-map.full .maplibregl-ctrl-top-right) {
    top: auto;
    right: auto;
    bottom: 9.6rem;
    left: 1rem;
  }

  :global(.page-map.full .maplibregl-ctrl-group) {
    border-radius: 0.875rem;
    box-shadow: var(--shadow);
  }

  :global(.page-map.full .maplibregl-ctrl-group button) {
    width: 2.375rem;
    height: 2.375rem;
  }

  @container mapwin (min-width: 900px) {
    .side {
      top: 4.6rem;
      max-height: calc(100% - 16.2rem);
    }
  }

  /* Beim Wechsel auf die Kartenseite kommen die Fenster nacheinander herein: erst die Legende, dann Optionen und
     Zoom, zuletzt die Zeitleiste. Die Seite bleibt im Speicher und wird nur eingeblendet; jedes Einblenden startet
     diese Animationen neu. "translate" statt "transform", damit die zentrierte Zeitleiste ihre Verschiebung behält. */
  .full .left {
    top: 4.6rem; /* unter der Glas-Leiste mit Marke, Schalter und Info */
    animation: ui-in 560ms var(--ease) 140ms both;
    --dx: -1.25rem;
  }

  .full .side {
    animation: ui-in 560ms var(--ease) 230ms both;
    --dx: 1.25rem;
  }

  .full .dock {
    animation: ui-in 620ms var(--ease) 340ms both;
    --dy: 1.75rem;
  }

  :global(.page-map.full .maplibregl-ctrl-top-right) {
    animation: ui-in 520ms var(--ease) 300ms both;
    --dx: -1.25rem;
  }

  @keyframes ui-in {
    from {
      opacity: 0;
      translate: var(--dx, 0) var(--dy, 0);
    }
  }

  /* Breit genug, damit die Zeitleiste die Ecke frei lässt: Quellenangabe ganz unten rechts */
  @container mapwin (min-width: 1800px) {
    :global(.page-map.full .maplibregl-ctrl-bottom-right) {
      bottom: 0.4rem;
      right: 0.4rem;
    }
  }

  @container mapwin (max-width: 560px) {
    /* Handy: Legende nur als schmaler Farbverlauf, der Optionen-Knopf sitzt als runder Knopf neben der Menü-Pille */
    .full .left {
      top: 4.4rem;
      width: 9.5rem;
    }

    .full .left .info {
      padding: 0.5rem 0.65rem 0.55rem;
    }

    .full .left .lt,
    .full .left .cols-note,
    .full .left .swatch {
      display: none;
    }

    .side:not(.open) {
      top: 4.4rem;
    }

    .side-fab {
      padding: 0.7rem;
    }

    .side-fab .lbl {
      display: none;
    }

    /* Zeitleiste schlank: Datum, Abspielen und Leiste; Tempo und Monatsnamen entfallen */
    .full .dock .speeds,
    .full .dock .months {
      display: none;
    }

    .full .dock {
      padding: 0.65rem 0.95rem 0.7rem;
    }

    .full .dock .row {
      flex-wrap: nowrap;
    }

    .full .dock .scrub {
      order: 0;
      flex-basis: auto;
    }

    .side {
      top: 4.4rem;
      right: 0.8rem;
      width: calc(100% - 1.6rem);
      max-height: calc(100% - 19.2rem);
    }

    .full .dock {
      bottom: 0.8rem;
      border-radius: 1.25rem;
    }

    .full .detail {
      top: 9.2rem;
      bottom: auto;
      left: 0.8rem;
      width: auto;
      max-height: 30%;
    }

    :global(.page-map.full .maplibregl-ctrl-top-right) {
      bottom: 9.4rem;
      left: 0.8rem;
    }

    /* Quellenangabe: klein, direkt über der schlanken Zeitleiste statt irgendwo im Bild */
    :global(.page-map.full .maplibregl-ctrl-bottom-right) {
      bottom: 9.4rem;
      right: 0.8rem;
    }

    :global(.page-map.full .maplibregl-ctrl-attrib) {
      font-size: 0.6rem;
    }
  }

  /* ---- Bahnhofsnamen, die beim Abspielen aufpoppen (werden von MapLibre-Markern getragen) ---- */
  :global(.pop) {
    pointer-events: none;
  }

  :global(.pop span) {
    display: block;
    white-space: nowrap;
    font-family: var(--sans);
    font-weight: 700;
    border-radius: 0.5rem;
    box-shadow: var(--shadow);
    will-change: transform, opacity;
    animation: pop var(--dur, 1.5s) var(--ease) both;
  }

  :global(.pop.mid span) {
    --dur: 1.5s;
    padding: 0.18rem 0.5rem;
    font-size: 0.78rem;
    background: var(--bg);
    color: var(--text);
  }

  :global(.pop.end span) {
    --dur: 2.6s;
    padding: 0.32rem 0.75rem;
    font-size: 1.05rem;
    background: var(--red);
    color: var(--on-red);
  }

  @keyframes pop {
    0% {
      opacity: 0;
      transform: translateY(0.5rem) scale(0.92);
    }
    12% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
    60% {
      opacity: 1;
      transform: translateY(-0.25rem) scale(1);
    }
    100% {
      opacity: 0;
      transform: translateY(-2.125rem) scale(1);
    }
  }

  /* ---- MapLibre im Seitendesign ---- */
  :global(.page-map .maplibregl-map) {
    font-family: var(--sans);
  }

  :global(.page-map .maplibregl-ctrl-bottom-right) {
    bottom: 8.4rem;
  }

  :global(.page-map .maplibregl-ctrl-attrib),
  :global(.page-map .maplibregl-ctrl-attrib.maplibregl-compact) {
    background: #ffffff;
    font-size: 0.74rem;
    color: var(--muted);
    border-radius: 0.5rem;
  }

  :global(.page-map .maplibregl-ctrl-attrib a) {
    color: var(--muted);
  }

  /* Karte ohne Bedienfelder (Handy, Startseite): nur die Karte, die Quellenangabe in der Ecke */
  .bare .dock,
  .bare .info,
  .bare .mode {
    display: none;
  }

  :global(.page-map.bare .maplibregl-ctrl-bottom-right) {
    bottom: 0.3rem;
  }

  :global(.page-map.bare .maplibregl-ctrl-attrib) {
    font-size: 0.58rem;
    line-height: 1.2;
  }

  /* Touchgeräte zoomen mit zwei Fingern: die Plus/Minus-Knöpfe nehmen nur Platz weg, der Kompass bleibt */
  @media (pointer: coarse) {
    :global(.page-map .maplibregl-ctrl-zoom-in),
    :global(.page-map .maplibregl-ctrl-zoom-out) {
      display: none;
    }
  }

  /* ---- Schmales Fenster ---- */
  @container mapwin (max-width: 480px) {
    .lt {
      display: none;
    }
  }

  @container mapwin (max-width: 560px) {
    .info {
      width: calc(100% - 8.6rem);
      padding: 0.5rem 0.65rem;
    }
    .cols-note {
      display: none;
    }
    .detail {
      top: 3.4rem;
      bottom: auto;
      left: 0.8rem;
      width: auto;
      max-height: 34%;
    }
    :global(.page-map .maplibregl-ctrl-bottom-right) {
      bottom: 11rem;
    }
    .dock {
      padding: 0.7rem 0.8rem 0.5rem;
    }
    .counters {
      gap: 0.9rem;
    }
    .counters b {
      font-size: 1.05rem;
    }
    .row {
      flex-wrap: wrap;
    }
    .scrub {
      order: 3;
      flex-basis: 100%;
    }
    .speeds {
      margin-left: auto;
    }
  }
</style>
