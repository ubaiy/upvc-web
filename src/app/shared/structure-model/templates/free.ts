/**
 * A structure drawn from nothing (card T169): the user's own plan, a polygon
 * on the floor (footprint.ts), with a wall on every side and one roof over it.
 *
 * It is a generator like the others, so sizes, undo, the price and the save
 * go the same way. Its parameters are the plan and the state of each side as
 * text, the wall height, the panel width and the roof. A side is a wall
 * ('w'), open ('o': posts and a beam, nothing between) or against the
 * existing building ('h': nothing but a wall plate under the roof).
 *
 * Every roof is made of flat panels: a plan with inward corners is cut at
 * every corner line (footprint.slabsOf), so no pane is ever bent.
 */

import { StructureBuilder, evenParts } from '../builder';
import {
  clipConvex,
  commonIntervals,
  distP,
  formatPlan,
  gableRidges,
  highSides,
  longestSide,
  orientPlan,
  parsePlan,
  planCentroid,
  planProblem,
  Pt,
  rectanglePlan,
  regularPlan,
  RoofKind,
  roofsFor,
  roofsOffered,
  sideFrame,
  slabsOf,
  withoutStraightCorners,
} from '../footprint';
import { Dim, num, paramDim, str, TemplateDef } from '../template';
import { FaceFill, Params, Structure, Vec3 } from '../types';
import { clamp, DEG } from '../vec';
import { domeShape } from './dome';

export const FREE_KIND = 'free';
const DEFAULT_PLAN = formatPlan(rectanglePlan(3600, 2400));

export const ROOF_LABEL: Record<RoofKind, string> = {
  none: 'No roof',
  flat: 'Flat',
  leanto: 'Lean-to',
  gable: 'Gable',
  hipped: 'Hipped',
  pyramid: 'Pyramid',
  dome: 'Dome',
};

/** Why a roof is not offered on a plan, in plain words ('' when it is). */
export function roofRefusal(plan: Pt[], roof: RoofKind): string {
  if (roofsOffered(plan).includes(roof)) return '';
  if (roof === 'gable') return 'A gable needs roof on both sides of its ridge; a part of this plan would get one slope only. Use a lean-to or a flat roof.';
  if (roof === 'dome') return 'A dome needs a regular plan of 5 sides or more (use "Round / regular").';
  if (roof === 'leanto') return 'A lean-to needs one straight side that the whole plan lies behind.';
  return `A ${ROOF_LABEL[roof].toLowerCase()} roof needs a plan with no inward corner.`;
}

/** The plan of a structure's parameters, in the stored direction. */
export function planOf(p: Params): Pt[] {
  const pts = parsePlan(p['plan']);
  return pts.length >= 3 ? pts : parsePlan(DEFAULT_PLAN);
}

/** One letter a side: 'w' wall, 'o' open, 'h' against the existing building. */
export function wallStates(p: Params, sides: number): string {
  const raw = typeof p['walls'] === 'string' ? (p['walls'] as string) : '';
  let out = '';
  for (let i = 0; i < sides; i++) out += raw[i] === 'o' || raw[i] === 'h' ? raw[i] : 'w';
  return out;
}

/** The ridge of a gable: its direction, the direction across it and where it lies across. */
function ridgeOf(plan: Pt[], p: Params): { along: Pt; across: Pt; mid: number; half: number } {
  const long = sideFrame(plan, longestSide(plan)).dir;
  const along: Pt = str(p, 'ridge') === 'across' ? [-long[1], long[0]] : long;
  const across: Pt = [-along[1], along[0]];
  const ts = plan.map((q) => q[0] * across[0] + q[1] * across[1]);
  const lo = Math.min(...ts);
  const hi = Math.max(...ts);
  return { along, across, mid: (lo + hi) / 2, half: (hi - lo) / 2 };
}

