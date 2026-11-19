// Ein ICE in Outlines: Triebkopf mit langer, weich abfallender Nase, vier Mittelwagen, Endwagen mit Nase nach hinten.
// Jeder Wagen ist ein Netz aus Querschnitt-Ringen (Meter: x = Länge, y = seitlich, z = oben). Dazu kommen
// Detail-Linien (Fensterpfosten, Türen, Zierstreifen, Stromabnehmer, Drehgestelle) und gefüllte Flächen
// (hellgraues Fensterband, dunkle Frontscheibe), jeweils einer Fläche zugeordnet, damit sie mit ihr verdeckt werden.

const HW = 1.47, Z0 = 0.95, Z1 = 3.9; // halbe Breite, Unterkante, Dach
export const CAR = 25.5, GAP = 0.9;
const NOSE = 9.5;

// Querschnitt: unten leicht eingezogen, Wände senkrecht, oben runde Schultern
function ring(w, z0, z1) {
  const r = [[0, z0], [0.66 * w, z0], [w, z0 + 0.38], [w, z1 - 0.95], [0.95 * w, z1 - 0.45], [0.74 * w, z1 - 0.12], [0, z1]];
  const left = r.slice(1, -1).reverse().map(([y, z]) => [-y, z]);
  return [...r, ...left]; // 12 Punkte
}
const M = 12;
// Nasenform: t = 0 am Übergang zum Wagenkasten, 1 an der Spitze
const nose = (t) => ({
  w: HW * (1 - 0.64 * t ** 2.2),
  z0: Z0 + 0.32 * t ** 2.4,
  z1: Z1 - (Z1 - 1.55) * t ** 1.25,
});

function newell(pts) {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}

