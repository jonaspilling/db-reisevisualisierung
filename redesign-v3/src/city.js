// Die Stadt um einen Bahnhof aus OpenStreetMap (ausgeschnitten mit tools/extract_city.py aus den OSM-Dateien im Projekt).
// Jedes Gebäude wird einmal in ein kleines 3D-Netz umgerechnet: Wände, Dachflächen (nach roof:shape), Dachdeckel.
// Koordinaten danach in Welt-Kilometern (wie die Fahrtlinien), Höhen ebenfalls in Kilometern.

const clampN = (v, a, b) => Math.min(b, Math.max(a, v));
const file = (key) => key.replace(/[() ]/g, "_");

// ---------- kleine Geometrie-Helfer (lokale Meter) ----------
function signedArea(p) {
  let a = 0;
  const n = p.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += p[2 * i] * p[2 * j + 1] - p[2 * j] * p[2 * i + 1];
  }
  return a / 2;
}
function reverseRing(p) {
  const out = [];
  for (let i = p.length - 2; i >= 0; i -= 2) out.push(p[i], p[i + 1]);
  return out;
}
function centroid(p) {
  let x = 0, y = 0;
  const n = p.length / 2;
  for (let i = 0; i < n; i++) { x += p[2 * i]; y += p[2 * i + 1]; }
  return [x / n, y / n];
}
// Hauptachse (Richtung der größten Ausdehnung) eines Punkthaufens
function principalAxis(p) {
  const [cx, cy] = centroid(p);
  let sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < p.length; i += 2) {
    const dx = p[i] - cx, dy = p[i + 1] - cy;
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
  }
  return 0.5 * Math.atan2(2 * sxy, sxx - syy);
}
// Flächennormale nach Newell (robust auch für Dreiecke mit doppelten Punkten)
function newell(pts) {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}

// Umriss vereinfachen (Douglas-Peucker für geschlossene Ringe): Punkte auf geraden Kanten fallen weg,
// sonst wird aus jedem Zwischenpunkt eine senkrechte Wandkante
function simplifyRing(p, tol) {
  const n = p.length / 2;
  if (n <= 4) return p;
  const pt = (i) => [p[2 * (i % n)], p[2 * (i % n) + 1]];
  // Startpunkt und der am weitesten entfernte Punkt teilen den Ring in zwei Hälften
  let far = 0, fd = -1;
  const [x0, y0] = pt(0);
  for (let i = 1; i < n; i++) { const [x, y] = pt(i); const d = (x - x0) ** 2 + (y - y0) ** 2; if (d > fd) { fd = d; far = i; } }
  const keep = new Uint8Array(n);
  keep[0] = keep[far] = 1;
  const rdp = (a, b) => {
    const [ax, ay] = pt(a), [bx, by] = pt(b);
    const L = Math.hypot(bx - ax, by - ay) || 1e-9;
    let best = -1, bd = tol;
    for (let i = a + 1; i < b; i++) {
      const [x, y] = pt(i);
      const d = Math.abs((bx - ax) * (ay - y) - (ax - x) * (by - ay)) / L;
      if (d > bd) { bd = d; best = i; }
    }
    if (best >= 0) { keep[best % n] = 1; rdp(a, best); rdp(best, b); }
  };
  rdp(0, far);
  rdp(far, n);
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(p[2 * i], p[2 * i + 1]);
  return out.length >= 6 ? out : p;
}