/** The height of the top of the walls (the roof's edge) over a point of the plan. */
export function eaveHeight(plan: Pt[], p: Params): (q: Pt) => number {
  const h = num(p, 'height');
  const roof = str(p, 'roof');
  const slope = Math.tan(num(p, 'pitch') * DEG);
  if (roof === 'leanto') {
    const i = Number(str(p, 'highSide')) - 1;
    const { out } = sideFrame(plan, i);
    const depth = (q: Pt): number => -((q[0] - plan[i][0]) * out[0] + (q[1] - plan[i][1]) * out[1]);
    const far = Math.max(...plan.map(depth));
    return (q) => h + slope * (far - depth(q));
  }
  if (roof === 'gable') {
    const r = ridgeOf(plan, p);
    return (q) => h + slope * (r.half - Math.abs(q[0] * r.across[0] + q[1] * r.across[1] - r.mid));
  }
  return () => h;
}

function generate(p: Params): Structure {
  const plan = planOf(p);
  const n = plan.length;
  const h = num(p, 'height');
  const module = num(p, 'module');
  const roof = str(p, 'roof') as RoofKind;
  const states = wallStates(p, n);
  const top = eaveHeight(plan, p);
  const centre = planCentroid(plan);
  const b = new StructureBuilder([centre[0], h / 2, centre[1]]);
  const at = (q: Pt, y: number): Vec3 => [q[0], y, q[1]];
  const up = (q: Pt): Vec3 => at(q, top(q));
  const mix = (a: Pt, c: Pt, k: number): Pt => [a[0] + (c[0] - a[0]) * k, a[1] + (c[1] - a[1]) * k];
  const fixed: FaceFill = { kind: 'design', opening: 'fixed' };
  const ridge = roof === 'gable' ? ridgeOf(plan, p) : null;
  const across = (q: Pt): number => (ridge ? q[0] * ridge.across[0] + q[1] * ridge.across[1] : 0);

  // --- the sides: a wall, an opening with its posts, or the building ---
  for (let i = 0; i < n; i++) {
    const a = plan[i];
    const c = plan[(i + 1) % n];
    const state = states[i];
    const { dir, out } = sideFrame(plan, i);
    // Under a gable a side that passes under the ridge has its top in two straight parts.
    const stops: Pt[] = [a];
    if (ridge) {
      const ta = across(a) - ridge.mid;
      const tc = across(c) - ridge.mid;
      if (ta * tc < 0 && Math.abs(ta) > 1 && Math.abs(tc) > 1) stops.push(mix(a, c, ta / (ta - tc)));
    }
    stops.push(c);
    if (state === 'h') {
      if (roof !== 'none') for (let s = 0; s + 1 < stops.length; s++) b.bar(up(stops[s]), up(stops[s + 1]), 'wall_plate');
      continue;
    }
    // A wall end is a corner post where the plan turns, a coupler where it runs straight on, a plain frame at the building.
    const endRole = (other: number): string => {
      if (states[other] === 'h') return 'frame';
      const od = sideFrame(plan, other).dir;
      return Math.abs(od[0] * dir[1] - od[1] * dir[0]) < 1e-3 ? 'coupler' : 'corner_post';
    };
    const startRole = endRole((i + n - 1) % n);
    const finishRole = endRole((i + 1) % n);
    const outward: Vec3 = [out[0], 0, out[1]];
    const base = { role: 'wall' as const, group: `wall-${i + 1}`, groupLabel: `Wall ${i + 1}`, outward };
    if (state === 'w') b.bar(at(a, 0), at(c, 0), 'frame');
    let k = 0;
    for (let s = 0; s + 1 < stops.length; s++) {
      const s0 = stops[s];
      const s1 = stops[s + 1];
      const level = Math.abs(top(s0) - top(s1)) < 0.5;
      b.bar(up(s0), up(s1), roof === 'none' ? 'frame' : level ? 'eave' : 'rafter');
      const first = s === 0;
      const last = s + 2 === stops.length;
      if (state === 'o') {
        k++;
        b.face({
          ...base,
          id: `w${i + 1}-${k}`,
          label: `Wall ${i + 1}, opening${stops.length > 2 ? ` ${k}` : ''}`,
          fill: { kind: 'open' },
          pts: [at(s0, 0), at(s1, 0), up(s1), up(s0)],
          roles: ['', last ? finishRole : '', '', first ? startRole : ''],
        });
        continue;
      }
      const parts = evenParts(distP(s0, s1), module);
      for (let j = 0; j < parts; j++) {
        const p0 = mix(s0, s1, j / parts);
        const p1 = mix(s0, s1, (j + 1) / parts);
        k++;
        b.face({
          ...base,
          id: `w${i + 1}-${k}`,
          label: `Wall ${i + 1}, panel ${k}`,
          fill: fixed,
          pts: [at(p0, 0), at(p1, 0), up(p1), up(p0)],
          roles: ['', j === parts - 1 && last ? finishRole : 'coupler', '', j === 0 && first ? startRole : 'coupler'],
        });
      }
    }
  }

  // --- the roof ---
  const fill: FaceFill = str(p, 'roofFill') === 'solid' ? { kind: 'panel', productId: null } : { kind: 'glass', glassId: null };
  const skyward: Vec3 = [0, 1, 0];
  const roofBase = { role: 'roof' as const, fill, outward: skyward };

  if (roof === 'flat' || roof === 'leanto' || roof === 'gable') {
    // Rafters run down the slope (lean-to), across the ridge (gable), or across the longest side (flat).
    const axis: Pt = roof === 'leanto' ? sideFrame(plan, Number(str(p, 'highSide')) - 1).dir : ridge ? ridge.along : sideFrame(plan, longestSide(plan)).dir;
    const perp: Pt = [-axis[1], axis[0]];
    const back = (s: number, t: number): Pt => [s * axis[0] + t * perp[0], s * axis[1] + t * perp[1]];
    const slabs = slabsOf(plan, axis, module);
    const ridgeRuns: [number, number][] = [];
    let k = 0;
    for (const slab of slabs) {
      for (const piece of slab.pieces) {
        const sides = ridge ? [clipConvex(piece.pts, perp, ridge.mid), clipConvex(piece.pts, [-perp[0], -perp[1]], -ridge.mid)] : [piece.pts];
        if (ridge && sides[0].length >= 3 && sides[1].length >= 3) {
          // The part of the ridge this piece carries: where its lower half touches the ridge line.
          const on = sides[0].filter((q) => Math.abs(across(q) - ridge.mid) < 0.01).map((q) => q[0] * axis[0] + q[1] * axis[1]);
          if (on.length >= 2 && Math.max(...on) - Math.min(...on) > 0.5) ridgeRuns.push([Math.min(...on), Math.max(...on)]);
        }
        sides.forEach((pts, side) => {
          if (pts.length < 3) return;
          k++;
          b.face({
            ...roofBase,
            id: `roof-${k}`,
            label: `Roof panel ${k}`,
            group: ridge ? `roof-${side ? 'b' : 'a'}` : 'roof',
            groupLabel: ridge ? `Roof, slope ${side ? 2 : 1}` : 'Roof',
            pts: pts.map(up),
            roles: pts.map(() => ''),
          });
        });
      }
    }
    // A rafter on every cut line, only where the roof runs on both sides of it.
    for (let c = 1; c < slabs.length; c++) {
      const s = slabs[c].c0;
      const runs = commonIntervals(slabs[c - 1].pieces.map((x) => x.at1), slabs[c].pieces.map((x) => x.at0));
      for (const [lo, hi] of runs) {
        const stops = ridge && lo < ridge.mid - 0.5 && hi > ridge.mid + 0.5 ? [lo, ridge.mid, hi] : [lo, hi];
        for (let j = 0; j + 1 < stops.length; j++) b.bar(up(back(s, stops[j])), up(back(s, stops[j + 1])), 'rafter');
      }
    }
    if (ridge) {
      const merged: [number, number][] = [];
      for (const run of ridgeRuns.sort((x, y) => x[0] - y[0])) {
        const lastRun = merged[merged.length - 1];
        if (lastRun && run[0] - lastRun[1] < 1) lastRun[1] = Math.max(lastRun[1], run[1]);
        else merged.push([run[0], run[1]]);
      }
      for (const [s0, s1] of merged) {
        const e0 = up(back(s0, ridge.mid));
        const e1 = up(back(s1, ridge.mid));
        b.bar(e0, e1, 'ridge');
        b.hub(e0, 'ridge_end');
        b.hub(e1, 'ridge_end');
      }
    }
  }

  if (roof === 'hipped') {
    // One slope a side, all at the same pitch: a point of the plan belongs to the side it is nearest to.
    const simple = withoutStraightCorners(plan);
    const frames = simple.map((_, i) => sideFrame(simple, i));
    const depth = (i: number, q: Pt): number => -((q[0] - simple[i][0]) * frames[i].out[0] + (q[1] - simple[i][1]) * frames[i].out[1]);
    const slope = Math.tan(num(p, 'pitch') * DEG);
    // Corners shared by slopes are worked out once, so their bars are one bar.
    const known: { q: Pt; v: Vec3 }[] = [];
    const lift = (q: Pt, y: number): Vec3 => {
      const hit = known.find((x) => distP(x.q, q) < 5);
      if (hit) return hit.v;
      const v = at(q, y);
      known.push({ q, v });
      return v;
    };
    simple.forEach((_, i) => {
      let region = simple;
      const inI: Pt = [-frames[i].out[0], -frames[i].out[1]];
      for (let j = 0; j < simple.length && region.length >= 3; j++) {
        if (j === i) continue;
        const inJ: Pt = [-frames[j].out[0], -frames[j].out[1]];
        const normal: Pt = [inI[0] - inJ[0], inI[1] - inJ[1]];
        if (Math.hypot(normal[0], normal[1]) < 1e-6) continue;
        const limit = inI[0] * simple[i][0] + inI[1] * simple[i][1] - (inJ[0] * simple[j][0] + inJ[1] * simple[j][1]);
        region = clipConvex(region, normal, limit);
      }
      if (region.length < 3) return;
      // Corners that fall together (many slopes meeting at one top) are one corner.
      const lifted = region.map((q) => lift(q, h + slope * depth(i, q)));
      const keep = lifted.map((v, x) => v !== lifted[(x + 1) % lifted.length]);
      if (keep.filter(Boolean).length < 3) return;
      const pts = lifted.filter((_v, x) => keep[x]);
      region = region.filter((_q, x) => keep[x]);
      const ds = pts.map((v) => (v[1] - h) / slope);
      const roles = region.map((_q, x) => {
        const y = (x + 1) % region.length;
        if (ds[x] < 0.5 && ds[y] < 0.5) return '';
        return Math.abs(ds[x] - ds[y]) < 0.5 ? 'ridge' : 'hip';
      });
      b.sliced({
        ...roofBase,
        idPrefix: `roof-s${i + 1}`,
        labelPrefix: `Roof slope ${i + 1}, panel`,
        group: `roof-s${i + 1}`,
        groupLabel: `Roof slope ${i + 1}`,
        pts,
        roles,
        dir: [frames[i].dir[0], 0, frames[i].dir[1]],
        target: module,
        cutRole: 'rafter',
      });
      pts.forEach((v, x) => {
        if (ds[x] > 0.5) b.hub(v, 'ridge_end');
      });
    });
  }

  if (roof === 'pyramid') {
    const apex = at(centre, h + num(p, 'rise'));
    for (let i = 0; i < n; i++) {
      const { dir } = sideFrame(plan, i);
      b.sliced({
        ...roofBase,
        idPrefix: `roof-s${i + 1}`,
        labelPrefix: `Roof slope ${i + 1}, panel`,
        group: `roof-s${i + 1}`,
        groupLabel: `Roof slope ${i + 1}`,
        pts: [up(plan[i]), up(plan[(i + 1) % n]), apex],
        roles: ['', 'hip', 'hip'],
        dir: [dir[0], 0, dir[1]],
        target: module,
        cutRole: 'rafter',
      });
    }
    b.hub(apex, 'crown');
  }

  if (roof === 'dome') {
    const round = regularPlan(plan);
    if (round) {
      const m = num(p, 'rings');
      const { rings } = domeShape({ diameter: round.radius * 2, rise: num(p, 'rise'), kerb: h, rings: m, opening: 0 });
      const node = (j: number, i: number): Vec3 => {
        const q = plan[i % n];
        const k = rings[j].r / round.radius;
        return [round.centre[0] + (q[0] - round.centre[0]) * k, rings[j].y, round.centre[1] + (q[1] - round.centre[1]) * k];
      };
      for (let j = 0; j < m; j++) {
        for (let i = 0; i < n; i++) {
          const triangle = j === 0;
          b.face({
            role: 'roof',
            fill,
            id: `r${j + 1}-s${i + 1}`,
            label: `Dome ring ${j + 1}, panel ${i + 1}`,
            group: `ring-${j + 1}`,
            groupLabel: m === 1 ? 'Dome panels' : `Dome ring ${j + 1}${j === 0 ? ' (top)' : j === m - 1 ? ' (base)' : ''}`,
            pts: triangle ? [node(0, 0), node(1, i + 1), node(1, i)] : [node(j, i), node(j, i + 1), node(j + 1, i + 1), node(j + 1, i)],
            roles: triangle ? ['rib', 'ring', 'rib'] : ['ring', 'rib', 'ring', 'rib'],
          });
        }
      }
      b.hub(node(0, 0), 'crown');
      for (let j = 1; j <= m; j++) for (let i = 0; i < n; i++) b.hub(node(j, i), 'node');
    }
  }

  return b.build('My structure', FREE_KIND, p);
}

