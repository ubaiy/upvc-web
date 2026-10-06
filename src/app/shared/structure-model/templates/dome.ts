/**
 * Segmented dome: N ribs and M rings on a sphere cap (research part 1, 17.6).
 * Every panel is flat: a trapezoid between two rings (its ring edges are
 * parallel chords), a triangle in the top ring. Optional top opening with a
 * flat cap, optional vertical kerb under the base ring.
 */

import { StructureBuilder } from '../builder';
import { Dim, num, paramDim, TemplateDef } from '../template';
import { Params, Structure, Vec3 } from '../types';
import { clamp } from '../vec';

export interface DomeShape {
  /** Sphere radius and the angle from the vertical of each ring, top first. */
  sphereR: number;
  angles: number[];
  /** Radius and height of each ring, top first; the last is the base ring. */
  rings: { r: number; y: number }[];
}

export function domeShape(p: Params): DomeShape {
  const half = num(p, 'diameter') / 2;
  const rise = num(p, 'rise');
  const kerb = num(p, 'kerb');
  const m = num(p, 'rings');
  const sphereR = (half * half + rise * rise) / (2 * rise);
  const full = Math.atan2(half, sphereR - rise);
  const top = num(p, 'opening') > 0 ? Math.asin(num(p, 'opening') / 2 / sphereR) : 0;
  const angles: number[] = [];
  for (let j = 0; j <= m; j++) angles.push(top + ((full - top) * j) / m);
  const rings = angles.map((a) => ({ r: sphereR * Math.sin(a), y: kerb + rise - sphereR + sphereR * Math.cos(a) }));
  return { sphereR, angles, rings };
}

function generate(p: Params): Structure {
  const n = num(p, 'ribs');
  const m = num(p, 'rings');
  const kerb = num(p, 'kerb');
  const open = num(p, 'opening') > 0;
  const { rings } = domeShape(p);
  const node = (j: number, i: number): Vec3 => {
    const t = (2 * Math.PI * (i % n)) / n;
    return [rings[j].r * Math.cos(t), rings[j].y, rings[j].r * Math.sin(t)];
  };
  const b = new StructureBuilder([0, kerb, 0]);

  for (let j = 0; j < m; j++) {
    const group = `ring-${j + 1}`;
    const groupLabel = m === 1 ? 'Dome panels' : `Ring ${j + 1}${j === 0 ? ' (top)' : j === m - 1 ? ' (base)' : ''}`;
    for (let i = 0; i < n; i++) {
      const triangle = j === 0 && !open;
      b.face({
        id: `r${j + 1}-s${i + 1}`,
        label: `Ring ${j + 1}, panel ${i + 1}`,
        role: 'roof',
        group,
        groupLabel,
        fill: { kind: 'glass', glassId: null },
        pts: triangle ? [node(0, 0), node(1, i + 1), node(1, i)] : [node(j, i), node(j, i + 1), node(j + 1, i + 1), node(j + 1, i)],
        roles: triangle ? ['rib', 'ring', 'rib'] : ['ring', 'rib', 'ring', 'rib'],
      });
    }
  }
  if (open) {
    const cap: Vec3[] = [];
    for (let i = 0; i < n; i++) cap.push(node(0, i));
    b.face({
      id: 'cap',
      label: 'Top cap',
      role: 'roof',
      group: 'cap',
      groupLabel: 'Top cap',
      fill: { kind: 'glass', glassId: null },
      pts: cap,
      roles: cap.map(() => 'ring'),
    });
  } else {
    b.hub(node(0, 0), 'crown');
  }
  for (let j = open ? 0 : 1; j <= m; j++) for (let i = 0; i < n; i++) b.hub(node(j, i), 'node');

  if (kerb > 0) {
    for (let i = 0; i < n; i++) {
      const p0 = node(m, i);
      const p1 = node(m, i + 1);
      b.face({
        id: `k-s${i + 1}`,
        label: `Kerb panel ${i + 1}`,
        role: 'wall',
        group: 'kerb',
        groupLabel: 'Kerb',
        fill: { kind: 'panel', productId: null },
        pts: [[p0[0], 0, p0[2]], [p1[0], 0, p1[2]], p1, p0],
        roles: ['frame', 'corner_post', 'ring', 'corner_post'],
      });
    }
  }
  return b.build('Dome', 'dome', p);
}

export const DOME: TemplateDef = {
  kind: 'dome',
  label: 'Dome',
  blurb: 'Segmented glass dome: ribs, rings, flat panels',
  params: [
    { key: 'diameter', label: 'Diameter', type: 'mm', default: 3000, min: 1000, max: 12000, step: 10 },
    { key: 'rise', label: 'Rise', type: 'mm', default: 1000, min: 150, max: 6000, step: 10 },
    { key: 'ribs', label: 'Ribs', type: 'count', default: 12, min: 5, max: 32, step: 1 },
    { key: 'rings', label: 'Rings', type: 'count', default: 3, min: 1, max: 8, step: 1 },
    { key: 'opening', label: 'Top opening', type: 'mm', default: 0, min: 0, max: 6000, step: 10, hint: '0 = closed top with a crown hub' },
    { key: 'kerb', label: 'Kerb height', type: 'mm', default: 0, min: 0, max: 1500, step: 10 },
  ],
  constrain(p) {
    const d = num(p, 'diameter');
    const opening = num(p, 'opening');
    return {
      ...p,
      // Never more than a hemisphere; a top opening under 100 mm is no opening.
      rise: clamp(num(p, 'rise'), 150, d / 2),
      opening: opening < 100 ? 0 : Math.min(opening, Math.round(d * 0.6)),
    };
  },
  generate,
  dims(p): Dim[] {
    const half = num(p, 'diameter') / 2;
    const kerb = num(p, 'kerb');
    const top = kerb + num(p, 'rise');
    const out = half + 350;
    // The rise is pulled at the crown; a dome with a top opening has no crown, so at its top ring.
    const ring = domeShape(p).rings[0];
    const dims = [
      paramDim(DOME, p, 'diameter', [-half, 0, out], [half, 0, out], { at: [half, kerb, 0], axis: [1, 0, 0], gain: 2 }),
      paramDim(DOME, p, 'rise', [-out, kerb, 0], [-out, top, 0], { at: [ring.r, ring.y, 0], axis: [0, 1, 0], gain: 1 }),
    ];
    if (kerb > 0) dims.push(paramDim(DOME, p, 'kerb', [out, 0, 0], [out, kerb, 0]));
    return dims;
  },
};
