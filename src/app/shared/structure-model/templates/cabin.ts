/**
 * Cabin / enclosure: one to four straight walls on a rectangle, divided into
 * even panels close to the wanted panel width, a door in the front wall and
 * an optional flat roof. The back (Z = 0) is the building unless the plan is
 * a closed box.
 */

import { evenParts, StructureBuilder } from '../builder';
import { Dim, num, paramDim, str, TemplateDef } from '../template';
import { FaceFill, Params, Structure, Vec3 } from '../types';
import { clamp, dist, lerp } from '../vec';

const DOOR_LEAF_HEIGHT = 2100;
const MIN_TOP_LIGHT = 300;
const MIN_SIDE_PANEL = 300;

type WallKey = 'front' | 'right' | 'left' | 'back';
const WALLS: Record<string, WallKey[]> = {
  straight: ['front'],
  l: ['front', 'right'],
  u: ['front', 'left', 'right'],
  box: ['front', 'right', 'back', 'left'],
};
const WALL_LABEL: Record<WallKey, string> = { front: 'Front wall', right: 'Right wall', left: 'Left wall', back: 'Back wall' };

/** Panel widths of the front wall, left to right, and which one is the door (-1 = none). */
export function frontLayout(p: Params): { widths: number[]; door: number } {
  const len = num(p, 'width');
  const module = num(p, 'module');
  const doorW = Math.min(num(p, 'doorWidth'), len);
  if (doorW <= 0) {
    const n = evenParts(len, module);
    return { widths: Array<number>(n).fill(len / n), door: -1 };
  }
  let start = clamp((num(p, 'doorAt') / 100) * len - doorW / 2, 0, len - doorW);
  // A sliver beside the door cannot be made: the door goes to the end of the wall.
  if (start < MIN_SIDE_PANEL) start = 0;
  if (len - start - doorW < MIN_SIDE_PANEL) start = len - doorW;
  const left = start;
  const right = len - start - doorW;
  const nl = left > 0 ? evenParts(left, module) : 0;
  const nr = right > 0 ? evenParts(right, module) : 0;
  return {
    widths: [...Array<number>(nl).fill(left / Math.max(1, nl)), doorW, ...Array<number>(nr).fill(right / Math.max(1, nr))],
    door: nl,
  };
}

function generate(p: Params): Structure {
  const shape = str(p, 'shape');
  const w = num(p, 'width');
  const d = shape === 'straight' ? 0 : num(p, 'depth');
  const h = num(p, 'height');
  const roof = shape === 'straight' ? 'none' : str(p, 'roof');
  const walls = WALLS[shape];
  const has = (k: WallKey): boolean => walls.includes(k);
  const b = new StructureBuilder([0, h / 2, shape === 'straight' ? -1000 : d / 2]);
  const fixed: FaceFill = { kind: 'design', opening: 'fixed' };
  // Each wall from its left end to its right end as seen from outside.
  const run: Record<WallKey, [Vec3, Vec3]> = {
    front: [[-w / 2, 0, d], [w / 2, 0, d]],
    right: [[w / 2, 0, d], [w / 2, 0, 0]],
    back: [[w / 2, 0, 0], [-w / 2, 0, 0]],
    left: [[-w / 2, 0, 0], [-w / 2, 0, d]],
  };
  const up = (q: Vec3, y: number): Vec3 => [q[0], y, q[2]];
  // A wall end is a corner post where another wall meets it, a plain frame where it stops.
  const order: WallKey[] = ['front', 'right', 'back', 'left'];
  const endRole = (k: WallKey, atStart: boolean): string => {
    const i = order.indexOf(k);
    return has(order[(i + (atStart ? 3 : 1)) % 4]) ? 'corner_post' : 'frame';
  };

  for (const k of walls) {
    const [s, e] = run[k];
    const length = dist(s, e);
    const layout = k === 'front' ? frontLayout(p) : null;
    const n = layout ? layout.widths.length : evenParts(length, num(p, 'module'));
    const door = layout ? layout.door : -1;
    b.bar(s, e, 'frame');
    b.bar(up(s, h), up(e, h), roof === 'none' ? 'frame' : 'eave');
    let at = 0;
    for (let i = 0; i < n; i++) {
      const pw = layout ? layout.widths[i] : length / n;
      const p0 = lerp(s, e, at / length);
      const p1 = lerp(s, e, (at + pw) / length);
      at += pw;
      const leftRole = i === 0 ? endRole(k, true) : 'coupler';
      const rightRole = i === n - 1 ? endRole(k, false) : 'coupler';
      const base = { role: 'wall' as const, group: `wall-${k}`, groupLabel: WALL_LABEL[k] };
      if (i === door) {
        const leaf = h - DOOR_LEAF_HEIGHT >= MIN_TOP_LIGHT ? DOOR_LEAF_HEIGHT : h;
        b.bar(p0, up(p0, h), leftRole);
        b.bar(p1, up(p1, h), rightRole);
        b.face({
          ...base,
          id: 'door',
          label: 'Door',
          fill: { kind: 'design', opening: 'door' },
          pts: [p0, p1, up(p1, leaf), up(p0, leaf)],
          roles: ['', '', leaf < h ? 'transom' : '', ''],
        });
        if (leaf < h) {
          b.face({ ...base, id: 'door-top', label: 'Light over door', fill: fixed, pts: [up(p0, leaf), up(p1, leaf), up(p1, h), up(p0, h)], roles: ['', '', '', ''] });
        }
      } else {
        const idx = door >= 0 && i > door ? i : i + 1;
        b.face({
          ...base,
          id: `${k}-${idx}`,
          label: `${WALL_LABEL[k]}, panel ${idx}`,
          fill: fixed,
          pts: [p0, p1, up(p1, h), up(p0, h)],
          roles: ['', rightRole, '', leftRole],
        });
      }
    }
  }

  if (roof !== 'none') {
    const pts: Vec3[] = [[-w / 2, h, d], [w / 2, h, d], [w / 2, h, 0], [-w / 2, h, 0]];
    // Where no wall carries the roof edge: a wall plate on the building, an end rafter at an open side.
    const roles = [has('front') ? '' : 'eave', has('right') ? '' : 'rafter', has('back') ? '' : 'wall_plate', has('left') ? '' : 'rafter'];
    b.sliced({
      idPrefix: 'roof',
      labelPrefix: 'Roof panel',
      role: 'roof',
      group: 'roof',
      groupLabel: 'Roof',
      fill: roof === 'glass' ? { kind: 'glass', glassId: null } : { kind: 'panel', productId: null },
      pts,
      roles,
      dir: [1, 0, 0],
      target: num(p, 'module'),
      cutRole: 'rafter',
    });
  }
  return b.build('Cabin', 'cabin', p);
}

