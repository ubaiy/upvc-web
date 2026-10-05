/**
 * design-3d member geometry — pure functions, no three.js.
 *
 * A member is its profile section swept along a path in the face plane
 * (x along the sill, y up, z = the outward normal; depth runs to −z). At
 * every path vertex the section ring lies ON the plane that bisects the two
 * bars meeting there, so a 90° corner gives an exact 45° mitre and any
 * other angle its own mitre, without CSG. A curved bar (arch head, ring) is
 * the same sweep along a tessellated arc, shaded smooth along its run.
 *
 * Output is a triangle soup: 9 numbers per triangle in `positions`, the
 * matching vertex normals in `normals`.
 */

import { ProfileSection } from './profile-section';

export interface P2 {
  x: number;
  y: number;
}

export interface Geo {
  positions: number[];
  normals: number[];
}

export interface SweepOptions {
  /** Closed loop (frame, sash) or an open run with square, capped ends. */
  closed: boolean;
  /** z of the section's outside face (d = 0). */
  zOutside: number;
  /**
   * True at a vertex where one bar ends and the next begins (a corner).
   * Vertices without a break are joints inside one curved bar. Default:
   * every vertex is a break.
   */
  breaks?: boolean[];
}

type V3 = [number, number, number];

export function emptyGeo(): Geo {
  return { positions: [], normals: [] };
}

export function triangleCount(geo: Geo): number {
  return geo.positions.length / 9;
}

/** Push one triangle, turned so that it faces along `n`. */
function pushTri(geo: Geo, a: V3, b: V3, c: V3, na: V3, nb: V3, nc: V3): void {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const cx = uy * vz - uz * vy;
  const cy = uz * vx - ux * vz;
  const cz = ux * vy - uy * vx;
  const facing = cx * (na[0] + nb[0] + nc[0]) + cy * (na[1] + nb[1] + nc[1]) + cz * (na[2] + nb[2] + nc[2]);
  if (facing >= 0) {
    geo.positions.push(...a, ...b, ...c);
    geo.normals.push(...na, ...nb, ...nc);
  } else {
    geo.positions.push(...a, ...c, ...b);
    geo.normals.push(...na, ...nc, ...nb);
  }
}

function signedArea(path: P2[]): number {
  let acc = 0;
  for (let i = 0; i < path.length; i++) {
    const a = path[i];
    const b = path[(i + 1) % path.length];
    acc += a.x * b.y - b.x * a.y;
  }
  return acc / 2;
}

/** Drop a vertex that repeats its predecessor (and the closing duplicate). */
function clean(path: P2[], closed: boolean, breaks?: boolean[]): { pts: P2[]; brk: boolean[] } {
  const pts: P2[] = [];
  const brk: boolean[] = [];
  path.forEach((p, i) => {
    const prev = pts[pts.length - 1];
    if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) < 1e-6) {
      if (breaks?.[i]) brk[brk.length - 1] = true;
      return;
    }
    pts.push(p);
    brk.push(breaks ? breaks[i] === true : true);
  });
  if (closed && pts.length > 1) {
    const a = pts[0];
    const z = pts[pts.length - 1];
    if (Math.hypot(a.x - z.x, a.y - z.y) < 1e-6) {
      if (brk[brk.length - 1]) brk[0] = true;
      pts.pop();
      brk.pop();
    }
  }
  return { pts, brk };
}

/**
 * Sweep `section` along `path`. Returns one Geo per bar: the path is cut
 * into bars at its `breaks`. For a closed path the section's y points to
 * the inside of the loop; for an open path it points to the LEFT of the
 * direction of travel.
 */
