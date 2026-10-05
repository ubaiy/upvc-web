/**
 * design-canvas renderer — the two things every leaf is made of: a sash (a
 * frame of stiles and rails with a real face width) and its glass, with the
 * dark gasket round it. A pane glazed differently from the window gets its
 * own tint, a hatch and a small tag.
 */

import Konva from 'konva';
import {
  LeafNode,
  glassIndexOf,
  hasOwnGlass,
  paneGlassId,
} from '../../design-model';
import {
  COL,
  Parent,
  PxRect,
  RenderCtx,
  glassTintFor,
  insetPx,
  shadeColor,
} from './render-common';
import { drawBevelBands } from './render-frame';

/** The seal between glass and profile: what makes a pane read as glazed. */
export const GASKET = '#30343a';
/** Tints for a pane's own glass when the catalogue names no colour for it. */
const OWN_GLASS_TINTS = ['#d6d0ee', '#f1dfbb', '#cbe6cf', '#f0cfd6'];

export interface SashOpts {
  /** Node name of the bands (and `<name>-edge` of the outline). */
  name: string;
  /** Front leaves throw a soft shadow on what is behind them. */
  shadow?: boolean;
  attrs?: Record<string, unknown>;
}

/**
 * A sash: outline, four mitred bands of `facePx`, inner reveal. Returns the
 * rect the glass sits in.
 */
export function drawSashFrame(
  parent: Parent,
  r: PxRect,
  facePx: number,
  color: string,
  o: SashOpts
): PxRect {
  // A sash is a shade darker than the frame it sits in, so its two stiles
  // and two rails read as members of their own even in a white profile.
  color = sashColor(color);
  const edge = new Konva.Rect({
    x: r.x,
    y: r.y,
    width: r.w,
    height: r.h,
    fill: color,
    stroke: COL.stroke,
    strokeWidth: 1.5,
    listening: false,
    name: `${o.name}-edge`,
    ...(o.shadow
      ? { shadowColor: '#000000', shadowBlur: 7, shadowOpacity: 0.38, shadowOffset: { x: 0, y: 1 } }
      : {}),
  });
  if (o.attrs) edge.setAttrs(o.attrs);
  parent.add(edge);
  drawBevelBands(parent, r.x, r.y, r.w, r.h, facePx, color, o.name);
  return insetPx(r, facePx);
}

