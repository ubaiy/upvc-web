/**
 * Bay / bow window: N equal segments, each turned by the same angle from the
 * one before (research part 1, 17.1). 3 segments at 45° is the classic bay;
 * 5 or 7 at a smaller angle is a bow. The ends sit on the wall (Z = 0).
 */

import { StructureBuilder } from '../builder';
import { Dim, num, paramDim, TemplateDef } from '../template';
import { Params, Structure, Vec3 } from '../types';
import { clamp, DEG } from '../vec';

export interface BayPlan {
  /** Plan points (x, z) from the left end to the right end as seen from outside. */
  points: [number, number][];
  opening: number;
  projection: number;
}

export function bayPlan(segments: number, segmentWidth: number, angleDeg: number): BayPlan {
  let x = 0;
  let z = 0;
  let projection = 0;
  const raw: [number, number][] = [[0, 0]];
  for (let i = 0; i < segments; i++) {
    const phi = -(i - (segments - 1) / 2) * angleDeg * DEG;
    x += segmentWidth * Math.cos(phi);
    z += segmentWidth * Math.sin(phi);
    projection = Math.max(projection, z);
    raw.push([x, z]);
  }
  return { points: raw.map(([px, pz]) => [px - x / 2, pz]), opening: x, projection };
}

/** The largest turn that still leaves the two end segments leaning outward. */
const maxAngle = (segments: number): number => Math.min(60, Math.floor(170 / (segments - 1)));

function generate(p: Params): Structure {
  const n = num(p, 'segments');
  const sill = num(p, 'sill');
  const top = sill + num(p, 'height');
  const plan = bayPlan(n, num(p, 'segmentWidth'), num(p, 'angle'));
  const b = new StructureBuilder([0, (sill + top) / 2, -1000]);
  for (let i = 0; i < n; i++) {
    const [x0, z0] = plan.points[i];
    const [x1, z1] = plan.points[i + 1];
    const pts: Vec3[] = [[x0, sill, z0], [x1, sill, z1], [x1, top, z1], [x0, top, z0]];
    b.face({
      id: `s${i + 1}`,
      label: `Segment ${i + 1}`,
      role: 'wall',
      group: 'bay',
      groupLabel: 'All segments',
      fill: { kind: 'design', opening: 'fixed' },
      pts,
      roles: ['frame', i === n - 1 ? 'frame' : 'corner_post', 'frame', i === 0 ? 'frame' : 'corner_post'],
    });
  }
  return b.build(n > 3 ? 'Bow window' : 'Bay window', 'bay', p);
}

export const BAY: TemplateDef = {
  kind: 'bay',
  label: 'Bay / bow window',
  blurb: 'Three to seven segments turned out from the wall',
  params: [
    { key: 'segments', label: 'Segments', type: 'count', default: 3, min: 3, max: 7, step: 1 },
    { key: 'segmentWidth', label: 'Segment width', type: 'mm', default: 900, min: 300, max: 2400, step: 10 },
    { key: 'angle', label: 'Angle between segments', type: 'deg', default: 45, min: 5, max: 60, step: 0.1 },
    { key: 'height', label: 'Height', type: 'mm', default: 1500, min: 400, max: 3000, step: 10 },
    { key: 'sill', label: 'Sill above floor', type: 'mm', default: 900, min: 0, max: 2000, step: 10 },
  ],
  constrain(p) {
    return { ...p, angle: clamp(num(p, 'angle'), 5, maxAngle(num(p, 'segments'))) };
  },
  generate,
  dims(p): Dim[] {
    const n = num(p, 'segments');
    const sill = num(p, 'sill');
    const top = sill + num(p, 'height');
    const plan = bayPlan(n, num(p, 'segmentWidth'), num(p, 'angle'));
    const half = plan.opening / 2;
    const projectionOf = (q: Params, angle: number): number => bayPlan(num(q, 'segments'), num(q, 'segmentWidth'), angle).projection;
    const dims: Dim[] = [
      {
        id: 'opening',
        label: 'Opening width',
        a: [-half, sill, -200],
        b: [half, sill, -200],
        value: Math.round(plan.opening),
        unit: 'mm',
        min: 600,
        max: 12000,
        // The opening is in proportion to the segment width at a given angle.
        set: (q, v) => ({ ...q, segmentWidth: (num(q, 'segmentWidth') * v) / bayPlan(num(q, 'segments'), num(q, 'segmentWidth'), num(q, 'angle')).opening }),
      },
      {
        id: 'projection',
        label: 'Projection',
        a: [half + 300, sill, 0],
        b: [half + 300, sill, plan.projection],
        value: Math.round(plan.projection),
        unit: 'mm',
        min: Math.ceil(projectionOf(p, 5)),
        max: Math.floor(projectionOf(p, maxAngle(n))),
        handle: { at: [0, (sill + top) / 2, plan.projection], axis: [0, 0, 1], gain: 1 },
        // The projection grows with the angle: find the angle by halving.
        set: (q, v) => {
          let lo = 5;
          let hi = maxAngle(num(q, 'segments'));
          for (let k = 0; k < 40; k++) {
            const m = (lo + hi) / 2;
            if (projectionOf(q, m) < v) lo = m;
            else hi = m;
          }
          return { ...q, angle: (lo + hi) / 2 };
        },
      },
      paramDim(BAY, p, 'height', [-half - 300, sill, 0], [-half - 300, top, 0], { at: [0, top, plan.projection], axis: [0, 1, 0], gain: 1 }),
    ];
    if (sill > 0) dims.push(paramDim(BAY, p, 'sill', [half + 300, 0, 0], [half + 300, sill, 0]));
    return dims;
  },
};