export function sweepSection(path: P2[], section: ProfileSection, opts: SweepOptions): Geo[] {
  const { pts, brk } = clean(path, opts.closed, opts.breaks);
  const n = pts.length;
  if (n < 2 || (opts.closed && n < 3)) return [];
  const closed = opts.closed;
  const segCount = closed ? n : n - 1;
  const left = closed ? signedArea(pts) >= 0 : true;

  // Per segment: unit direction and the unit normal towards the glass.
  const dir: P2[] = [];
  const inw: P2[] = [];
  for (let i = 0; i < segCount; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    dir.push(d);
    inw.push(left ? { x: -d.y, y: d.x } : { x: d.y, y: -d.x });
  }

  // Per vertex: the mitre vector. A point `y` mm in from the outer edge sits at
  // vertex + mitre × y, which is on the bisecting plane of the two bars.
  const mitre: P2[] = [];
  for (let i = 0; i < n; i++) {
    const before = closed ? inw[(i - 1 + segCount) % segCount] : inw[i - 1];
    const after = closed ? inw[i % segCount] : inw[i];
    if (before && after) {
      const k = 1 + before.x * after.x + before.y * after.y;
      mitre.push(k > 1e-6 ? { x: (before.x + after.x) / k, y: (before.y + after.y) / k } : after);
    } else {
      mitre.push((before ?? after) as P2);
    }
  }

  const outline = section.outline;
  const K = outline.length;
  const ring = (i: number, k: number): V3 => {
    const [d, y] = outline[k];
    return [pts[i].x + mitre[i].x * y, pts[i].y + mitre[i].y * y, opts.zOutside - d];
  };
  // Outward normal of each section edge, in (d, y).
  const edgeN: P2[] = outline.map((p, k) => {
    const q = outline[(k + 1) % K];
    const ex = q[0] - p[0];
    const ey = q[1] - p[1];
    const len = Math.hypot(ex, ey) || 1;
    return { x: ey / len, y: -ex / len };
  });
  const normalAt = (vertex: number, seg: number, k: number): V3 => {
    let across = inw[seg];
    if (!brk[vertex]) {
      const m = mitre[vertex];
      const len = Math.hypot(m.x, m.y) || 1;
      across = { x: m.x / len, y: m.y / len };
    }
    return [across.x * edgeN[k].y, across.y * edgeN[k].y, -edgeN[k].x];
  };

  // Bars: a new one starts at each break (an open path also starts at 0).
  const start = closed ? Math.max(0, brk.indexOf(true)) : 0;
  const bars: Geo[] = [];
  let current: Geo | null = null;
  for (let s = 0; s < segCount; s++) {
    const i = (start + s) % n;
    const j = (i + 1) % n;
    if (!current || brk[i]) {
      current = emptyGeo();
      bars.push(current);
    }
    for (let k = 0; k < K; k++) {
      const k2 = (k + 1) % K;
      const a = ring(i, k);
      const b = ring(j, k);
      const c = ring(j, k2);
      const d = ring(i, k2);
      const ni = normalAt(i, i, k);
      const nj = normalAt(j, i, k);
      pushTri(current, a, b, c, ni, nj, nj);
      pushTri(current, a, c, d, ni, nj, ni);
    }
    if (!closed && (s === 0 || s === segCount - 1)) {
      const ends: [number, number][] = [];
      if (s === 0) ends.push([i, -1]);
      if (s === segCount - 1) ends.push([j, 1]);
      for (const [v, sign] of ends) {
        const nrm: V3 = [dir[i].x * sign, dir[i].y * sign, 0];
        for (let k = 1; k < K - 1; k++) {
          pushTri(current, ring(v, 0), ring(v, k), ring(v, k + 1), nrm, nrm, nrm);
        }
      }
    }
  }
  return bars;
}

/**
 * A flat plate: the convex polygon `poly` (face plane) from zFront down to
 * zBack. Used for glass, mesh, dividers, glazing bars, rails and handles.
 */
export function extrudePolygon(poly: P2[], zFront: number, zBack: number): Geo {
  const geo = emptyGeo();
  const { pts } = clean(poly, true);
  const n = pts.length;
  if (n < 3) return geo;
  const front: V3 = [0, 0, 1];
  const back: V3 = [0, 0, -1];
  const at = (i: number, z: number): V3 => [pts[i].x, pts[i].y, z];
  for (let i = 1; i < n - 1; i++) {
    pushTri(geo, at(0, zFront), at(i, zFront), at(i + 1, zFront), front, front, front);
    pushTri(geo, at(0, zBack), at(i, zBack), at(i + 1, zBack), back, back, back);
  }
  const outward = signedArea(pts) >= 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = pts[j].x - pts[i].x;
    const dy = pts[j].y - pts[i].y;
    const len = Math.hypot(dx, dy) || 1;
    const nrm: V3 = [(outward * dy) / len, (-outward * dx) / len, 0];
    pushTri(geo, at(i, zFront), at(j, zFront), at(j, zBack), nrm, nrm, nrm);
    pushTri(geo, at(i, zFront), at(j, zBack), at(i, zBack), nrm, nrm, nrm);
  }
  return geo;
}

/** Axis-aligned box as a plate. */
export function boxGeo(x0: number, y0: number, x1: number, y1: number, zFront: number, zBack: number): Geo {
  return extrudePolygon(
    [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ],
    zFront,
    zBack
  );
}

export interface Bounds {
  min: V3;
  max: V3;
}

export function boundsOf(geos: Geo[]): Bounds {
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const g of geos) {
    for (let i = 0; i < g.positions.length; i += 3) {
      for (let a = 0; a < 3; a++) {
        const v = g.positions[i + a];
        if (v < min[a]) min[a] = v;
        if (v > max[a]) max[a] = v;
      }
    }
  }
  return { min, max };
}