/** The sash colour for a profile colour: a shade darker (lighter when the profile is dark). */
export function sashColor(profile: string): string {
  const hex = shadeColor(profile, 0);
  const n = parseInt(hex.slice(1), 16);
  const luma = (((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000;
  return shadeColor(hex, luma < 90 ? 0.14 : -0.09);
}

export interface GlassOpts {
  name?: string;
  /** Tag a pane that has its own glass (once per pane). */
  tag?: boolean;
  bars?: boolean;
}

/** Glass of `leaf` in `g`: tint, gasket, reflection, glazing bars, own-glass marks. */
export function drawGlass(
  parent: Parent,
  leaf: LeafNode,
  g: PxRect,
  ctx: RenderCtx,
  o: GlassOpts = {}
): void {
  const own = hasOwnGlass(ctx.design, leaf);
  const index = own ? glassIndexOf(ctx.design, leaf) : 0;
  const tint = own
    ? glassTintFor(leaf.glassId ?? null, ctx.opts.glassTints) ??
      OWN_GLASS_TINTS[(index - 1) % OWN_GLASS_TINTS.length]
    : ctx.opts.glassTint ?? null;
  const glass = new Konva.Rect({
    x: g.x,
    y: g.y,
    width: g.w,
    height: g.h,
    stroke: GASKET,
    strokeWidth: ctx.detail === 'tiny' ? 1 : 1.5,
    listening: false,
    name: o.name ?? 'glass-pane',
    fillLinearGradientStartPoint: { x: 0, y: 0 },
    fillLinearGradientEndPoint: { x: 0, y: g.h },
    fillLinearGradientColorStops: tint
      ? [0, shadeColor(tint, 0.55), 1, tint]
      : [0, COL.glassTop, 1, COL.glassBottom],
  });
  glass.setAttrs({
    paneId: leaf.id,
    glassTint: tint ?? '',
    glassId: paneGlassId(ctx.design, leaf),
    ownGlass: own,
  });
  parent.add(glass);
  if (ctx.detail !== 'tiny') drawGlassReflection(parent, g);
  if (own) drawGlassHatch(parent, g, index);
  if (o.bars !== false) drawGlazingBars(parent, g, ctx);
  if (own && o.tag !== false) drawGlassTag(parent, leaf, g, ctx, index);
}

function drawGlassReflection(parent: Parent, r: PxRect): void {
  const { x, y, w, h } = r;
  parent.add(
    new Konva.Line({
      points: [
        x + w * 0.52, y,
        x + w * 0.72, y,
        x + w * 0.32, y + h,
        x + w * 0.12, y + h,
      ],
      closed: true,
      fill: 'rgba(255,255,255,0.28)',
      listening: false,
      name: 'glass-reflection',
    })
  );
}

/**
 * Sparse diagonal lines over a pane with its own glass. The second
 * different glass leans the other way, the third is crossed, so two
 * special glasses in one window can be told apart in black and white.
 */
function drawGlassHatch(parent: Parent, g: PxRect, index: number): void {
  const step = 13;
  const variant = (index - 1) % 3;
  const points: number[][] = [];
  for (let d = step; d < g.w + g.h; d += step) {
    const x1 = Math.min(d, g.w);
    const y1 = Math.max(0, d - g.w);
    const x2 = Math.max(0, d - g.h);
    const y2 = Math.min(d, g.h);
    if (variant !== 1) points.push([g.x + x1, g.y + y1, g.x + x2, g.y + y2]);
    if (variant !== 0) points.push([g.x + g.w - x1, g.y + y1, g.x + g.w - x2, g.y + y2]);
  }
  const hatch = new Konva.Shape({
    listening: false,
    name: 'glass-hatch',
    stroke: 'rgba(38, 48, 60, 0.3)',
    strokeWidth: 1,
    sceneFunc: (c, shape) => {
      c.beginPath();
      for (const [ax, ay, bx, by] of points) {
        c.moveTo(ax, ay);
        c.lineTo(bx, by);
      }
      c.strokeShape(shape);
    },
  });
  hatch.setAttr('variant', variant);
  parent.add(hatch);
}

/** "G2 6mm Toughened" in the bottom corner of a pane with its own glass. */
function drawGlassTag(
  parent: Parent,
  leaf: LeafNode,
  g: PxRect,
  ctx: RenderCtx,
  index: number
): void {
  if (g.w < 24 || g.h < 22) return;
  const code = `G${index + 1}`;
  const name = ctx.opts.glassLabels?.[String(leaf.glassId)] ?? '';
  const fontSize = ctx.detail === 'full' ? 10 : 9;
  const text = new Konva.Text({ text: name ? `${code} ${name}` : code, fontSize, padding: 3, fill: '#ffffff', fontStyle: 'bold' });
  if (text.width() > g.w - 8) text.text(code);
  const label = new Konva.Label({
    x: g.x + 4,
    y: g.y + g.h - text.height() - 4,
    listening: false,
    name: 'glass-tag',
  });
  label.setAttrs({ paneId: leaf.id, glassIndex: index, caption: text.text() });
  label.add(new Konva.Tag({ fill: '#374151', cornerRadius: 3, opacity: 0.92 }));
  label.add(text);
  parent.add(label);
}

/** Glazing / Georgian bars from the document's glazing spec. */
function drawGlazingBars(parent: Parent, r: PxRect, ctx: RenderCtx): void {
  const { x, y, w, h } = r;
  const vBars = ctx.design.glazing.barsV;
  const hBars = ctx.design.glazing.barsH;
  if (!vBars && !hBars) return;
  const color = ctx.opts.profileColor;
  const barPx = 3;
  const fill = color && color !== '#ffffff' ? color : '#bfbfbf';
  const bar = (bx: number, by: number, bw: number, bh: number): void => {
    parent.add(
      new Konva.Rect({
        x: bx,
        y: by,
        width: bw,
        height: bh,
        fill,
        stroke: '#777777',
        strokeWidth: 0.5,
        listening: false,
        name: 'glazing-bar',
      })
    );
  };
  for (let i = 1; i <= vBars; i++) {
    bar(x + (w / (vBars + 1)) * i - barPx / 2, y, barPx, h);
  }
  for (let j = 1; j <= hBars; j++) {
    bar(x, y + (h / (hBars + 1)) * j - barPx / 2, w, barPx);
  }
}