// ---------- ein Gebäude als Netz ----------
function buildMesh(rec, toW) {
  let [h, mh, rs, rh, rd, across, st, outer, holes] = rec;
  outer = simplifyRing(outer, rs === 5 ? 0.35 : 0.6);
  holes = (holes || []).map((r) => simplifyRing(r, 0.6));
  if (signedArea(outer) < 0) outer = reverseRing(outer); // außen gegen den Uhrzeigersinn
  holes = (holes || []).map((r) => (signedArea(r) > 0 ? reverseRing(r) : r)); // innen im Uhrzeigersinn
  if (holes.length) rs = 0; // Dächer mit Innenhof: flach
  const n = outer.length / 2;
  const area = Math.abs(signedArea(outer));

  // Firstrichtung u, quer dazu v
  let ang;
  if (rd >= 0) ang = Math.PI / 2 - ((rd + 90) * Math.PI) / 180; // roof:direction ist die Gefällerichtung (Kompass)
  else ang = principalAxis(outer);
  if (across) ang += Math.PI / 2;
  const ux = Math.cos(ang), uy = Math.sin(ang), vx = -uy, vy = ux;
  let umin = Infinity, umax = -Infinity, vmin = Infinity, vmax = -Infinity;
  for (let i = 0; i < n; i++) {
    const u = outer[2 * i] * ux + outer[2 * i + 1] * uy, v = outer[2 * i] * vx + outer[2 * i + 1] * vy;
    umin = Math.min(umin, u); umax = Math.max(umax, u); vmin = Math.min(vmin, v); vmax = Math.max(vmax, v);
  }
  const L = umax - umin, Wd = vmax - vmin, cu = (umin + umax) / 2, cv = (vmin + vmax) / 2;

  if (rs && rh < 0) rh = Math.min(12, Wd * [0, 0.35, 0.35, 0.45, 0.5, 0.3, 0.15][rs]);
  if (!rs) rh = 0;
  const area0 = Math.abs(signedArea(outer));
  // Bahnsteighallen: fast halbkreisförmige Tonnen (wie die großen Hallen in Frankfurt), nicht flach
  const hall = rs === 5 && st > 0 && area0 / Math.max(1, L * Wd) > 0.72;
  // Hallen: Wölbung nach Bogenhöhe der Halle; stimmt die erfasste Gebäudehöhe nicht (z. B. Köln: 7 m bei 22 m Dach),
  // wird das Gebäude so hoch wie die Wölbung verlangt, statt den Bogen flachzudrücken
  if (hall) rh = Math.max(rh, Math.min((rec.rise ?? 0.42) * Wd, Math.max(h - mh - 1.5, 24)));
  if (hall && rec.rise != null && rec.rise < 0.3) rh = Math.min(rh, rec.rise * Wd); // flache Hallen (Lille)
  if (hall) h = Math.max(h, mh + rh + 1.5);
  if (h - rh < mh + 0.5) rh = Math.max(0, h - mh - 0.5);
  const ze = h - rh;

  // Dachringe: jeder Ring ist der Grundriss, in u und v zum Mittelpunkt gestaucht, auf einer Höhe
  let rings;
  switch (rs) {
    case 1: rings = [[1, 1, ze], [1, 0, h]]; break; // Satteldach
    case 2: rings = [[1, 1, ze], [Math.max(0, (L - Wd) / L), 0, h]]; break; // Walmdach
    case 3: rings = [[1, 1, ze], [0, 0, h]]; break; // Zeltdach
    case 4: rings = [0, 1, 2, 3, 4, 5, 6].map((k) => { const t = (k / 6) * (Math.PI / 2); return [Math.cos(t), Math.cos(t), ze + rh * Math.sin(t)]; }); break; // Kuppel
    case 5: rings = [0, 1, 2, 3, 4, 5, 6].map((k) => { const t = (k / 6) * (Math.PI / 2); return [1, Math.cos(t), ze + rh * Math.sin(t)]; }); break; // Tonnendach
    default: rings = [[1, 1, ze]];
  }

  const V = []; // Weltpunkte (x, y, z) in km
  const add = (x, y, z) => { const [X, Y] = toW(x, y); V.push(X, Y, z / 1000); return V.length / 3 - 1; };
  const ringIdx = (sc, z, skillion) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const x = outer[2 * i], y = outer[2 * i + 1];
      const u = x * ux + y * uy - cu, v = x * vx + y * vy - cv;
      const U = cu + u * sc[0], Vv = cv + v * sc[1];
      const zz = skillion ? ze + rh * ((v + Wd / 2) / (Wd || 1)) : z;
      out.push(add(U * ux + Vv * vx, U * uy + Vv * vy, zz));
    }
    return out;
  };
  const base = [];
  for (let i = 0; i < n; i++) base.push(add(outer[2 * i], outer[2 * i + 1], mh));
  const R = rings.map((r) => ringIdx(r, r[2], rs === 6));

  const P = (i) => [V[3 * i], V[3 * i + 1], V[3 * i + 2]];
  const F = [];
  const face = (idx, kind) => {
    const pts = idx.map(P);
    // Normale in Metern rechnen (Höhe ist in km wie x/y, also passt das Verhältnis)
    F.push({ i: idx, n: newell(pts), kind });
  };
  // Wände außen (mit Länge und Höhe für Fenster und Türen)
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    face([base[i], base[j], R[0][j], R[0][i]], 0);
    const f = F[F.length - 1];
    f.len = Math.hypot(outer[2 * j] - outer[2 * i], outer[2 * j + 1] - outer[2 * i + 1]);
    f.wh = ze - mh;
    f.a = [outer[2 * i], outer[2 * i + 1]]; // Wandanfang und -ende in lokalen Metern (für Türen)
    f.b = [outer[2 * j], outer[2 * j + 1]];
  }
  // Wände der Innenhöfe und Deckel mit Löchern
  const holeIdx = [];
  for (const hr of holes) {
    const m = hr.length / 2, b2 = [], t2 = [];
    for (let i = 0; i < m; i++) { b2.push(add(hr[2 * i], hr[2 * i + 1], mh)); t2.push(add(hr[2 * i], hr[2 * i + 1], ze)); }
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      face([b2[i], b2[j], t2[j], t2[i]], 0);
    }
    holeIdx.push(t2);
  }
  // Sattel- und Tonnendächer auf (fast) rechteckigen Grundrissen: richtig als Streifen mit senkrechten Giebeln
  // bauen (sonst sehen Bahnsteighallen von vorn wie Kuppeln aus)
  const rectish = area / Math.max(1, L * Wd) > 0.72;
  if ((rs === 1 || rs === 5) && rectish) {
    const segs = hall ? 18 : 10;
    const prof = rs === 1
      ? [[-1, 0], [0, 1], [1, 0]]
      : Array.from({ length: segs + 1 }, (_, k) => { const t = Math.PI - (k / segs) * Math.PI; return [Math.cos(t), Math.sin(t)]; });
    const P0 = (u, pv) => add((cu + u) * ux + (cv + pv[0] * Wd / 2) * vx, (cu + u) * uy + (cv + pv[0] * Wd / 2) * vy, ze + rh * pv[1]);
    const A = prof.map((pv) => P0(-L / 2, pv)), B = prof.map((pv) => P0(L / 2, pv));
    const center = [ (cu) * ux + cv * vx, cu * uy + cv * vy ];
    const [cX, cY] = toW(center[0], center[1]);
    const outward = (idx) => {
      // Fläche so drehen, dass die Normale vom Gebäude weg zeigt
      const pts = idx.map(P);
      const n0 = newell(pts);
      let mx = 0, my = 0, mz = 0;
      for (const p of pts) { mx += p[0]; my += p[1]; mz += p[2]; }
      mx /= pts.length; my /= pts.length; mz /= pts.length;
      const dot = n0[0] * (mx - cX) + n0[1] * (my - cY) + n0[2] * (mz - (ze / 1000)) * 0.3;
      return dot >= 0 ? idx : idx.slice().reverse();
    };
    // Querrippen über das Dach (Hallen alle ~9 m, sonst ~12 m) als Linien auf den Dachstreifen
    const nr = rs === 5 ? Math.max(1, Math.round(L / (hall ? 9 : 12))) : 0;
    for (let k = 0; k < prof.length - 1; k++) {
      const idx = outward([A[k], A[k + 1], B[k + 1], B[k]]);
      const f = { i: idx, n: newell(idx.map(P)), kind: 1 };
      if (nr > 1) {
        f.lines = [];
        for (let r = 1; r < nr; r++) {
          const u = -L / 2 + (L * r) / nr;
          f.lines.push([P0(u, prof[k]), P0(u, prof[k + 1])]);
        }
      }
      F.push(f);
    }
    // Giebel mit senkrechten Sprossen (Glasfront der Halle)
    for (const [G, u] of [[A, -L / 2], [B, L / 2]]) {
      const idx = outward(G.slice());
      const f = { i: idx, n: newell(idx.map(P)), kind: 1 };
      if (rs === 5 && hall) {
        // verglaster Halbkreisgiebel: Rahmenbogen innen, senkrechte Sprossen, Kämpferband, kurze Bogensteine
        f.lines = [];
        const fi = 0.86;
        const inner = prof.map(([x, z]) => P0(u, [x * fi, z * fi]));
        for (let k = 0; k < prof.length - 1; k++) f.lines.push([inner[k], inner[k + 1]]);
        for (let k = 1; k < prof.length - 1; k++) {
          f.lines.push([inner[k], P0(u, [prof[k][0] * fi, 0])]);
          if (k % 2 === 0) f.lines.push([G[k], inner[k]]);
        }
        for (const zq of [0.38, 0.62]) {
          const xq = Math.sqrt(1 - (zq / fi) ** 2) * fi;
          f.lines.push([P0(u, [-xq, zq]), P0(u, [xq, zq])]);
        }
      } else if (rs === 5) {
        f.lines = [];
        for (let k = 1; k < prof.length - 1; k++) f.lines.push([G[k], P0(u, [prof[k][0], 0])]);
        const zq = 0.55; // Kämpferlinie
        const xq = Math.sqrt(1 - zq * zq);
        f.lines.push([P0(u, [-xq, zq]), P0(u, [xq, zq])]);
      }
      F.push(f);
    }
  } else {
    // alle anderen Dächer: Grundriss in Ringen zum Mittelpunkt hin stauchen
    for (let k = 0; k < R.length - 1; k++)
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        face([R[k][i], R[k][j], R[k + 1][j], R[k + 1][i]], 1);
      }
  }
  // Deckel (flaches Dach, Pultdach oder oberster Kuppelring)
  if (rs === 0 || rs === 6 || rs === 4) {
    const top = R[R.length - 1];
    const f = { i: top, n: rs === 6 ? newell(top.map(P)) : [0, 0, 1], kind: 2, holes: holeIdx };
    // München: flaches Hallendach mit aufgesetzten Oberlicht-Kästen quer über die Halle
    let pushed = false;
    if (rs === 0 && rec.lantern && area > 2000 && rectish && !holes.length) {
      F.push(f); // erst das Dach, dann die Aufbauten darauf
      pushed = true;
      const bandW = 4, gap = 13, hz = h + 2.6;
      const box = (u0, u1, v0, v1) => {
        const c = (u, v) => [(cu + u) * ux + (cv + v) * vx, (cu + u) * uy + (cv + v) * vy];
        const ring = [c(u0, v0), c(u1, v0), c(u1, v1), c(u0, v1)];
        const b = ring.map(([x, y]) => add(x, y, h)), t = ring.map(([x, y]) => add(x, y, hz));
        for (let i = 0; i < 4; i++) face([b[i], b[(i + 1) % 4], t[(i + 1) % 4], t[i]], 0);
        const topF = { i: t, n: [0, 0, 1], kind: 2, lines: [[add(...c((u0 + u1) / 2, v0), hz), add(...c((u0 + u1) / 2, v1), hz)]] };
        F.push(topF);
      };
      for (let u = -L / 2 + gap / 2; u < L / 2 - bandW; u += gap) box(u, u + bandW, -Wd * 0.44, Wd * 0.44);
    } else if (rs === 0 && st > 0 && area > 1500 && rectish && !holes.length) {
      // große flache Bahnhofsdächer: Oberlichtbänder quer über das Dach
      f.lines = [];
      const step = Math.max(6, Math.min(12, L / 14));
      for (let u = -L / 2 + step; u < L / 2 - step / 2; u += step) {
        const pa = (cu + u) * ux + (cv - Wd * 0.42) * vx, pb = (cu + u) * uy + (cv - Wd * 0.42) * vy;
        const qa = (cu + u) * ux + (cv + Wd * 0.42) * vx, qb = (cu + u) * uy + (cv + Wd * 0.42) * vy;
        f.lines.push([add(pa, pb, h), add(qa, qb, h)]);
      }
    }
    if (!pushed) F.push(f);
  }
  const [cx, cy] = centroid(outer);
  let rad = 0;
  for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(outer[2 * i] - cx, outer[2 * i + 1] - cy));
  const [wx, wy] = toW(cx, cy);
  return { V: new Float64Array(V), F, st, lo: outer, top: R[0], h: h / 1000, ze: ze / 1000, mh: mh / 1000, c: [wx, wy, h / 2000], lc: [cx, cy], rad: rad / 1000, area, floors: Math.max(0, Math.floor((ze - mh) / 3.2)) };
}