const roofIs = (...kinds: RoofKind[]) => (p: Params): boolean => kinds.includes(p['roof'] as RoofKind);
const never = (): boolean => false;
const RIDGE_OPTIONS: { value: 'along' | 'across'; label: string }[] = [
  { value: 'along', label: 'Along the longest wall' },
  { value: 'across', label: 'Across it' },
];
const ROOF_ORDER: RoofKind[] = ['none', 'flat', 'leanto', 'gable', 'hipped', 'pyramid', 'dome'];

export const FREE: TemplateDef = {
  kind: FREE_KIND,
  label: 'Your own structure',
  blurb: 'Draw the plan yourself; walls rise from it and you choose the roof',
  params: [
    { key: 'plan', label: 'Plan', type: 'text', default: DEFAULT_PLAN, showIf: never },
    { key: 'walls', label: 'Sides', type: 'text', default: '', showIf: never },
    { key: 'height', label: 'Wall height', type: 'mm', default: 2400, min: 300, max: 6000, step: 10, hint: '300 to 6000 mm, floor to the top of the walls' },
    { key: 'module', label: 'Panel width', type: 'mm', default: 900, min: 400, max: 3000, step: 10, hint: 'Each wall and the roof are divided evenly, close to this' },
    {
      key: 'roof',
      label: 'Roof',
      type: 'choice',
      default: 'flat',
      options: ROOF_ORDER.map((value) => ({ value, label: ROOF_LABEL[value] })),
      // A roof a saved structure already has stays in the list, even where it would not be offered anew.
      optionsFor: (p) =>
        ROOF_ORDER.filter((value) => roofsOffered(planOf(p)).includes(value) || (value === p['roof'] && roofsFor(planOf(p)).includes(value))).map((value) => ({ value, label: ROOF_LABEL[value] })),
      hint: 'Only the roofs that can be built on this plan are offered',
    },
    {
      key: 'roofFill',
      label: 'Roof panels',
      type: 'choice',
      default: 'glass',
      options: [
        { value: 'glass', label: 'Glass' },
        { value: 'solid', label: 'Solid' },
      ],
      showIf: (p) => p['roof'] !== 'none',
    },
    {
      key: 'highSide',
      label: 'High side',
      type: 'choice',
      default: '1',
      optionsFor: (p) => highSides(planOf(p)).map((i) => ({ value: String(i + 1), label: `Wall ${i + 1}` })),
      hint: 'The roof falls away from this wall. The wall numbers are on the plan.',
      showIf: roofIs('leanto'),
    },
    {
      key: 'ridge',
      label: 'Ridge',
      type: 'choice',
      default: 'along',
      options: [
        { value: 'along', label: 'Along the longest wall' },
        { value: 'across', label: 'Across it' },
      ],
      optionsFor: (p) => {
        const ridges = gableRidges(planOf(p));
        return RIDGE_OPTIONS.filter((o) => !ridges.length || ridges.includes(o.value) || o.value === p['ridge']);
      },
      showIf: roofIs('gable'),
    },
    { key: 'pitch', label: 'Roof pitch', type: 'deg', default: 15, min: 2, max: 60, step: 0.5, hint: '2° to 60° from level', showIf: roofIs('leanto', 'gable', 'hipped') },
    { key: 'rise', label: 'Roof rise', type: 'mm', default: 1000, min: 150, max: 6000, step: 10, hint: 'From the top of the walls to the top of the roof', showIf: roofIs('pyramid', 'dome') },
    { key: 'rings', label: 'Dome rings', type: 'count', default: 3, min: 1, max: 8, step: 1, hint: 'The segments round the dome are the sides of the plan', showIf: roofIs('dome') },
  ],
  constrain(p) {
    let plan = parsePlan(p['plan']);
    if (planProblem(plan)) plan = parsePlan(DEFAULT_PLAN);
    plan = orientPlan(plan);
    const roofs = roofsFor(plan);
    const roof = roofs.includes(p['roof'] as RoofKind) ? (p['roof'] as RoofKind) : 'flat';
    const high = highSides(plan);
    const wanted = Number(p['highSide']) - 1;
    const round = regularPlan(plan);
    // A gable newly chosen takes the ridge that gives it two slopes.
    const ridges = gableRidges(plan);
    const ridge = roof === 'gable' && ridges.length && !ridges.includes(p['ridge'] as 'along' | 'across') ? ridges[0] : p['ridge'];
    return {
      ...p,
      ridge,
      plan: formatPlan(plan),
      walls: wallStates(p, plan.length),
      roof,
      highSide: String((high.includes(wanted) ? wanted : high[0] ?? 0) + 1),
      // A dome is never more than a hemisphere.
      rise: roof === 'dome' && round ? clamp(num(p, 'rise'), 150, Math.floor(round.radius)) : num(p, 'rise'),
    };
  },
  generate,
  dims(p): Dim[] {
    const plan = planOf(p);
    const n = plan.length;
    const h = num(p, 'height');
    const top = eaveHeight(plan, p);
    const states = wallStates(p, n);
    const built = (i: number): boolean => states[i] !== 'h' || p['roof'] !== 'none';
    // The handle sits ON the structure: on the top of a wall, at a corner where the wall is just the wall
    // height (under a slope the other corners are higher), and of those the one nearest the usual view.
    let best = 0;
    let bestScore = -Infinity;
    plan.forEach((q, i) => {
      if (!built(i) && !built((i + n - 1) % n)) return;
      const score = -Math.round(top(q) - h) * 1e6 + q[0] * 0.62 + q[1];
      if (score > bestScore) [best, bestScore] = [i, score];
    });
    const q = plan[best];
    const y = top(q);
    // The size is measured beside that corner, pointing away from the plan.
    const o0 = sideFrame(plan, best).out;
    const o1 = sideFrame(plan, (best + n - 1) % n).out;
    const l = Math.hypot(o0[0] + o1[0], o0[1] + o1[1]) || 1;
    const a: Vec3 = [q[0] + ((o0[0] + o1[0]) / l) * 350, 0, q[1] + ((o0[1] + o1[1]) / l) * 350];
    return [paramDim(FREE, p, 'height', a, [a[0], h, a[2]], { at: [q[0], y, q[1]], axis: [0, 1, 0], gain: 1 })];
  },
};
