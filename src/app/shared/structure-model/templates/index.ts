/** The structure templates the designer offers, in the order of its start screen. */

import { TemplateDef } from '../template';
import { BAY } from './bay';
import { CABIN } from './cabin';
import { GABLE, LEAN_TO } from './conservatory';
import { DOME } from './dome';
import { PYRAMID } from './pyramid';

export const TEMPLATES: readonly TemplateDef[] = [DOME, CABIN, BAY, PYRAMID, LEAN_TO, GABLE];

export function templateOf(kind: string): TemplateDef | undefined {
  return TEMPLATES.find((t) => t.kind === kind);
}

export { BAY, CABIN, DOME, GABLE, LEAN_TO, PYRAMID };
