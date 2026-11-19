// Ein ICE-Triebkopf als kleines 3D-Modell, ohne WebGL: Flächen werden von Hand gedreht, projiziert, sortiert
// und auf ein 2D-Canvas gemalt. Einheiten sind Meter (grob): Höhe 3,9, Breite 2,96, Gleisspur 1,435.
const L_BODY = 6; // gerader Mittelteil reicht von -6 bis +6
const NOSE = 7.5; // Länge jeder Nase
const H = 4.2; // Dachhöhe über Schienenoberkante (etwas gestaucht-hoch, damit er kräftig wirkt)
const Y0 = 0.95; // Unterkante des Wagenkastens
const HW = 1.5; // halbe Breite

const C = {
  white: [241, 238, 228],
  roof: [208, 207, 198],
  red: [236, 0, 22],
  glass: [22, 30, 58],
  under: [46, 50, 54],
  dark: [32, 34, 38],
  light: [255, 242, 190],
  metal: [150, 156, 162],
  hub: [70, 74, 80],
};

// Form der Nase: t = 0 am Übergang zum Mittelteil, 1 an der Spitze
const wf = (t) => Math.max(0.3, Math.pow(1 - Math.pow(t, 2.4), 0.5)); // Breite (Grundriss rund zulaufend)
const yt = (t) => H - (H - 2.2) * Math.pow(t, 1.7); // Dach fällt lang nach vorn ab
const yb = (t) => Y0 + 0.2 * Math.pow(t, 3); // Unterkante steigt leicht an