const notStraight = (p: Params): boolean => p['shape'] !== 'straight';

export const CABIN: TemplateDef = {
  kind: 'cabin',
  label: 'Cabin / enclosure',
  blurb: 'Glazed walls in a row, an L, a U or a closed box, with a door',
  params: [
    {
      key: 'shape',
      label: 'Plan',
      type: 'choice',
      default: 'box',
      options: [
        { value: 'straight', label: 'Straight wall' },
        { value: 'l', label: 'L' },
        { value: 'u', label: 'U' },
        { value: 'box', label: 'Closed box' },
      ],
    },
    { key: 'width', label: 'Width', type: 'mm', default: 3600, min: 900, max: 12000, step: 10 },
    { key: 'depth', label: 'Depth', type: 'mm', default: 2400, min: 600, max: 8000, step: 10, showIf: notStraight },
    { key: 'height', label: 'Height', type: 'mm', default: 2400, min: 1800, max: 3600, step: 10 },
    { key: 'module', label: 'Panel width', type: 'mm', default: 900, min: 400, max: 2000, step: 10, hint: 'Each wall is divided evenly, close to this' },
    { key: 'doorWidth', label: 'Door width', type: 'mm', default: 900, min: 0, max: 1800, step: 10, hint: '0 = no door' },
    { key: 'doorAt', label: 'Door position', type: 'count', default: 50, min: 0, max: 100, step: 1, hint: '% along the front wall', showIf: (p) => num(p, 'doorWidth') > 0 },
    {
      key: 'roof',
      label: 'Roof',
      type: 'choice',
      default: 'glass',
      options: [
        { value: 'none', label: 'No roof' },
        { value: 'glass', label: 'Glass roof' },
        { value: 'solid', label: 'Solid roof' },
      ],
      showIf: notStraight,
    },
  ],
  constrain(p) {
    const doorWidth = num(p, 'doorWidth');
    // A door narrower than 600 is no door.
    return { ...p, doorWidth: doorWidth < 600 ? 0 : Math.min(doorWidth, num(p, 'width')) };
  },
  generate,
  dims(p): Dim[] {
    const hw = num(p, 'width') / 2;
    const h = num(p, 'height');
    const straight = !notStraight(p);
    const d = straight ? 0 : num(p, 'depth');
    const dims = [
      paramDim(CABIN, p, 'width', [-hw, 0, d + 350], [hw, 0, d + 350], { at: [hw, h / 2, d / 2], axis: [1, 0, 0], gain: 2 }),
      paramDim(CABIN, p, 'height', [-hw - 350, 0, d], [-hw - 350, h, d], { at: [-hw, h, d], axis: [0, 1, 0], gain: 1 }),
    ];
    if (!straight) dims.push(paramDim(CABIN, p, 'depth', [hw + 350, 0, 0], [hw + 350, 0, d], { at: [0, h / 2, d], axis: [0, 0, 1], gain: 1 }));
    return dims;
  },
};