// ---------- Handgebaute Zusätze (Statuen, Pavillons) ----------
// Drehkörper aus Ringen [Radius in m, Höhe in m] von unten nach oben (Säulen, Figuren, Kugeln)
function latheMesh(toW, x, y, rings, seg = 14) {
  const V = [], F = [], idx = [];
  for (const [r, z] of rings) {
    const row = [];
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * Math.PI * 2, [X, Y] = toW(x + Math.cos(a) * r, y + Math.sin(a) * r);
      V.push(X, Y, z / 1000);
      row.push(V.length / 3 - 1);
    }
    idx.push(row);
  }
  const P = (i) => [V[3 * i], V[3 * i + 1], V[3 * i + 2]];
  const [cx0, cy0] = toW(x, y);
  const zs = rings.map((r) => r[1]), zmid = (Math.min(...zs) + Math.max(...zs)) / 2000;
  const face = (ids, kind) => {
    let pts = ids.map(P), n = newell(pts);
    let mx = 0, my = 0, mz = 0;
    for (const p of pts) { mx += p[0]; my += p[1]; mz += p[2]; }
    mx /= pts.length; my /= pts.length; mz /= pts.length;
    if (kind !== 2 && n[0] * (mx - cx0) + n[1] * (my - cy0) + n[2] * (mz - zmid) < 0) { ids = ids.slice().reverse(); n = n.map((v) => -v); }
    F.push({ i: ids, n, kind });
  };
  for (let j = 0; j < idx.length - 1; j++)
    for (let k = 0; k < seg; k++) {
      const k1 = (k + 1) % seg;
      if (rings[j][0] < 0.01 && rings[j + 1][0] < 0.01) continue;
      face([idx[j][k], idx[j][k1], idx[j + 1][k1], idx[j + 1][k]], 3);
    }
  const last = rings.length - 1;
  if (rings[last][0] >= 0.01) face(idx[last].slice(), 2);
  let wide = 0;
  rings.forEach((r, j) => { if (r[0] > rings[wide][0]) wide = j; });
  const R = rings[wide][0], lo = [];
  for (let k = 0; k < 12; k++) lo.push(x + Math.cos((k / 12) * Math.PI * 2) * R, y + Math.sin((k / 12) * Math.PI * 2) * R);
  const top = Math.max(...zs) / 1000, base = Math.min(...zs) / 1000;
  return { V: new Float64Array(V), F, st: 1, lo, top: idx[wide], h: top, ze: top, mh: base, c: [cx0, cy0, (top + base) / 2], lc: [x, y], rad: R / 1000, area: Math.PI * R * R, floors: 0 };
}
const sphereRings = (R, zc, n = 6) => Array.from({ length: n + 1 }, (_, k) => { const t = -Math.PI / 2 + (k / n) * Math.PI; return [Math.max(0.001, R * Math.cos(t)), zc + R * Math.sin(t)]; });
// Atlas mit der Weltkugel (Frankfurt Hbf): Sockel, Körper, Kopf, erhobene Arme, Kugel
function atlas(toW, x, y, z0, k = 1) {
  const out = [];
  const box = (cx, cy, w, d, zb, zt) => buildMesh([zt / 1000 * 1000, zb, 0, -1, -1, 0, 1, [cx - w / 2, cy - d / 2, cx + w / 2, cy - d / 2, cx + w / 2, cy + d / 2, cx - w / 2, cy + d / 2], []], toW);
  out.push(latheMesh(toW, x, y, [[3.4 * k, z0], [3.4 * k, z0 + 2.2 * k], [2.5 * k, z0 + 2.2 * k], [2.5 * k, z0 + 3.4 * k]], 16)); // Sockel
  const zb = z0 + 3.4 * k;
  out.push(latheMesh(toW, x, y, [[1.5 * k, zb], [1.2 * k, zb + 2.4 * k], [1.15 * k, zb + 3.2 * k], [0.7 * k, zb + 3.5 * k]], 12)); // Körper
  out.push(latheMesh(toW, x, y, sphereRings(0.62 * k, zb + 4.1 * k, 4), 10)); // Kopf
  for (const side of [-1, 1]) out.push(box(x, y + side * 1.15 * k, 0.55 * k, 0.55 * k, zb + 3.0 * k, zb + 6.4 * k)); // Arme
  out.push(latheMesh(toW, x, y, sphereRings(2.5 * k, zb + 8.6 * k, 8), 16)); // Weltkugel
  return out;
}
// Linien auf eine Fläche legen (Weltpunkte werden angehängt, Linien verweisen darauf); Segmente in lokalen Metern
function addLines(m, face, segs, toW) {
  if (!face || !segs.length) return;
  const n0 = m.V.length / 3, extra = [], lines = [];
  segs.forEach(([x1, y1, z1, x2, y2, z2], k) => {
    const [X1, Y1] = toW(x1, y1), [X2, Y2] = toW(x2, y2);
    extra.push(X1, Y1, z1 / 1000, X2, Y2, z2 / 1000);
    lines.push([n0 + 2 * k, n0 + 2 * k + 1]);
  });
  const V = new Float64Array(m.V.length + extra.length);
  V.set(m.V);
  V.set(extra, m.V.length);
  m.V = V;
  face.lines = (face.lines || []).concat(lines);
}
// Bezugssystem eines Pavillons: u zeigt aus der Fassade heraus (Richtung der Gleisachse), v läuft entlang der Fassade.
// Angabe entweder als c (lokale Meter) oder als uv im gedrehten System (rot in Grad gegen den Uhrzeigersinn ab Osten).
function frameOf(p) {
  const th = ((p.rot || 0) * Math.PI) / 180, U = [Math.cos(th), Math.sin(th)], V = [-Math.sin(th), Math.cos(th)];
  const c = p.uv ? [p.uv[0] * U[0] + p.uv[1] * V[0], p.uv[0] * U[1] + p.uv[1] * V[1]] : p.c;
  return { c, U, V, at: (du, dv) => [c[0] + du * U[0] + dv * V[0], c[1] + du * U[1] + dv * V[1]] };
}
// Mittelbau des Frankfurter Hauptbahnhofs: Bogenfenster mit Sprossen, drei Portale, Pilaster, Kranzgesims, Uhr im Giebel
function facadeArt(m, p, fr, toW) {
  const wall = [], gable = [], dF = p.d / 2 + 0.15;
  const seg = (list, a, za, b, zb) => { const [x1, y1] = fr.at(dF, a), [x2, y2] = fr.at(dF, b); list.push([x1, y1, za, x2, y2, zb]); };
  const arc = (list, cy, cz, r, a0, a1, n = 14) => {
    let py = cy + r * Math.cos(a0), pz = cz + r * Math.sin(a0);
    for (let k = 1; k <= n; k++) { const a = a0 + ((a1 - a0) * k) / n, qy = cy + r * Math.cos(a), qz = cz + r * Math.sin(a); seg(list, py, pz, qy, qz); py = qy; pz = qz; }
  };
  const hw = p.w / 2, ze = p.h - Math.min(12, p.w * 0.35); // Traufhöhe
  const zs = 17, r = 7.5, yc = 0;
  for (const [rr, zb] of [[r, 5.5], [r + 1.3, 4.8]]) { seg(wall, yc - rr, zb, yc - rr, zs); seg(wall, yc + rr, zb, yc + rr, zs); arc(wall, yc, zs, rr, 0, Math.PI); }
  seg(wall, yc - r - 1.3, 4.8, yc + r + 1.3, 4.8);
  for (const dy of [-2.5, 0, 2.5]) seg(wall, yc + dy, 5.5, yc + dy, zs + Math.sqrt(r * r - dy * dy));
  for (const z of [9.5, 13.5]) seg(wall, yc - r, z, yc + r, z);
  for (const a of [Math.PI / 6, Math.PI / 3, (2 * Math.PI) / 3, (5 * Math.PI) / 6]) seg(wall, yc, zs, yc + r * Math.cos(a), zs + r * Math.sin(a));
  for (const cy of [yc - 11, yc, yc + 11]) { seg(wall, cy - 2.2, 0, cy - 2.2, 2.2); seg(wall, cy + 2.2, 0, cy + 2.2, 2.2); arc(wall, cy, 2.2, 2.2, 0, Math.PI, 8); seg(wall, cy, 0, cy, 4.4); }
  for (const off of [-19.5, -14, 14, 19.5]) { if (Math.abs(off) > hw - 1) continue; seg(wall, yc + off, 0, yc + off, ze - 1.5); seg(wall, yc + off - 0.8, ze - 1.5, yc + off + 0.8, ze - 1.5); }
  for (const z of [ze - 0.9, ze - 0.2]) seg(wall, -hw, z, hw, z);
  const zc = ze + 4.5, rc = 3.1;
  arc(gable, yc, zc, rc, 0, Math.PI * 2, 22);
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; seg(gable, yc + 2.5 * Math.cos(a), zc + 2.5 * Math.sin(a), yc + rc * Math.cos(a), zc + rc * Math.sin(a)); }
  seg(gable, yc, zc, yc, zc + 2.3);
  seg(gable, yc, zc, yc + 1.5 * Math.cos(-Math.PI / 6), zc + 1.5 * Math.sin(-Math.PI / 6));
  seg(gable, -hw + 2.4, ze + 0.6, yc, p.h - 1.7);
  seg(gable, yc, p.h - 1.7, hw - 2.4, ze + 0.6);
  const duOf = ([x, y]) => (x - fr.c[0]) * fr.U[0] + (y - fr.c[1]) * fr.U[1];
  const front = m.F.find((f) => f.kind === 0 && f.a && Math.abs(duOf(f.a) - p.d / 2) < 0.1 && Math.abs(duOf(f.b) - p.d / 2) < 0.1);
  const tri = m.F.find((f) => f.kind === 1 && f.i.length === 3 && f.n[0] * fr.U[0] + f.n[1] * fr.U[1] > 0.5);
  if (front) front.plain = true; // das Fensterraster entfällt, die Fassade ist gezeichnet
  addLines(m, front, wall, toW);
  addLines(m, tri, gable, toW);
}
// Turm: gestufter Schaft mit Fensterraster, Gesims, Glockengeschoss mit Bogenöffnungen, zweites Gesims, Eckfialen,
// Pyramidendach und Spitze. p = { uv/c, rot, w: Kantenlänge, h: Gesamthöhe bis zur Dachspitze }
function addTower(out, p, toW) {
  const fr = frameOf(p), s = p.w, h = p.h;
  const sq = (size, du0 = 0, dv0 = 0) => { const a = size / 2, r = []; for (const [du, dv] of [[-a, -a], [a, -a], [a, a], [-a, a]]) r.push(...fr.at(du0 + du, dv0 + dv)); return r; };
  const box = (size, zb, zt, du0 = 0, dv0 = 0) => buildMesh([zt, zb, 0, -1, -1, 0, 1, sq(size, du0, dv0), []], toW);
  const zs = h * 0.54, zc = zs + 1.4, zb2 = zc + h * 0.17;
  out.buildings.push(box(s, 0, zs)); // Schaft
  out.buildings.push(box(s + 1.6, zs, zc)); // Gesims
  const bel = box(s - 1.6, zc, zb2); // Glockengeschoss
  const hw = (s - 1.6) / 2;
  for (const f of bel.F) {
    if (f.kind !== 0 || !f.a) continue;
    const mx = (f.a[0] + f.b[0]) / 2 - fr.c[0], my = (f.a[1] + f.b[1]) / 2 - fr.c[1], l = Math.hypot(mx, my) || 1;
    const nx = mx / l, ny = my / l, tx = -ny, ty = nx;
    const P = (t, z) => [fr.c[0] + nx * (hw + 0.15) + tx * t, fr.c[1] + ny * (hw + 0.15) + ty * t, z];
    const segs = [], seg = (t1, z1, t2, z2) => segs.push([...P(t1, z1), ...P(t2, z2)]);
    const zbase = zc + 1.2, ztop = zb2 - 1.6;
    for (const c of [-1.7, 1.7]) {
      const r = 0.95, zspr = ztop - r;
      seg(c - r, zbase, c - r, zspr); seg(c + r, zbase, c + r, zspr); seg(c - r, zbase, c + r, zbase);
      let pt = c + r, pz = zspr;
      for (let k = 1; k <= 8; k++) { const a = (k / 8) * Math.PI, qt = c + r * Math.cos(a), qz = zspr + r * Math.sin(a); seg(pt, pz, qt, qz); pt = qt; pz = qz; }
      seg(c, zbase, c, zspr + r); // Mittelsprosse
      for (const z of [zbase + 0.8, zbase + 1.6]) seg(c - r, z, c + r, z); // Schalllamellen
    }
    seg(-hw + 0.4, zb2 - 0.5, hw - 0.4, zb2 - 0.5);
    f.plain = true;
    addLines(bel, f, segs, toW);
  }
  out.buildings.push(bel);
  out.buildings.push(box(s - 0.6, zb2, zb2 + 1.0)); // oberes Gesims
  const zr = zb2 + 1.0, a = (s - 0.6) / 2 - 0.55;
  out.buildings.push(buildMesh([h, zr, 3, h - zr, -1, 0, 1, sq(s - 1.0), []], toW)); // Pyramidendach
  for (const [du, dv] of [[-a, -a], [a, -a], [a, a], [-a, a]]) out.buildings.push(buildMesh([zr + 3.6, zr, 3, 2.3, -1, 0, 1, sq(1.0, du, dv), []], toW)); // Eckfialen
  const [fx, fy] = fr.at(0, 0);
  out.buildings.push(latheMesh(toW, fx, fy, sphereRings(0.55, h + 0.5, 4), 8)); // Knauf
  out.buildings.push(latheMesh(toW, fx, fy, [[0.16, h + 0.9], [0.05, h + 3.6]], 6)); // Spitze
}
// Pavillons, Flügelbauten und Türme: p = { c oder uv, rot, w: Breite entlang der Fassade, d: Tiefe, h: Höhe bis First/Spitze,
// rs: Dachform (1 Giebel zur Fassade, 2 Walm, 3 Zelt), rh: Dachhöhe, atlas: Statuengruppe, art: Fassadenzeichnung }
function addPavilion(out, p, toW) {
  if (p.tower) return addTower(out, p, toW);
  const fr = frameOf(p), rs = p.rs ?? 1;
  const ring = [];
  for (const [du, dv] of [[-p.d / 2, -p.w / 2], [p.d / 2, -p.w / 2], [p.d / 2, p.w / 2], [-p.d / 2, p.w / 2]]) ring.push(...fr.at(du, dv));
  const m = buildMesh([p.h, 0, rs, p.rh ?? -1, -1, rs === 1 ? 1 : 0, 1, ring, []], toW); // Giebel: First quer zur Fassade (Hauptachse der Fläche + 90°)
  out.buildings.push(m);
  if (p.art) facadeArt(m, p, fr, toW);
  if (p.atlas) {
    const top = m.h * 1000, [ax, ay] = fr.at(p.d * 0.25, 0);
    out.buildings.push(...atlas(toW, ax, ay, top, 1));
    for (const side of [-1, 1]) { const [bx, by] = fr.at(p.d * 0.25, side * p.w * 0.42); out.buildings.push(...atlas(toW, bx, by, top - 1.5, 0.45)); }
  }
}

