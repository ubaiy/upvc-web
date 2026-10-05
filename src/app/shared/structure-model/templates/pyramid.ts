/**
 * Pyramid / lantern roof on a rectangle (research part 1, 17.4): the same
 * pitch on all four sides. A square gives a pyramid with one crown hub; a
 * longer rectangle gives a lantern: two half pyramids and a ridge of
 * (long side − short side).
 */

import { StructureBuilder } from '../builder';
import { Dim, num, paramDim, TemplateDef } from '../template';
import { Params, Structure, Vec3 } from '../types';
import { clamp, DEG } from '../vec';

export function pyramidHeight(p: Params): number {
  return (Math.min(num(p, 'length'), num(p, 'width')) / 2) * Math.tan(num(p, 'pitch') * DEG);
}

function generate(p: Params): Structure {
  const length = num(p, 'length');
  const width = num(p, 'width');
  const up = num(p, 'upstand');
  const top = up + pyramidHeight(p);
  const alongX = length >= width;
  const long = Math.max(length, width);
  const short = Math.min(length, width);
  // (along the ridge, up, across it) → world; the ridge runs along the longer side.
  const pt = (l: number, y: number, s: number): Vec3 => (alongX ? [l, y, s] : [s, y, l]);
  const ridge = (long - short) / 2;
  const b = new StructureBuilder([0, up, 0]);
  const spacing = num(p, 'spacing');

  const sides = [
    { key: 'front', label: alongX ? 'Front slope' : 'Right slope', s: 1, end: false },
    { key: 'back', label: alongX ? 'Back slope' : 'Left slope', s: -1, end: false },
    { key: 'end-a', label: alongX ? 'Left end' : 'Back end', s: -1, end: true },
    { key: 'end-b', label: alongX ? 'Right end' : 'Front end', s: 1, end: true },
  ];
  for (const side of sides) {
    let pts: Vec3[];
    let roles: string[];
    if (side.end) {
      const l = (side.s * long) / 2;
      pts = [pt(l, up, -short / 2), pt(l, up, short / 2), pt(side.s * ridge, top, 0)];
      roles = ['eave', 'hip', 'hip'];
    } else {
      const s = (side.s * short) / 2;
      pts = [pt(-long / 2, up, s), pt(long / 2, up, s), pt(ridge, top, 0)];
      roles = ['eave', 'hip', 'hip'];
      if (ridge > 0.01) {
        pts.push(pt(-ridge, top, 0));
        roles = ['eave', 'hip', 'ridge', 'hip'];
      }
    }
    b.sliced({
      idPrefix: side.key,
      labelPrefix: side.label,
      role: 'roof',
      group: `roof-${side.key}`,
      groupLabel: side.label,
      fill: { kind: 'glass', glassId: null },
      pts,
      roles,
      dir: side.end ? pt(0, 0, 1) : pt(1, 0, 0),
      target: spacing,
      cutRole: 'rafter',
    });
  }
  if (ridge > 0.01) {
    b.hub(pt(-ridge, top, 0), 'ridge_end');
    b.hub(pt(ridge, top, 0), 'ridge_end');
  } else {
    b.hub([0, top, 0], 'crown');
  }

  if (up > 0) {
    const c: Vec3[] = [
      [-length / 2, 0, width / 2],
      [length / 2, 0, width / 2],
      [length / 2, 0, -width / 2],
      [-length / 2, 0, -width / 2],
    ];
    const names = ['Front', 'Right', 'Back', 'Left'];
    c.forEach((p0, i) => {
      const p1 = c[(i + 1) % 4];
      b.face({
        id: `up-${i + 1}`,
        label: `${names[i]} upstand`,
        role: 'wall',
        group: 'upstand',
        groupLabel: 'Upstand',
        fill: { kind: 'panel', productId: null },
        pts: [p0, p1, [p1[0], up, p1[2]], [p0[0], up, p0[2]]],
        roles: ['frame', 'corner_post', '', 'corner_post'],
      });
    });
  }
  return b.build(ridge > 0.01 ? 'Lantern roof' : 'Pyramid roof', 'pyramid', p);
}

export const PYRAMID: TemplateDef = {
  kind: 'pyramid',
  label: 'Pyramid / lantern roof',
  blurb: 'Four slopes to a point, or to a ridge on a longer base',
  params: [
    { key: 'length', label: 'Length', type: 'mm', default: 2400, min: 600, max: 8000, step: 10 },
    { key: 'width', label: 'Width', type: 'mm', default: 1500, min: 600, max: 8000, step: 10 },
    { key: 'pitch', label: 'Pitch', type: 'deg', default: 30, min: 10, max: 60, step: 0.1 },
    { key: 'spacing', label: 'Bar spacing', type: 'mm', default: 600, min: 0, max: 2000, step: 10, hint: '0 = one pane per slope' },
    { key: 'upstand', label: 'Upstand height', type: 'mm', default: 150, min: 0, max: 1200, step: 10 },
  ],
  generate,
  dims(p): Dim[] {
    const hl = num(p, 'length') / 2;
    const hw = num(p, 'width') / 2;
    const up = num(p, 'upstand');
    const height = pyramidHeight(p);
    const short = Math.min(hl, hw);
    const heightDim: Dim = {
      id: 'height',
      label: 'Height',
      a: [-hl - 350, up, 0],
      b: [-hl - 350, up + height, 0],
      value: Math.round(height),
      unit: 'mm',
      min: Math.ceil(short * Math.tan(10 * DEG)),
      max: Math.floor(short * Math.tan(60 * DEG)),
      handle: { at: [0, up + height, 0], axis: [0, 1, 0], gain: 1 },
      set: (q, v) => ({ ...q, pitch: clamp(Math.atan2(v, Math.min(num(q, 'length'), num(q, 'width')) / 2) / DEG, 10, 60) }),
    };
    return [
      paramDim(PYRAMID, p, 'length', [-hl, 0, hw + 350], [hl, 0, hw + 350], { at: [hl, up, 0], axis: [1, 0, 0], gain: 2 }),
      paramDim(PYRAMID, p, 'width', [hl + 350, 0, -hw], [hl + 350, 0, hw], { at: [0, up, hw], axis: [0, 0, 1], gain: 2 }),
      heightDim,
      paramDim(PYRAMID, p, 'pitch', [0, up + height * 0.45, hw * 0.55], [0, up + height * 0.45, hw * 0.55]),
    ];
  },
};
