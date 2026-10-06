/** The structure templates the designer offers, in the order of its start screen. */

import { TemplateDef } from '../template';
import { BAY } from './bay';
import { CABIN } from './cabin';
import { GABLE, LEAN_TO } from './conservatory';
import { DOME } from './dome';
import { FREE } from './free';
import { PYRAMID } from './pyramid';

export const TEMPLATES: readonly TemplateDef[] = [DOME, CABIN, BAY, PYRAMID, LEAN_TO, GABLE];

/** Every generator: the examples of the start screen and the structure drawn from nothing. */
const ALL: readonly TemplateDef[] = [...TEMPLATES, FREE];

export function templateOf(kind: string): TemplateDef | undefined {
  return ALL.find((t) => t.kind === kind);
}

export { BAY, CABIN, DOME, FREE, GABLE, LEAN_TO, PYRAMID };
export { eaveHeight, FREE_KIND, planOf, ROOF_LABEL, roofRefusal, wallStates } from './free';