// Höhen korrigieren: Bahnhofsgebäude, die in OSM ohne (oder mit unplausibler) Höhe erfasst sind,
// bekommen eine realistische Höhe; dazu gezielte Werte je Bahnhof (boost: Kreis in lokalen Metern + Höhe)
function fixHeight(rec, opts) {
  const boost = opts.boost;
  rec.rise = opts.rise;
  const o = rec[7], n = o.length / 2;
  let cx = 0, cy = 0;
  for (let i = 0; i < n; i++) { cx += o[2 * i]; cy += o[2 * i + 1]; }
  cx /= n; cy /= n;
  let boosted = false;
  for (const bo of boost || []) {
    if (Math.hypot(cx - bo.c[0], cy - bo.c[1]) < bo.r && rec[2] !== 5) {
      rec[0] = Math.max(rec[0], bo.h);
      if (bo.roof) { rec[2] = bo.roof; rec[3] = bo.rh ?? -1; }
      boosted = true;
      break;
    }
  }
  if (!boosted && rec[6] === 1 && rec[2] === 0 && rec[0] < 18 && Math.abs(signedArea(o)) > 400) rec[0] = 20;
  // Markante Bahnhofsdächer: in OSM sind viele Hallen flach erfasst. Lange, große Bahnhofsbauten bekommen
  // ein Tonnendach (Bahnsteighalle), kleine schlichte Empfangsgebäude ein Walmdach.
  // je Bahnhof nach dem echten Vorbild: halls = Bogenhallen erlaubt, hips = Walmdächer, lanterns = Oberlichter
  if (rec[6] > 0 && rec[2] === 0 && opts.lanterns) rec.lantern = true;
  if (rec[6] > 0 && rec[2] === 0 && (opts.halls !== false || opts.hips !== false)) {
    const s = simplifyRing(o, 0.8), a = principalAxis(s);
    const ux = Math.cos(a), uy = Math.sin(a);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let i = 0; i < s.length; i += 2) {
      const u = s[i] * ux + s[i + 1] * uy, v = -s[i] * uy + s[i + 1] * ux;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    const L = u1 - u0, Wd = v1 - v0, area = Math.abs(signedArea(s)), rect = area / Math.max(1, L * Wd);
    if (opts.halls !== false && area > 1500 && L / Wd > 1.5 && rect > 0.78 && Wd > 14) {
      rec[2] = 5;
      rec[3] = Math.min(Wd * 0.2, 15);
      rec[0] = Math.max(rec[0], rec[1] + 6) + rec[3];
    } else if (opts.hips !== false && rec[6] === 1 && area > 250 && s.length / 2 <= 8 && rect > 0.82 && Wd < 40) {
      rec[2] = 2;
      rec[3] = Math.min(5, Wd * 0.28);
      rec[0] += rec[3];
    }
  }
}

