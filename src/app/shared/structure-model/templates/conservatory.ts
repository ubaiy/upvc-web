/**
 * Conservatory roofs on walls, against a building at Z = 0 (research part 1,
 * 17.2 and 17.3): a lean-to (one slope falling to the front) and a gable (a
 * ridge running out from the building, a glazed triangle at the front).
 */

import { StructureBuilder } from '../builder';
import { Dim, num, paramDim, ParamSpec, TemplateDef } from '../template';
import { FaceFill, Params, Structure, Vec3 } from '../types';
import { clamp, DEG } from '../vec';

const FIXED: FaceFill = { kind: 'design', opening: 'fixed' };
const GLASS: FaceFill = { kind: 'glass', glassId: null };
const WALL = { role: 'wall' as const, fill: FIXED, cutRole: 'coupler' };
const ROOF = { role: 'roof' as const, fill: GLASS, cutRole: 'rafter' };

const SHARED: ParamSpec[] = [
  { key: 'width', label: 'Width', type: 'mm', default: 3600, min: 1500, max: 9000, step: 10 },
  { key: 'projection', label: 'Projection', type: 'mm', default: 2700, min: 1000, max: 6000, step: 10 },
  { key: 'eave', label: 'Eave height', type: 'mm', default: 2100, min: 1500, max: 3000, step: 10 },
];
const BARS: ParamSpec[] = [
  { key: 'spacing', label: 'Roof bar spacing', type: 'mm', default: 700, min: 300, max: 1500, step: 10 },
  { key: 'module', label: 'Wall panel width', type: 'mm', default: 900, min: 400, max: 2000, step: 10 },
];

/** Height of the roof above the eave: at the building for a lean-to, at the ridge for a gable. */
export function roofRise(kind: 'lean-to' | 'gable', p: Params): number {
  const run = kind === 'lean-to' ? num(p, 'projection') : num(p, 'width') / 2;
  return run * Math.tan(num(p, 'pitch') * DEG);
}

function frontWall(b: StructureBuilder, p: Params): void {
  const hw = num(p, 'width') / 2;
  const z = num(p, 'projection');
  const e = num(p, 'eave');
  b.sliced({
    ...WALL,
    idPrefix: 'front',
    labelPrefix: 'Front wall, panel',
    group: 'wall-front',
    groupLabel: 'Front wall',
    pts: [[-hw, 0, z], [hw, 0, z], [hw, e, z], [-hw, e, z]],
    roles: ['frame', 'corner_post', 'eave', 'corner_post'],
    dir: [1, 0, 0],
    target: num(p, 'module'),
  });
}

function generateLeanTo(p: Params): Structure {
  const hw = num(p, 'width') / 2;
  const z = num(p, 'projection');
  const e = num(p, 'eave');
  const top = e + roofRise('lean-to', p);
  const b = new StructureBuilder([0, e / 2, z / 2]);
  frontWall(b, p);
  for (const side of [
    { key: 'left', label: 'Left side', x: -hw },
    { key: 'right', label: 'Right side', x: hw },
  ]) {
    // Divided along the projection: each panel is a right trapezoid under the rake.
    b.sliced({
      ...WALL,
      idPrefix: side.key,
      labelPrefix: `${side.label}, panel`,
      group: `wall-${side.key}`,
      groupLabel: side.label,
      pts: [[side.x, 0, 0], [side.x, 0, z], [side.x, e, z], [side.x, top, 0]],
      roles: ['frame', 'corner_post', 'rafter', 'frame'],
      dir: [0, 0, 1],
      target: num(p, 'module'),
    });
  }
  b.sliced({
    ...ROOF,
    idPrefix: 'roof',
    labelPrefix: 'Roof pane',
    group: 'roof',
    groupLabel: 'Roof',
    pts: [[-hw, e, z], [hw, e, z], [hw, top, 0], [-hw, top, 0]],
    roles: ['eave', 'rafter', 'wall_plate', 'rafter'],
    dir: [1, 0, 0],
    target: num(p, 'spacing'),
  });
  return b.build('Lean-to conservatory', 'lean-to', p);
}

