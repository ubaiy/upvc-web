/**
 * Opening a saved quotation line in the designer.
 *
 *  1. A line saved by the new designer carries the WindowDesign document in
 *     `old_post_data.design`: it is parsed and opens exactly as saved.
 *  2. An older line has no document. It goes through the existing
 *     reconstruction (design-tree.util.ts: the `design_tree` snapshot the old
 *     screen stored, else the `full_window` rebuild) and the resulting pane
 *     tree is converted into a WindowDesign.
 *  3. If that conversion is not faithful (the old layout could only be
 *     approximated, the sizes do not match what was saved, or the line uses
 *     an option the model does not carry) the line opens read-only and the
 *     user is offered "Redraw this window".
 *
 * Opening never prices anything: the caller shows the stored price until
 * the user changes the window. Pure: no Angular, no HTTP.
 */

import {
  DEFAULT_FRAME_FACE_MM,
  Id,
  LeafNode,
  PaneNode as ModelNode,
  SlidePanel,
  SplitNode,
  TrackType,
  WindowDesign,
  checkInvariants,
  createDesign,
  fromLegacy,
  layout,
  parse,
  positionsFromWidths,
} from 'src/app/shared/design-model';
import {
  PaneNode as OldNode,
  deserializePaneTree,
  reconstructFromFullWindow,
} from './design-tree.util';

export type SavedLineSource = 'design' | 'snapshot' | 'full_window' | 'none';

export interface OpenedLine {
  design: WindowDesign;
  source: SavedLineSource;
  /** False: open read-only and offer "Redraw this window". */
  faithful: boolean;
  /** Plain-language reasons, shown to the user when not faithful. */
  reasons: string[];
}

export interface SavedLineOptions {
  frameFaceMm?: number;
}

const TRACKS: TrackType[] = ['2 Track', '2.5 Track', '3 Track', '4 Track'];