// Stadtdatei laden: wenn möglich in einem Worker (Parsen blockiert dort nicht die Kamerafahrt), sonst im Hauptthread.
// Liefert die Teile ("b", "road", "rail", "water", "wa") portionsweise an on(part, daten).
let worker, wid = 0;
const waiting = new Map();
function getWorker() {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL("./city-worker.js", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }) => waiting.get(data.id)?.(data);
    worker.onerror = () => { worker = null; for (const f of waiting.values()) f({ type: "error" }); };
  } catch { worker = null; }
  return worker;
}
async function fetchCity(key, batch, on) {
  const url = `data/city/${file(key)}.json`;
  const wk = getWorker();
  if (wk) {
    const id = ++wid;
    const ok = await new Promise((res) => {
      waiting.set(id, (m) => {
        if (m.type === "none") { waiting.delete(id); res(false); }
        else if (m.type === "error") { waiting.delete(id); res(null); }
        else if (m.type === "end") { waiting.delete(id); res(true); }
        else on(m.type, m.v);
      });
      wk.postMessage({ id, url: new URL(url, document.baseURI).href, batch }); // im Worker zählt sonst src/ als Basis
    });
    if (ok !== null) return ok;
    // Worker nicht nutzbar: Teile verwerfen und im Hauptthread laden
  }
  const r = await fetch(url);
  if (!r.ok) return false;
  const d = await r.json();
  for (const part of ["rail", "b", "road", "water", "wa"]) on(part, d[part] || []);
  return true;
}

