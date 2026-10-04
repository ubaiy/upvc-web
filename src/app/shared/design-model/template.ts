/**
 * design-model templates (Phase 2 item 2.3, model level): a DesignTemplate
 * wraps a WindowDesign with catalogue metadata and a parametric resize
 * rule, so "Standard bedroom 1200×1200" can be dropped into any quotation
 * at any size with its invariants intact.
 *
 * Resize rules:
 *  - 'proportional'   — every divider rescales with the frame, ignoring
 *    the stored lockedMm flags (the template is a pure proportion recipe);
 *  - 'preserve-locks' — the design's own lockedMm semantics apply: locked
 *    dividers keep their mm offsets (clamped), unlocked ones scale.
 *
 * The thumbnail is a DESCRIPTOR, not an image: the renderer owns pixel
 * production (stage.toDataURL) and stores the result here; the model never
 * touches the DOM.
 */

import { checkInvariants } from './invariants';
import { resizeFrame, OpOptions } from './operations';
import { parse } from './serialize';
import {
  DesignError,
  PaneNode,
  WindowDesign,
  isLeaf,
} from './types';

export const TEMPLATE_SCHEMA = 'upvc.design-template/1';

export interface ThumbnailDescriptor {
  kind: 'none' | 'dataUrl';
  /** Present for kind 'dataUrl' (the renderer's stage.toDataURL output). */
  value?: string;
}

export type TemplateResizeRule = 'proportional' | 'preserve-locks';

export interface DesignTemplate {
  schema: string;
  name: string;
  tags: string[];
  thumbnail: ThumbnailDescriptor;
  resizeRule: TemplateResizeRule;
  design: WindowDesign;
}

export interface CreateTemplateOptions {
  tags?: string[];
  thumbnail?: ThumbnailDescriptor;
  resizeRule?: TemplateResizeRule;
}

/** Snapshot a design as a named template (deep copy; design untouched). */
export function createTemplate(
  design: WindowDesign,
  name: string,
  opts?: CreateTemplateOptions
): DesignTemplate {
  if (!name.trim()) throw new DesignError('template needs a non-empty name');
  return {
    schema: TEMPLATE_SCHEMA,
    name: name.trim(),
    tags: (opts?.tags ?? []).map((t) => t.trim()).filter(Boolean),
    thumbnail: opts?.thumbnail ?? { kind: 'none' },
    resizeRule: opts?.resizeRule ?? 'proportional',
    design: JSON.parse(JSON.stringify(design)) as WindowDesign,
  };
}

export interface InstantiateResult {
  design: WindowDesign;
  /** Clamp notes the UI must surface (architecture §4 Phase 2 risk note). */
  warnings: string[];
}

/** Strip every lockedMm flag so resizeFrame scales purely proportionally. */
function unlockAll(node: PaneNode): PaneNode {
  if (isLeaf(node)) return node;
  return {
    ...node,
    lockedMm: node.lockedMm.map(() => false),
    children: node.children.map(unlockAll),
  };
}

/** All locked divider positions, in depth-first order (for clamp detection). */
function lockedPositions(node: PaneNode, out: number[] = []): number[] {
  if (isLeaf(node)) return out;
  node.positionsMm.forEach((p, i) => {
    if (node.lockedMm[i]) out.push(p);
  });
  node.children.forEach((c) => lockedPositions(c, out));
  return out;
}

/**
 * Instantiate a template at a new frame size, preserving every model
 * invariant. The returned design is independent of the template (deep
 * copy) and its history starts fresh. Warnings report frame clamping
 * (200–5800 mm / required-minimum bounds) and locked dividers that had to
 * move under 'preserve-locks'.
 */
export function instantiateTemplate(
  template: DesignTemplate,
  widthMm: number,
  heightMm: number,
  opts?: OpOptions
): InstantiateResult {
  if (template.schema !== TEMPLATE_SCHEMA) {
    throw new DesignError(`unknown template schema '${template.schema}'`);
  }
  const warnings: string[] = [];
  let design = JSON.parse(JSON.stringify(template.design)) as WindowDesign;
  const lockedBefore =
    template.resizeRule === 'preserve-locks'
      ? lockedPositions(design.root)
      : [];
  if (template.resizeRule === 'proportional') {
    design = { ...design, root: unlockAll(design.root) };
  }

  design = resizeFrame(design, widthMm, heightMm, opts);

  if (design.frame.widthMm !== widthMm || design.frame.heightMm !== heightMm) {
    warnings.push(
      `requested ${widthMm}×${heightMm} clamped to ` +
        `${design.frame.widthMm}×${design.frame.heightMm} mm`
    );
  }
  if (template.resizeRule === 'preserve-locks') {
    const lockedAfter = lockedPositions(design.root);
    const moved = lockedBefore.filter(
      (p, i) => Math.abs(p - (lockedAfter[i] ?? p)) > 1e-6
    ).length;
    if (moved > 0) {
      warnings.push(
        `${moved} locked divider${moved > 1 ? 's' : ''} clamped to fit the new size`
      );
    }
  }

  const problems = checkInvariants(design, opts);
  if (problems.length) {
    throw new DesignError(
      `template '${template.name}' cannot instantiate at ` +
        `${widthMm}×${heightMm}: ${problems.join('; ')}`
    );
  }
  return { design, warnings };
}

/** Serialize a template for the design_templates store. */
export function serializeTemplate(template: DesignTemplate): string {
  return JSON.stringify(template);
}

/** Parse (and validate) a stored template; the embedded design migrates. */
export function parseTemplate(input: string | object): DesignTemplate {
  let raw: unknown;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch (e) {
      throw new DesignError(
        `template is not valid JSON: ${(e as Error).message}`
      );
    }
  } else {
    raw = input;
  }
  const t = raw as Partial<DesignTemplate> | null;
  if (!t || typeof t !== 'object') throw new DesignError('template is not an object');
  if (t.schema !== TEMPLATE_SCHEMA) {
    throw new DesignError(`unknown template schema '${String(t.schema)}'`);
  }
  if (typeof t.name !== 'string' || !t.name.trim()) {
    throw new DesignError('template.name missing');
  }
  if (t.resizeRule !== 'proportional' && t.resizeRule !== 'preserve-locks') {
    throw new DesignError(`template.resizeRule '${String(t.resizeRule)}'`);
  }
  if (!t.design || typeof t.design !== 'object') {
    throw new DesignError('template.design missing');
  }
  return {
    schema: TEMPLATE_SCHEMA,
    name: t.name.trim(),
    tags: Array.isArray(t.tags) ? t.tags.filter((x): x is string => typeof x === 'string') : [],
    thumbnail:
      t.thumbnail && (t.thumbnail.kind === 'dataUrl' || t.thumbnail.kind === 'none')
        ? t.thumbnail
        : { kind: 'none' },
    resizeRule: t.resizeRule,
    design: parse(t.design), // migrates older design schemas
  };
}