// Querschnitt als abgerundetes Rechteck mit feinen Zeilen an der Wand (damit Fensterbänder sauber werden).
// Alle Querschnitte haben gleich viele Punkte, Zeile j liegt überall auf gleicher relativer Höhe.
function ring(x, w, y0, y1) {
  const hw = HW * w;
  const hgt = y1 - y0;
  const rb = Math.min(0.55, hgt * 0.22, hw * 0.5); // Radius unten
  const rt = Math.min(1.05, hgt * 0.34, hw * 0.9); // Schulter oben, runder
  const right = [[0, y0], [hw * 0.5, y0]];
  for (let k = 0; k <= 4; k++) {
    const a = -Math.PI / 2 + (k / 4) * (Math.PI / 2);
    right.push([hw - rb + Math.cos(a) * rb, y0 + rb + Math.sin(a) * rb]);
  }
  const ya = y0 + rb, yb2 = y1 - rt;
  for (let k = 1; k <= 9; k++) right.push([hw, ya + ((yb2 - ya) * k) / 10]);
  for (let k = 0; k <= 7; k++) {
    const a = (k / 7) * (Math.PI / 2);
    right.push([hw - rt * 0.55 + Math.cos(a) * rt * 0.55, yb2 + Math.sin(a) * rt]);
  }
  right.push([hw * 0.45, y1], [0, y1]);
  // rechts hinauf, dann links wieder hinunter (ohne doppelte Mittelpunkte)
  const left = right.slice(1, -1).reverse().map(([z, y]) => [-z, y]);
  return [...right, ...left].map(([z, y]) => [x, y, z]);
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

function colorFor(q) {
  // row = Höhe dieser Zeile am geraden Wagenkasten (gleiche Zeile = gleiche Farbe, auch an der Nase)
  const { cx, cy, cz, n, hw, row } = q;
  const tt = Math.max(0, (Math.abs(cx) - L_BODY) / NOSE);
  const dir = Math.sign(cx) || 1;
  const wall = Math.abs(n[2]) > 0.7;
  if (n[1] < -0.7) return { c: C.dark };
  if (cy < 1.12 && (wall || Math.abs(n[0]) > 0.3)) return { c: C.under };
  if (tt > 0.84 && Math.abs(n[0]) > 0.5 && cy > 1.12 && cy < 2.1 && Math.abs(cz) > 0.3 * hw && Math.abs(cz) < 0.82 * hw) return { c: C.light, emit: true };
  if (tt > 0.2 && tt < 0.78 && n[1] > 0.22 && n[0] * dir > 0.22 && Math.abs(cz) < 0.7 * hw) return { c: C.glass, glass: true };
  if (wall && row < 1.15) return { c: C.under };
  if (wall && row >= 1.15 && row < 1.55) return { c: C.red };
  if (wall && row >= 1.95 && row < 3.3) {
    if (tt === 0) {
      const cell = (cx + L_BODY) / 1.2, k = Math.floor(cell), local = cell - k;
      if (k !== 4 && k !== 5 && local > 0.14 && local < 0.86) return { c: C.glass, glass: true };
      return { c: [226, 223, 212] };
    }
  }
  if (n[1] > 0.78) return { c: C.roof };
  return { c: C.white };
}

export function buildTrain() {
  // Querschnitte von der hinteren Spitze (-x) bis zur vorderen (+x)
  const st = [];
  const nN = 22;
  for (let i = 0; i <= nN; i++) {
    const t = Math.pow(1 - i / nN, 0.75); // 1 an der Spitze
    st.push({ x: -(L_BODY + NOSE * t), w: wf(t), y0: yb(t), y1: yt(t) });
  }
  for (let i = 1; i < 30; i++) {
    const x = -L_BODY + (2 * L_BODY * i) / 30;
    st.push({ x, w: 1, y0: Y0, y1: H });
  }
  for (let i = 0; i <= nN; i++) {
    const t = Math.pow(i / nN, 0.75);
    st.push({ x: L_BODY + NOSE * t, w: wf(t), y0: yb(t), y1: yt(t) });
  }
  // doppelte Stationen am Übergang vermeiden (t = 0 liegt genau bei ±6)
  const rings = st.map((s) => ring(s.x, s.w, s.y0, s.y1));

  const quads = [];
  const bodyRing = ring(0, 1, Y0, H);
  const M = bodyRing.length;
  for (let i = 0; i < st.length - 1; i++) {
    for (let j = 0; j < M; j++) {
      const j2 = (j + 1) % M;
      const row = (bodyRing[j][1] + bodyRing[j2][1]) / 2;
      const v = [rings[i][j], rings[i][j2], rings[i + 1][j2], rings[i + 1][j]];
      const cx = (v[0][0] + v[1][0] + v[2][0] + v[3][0]) / 4;
      const cy = (v[0][1] + v[1][1] + v[2][1] + v[3][1]) / 4;
      const cz = (v[0][2] + v[1][2] + v[2][2] + v[3][2]) / 4;
      let n = norm(cross(sub(v[1], v[0]), sub(v[3], v[0])));
      const axisY = (st[i].y0 + st[i].y1 + st[i + 1].y0 + st[i + 1].y1) / 4;
      if (n[0] * 0 + n[1] * (cy - axisY) + n[2] * cz + n[0] * 0 < 0) n = [-n[0], -n[1], -n[2]];
      const hw = (HW * (st[i].w + st[i + 1].w)) / 2;
      const col = colorFor({ cx, cy, cz, n, hw, row });
      quads.push({ v, n, ...col });
    }
  }
  // Kappen an den Spitzen (Kupplungsabdeckung)
  for (const [k, sx] of [[0, -1], [st.length - 1, 1]]) {
    quads.push({ v: rings[k].slice(), n: [sx, 0, 0], c: C.under });
    // Scheinwerfer und Schlusslicht an der Spitze
    const x = st[k].x + sx * 0.02, yc = (st[k].y0 + st[k].y1) / 2 - 0.05;
    for (const zz of [-0.2, 0.2]) {
      quads.push({ v: [[x, yc - 0.07, zz - 0.1], [x, yc - 0.07, zz + 0.1], [x, yc + 0.07, zz + 0.1], [x, yc + 0.07, zz - 0.1]], n: [sx, 0, 0], c: C.light, emit: true });
    }
  }

  // Drehgestelle als dunkle Kästen
  const box = (x0, x1, y0, y1, z0, z1, c) => {
    const p = (x, y, z) => [x, y, z];
    const f = [
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]],
      [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]],
      [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]],
    ];
    const ns = [[0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0]];
    return f.map((v, i) => ({ v, n: ns[i], c }));
  };
  const bogies = [];
  for (const bx of [-3.8, 3.8]) bogies.push(...box(bx - 1.55, bx + 1.55, 0.5, 0.98, -0.4, 0.4, C.under));

  const axles = [-5.05, -2.55, 2.55, 5.05];
  return { quads, bogies, axles };
}

function wheelQuads(xa, z0, z1, ang) {
  const R = 0.46, Yc = 0.47, N = 16, out = [];
  const pt = (a, r, z) => [xa + Math.cos(a) * r, Yc + Math.sin(a) * r, z];
  const outer = z1 > z0 ? z1 : z0;
  const nz = Math.sign(outer);
  for (let k = 0; k < N; k++) {
    const a0 = ang + (k / N) * Math.PI * 2, a1 = ang + ((k + 1) / N) * Math.PI * 2;
    out.push({ v: [pt(a0, R, z0), pt(a1, R, z0), pt(a1, R, z1), pt(a0, R, z1)], n: [Math.cos((a0 + a1) / 2), Math.sin((a0 + a1) / 2), 0], c: C.dark });
  }
  // Speichen auf der Außenseite (drei helle Streifen), dazwischen dunkel
  const zc = outer + nz * 0.01;
  out.push({ v: Array.from({ length: N }, (_, k) => pt(ang + (k / N) * Math.PI * 2, R, zc)), n: [0, 0, nz], c: C.hub });
  for (let s = 0; s < 3; s++) {
    const a = ang + (s * Math.PI * 2) / 3;
    const w = 0.22;
    out.push({ v: [pt(a - w, R * 0.96, zc + nz * 0.005), pt(a + w, R * 0.96, zc + nz * 0.005), pt(a + w * 0.4, 0.1, zc + nz * 0.005), pt(a - w * 0.4, 0.1, zc + nz * 0.005)], n: [0, 0, nz], c: C.metal });
  }
  return out;
}