// Gestapelte Bauteile (Türme in OSM: je Geschossgruppe ein Teil mit gleichem Grundriss) zu einem Gebäude zusammenfassen.
// Beginnt der Turm erst in der Luft und liegt darunter nichts, wird er bis zum Boden verlängert (er schwebt sonst).
async function buildParts(parts, out, opts, toW, slice) {
  const key = (r) => {
    const o = r[7], n = o.length / 2;
    let cx = 0, cy = 0;
    for (let i = 0; i < n; i++) { cx += o[2 * i]; cy += o[2 * i + 1]; }
    return `${Math.round(cx / n / 8)}|${Math.round(cy / n / 8)}|${Math.round(Math.abs(signedArea(o)) / 150)}`; // Geschosse liegen oft ein paar Meter versetzt
  };
  const groups = new Map();
  for (const r of parts) { const k = key(r); (groups.get(k) || groups.set(k, []).get(k)).push(r); }
  const supported = (x, y, z) => out.buildings.some((m) => m.h * 1000 >= z - 1 && Math.abs(m.lc[0] - x) < m.rad * 1000 && Math.abs(m.lc[1] - y) < m.rad * 1000 && inRing(x, y, m.lo));
  for (const g of groups.values()) {
    g.sort((a, b) => a[1] - b[1]);
    const chains = [];
    for (const r of g) {
      const last = chains[chains.length - 1];
      if (last && r[1] <= last.top + 0.6) { last.top = Math.max(last.top, r[0]); last.rec = r[0] >= last.rec[0] ? [r[0], last.rec[1], ...r.slice(2)] : last.rec; }
      else chains.push({ top: r[0], rec: r.slice() });
    }
    for (const c of chains) {
      await slice();
      const rec = c.rec;
      const o = rec[7], n = o.length / 2;
      let cx = 0, cy = 0;
      for (let i = 0; i < n; i++) { cx += o[2 * i]; cy += o[2 * i + 1]; }
      cx /= n; cy /= n;
      if (rec[1] > 5 && !supported(cx, cy, rec[1])) rec[1] = 0; // nichts darunter: bis zum Boden
      fixHeight(rec, opts);
      try { out.buildings.push(buildMesh(rec, toW)); } catch { /* kaputte Geometrie überspringen */ }
    }
  }
}
function inRing(x, y, p) {
  let c = false;
  for (let i = 0, j = p.length / 2 - 1; i < p.length / 2; j = i++) {
    const xi = p[2 * i], yi = p[2 * i + 1], xj = p[2 * j], yj = p[2 * j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi) c = !c;
  }
  return c;
}