function buildCar(noseFront, noseBack, pantograph) {
  const NR = 10;
  const st = [];
  if (noseBack) for (let k = NR; k >= 1; k--) { const t = k / NR; st.push({ x: NOSE * (1 - t), t, ...nose(t) }); }
  const bodyX0 = noseBack ? NOSE : 0, bodyX1 = noseFront ? CAR - NOSE : CAR;
  st.push({ x: bodyX0, t: 0, w: HW, z0: Z0, z1: Z1 });
  st.push({ x: bodyX1, t: 0, w: HW, z0: Z0, z1: Z1 });
  if (noseFront) for (let k = 1; k <= NR; k++) { const t = k / NR; st.push({ x: bodyX1 + NOSE * t, t, ...nose(t) }); }
  const kBody = noseBack ? NR : 0; // Ring am Anfang des Wagenkastens

  const V = [];
  const add = (x, y, z) => { V.push(x, y, z); return V.length / 3 - 1; };
  const rings = st.map((s) => ring(s.w, s.z0, s.z1).map(([y, z]) => add(s.x, y, z)));
  const P = (i) => [V[3 * i], V[3 * i + 1], V[3 * i + 2]];
  const F = [];
  for (let k = 0; k < rings.length - 1; k++)
    for (let j = 0; j < M; j++) {
      const j2 = (j + 1) % M;
      F.push({ i: [rings[k][j], rings[k][j2], rings[k + 1][j2], rings[k + 1][j]], lines: [], polys: [] });
    }
  const capA = F.length; F.push({ i: rings[0].slice(), lines: [], polys: [] });
  const capB = F.length; F.push({ i: rings[rings.length - 1].slice(), lines: [], polys: [] });
  // alle Flächen nach außen drehen
  for (const f of F) {
    const pts = f.i.map(P);
    let n = newell(pts);
    let cx = 0, cy = 0, cz = 0;
    for (const p of pts) { cx += p[0]; cy += p[1]; cz += p[2]; }
    cx /= pts.length; cy /= pts.length; cz /= pts.length;
    const isCap = pts.length === M;
    const dir = isCap ? [cx - CAR / 2, 0, 0] : [0, cy, cz - (Z0 + Z1) / 2];
    if (n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2] < 0) { f.i.reverse(); n = n.map((v) => -v); }
    f.n = n;
  }
  const faceAt = (k, j) => F[k * M + j];

  for (const side of [1, -1]) {
    const f = faceAt(kBody, side > 0 ? 2 : 9); // senkrechte Seitenwand
    const y = side * HW * 1.003;
    const za = Z0 + 1.2, zb = Z0 + 2.08;
    const xa = bodyX0 + (noseBack ? 0.6 : 1.4), xb = bodyX1 - (noseFront ? 0.6 : 1.4);
    // durchgehendes Fensterband, dazwischen schmale Pfosten
    f.polys.push({ fill: "#dcdcdc", pts: [[xa, y, za], [xb, y, za], [xb, y, zb], [xa, y, zb]] });
    for (let x = xa + 2.3; x < xb - 0.5; x += 2.3) f.lines.push([[x, y, za], [x, y, zb]]);
    // Zierstreifen unter den Fenstern und an der Unterkante
    f.lines.push([[bodyX0, y, Z0 + 0.8], [bodyX1, y, Z0 + 0.8]]);
    // Türen
    for (const xd of [bodyX0 + 0.9, bodyX1 - 2.2]) {
      if ((noseBack && xd < NOSE + 0.5) || (noseFront && xd > CAR - NOSE - 1.8)) continue;
      f.lines.push([[xd, y, Z0 + 0.05], [xd, y, Z0 + 2.3]], [[xd + 1.3, y, Z0 + 0.05], [xd + 1.3, y, Z0 + 2.3]], [[xd, y, Z0 + 2.3], [xd + 1.3, y, Z0 + 2.3]]);
    }
    // Drehgestelle
    for (const xg of [bodyX0 + 2.6, bodyX1 - 2.6]) {
      const yy = side * 1.05;
      f.lines.push([[xg - 1.5, yy, 0.25], [xg + 1.5, yy, 0.25]], [[xg - 1.5, yy, 0.25], [xg - 1.5, yy, Z0]], [[xg + 1.5, yy, 0.25], [xg + 1.5, yy, Z0]]);
    }
  }

  // Nase: dunkle Frontscheibe über die Oberseite, Seitenfenster des Führerstands, Scheinwerfer
  const decorateNose = (front) => {
    const ring0 = front ? kBody + 1 : 0; // erster Nasenring (Index in st)
    const tOf = (t) => (front ? bodyX1 + NOSE * t : NOSE * (1 - t));
    const pt = (t, frac) => { const n = nose(t); return [tOf(t), frac * n.w * 0.7, n.z1 - 0.04]; };
    const ts = [0.2, 0.3, 0.4, 0.5, 0.6];
    const left = ts.map((t) => pt(t, 1)), right = ts.slice().reverse().map((t) => pt(t, -1));
    // Fläche, an die die Scheibe gehängt wird: oben, ungefähr bei t = 0.4
    const kMid = front ? kBody + 4 : NR - 5;
    faceAt(kMid, 5).polys.push({ fill: "#2b2b2b", pts: [...left, ...right] });
    // Seitenfenster des Führerstands
    for (const side of [1, -1]) {
      const kS = front ? kBody + 1 : NR - 2;
      const ta = 0.08, tb = 0.24, na = nose(ta), nb = nose(tb);
      faceAt(kS, side > 0 ? 3 : 8).polys.push({
        fill: "#dcdcdc",
        pts: [[tOf(ta), side * na.w * 0.99, na.z1 - 1.25], [tOf(tb), side * nb.w * 0.99, nb.z1 - 1.05], [tOf(tb), side * nb.w * 0.97, nb.z1 - 0.55], [tOf(ta), side * na.w * 0.97, na.z1 - 0.6]],
      });
    }
    // Scheinwerfer an der Spitze
    const tip = st[front ? st.length - 1 : 0];
    const cap = F[front ? capB : capA];
    for (const yy of [-0.28, 0.28]) {
      cap.polys.push({ fill: "#ffffff", pts: [[tip.x, yy - 0.13, tip.z0 + 0.3], [tip.x, yy + 0.13, tip.z0 + 0.3], [tip.x, yy + 0.13, tip.z0 + 0.44], [tip.x, yy - 0.13, tip.z0 + 0.44]] });
    }
    void ring0;
  };
  if (noseFront) decorateNose(true);
  if (noseBack) decorateNose(false);

  // Stromabnehmer auf dem Dach
  if (pantograph) {
    const roof = faceAt(kBody, 6);
    const x0 = noseFront ? bodyX0 + 5 : bodyX1 - 7, z = Z1 + 0.02;
    roof.lines.push([[x0, -0.55, z], [x0 + 1.7, 0, z + 1.15]], [[x0, 0.55, z], [x0 + 1.7, 0, z + 1.15]], [[x0 + 1.7, 0, z + 1.15], [x0 + 0.5, 0, z + 1.85]], [[x0 - 0.4, -0.85, z + 1.85], [x0 + 1.4, 0.85, z + 1.85]], [[x0 - 0.4, 0.85, z + 1.85], [x0 + 1.4, -0.85, z + 1.85]]);
  }
  return { V: new Float64Array(V), F };
}

// Zugverband: Kopf vorn (Nase in Fahrtrichtung), vier Mittelwagen, Endwagen
export function buildICE() {
  return [buildCar(true, false, true), buildCar(false, false), buildCar(false, false), buildCar(false, false), buildCar(false, false), buildCar(false, true, true)];
}
