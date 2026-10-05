/**
 * structure-model operations — every change of a Structure. All pure: each
 * returns a new document and leaves the one it was given alone.
 */

import { faceNormal } from './builder';
import { FillKey } from './derive';
import { TemplateDef, defaultParams, normalizeParams } from './template';
import { templateOf } from './templates';
import { Face, FaceFill, Params, STRUCTURE_SCHEMA, Structure } from './types';
import { area2, dot, len } from './vec';

/** A new structure of a template at its default size (or with some parameters given). */
export function createStructure(kind: string, params?: Params): Structure {
  const def = templateOf(kind);
  if (!def) throw new Error(`Unknown structure template: ${kind}`);
  return def.generate(params ? normalizeParams(def, { ...defaultParams(def), ...params }) : defaultParams(def));
}

/** The parameters of a structure, normalised (null for a free build). */
export function paramsOf(structure: Structure): { def: TemplateDef; params: Params } | null {
  const def = structure.template ? templateOf(structure.template.kind) : undefined;
  return def && structure.template ? { def, params: normalizeParams(def, structure.template.params) } : null;
}

/**
 * Run the template again with other parameters. The name and colours are
 * kept, and so are the fill and the glass tint of every face the user changed
 * by hand whose id still exists (panel 3 of the front wall stays a door while
 * the wall grows).
 */
export function retemplate(structure: Structure, params: Params): Structure {
  const own = paramsOf(structure);
  if (!own) return structure;
  const next = own.def.generate(normalizeParams(own.def, { ...own.params, ...params }));
  const edited = new Map(structure.faces.filter((f) => f.edited).map((f) => [f.id, f]));
  return {
    ...next,
    name: structure.name,
    defaults: structure.defaults,
    appearance: structure.appearance,
    faces: next.faces.map((face) => {
      const old = edited.get(face.id);
      if (!old || old.role !== face.role) return face;
      return { ...face, fill: old.fill, edited: true, ...(old.glassTint ? { glassTint: old.glassTint } : {}) };
    }),
  };
}

/** What a choice of the designer means for a face: a roof pane is plain glass, a wall panel a framed unit. */
export function fillFor(face: Face, key: FillKey): FaceFill {
  switch (key) {
    case 'panel':
      return { kind: 'panel', productId: null };
    case 'open':
      return { kind: 'open' };
    case 'fixed':
      return face.role === 'roof' ? { kind: 'glass', glassId: null } : { kind: 'design', opening: 'fixed' };
    default:
      return { kind: 'design', opening: key };
  }
}

export function setFaceFill(structure: Structure, faceIds: string[], key: FillKey): Structure {
  const ids = new Set(faceIds);
  if (!structure.faces.some((f) => ids.has(f.id))) return structure;
  return {
    ...structure,
    faces: structure.faces.map((f) => (ids.has(f.id) ? { ...f, fill: fillFor(f, key), edited: true } : f)),
  };
}

/** A glass tint for these faces only; null puts them back on the tint of the structure. */
export function setFaceGlassTint(structure: Structure, faceIds: string[], tint: string | null): Structure {
  const ids = new Set(faceIds);
  if (!structure.faces.some((f) => ids.has(f.id))) return structure;
  return {
    ...structure,
    faces: structure.faces.map((f) => {
      if (!ids.has(f.id)) return f;
      const { glassTint: _own, ...rest } = f;
      return tint ? { ...rest, glassTint: tint, edited: true } : rest;
    }),
  };
}

export function setAppearance(structure: Structure, patch: Partial<Structure['appearance']>): Structure {
  return { ...structure, appearance: { ...structure.appearance, ...patch } };
}

export function renameStructure(structure: Structure, name: string): Structure {
  const clean = name.trim().slice(0, 80);
  return clean && clean !== structure.name ? { ...structure, name: clean } : structure;
}

/** Ids of the faces changed together with this one (its wall, ring or slope). */
export function groupFaceIds(structure: Structure, faceId: string): string[] {
  const face = structure.faces.find((f) => f.id === faceId);
  return face ? structure.faces.filter((f) => f.group === face.group).map((f) => f.id) : [];
}

/** Invariant problems of a document; an empty list means it is sound. */
export function checkStructure(s: Structure): string[] {
  const problems: string[] = [];
  if (s.schema !== STRUCTURE_SCHEMA) problems.push(`schema is ${s.schema}`);
  const faceIds = new Set<string>();
  for (const f of s.faces) {
    if (faceIds.has(f.id)) problems.push(`face id ${f.id} is used twice`);
    faceIds.add(f.id);
    const { u, v } = f.plane;
    if (Math.abs(len(u) - 1) > 1e-6 || Math.abs(len(v) - 1) > 1e-6) problems.push(`face ${f.id}: axes are not unit`);
    if (Math.abs(dot(u, v)) > 1e-6) problems.push(`face ${f.id}: axes are not perpendicular`);
    if (f.outline.length < 3) problems.push(`face ${f.id}: fewer than 3 corners`);
    else if (area2(f.outline) <= 1) problems.push(`face ${f.id}: outline is empty or clockwise`);
    if (f.outline.some(([x, y]) => x < -1e-6 || y < -1e-6)) problems.push(`face ${f.id}: outline leaves its plane origin`);
    if (!Number.isFinite(len(faceNormal(f)))) problems.push(`face ${f.id}: bad plane`);
  }
  const jointIds = new Set<string>();
  for (const j of s.joints) {
    if (jointIds.has(j.id)) problems.push(`joint id ${j.id} is used twice`);
    jointIds.add(j.id);
    if (len([j.b[0] - j.a[0], j.b[1] - j.a[1], j.b[2] - j.a[2]]) < 1) problems.push(`joint ${j.id}: no length`);
    if (!j.faceIds.length) problems.push(`joint ${j.id}: on no face edge`);
    for (const id of j.faceIds) if (!faceIds.has(id)) problems.push(`joint ${j.id}: unknown face ${id}`);
  }
  for (const h of s.hubs) {
    if (!h.jointIds.length) problems.push(`hub ${h.id}: no bar arrives`);
    for (const id of h.jointIds) if (!jointIds.has(id)) problems.push(`hub ${h.id}: unknown joint ${id}`);
  }
  return problems;
}

export function serializeStructure(structure: Structure): string {
  return JSON.stringify(structure, null, 2);
}

/** Read a saved or exported document. Throws with a plain message when it is not one. */
export function parseStructure(text: string): Structure {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new Error('This file is not a structure document (not JSON).');
  }
  const s = doc as Partial<Structure> | null;
  if (!s || s.schema !== STRUCTURE_SCHEMA) throw new Error('This file is not a structure document (schema upvc.structure/1 expected).');
  if (!Array.isArray(s.faces) || !Array.isArray(s.joints) || !Array.isArray(s.hubs)) throw new Error('This structure document is incomplete.');
  const structure = { ...s, extras: s.extras ?? [] } as Structure;
  const problems = checkStructure(structure);
  if (problems.length) throw new Error(`This structure document is damaged: ${problems[0]}.`);
  return structure;
}