// perf.chunk: Gebäude pro Portion (kleiner = ruhigere Kamerafahrt); perf.minArea: kleinere Nebengebäude (m²) weglassen
export async function loadCity(key, w, kx, opts = {}, perf = {}) {
  const chunk = perf.chunk || 250, minArea = perf.minArea || 0;
  const toW = (x, y) => [w[0] + (x / 1000) * kx, w[1] + y / 1000];
  const pts = (arr, off = 0) => {
    const m = (arr.length - off) / 2, g = new Float64Array(m * 2);
    for (let i = 0; i < m; i++) {
      const [X, Y] = toW(arr[off + 2 * i], arr[off + 2 * i + 1]);
      g[2 * i] = X; g[2 * i + 1] = Y;
    }
    return g;
  };
  const out = { buildings: [], road: [], rail: [], water: [], wa: [], toW };
  // Aufräumen rund um den Bahnhof (350 m): winzige Splitter und kleine Bauten direkt auf den Gleisen gibt es in
  // Wirklichkeit nicht (OSM-Reste, Stellwerke und Bahnsteigdächer sind als Bahnhofsteile gekennzeichnet und bleiben)
  const rcell = 20, rgrid = new Map();
  const addRail = (l) => {
    for (let i = 0; i + 3 < l.length; i += 2) {
      const ax = l[i], ay = l[i + 1], bx = l[i + 2], by = l[i + 3], n = Math.max(1, Math.floor(Math.hypot(bx - ax, by - ay) / rcell) + 1);
      for (let k = 0; k <= n; k++) {
        const key = Math.floor((ax + ((bx - ax) * k) / n) / rcell) * 8191 + Math.floor((ay + ((by - ay) * k) / n) / rcell);
        (rgrid.get(key) || rgrid.set(key, []).get(key)).push(ax, ay, bx, by);
      }
    }
  };
  const onRail = (x, y, tol) => {
    const gx = Math.floor(x / rcell), gy = Math.floor(y / rcell);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const a = rgrid.get((gx + i) * 8191 + gy + j);
      if (!a) continue;
      for (let t = 0; t < a.length; t += 4) {
        const dx = a[t + 2] - a[t], dy = a[t + 3] - a[t + 1], L = dx * dx + dy * dy;
        const u = L ? clampN(((x - a[t]) * dx + (y - a[t + 1]) * dy) / L, 0, 1) : 0;
        if (Math.hypot(x - a[t] - u * dx, y - a[t + 1] - u * dy) < tol) return true;
      }
    }
    return false;
  };
  const phantom = (rec) => {
    if (rec[6] > 0) return false;
    const o = rec[7], n = o.length / 2;
    let cx = 0, cy = 0;
    for (let i = 0; i < n; i++) { cx += o[2 * i]; cy += o[2 * i + 1]; }
    cx /= n; cy /= n;
    if (Math.hypot(cx, cy) > 350) return false;
    const a = Math.abs(signedArea(o));
    return a < 15 || (a < 400 && onRail(cx, cy, 3.5));
  };
  // Arbeit in Zeitscheiben von ca. 4 ms: danach gibt der Aufbau die Hand ab, damit zwischen den Bildern nie lange
  // gerechnet wird (feste Gebäudezahlen pro Portion wurden bei großen Städten zu langen Pausen)
  const todo = [];
  const parts = [];
  let wake = null;
  const done = fetchCity(key, chunk, (part, v) => { todo.push([part, v]); wake?.(); });
  let t0 = performance.now();
  const slice = async () => { if (performance.now() - t0 > 4) { await yieldNow(); t0 = performance.now(); } };
  const work = async () => {
    for (;;) {
      const item = todo.shift();
      if (!item) {
        if (await Promise.race([done.then(() => true), new Promise((r) => (wake = () => r(false)))])) { if (!todo.length) return; }
        continue;
      }
      const [part, v] = item;
      if (part === "b") {
        for (const rec of v) {
          await slice();
          if (rec[0] <= 2 || rec[7].length < 6) continue;
          if (phantom(rec)) continue;
          // kleine Nebengebäude erst weit vom Bahnhof weglassen (nahe Bebauung bleibt vollständig)
          if (minArea && rec[6] === 0 && Math.hypot(rec[7][0], rec[7][1]) > 450 && Math.abs(signedArea(rec[7])) < minArea) continue;
          if (rec[1] > 0.5 && rec[6] === 0) { parts.push(rec); continue; } // Bauteile mit Mindesthöhe: unten zusammenfassen
          fixHeight(rec, opts);
          try { out.buildings.push(buildMesh(rec, toW)); } catch { /* kaputte Geometrie überspringen */ }
        }
      } else if (part === "rail") for (const l of v) { addRail(l); await slice(); out.rail.push({ g: pts(l), cls: 0 }); }
      else if (part === "road") for (const l of v) { await slice(); out.road.push({ g: pts(l, 1), cls: l[0] }); }
      else if (part === "water") for (const l of v) { await slice(); out.water.push({ g: pts(l), cls: 0 }); }
      else if (part === "wa") for (const [o, hs] of v) { await slice(); out.wa.push([pts(o), ...hs.map((h) => pts(h))]); }
    }
  };
  const found = await Promise.all([done, work()]).then(([f]) => f);
  if (found) await buildParts(parts, out, opts, toW, slice);
  if (found) for (const p of [opts.pavilion, ...(opts.extras || [])]) if (p) addPavilion(out, p, toW);
  return found ? out : null;
}

