/** Helpers shared by the structure-model specs. */

import { faceCorners } from '../builder';
import { jointLengthMm } from '../derive';
import { Structure } from '../types';
import { edgeKey } from '../vec';

/** How many faces use each distinct edge. */
export function edgeUse(structure: Structure): number[] {
  const use = new Map<string, number>();
  for (const face of structure.faces) {
    const c = faceCorners(face);
    c.forEach((p, i) => {
      const key = edgeKey(p, c[(i + 1) % c.length]);
      use.set(key, (use.get(key) ?? 0) + 1);
    });
  }
  return [...use.values()];
}

/** Lengths of the bars of one role, shortest first, to a tenth of a millimetre. */
export function barLengths(structure: Structure, role: string): number[] {
  return structure.joints
    .filter((j) => j.role === role)
    .map((j) => Math.round(jointLengthMm(j) * 10) / 10)
    .sort((a, b) => a - b);
}

export const countRole = (structure: Structure, role: string): number => structure.joints.filter((j) => j.role === role).length;

export const facesOf = (structure: Structure, group: string) => structure.faces.filter((f) => f.group === group);