/** '' and undefined mean "not set" in the old data (the api nulls empty strings). */
function idOf(v: unknown): Id | null {
  return v === undefined || v === null || v === '' ? null : (v as Id);
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseObject(raw: unknown): any {
  if (!raw) return null;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

interface Convert {
  spec: any;
  face: number;
  seq: number;
  reasons: string[];
}

function nextId(c: Convert): string {
  return `p${++c.seq}`;
}

function casementLeaf(node: OldNode, c: Convert): LeafNode {
  const type = node.casementType ?? c.spec?.casement_type;
  const leaf: LeafNode = {
    id: nextId(c),
    kind: 'leaf',
    category: 'Casement',
    casementType: type === 'Openable' ? 'Openable' : 'Fixed',
    productId: idOf(node.productId ?? c.spec?.product_id),
    sashId: null,
  };
  if (leaf.casementType === 'Openable') {
    leaf.sashId = idOf(node.sashId ?? c.spec?.sash_id);
    leaf.opening = {
      direction: node.openingDirection || c.spec?.opening_direction || 'Left',
      handleId: idOf(node.handleId ?? c.spec?.handle_id),
      hingesType: (node.hingesType || c.spec?.hinges_type || null) as string | null,
    };
  }
  if (node.framed) leaf.sashFramed = true;
  return leaf;
}

function slidingLeaf(first: OldNode, panels: SlidePanel[], c: Convert): LeafNode {
  const track = c.spec?.is_track;
  return {
    id: nextId(c),
    kind: 'leaf',
    category: 'Slidding',
    productId: idOf(first.productId ?? c.spec?.product_id),
    sashId: idOf(first.sashId ?? c.spec?.sash_id),
    slide: {
      tracks: TRACKS.includes(track) ? track : '2 Track',
      mesh: !!c.spec?.fly_mesh,
      panels,
    },
  };
}

function categoryOf(node: OldNode, c: Convert): string {
  return node.category ?? c.spec?.category_type ?? 'Casement';
}

/**
 * Convert one old node into the model. `wMm` × `hMm` is the daylight the
 * node fills. The old tree stores each split as fractions of what is left
 * after the divider faces; the model stores divider centrelines in mm.
 */
function convertNode(node: OldNode, wMm: number, hMm: number, c: Convert): ModelNode {
  const split = node.split;
  if (!split) {
    if (categoryOf(node, c) === 'Slidding') {
      // An undivided sliding pane was drawn, and priced, as one sash.
      const direction = node.openingDirection === 'Right' ? 'Right' : 'Left';
      return slidingLeaf(node, [{ widthMm: wMm, direction }], c);
    }
    return casementLeaf(node, c);
  }

  const alongX = split.direction === 'vertical';
  const sash = split.kind === 'palla';
  const face = sash ? 0 : split.mullionWidthMm || c.face;
  const span = alongX ? wMm : hMm;
  const avail = span - face * (split.children.length - 1);
  const sizes = split.fractions.map((f) => f * avail);

  // The old screen drew a slider as a palla division of Slidding sashes. In
  // the model the pallas are panels of ONE sliding pane, not panes.
  const sliders = split.children.filter((ch) => !ch.split && categoryOf(ch, c) === 'Slidding');
  if (sash && sliders.length === split.children.length) {
    if (!alongX) c.reasons.push('A sliding window stacked top to bottom cannot be drawn here.');
    return slidingLeaf(
      split.children[0],
      split.children.map((ch, i) => ({
        widthMm: sizes[i],
        direction:
          ch.openingDirection === 'Right' || ch.openingDirection === 'Left'
            ? ch.openingDirection
            : i % 2 === 0
            ? 'Left'
            : 'Right',
      })),
      c
    );
  }
  if (sash && sliders.length) {
    c.reasons.push('Sliding and casement sashes share one division; that mix cannot be drawn here.');
  }

  const id = nextId(c);
  const children = split.children.map((ch, i) => {
    const cw = alongX ? sizes[i] : wMm;
    const chH = alongX ? hMm : sizes[i];
    // A framed sash that is itself divided: its content sits inside the sash band.
    const inset = ch.framed && ch.split ? c.face : 0;
    return convertNode(ch, cw - 2 * inset, chH - 2 * inset, c);
  });
  const out: SplitNode = {
    id,
    kind: 'split',
    axis: alongX ? 'x' : 'y',
    dividerKind: sash ? 'sash' : 'mullion',
    dividerProfileId: sash ? null : idOf(split.profileId),
    dividerFaceMm: face,
    positionsMm: positionsFromWidths(sizes, face),
    lockedMm: sizes.slice(1).map(() => false),
    children,
  };
  if (node.framed) out.sashFramed = true;
  return out;
}

/** Options of the old screen that the model does not carry. */
function unsupportedOptions(spec: any): string[] {
  const out: string[] = [];
  if (spec?.is_louvers) out.push('It was saved with the "Louvers" option.');
  if (spec?.is_lshape) out.push('It was saved with the "L shape" option.');
  if (spec?.is_cupler) out.push('It was saved with the "Coupler" option.');
  if (spec?.ventilation_id) out.push('It was saved with a ventilation unit.');
  return out;
}

/**
 * The saved section sizes, when the line has them, must be what the
 * converted design measures: that is the proof the drawing is the same.
 */
function sizeMismatch(design: WindowDesign, sections: any, face: number): boolean {
  if (!Array.isArray(sections) || !sections.length) return false;
  const saved = sections
    .map((s) => [num(s?.widthMm), num(s?.heightMm)])
    .filter(([w, h]) => w > 0 && h > 0);
  if (saved.length !== sections.length) return false;
  const now: number[][] = [];
  for (const { leaf, rect } of layout(design, { frameFaceMm: face }).leaves) {
    if (leaf.category === 'Slidding' && leaf.slide) {
      for (const p of leaf.slide.panels) now.push([p.widthMm, rect.hMm]);
    } else {
      now.push([rect.wMm, rect.hMm]);
    }
  }
  if (now.length !== saved.length) return true;
  return now.some(([w, h], i) => Math.abs(w - saved[i][0]) > 1.5 || Math.abs(h - saved[i][1]) > 1.5);
}

/**
 * Open a `quatation/show-product` row. `row` is used as received: `width`,
 * `height`, `costhead_information.old_post_data`, `quatation_object_data`.
 */
export function openSavedLine(row: any, opts?: SavedLineOptions): OpenedLine {
  const face = opts?.frameFaceMm ?? DEFAULT_FRAME_FACE_MM;
  const opd = row?.costhead_information?.old_post_data ?? null;

  if (opd?.design) {
    try {
      return { design: parse(opd.design), source: 'design', faithful: true, reasons: [] };
    } catch {
      // A damaged document falls through to the older sources below.
    }
  }

  const qod = parseObject(row?.quatation_object_data);
  const widthMm = num(qod?.width ?? row?.width);
  const heightMm = num(qod?.height ?? row?.height);
  const c: Convert = { spec: opd ?? {}, face, seq: 0, reasons: [] };
  let n = 0;
  const oldId = () => `o${++n}`;

  let source: SavedLineSource = 'none';
  let tree: OldNode | null = null;
  const snapshot = qod?.design_tree;
  if (snapshot?.root) {
    tree = deserializePaneTree(snapshot.root, oldId);
    if (tree) {
      source = 'snapshot';
      // The window-level controls as they were at save time (old_post_data
      // holds the first SECTION's part, with per-section sizes).
      if (snapshot.spec && typeof snapshot.spec === 'object') c.spec = snapshot.spec;
    }
  }
  if (!tree) {
    const rec = reconstructFromFullWindow(opd, oldId, { width: widthMm, height: heightMm });
    if (rec) {
      tree = rec.root;
      source = 'full_window';
      if (rec.approximate) {
        c.reasons.push('Its layout could only be approximated.');
      }
    }
  }

  if (!tree || !(widthMm > 0) || !(heightMm > 0)) {
    // Nothing to rebuild from: the model's own best effort, never editable.
    let design: WindowDesign;
    try {
      design = fromLegacy(opd).design;
    } catch {
      design = createDesign();
    }
    return {
      design,
      source: 'none',
      faithful: false,
      reasons: ['The saved drawing of this window could not be read.'],
    };
  }

  c.reasons.push(...unsupportedOptions(c.spec));
  const colourId = idOf(qod?.color?.id ?? c.spec?.color_id);
  const root = convertNode(tree, widthMm - 2 * face, heightMm - 2 * face, c);
  const design: WindowDesign = createDesign({
    frame: {
      widthMm,
      heightMm,
      productId: idOf(c.spec?.product_id),
      colorId: colourId,
      profileColor: qod?.profile_color ?? qod?.color?.color_code ?? null,
    },
    productType: c.spec?.product_type === 'Door' ? 'Door' : 'Window',
    glazing: {
      glassId: idOf(c.spec?.glazz_id),
      barsH: num(c.spec?.glazing_bars_horizontal),
      barsV: num(c.spec?.glazing_bars_vertical),
    },
    root,
  });

  try {
    const problems = checkInvariants(design, { frameFaceMm: face });
    if (problems.length) {
      c.reasons.push('Its saved sizes do not fit together any more.');
    } else if (sizeMismatch(design, qod?.sections, face)) {
      c.reasons.push('Its pane sizes do not match what was saved.');
    }
  } catch {
    c.reasons.push('Its saved sizes do not fit together any more.');
  }

  return { design, source, faithful: c.reasons.length === 0, reasons: c.reasons };
}
