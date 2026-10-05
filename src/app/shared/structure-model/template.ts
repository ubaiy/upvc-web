/**
 * structure-model template — what a parametric template is: a list of
 * parameters with defaults and limits, a pure generator, and the dimensions
 * the designer shows and lets the user drag or type. Pure.
 */

import { Params, ParamValue, Structure, Vec3 } from './types';
import { clamp } from './vec';

export interface ParamSpec {
  key: string;
  label: string;
  type: 'mm' | 'deg' | 'count' | 'choice' | 'toggle';
  default: ParamValue;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
  hint?: string;
  /** Hidden while this says no (a door width has no meaning without a front wall). */
  showIf?: (p: Params) => boolean;
}

/** One measured size of the structure, shown in the 3D view. */
export interface Dim {
  id: string;
  label: string;
  /** The measured line, already placed outside the structure. a = b for a size shown as a label only. */
  a: Vec3;
  b: Vec3;
  value: number;
  unit: 'mm' | 'deg';
  min: number;
  max: number;
  /** A drag handle: where it sits, the direction it moves in, and the change of value per mm moved. */
  handle?: { at: Vec3; axis: Vec3; gain: number };
  /** The parameters after the user sets this size (not yet normalised). */
  set(p: Params, value: number): Params;
}

export interface TemplateDef {
  kind: string;
  label: string;
  blurb: string;
  params: ParamSpec[];
  /** Limits that depend on other parameters (a rise cannot pass half the diameter). */
  constrain?(p: Params): Params;
  generate(p: Params): Structure;
  dims(p: Params): Dim[];
}

export function defaultParams(def: TemplateDef): Params {
  const p: Params = {};
  for (const s of def.params) p[s.key] = s.default;
  return normalizeParams(def, p);
}

/** Every parameter present, of the right type, inside its limits and on its step. */
export function normalizeParams(def: TemplateDef, input: Params): Params {
  const p: Params = {};
  for (const s of def.params) {
    const raw = input[s.key];
    if (s.type === 'toggle') {
      p[s.key] = typeof raw === 'boolean' ? raw : s.default;
    } else if (s.type === 'choice') {
      p[s.key] = typeof raw === 'string' && s.options?.some((o) => o.value === raw) ? raw : s.default;
    } else {
      let v = typeof raw === 'number' && Number.isFinite(raw) ? raw : (s.default as number);
      const step = s.step ?? 1;
      // On its step, without the 58.800000000000004 of binary fractions.
      v = Number((Math.round(v / step) * step).toFixed(4));
      p[s.key] = clamp(v, s.min ?? -Infinity, s.max ?? Infinity);
    }
  }
  return def.constrain ? def.constrain(p) : p;
}

export const num = (p: Params, key: string): number => p[key] as number;
export const str = (p: Params, key: string): string => p[key] as string;

/** The usual dimension: it sets one numeric parameter. */
export function paramDim(
  def: { params: ParamSpec[] },
  p: Params,
  key: string,
  a: Vec3,
  b: Vec3,
  handle?: Dim['handle']
): Dim {
  const spec = def.params.find((s) => s.key === key) as ParamSpec;
  return {
    id: key,
    label: spec.label,
    a,
    b,
    value: num(p, key),
    unit: spec.type === 'deg' ? 'deg' : 'mm',
    min: spec.min ?? 0,
    max: spec.max ?? Infinity,
    handle,
    set: (q, value) => ({ ...q, [key]: value }),
  };
}