function generateGable(p: Params): Structure {
  const hw = num(p, 'width') / 2;
  const z = num(p, 'projection');
  const e = num(p, 'eave');
  const top = e + roofRise('gable', p);
  const b = new StructureBuilder([0, e / 2, z / 2]);
  frontWall(b, p);
  // The glazed triangle over the front wall, halved by a mullion under the ridge.
  b.sliced({
    ...WALL,
    cutRole: 'mullion',
    idPrefix: 'gable',
    labelPrefix: 'Gable light',
    group: 'gable',
    groupLabel: 'Gable',
    pts: [[-hw, e, z], [hw, e, z], [0, top, z]],
    roles: ['', 'rafter', 'rafter'],
    dir: [1, 0, 0],
    target: 0,
    count: 2,
  });
  for (const side of [
    { key: 'left', label: 'Left', x: -hw },
    { key: 'right', label: 'Right', x: hw },
  ]) {
    b.sliced({
      ...WALL,
      idPrefix: side.key,
      labelPrefix: `${side.label} wall, panel`,
      group: `wall-${side.key}`,
      groupLabel: `${side.label} wall`,
      pts: [[side.x, 0, 0], [side.x, 0, z], [side.x, e, z], [side.x, e, 0]],
      roles: ['frame', 'corner_post', 'eave', 'frame'],
      dir: [0, 0, 1],
      target: num(p, 'module'),
    });
    b.sliced({
      ...ROOF,
      idPrefix: `roof-${side.key}`,
      labelPrefix: `${side.label} slope, pane`,
      group: `roof-${side.key}`,
      groupLabel: `${side.label} roof slope`,
      pts: [[side.x, e, z], [0, top, z], [0, top, 0], [side.x, e, 0]],
      roles: ['rafter', 'ridge', 'rafter', 'eave'],
      dir: [0, 0, 1],
      target: num(p, 'spacing'),
    });
  }
  b.hub([0, top, z], 'ridge_end');
  return b.build('Gable conservatory', 'gable', p);
}

function dimsOf(def: TemplateDef, kind: 'lean-to' | 'gable', p: Params): Dim[] {
  const hw = num(p, 'width') / 2;
  const z = num(p, 'projection');
  const e = num(p, 'eave');
  const rise = roofRise(kind, p);
  const at: Vec3 = kind === 'lean-to' ? [0, e + rise / 2, z / 2] : [-hw / 2, e + rise / 2, z];
  return [
    paramDim(def, p, 'width', [-hw, 0, z + 350], [hw, 0, z + 350], { at: [hw, e / 2, z / 2], axis: [1, 0, 0], gain: 2 }),
    paramDim(def, p, 'projection', [hw + 350, 0, 0], [hw + 350, 0, z], { at: [0, e / 2, z], axis: [0, 0, 1], gain: 1 }),
    paramDim(def, p, 'eave', [-hw - 350, 0, z], [-hw - 350, e, z], { at: [-hw, e, z], axis: [0, 1, 0], gain: 1 }),
    paramDim(def, p, 'pitch', at, at),
  ];
}

export const LEAN_TO: TemplateDef = {
  kind: 'lean-to',
  label: 'Lean-to conservatory',
  blurb: 'One glass slope from the building down to the front wall',
  params: [...SHARED, { key: 'pitch', label: 'Roof pitch', type: 'deg', default: 15, min: 5, max: 40, step: 0.5 }, ...BARS],
  constrain(p) {
    // The roof may not climb more than 3 m up the building.
    const maxPitch = Math.floor(Math.atan2(3000, num(p, 'projection')) / DEG);
    return { ...p, pitch: clamp(num(p, 'pitch'), 5, Math.max(5, maxPitch)) };
  },
  generate: generateLeanTo,
  dims: (p) => dimsOf(LEAN_TO, 'lean-to', p),
};

export const GABLE: TemplateDef = {
  kind: 'gable',
  label: 'Gable conservatory',
  blurb: 'Two slopes to a ridge, a glazed gable at the front',
  params: [...SHARED, { key: 'pitch', label: 'Roof pitch', type: 'deg', default: 25, min: 10, max: 45, step: 0.5 }, ...BARS],
  generate: generateGable,
  dims: (p) => dimsOf(GABLE, 'gable', p),
};