// kurz an den Browser abgeben (Nachrichtenkanal statt setTimeout: keine 4-ms-Mindestpause)
const yieldChannel = new MessageChannel();
const yieldNow = () => new Promise((r) => { yieldChannel.port1.onmessage = () => r(); yieldChannel.port2.postMessage(0); });

// Der Bahnhof selbst: alle als Bahnhof gekennzeichneten Gebäude in der Nähe; dazu Mitte, Achsen und Ausdehnung
export function stationCluster(city, spot) {
  if (spot) {
    // fest eingestellt: alle (oder alle als Bahnhof markierten) Gebäude in einem Kreis
    const inR = spot.rect
      ? (b) => b.lc[0] > spot.rect[0] && b.lc[0] < spot.rect[2] && b.lc[1] > spot.rect[1] && b.lc[1] < spot.rect[3]
      : (b) => Math.hypot(b.lc[0] - spot.c[0], b.lc[1] - spot.c[1]) < spot.r;
    for (const b of city.buildings) b.station = inR(b) && (spot.all || b.st > 0);
    if (!city.buildings.some((b) => b.station)) for (const b of city.buildings) b.station = Math.hypot(b.lc[0] - spot.c[0], b.lc[1] - spot.c[1]) < spot.r * 0.5;
    return city.buildings.filter((b) => b.station);
  }
  const dist = (b) => Math.hypot(b.lc[0], b.lc[1]);
  // Keim: das als Bahnhof gekennzeichnete Gebäude, das dem Stationspunkt am nächsten liegt
  // (nicht alle "Gare"-Gebäude der Stadt, sonst zählt z. B. Lille Flandres mit)
  const cand = city.buildings.filter((b) => b.st === 1 && dist(b) < 400).sort((a, b) => dist(a) - dist(b));
  let seed = cand[0];
  if (!seed) seed = city.buildings.filter((b) => b.st === 2 && dist(b) < 300).sort((a, b) => dist(a) - dist(b))[0];
  if (!seed) seed = city.buildings.slice().sort((a, b) => dist(a) - dist(b))[0];
  for (const b of city.buildings) b.station = false;
  if (!seed) return [];
  const near = (b, r) => Math.hypot(b.lc[0] - seed.lc[0], b.lc[1] - seed.lc[1]) < r + seed.rad * 1000;
  for (const b of city.buildings) {
    if (b === seed || (b.st === 1 && near(b, 140)) || (b.st === 2 && near(b, 220))) b.station = true;
  }
  return city.buildings.filter((b) => b.station);
}
