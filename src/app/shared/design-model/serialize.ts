/**
 * design-model persistence — serialize / parse with a schema-version
 * migration registry. The serialized document is saved inside the existing
 * `old_post_data` JSON blob under the key `design` (zero API schema change);
 * `parse` upgrades any older schema through the registry on load, so a
 * saved window reopens exactly as saved, forever.
 */

import { checkInvariants } from './invariants';
import {
  DESIGN_SCHEMA,
  DesignError,
  PaneNode,
  WindowDesign,
  isSplit,
} from './types';

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

/** A migration takes a document at `from` and returns one at its `to`. */
export interface Migration {
  from: string;
  to: string;
  migrate(doc: unknown): unknown;
}

const registry = new Map<string, Migration>();

/**
 * Register a schema migration. Phase 1 ships only `upvc.design/1`, so the
 * registry starts empty; each future phase registers exactly one step
 * (`upvc.design/1` → `upvc.design/2`, ...) and old documents chain up.
 */
export function registerMigration(migration: Migration): void {
  registry.set(migration.from, migration);
}

/** Visible for tests. */
export function clearMigrations(): void {
  registry.clear();
}

/** Upgrade a raw document to the current schema (no-op when current). */
export function migrate(doc: unknown): WindowDesign {
  let current = doc as { schema?: unknown };
  let guard = 0;
  while (
    current &&
    typeof current === 'object' &&
    typeof current.schema === 'string' &&
    current.schema !== DESIGN_SCHEMA
  ) {
    const step = registry.get(current.schema);
    if (!step) {
      throw new ParseError(`unknown design schema '${current.schema}'`);
    }
    current = step.migrate(current) as { schema?: unknown };
    if (++guard > 32) throw new ParseError('migration chain does not terminate');
  }
  return current as WindowDesign;
}

/** Serialize a design for persistence (plain JSON, stable by key insertion). */
export function serialize(design: WindowDesign): string {
  return JSON.stringify(design);
}

/**
 * Parse (and migrate) a serialized design. Accepts either the JSON string
 * or an already-deserialized object (the `old_post_data.design` value as
 * it comes off the wire). Throws {@link ParseError} on malformed input.
 */
export function parse(input: string | object): WindowDesign {
  let raw: unknown;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch (e) {
      throw new ParseError(`design is not valid JSON: ${(e as Error).message}`);
    }
  } else {
    raw = input;
  }
  const migrated = migrate(raw);
  const problems = validateShape(migrated);
  if (problems.length) {
    throw new ParseError(`invalid design document: ${problems.join('; ')}`);
  }
  return migrated;
}

/**
 * Structural validation of a (schema-current) document. Returns problems;
 * empty = OK. Separate from {@link checkInvariants} so callers can accept a
 * structurally sound document whose VALUES need user attention.
 */
export function validateShape(doc: unknown): string[] {
  const problems: string[] = [];
  const d = doc as Partial<WindowDesign> | null;
  if (!d || typeof d !== 'object') return ['document is not an object'];
  if (d.schema !== DESIGN_SCHEMA) problems.push(`schema '${String(d.schema)}'`);
  if (d.unit !== 'mm') problems.push(`unit '${String(d.unit)}'`);
  if (!d.frame || typeof d.frame !== 'object') problems.push('missing frame');
  else {
    if (typeof d.frame.widthMm !== 'number') problems.push('frame.widthMm');
    if (typeof d.frame.heightMm !== 'number') problems.push('frame.heightMm');
    if (d.frame.shape?.kind !== 'rect') problems.push('frame.shape.kind');
  }
  if (d.productType !== 'Window' && d.productType !== 'Door') {
    problems.push(`productType '${String(d.productType)}'`);
  }
  if (!d.glazing || typeof d.glazing !== 'object') problems.push('missing glazing');
  if (!d.root || typeof d.root !== 'object') {
    problems.push('missing root');
    return problems;
  }
  validateNode(d.root as PaneNode, 'root', problems);
  return problems;
}

function validateNode(node: PaneNode, path: string, problems: string[]): void {
  if (typeof node.id !== 'string' || !node.id) {
    problems.push(`${path}.id`);
  }
  if (node.kind === 'leaf') {
    if (node.category !== 'Casement' && node.category !== 'Slidding') {
      problems.push(`${path}.category '${String(node.category)}'`);
    }
    if (node.category === 'Slidding') {
      if (!node.slide || !Array.isArray(node.slide.panels)) {
        problems.push(`${path}.slide`);
      }
    }
    return;
  }
  if (!isSplit(node)) {
    problems.push(`${path}.kind '${String((node as { kind?: unknown }).kind)}'`);
    return;
  }
  if (node.axis !== 'x' && node.axis !== 'y') problems.push(`${path}.axis`);
  if (!Array.isArray(node.positionsMm)) problems.push(`${path}.positionsMm`);
  if (!Array.isArray(node.lockedMm)) problems.push(`${path}.lockedMm`);
  if (!Array.isArray(node.children) || node.children.length < 1) {
    problems.push(`${path}.children`);
    return;
  }
  if (node.positionsMm.length !== node.children.length - 1) {
    problems.push(`${path}: children/positions count mismatch`);
  }
  node.children.forEach((c, i) =>
    validateNode(c, `${path}.children[${i}]`, problems)
  );
}

/** Convenience: parse + invariant check; throws DesignError on bad values. */
export function parseStrict(input: string | object): WindowDesign {
  const design = parse(input);
  const problems = checkInvariants(design);
  if (problems.length) {
    throw new DesignError(`design violates invariants: ${problems.join('; ')}`);
  }
  return design;
}