export function drawTrain(ctx, model, w, h, o) {
  const { yaw, pitch, time } = o;
  const D = 70; // Kameraabstand
  const ppu = w / 29; // Pixel pro Meter
  const f = ppu * D;
  const cyaw = Math.cos(yaw), syaw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cx0 = w / 2, cy0 = h * 0.62;
  const bob = Math.sin(time * 2.3) * 0.04;

  // Modell- zu Kamerakoordinaten
  const tp = (p) => {
    const x = p[0] * cyaw + p[2] * syaw, z = -p[0] * syaw + p[2] * cyaw, y = p[1] - 2.0 + bob;
    const y2 = y * cp + z * sp, z2 = -y * sp + z * cp;
    return [x, y2, z2 + D];
  };
  const tn = (n) => {
    const x = n[0] * cyaw + n[2] * syaw, z = -n[0] * syaw + n[2] * cyaw;
    return [x, n[1] * cp + z * sp, -n[1] * sp + z * cp];
  };
  const sx = (p) => cx0 + (f * p[0]) / p[2];
  const sy = (p) => cy0 - (f * p[1]) / p[2];

  ctx.clearRect(0, 0, w, h);

  // Boden: Schatten, Schienen, Schwellen (Schwellen laufen nach hinten weg, der Zug "fährt")
  const g = (x, z) => { const p = tp([x, -0.05, z]); return [sx(p), sy(p)]; };
  const shadow = [g(-17, -2.2), g(17, -2.2), g(17, 2.2), g(-17, 2.2)];
  ctx.fillStyle = "rgba(0,0,0,.28)";
  ctx.beginPath();
  shadow.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.fill();
  const gap = 1.1, off = (time * 3.2) % gap;
  ctx.strokeStyle = "rgba(120,126,132,.8)";
  ctx.lineWidth = Math.max(1, ppu * 0.1);
  ctx.beginPath();
  for (let x = -28 - off; x < 28; x += gap) {
    const a = g(x, -1.5), b = g(x, 1.5);
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
  }
  ctx.stroke();
  ctx.strokeStyle = "#aeb3b8";
  ctx.lineWidth = Math.max(1.4, ppu * 0.14);
  for (const z of [-0.72, 0.72]) {
    const a = g(-28, z), b = g(28, z);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }

  // Flächen sammeln: Rumpf, Drehgestelle, Räder
  const all = [...model.quads, ...model.bogies];
  const ang = time * 6;
  for (const xa of model.axles) {
    for (const [z0, z1] of [[0.58, 0.72], [-0.58, -0.72]]) all.push(...wheelQuads(xa, z0, z1, ang));
  }

  const L = [-0.5, 0.78, -0.5];
  const ln = Math.hypot(L[0], L[1], L[2]);
  const vis = [];
  for (const q of all) {
    const vs = q.v.map(tp);
    const n = tn(q.n);
    let cx = 0, cy = 0, cz = 0;
    for (const v of vs) { cx += v[0]; cy += v[1]; cz += v[2]; }
    cx /= vs.length; cy /= vs.length; cz /= vs.length;
    if (n[0] * cx + n[1] * cy + n[2] * cz >= 0) continue; // dreht uns den Rücken zu
    vis.push({ q, vs, n, z: cz });
  }
  vis.sort((a, b) => b.z - a.z);

  for (const { q, vs, n } of vis) {
    let k;
    if (q.emit) k = 1.05;
    else {
      const lam = Math.max(0, (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / ln);
      k = 0.5 + 0.56 * lam;
      if (q.glass) k = 0.7 + 0.9 * lam * lam; // Glas spiegelt etwas heller
    }
    const col = `rgb(${Math.min(255, q.c[0] * k) | 0},${Math.min(255, q.c[1] * k) | 0},${Math.min(255, q.c[2] * k) | 0})`;
    ctx.fillStyle = col;
    ctx.strokeStyle = col;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let i = 0; i < vs.length; i++) {
      const X = sx(vs[i]), Y = sy(vs[i]);
      if (i) ctx.lineTo(X, Y);
      else ctx.moveTo(X, Y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}
