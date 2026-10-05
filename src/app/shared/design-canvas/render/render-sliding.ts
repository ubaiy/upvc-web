/**
 * design-canvas renderer — a sliding leaf the way the trade draws it, from
 * the model's slideLayout():
 *
 *  - every shutter is its own framed sash: two stiles and two rails at the
 *    sash profile's face width, each outlined and mitred at the corners, a
 *    shade off the outer frame, with its glass inside; a dark reveal of the
 *    track pocket separates it from the outer frame at the head, the sill
 *    and the jamb it stands against;
 *  - shutters on different tracks overlap by one stile at the interlock, the
 *    one on the track nearer the viewer drawn over the other with a shadow
 *    edge; a circled number on each shutter is its track (1 = outside);
 *  - a moving shutter carries an arrow in the direction it travels and a
 *    touch lock on the stile it is pulled by (the one it leaves behind);
 *    a fixed one says FIXED;
 *  - the fly mesh is a shutter of its own: a slimmer, lighter frame with a
 *    fine hatch, named with its track (the innermost one), drawn where it
 *    is parked, inside the bands of the glass shutter it is parked with so
 *    both shutters can be seen;
 *  - the tracks are thin lines on the sill, one per track.
 */

import Konva from 'konva';
import {
  LeafNode,
  SlideLayout,
  SlideSpec,
  TRACK_COUNTS,
  slideLayout,
} from '../../design-model';
import {
  COL,
  Parent,
  PxRect,
  RenderCtx,
  insetPx,
  sashFacePx,
  shadeColor,
} from './render-common';
import { drawGlass, drawShutterSash } from './render-sash';

/** One shutter as drawn. */
interface ShutterPx {
  index: number;
  track: number;
  fixed: boolean;
  /** Travels towards the right of the SCREEN (mirrored with the view). */
  slidesRight: boolean;
  rect: PxRect;
}

interface SlidePx {
  layout: SlideLayout;
  facePx: number;
  /** The gap of the track pocket shown between a shutter and the outer frame. */
  revealPx: number;
  shutters: ShutterPx[];
  mesh: PxRect | null;
}

/** Pocket reveal round the shutters: enough to read as a gap, never a band. */
function revealFor(facePx: number, ctx: RenderCtx): number {
  if (ctx.detail === 'tiny') return 1;
  return Math.max(1.5, Math.min(3, facePx * 0.12));
}

function slidePx(
  slide: SlideSpec,
  leaf: LeafNode | null,
  r: PxRect,
  ctx: RenderCtx
): SlidePx {
  const ppm = ctx.view.pxPerMm;
  const daylightWMm = r.w / ppm;
  const sl = slideLayout(slide, daylightWMm);
  const n = sl.panels.length;
  const facePx = sashFacePx(ctx, leaf, 'sliding', {
    x: r.x,
    y: r.y,
    w: r.w / Math.max(1, n),
    h: r.h,
  });
  // Shutters on different tracks pass each other: they are drawn lapping
  // by at least one stile, half taken from each side of the joint.
  const lapPx = Math.max(0, facePx - sl.overlapMm * ppm) / 2;
  const revealPx = revealFor(facePx, ctx);
  const shutters = sl.panels.map((p): ShutterPx => {
    const lapsBefore = p.index > 0 && sl.panels[p.index - 1].track !== p.track;
    const lapsAfter = p.index < n - 1 && sl.panels[p.index + 1].track !== p.track;
    const x0 = p.xMm * ppm - (lapsBefore ? lapPx : 0);
    const x1 = (p.xMm + p.widthMm) * ppm + (lapsAfter ? lapPx : 0);
    const left = Math.max(revealPx, x0);
    const right = Math.min(r.w - revealPx, x1);
    return {
      index: p.index,
      track: p.track,
      fixed: p.fixed,
      slidesRight: (p.direction === 'Right') !== ctx.flip,
      rect: {
        x: r.x + (ctx.flip ? r.w - right : left),
        y: r.y + revealPx,
        w: Math.max(4, right - left),
        h: Math.max(4, r.h - 2 * revealPx),
      },
    };
  });
  let mesh: PxRect | null = null;
  if (sl.mesh) {
    const mx = sl.mesh.xMm * ppm;
    const mw = sl.mesh.widthMm * ppm;
    mesh = { x: r.x + (ctx.flip ? r.w - mx - mw : mx), y: r.y, w: mw, h: r.h };
  }
  return { layout: sl, facePx, revealPx, shutters, mesh };
}

/** Screen rect of panel `index` of a sliding leaf drawn in `r`. */
export function slidePanelRectPx(
  slide: SlideSpec,
  r: PxRect,
  ctx: RenderCtx,
  index: number
): PxRect | null {
  return slidePx(slide, null, r, ctx).shutters[index]?.rect ?? null;
}

/** The shutter nearer the viewer is drawn last: track 0 is the outside one. */
function backToFront(shutters: ShutterPx[], fromInside: boolean): ShutterPx[] {
  return [...shutters].sort((a, b) =>
    fromInside ? a.track - b.track || a.index - b.index : b.track - a.track || a.index - b.index
  );
}

export function drawSlidingLeaf(
  parent: Parent,
  leaf: LeafNode,
  slide: SlideSpec,
  r: PxRect,
  ctx: RenderCtx
): void {
  const s = slidePx(slide, leaf, r, ctx);
  const trackCount = TRACK_COUNTS[slide.tracks];
  const tiny = ctx.detail === 'tiny';

  // The opening behind the shutters (seen where nothing is parked).
  const back = new Konva.Rect({
    x: r.x,
    y: r.y,
    width: r.w,
    height: r.h,
    fill: shadeColor(ctx.color, ctx.color === '#ffffff' ? -0.5 : -0.35),
    stroke: COL.stroke,
    strokeWidth: 1,
    listening: false,
    name: 'slide-opening',
  });
  parent.add(back);

  drawTracks(parent, slide, r, ctx, trackCount);

  for (const sh of backToFront(s.shutters, ctx.flip)) {
    const glass = drawShutterSash(parent, sh.rect, s.facePx, ctx.color, {
      name: 'slide-sash',
      shadow: !tiny,
      thin: tiny,
      attrs: { panelIndex: sh.index, track: sh.track, fixed: sh.fixed },
    });
    // The spec-facing node of a shutter (one per panel).
    const marker = new Konva.Rect({
      x: sh.rect.x,
      y: sh.rect.y,
      width: sh.rect.w,
      height: sh.rect.h,
      listening: false,
      name: 'slide-panel',
    });
    marker.setAttrs({ panelIndex: sh.index, track: sh.track, fixed: sh.fixed });
    parent.add(marker);
    drawGlass(parent, leaf, glass, ctx, {
      name: sh.index === 0 ? 'glass-pane' : 'slide-glass',
      tag: sh.index === 0,
    });
  }

  for (const il of s.layout.interlocks) {
    const [a, b] = il.panels.map((i) => s.shutters[i]);
    drawInterlock(parent, a, b, s.facePx);
  }

  if (s.mesh) drawFlyMesh(parent, s.mesh, s.facePx + s.revealPx, ctx, slide, trackCount);

  for (const sh of s.shutters) {
    const glass = insetPx(sh.rect, s.facePx);
    if (sh.fixed) drawFixedMark(parent, sh, glass, ctx);
    else {
      drawArrow(parent, sh, glass, ctx);
      drawTouchLock(parent, sh, s.facePx);
    }
    if (ctx.detail === 'full') drawTrackBadge(parent, glass, String(sh.track + 1), sh.track);
  }
}

/** Thin rails on the sill under the opening, one per track. */
function drawTracks(
  parent: Parent,
  slide: SlideSpec,
  r: PxRect,
  ctx: RenderCtx,
  trackCount: number
): void {
  const room = Math.max(3, ctx.facePx - 2);
  const gap = Math.max(1.5, Math.min(4, room / (trackCount + 1)));
  const line = (t: number, name: string, half: boolean): void => {
    const y = r.y + r.h + gap * (t + 1);
    const w = half ? r.w / 2 : r.w;
    const x = half && (slide.meshPosition === 'Right') !== ctx.flip ? r.x + r.w - w : r.x;
    parent.add(
      new Konva.Line({
        points: [x, y, x + w, y],
        stroke: '#6b7280',
        strokeWidth: ctx.detail === 'tiny' ? 0.5 : 1,
        dash: half ? [4, 3] : [],
        listening: false,
        name,
      })
    );
  };
  for (let t = 0; t < trackCount; t++) line(t, 'track-line', false);
  // 2.5 track: the mesh runs on a half track of its own.
  if (slide.tracks === '2.5 Track') line(trackCount, 'track-line-mesh', true);
}

/**
 * The joint of two neighbouring shutters: where they lap (different
 * tracks) the front one's stile covers the stile behind it and is marked
 * with a faint shade, where they meet on one track a meeting line.
 */
function drawInterlock(parent: Parent, a: ShutterPx, b: ShutterPx, facePx: number): void {
  const left = Math.max(a.rect.x, b.rect.x);
  const right = Math.min(a.rect.x + a.rect.w, b.rect.x + b.rect.w);
  const lapped = a.track !== b.track && right > left;
  const x = lapped ? left : (left + right) / 2 - 0.75;
  const w = lapped ? Math.min(right - left, facePx) : 1.5;
  const band = new Konva.Rect({
    x,
    y: a.rect.y + 1,
    width: Math.max(1.5, w),
    height: Math.max(2, a.rect.h - 2),
    fill: lapped ? 'rgba(30, 34, 40, 0.06)' : 'rgba(30, 34, 40, 0.7)',
    listening: false,
    name: 'slide-interlock',
  });
  band.setAttrs({ panels: [a.index, b.index], lapped });
  parent.add(band);
}

function drawArrow(parent: Parent, sh: ShutterPx, glass: PxRect, ctx: RenderCtx): void {
  const cy = glass.y + glass.h / 2;
  const margin = Math.max(3, glass.w * 0.2);
  const xL = glass.x + margin;
  const xR = glass.x + glass.w - margin;
  if (xR - xL < 6) return;
  const head = ctx.detail === 'full' ? 9 : ctx.detail === 'compact' ? 7 : 5;
  const arrow = new Konva.Arrow({
    points: sh.slidesRight ? [xL, cy, xR, cy] : [xR, cy, xL, cy],
    stroke: COL.symbol,
    fill: COL.symbol,
    strokeWidth: ctx.detail === 'full' ? 2 : 1.5,
    pointerLength: head,
    pointerWidth: head,
    listening: false,
    name: 'slide-arrow',
  });
  arrow.setAttrs({ panelIndex: sh.index, pointsRight: sh.slidesRight });
  parent.add(arrow);
}

function drawFixedMark(parent: Parent, sh: ShutterPx, glass: PxRect, ctx: RenderCtx): void {
  const word = glass.w >= 54 && ctx.detail !== 'tiny' ? 'FIXED' : 'F';
  const fontSize = ctx.detail === 'full' ? 12 : 10;
  const mark = new Konva.Text({
    x: glass.x,
    y: glass.y + glass.h / 2 - fontSize / 2,
    width: glass.w,
    align: 'center',
    text: word,
    fontSize,
    fontStyle: 'bold',
    fill: COL.symbol,
    listening: false,
    name: 'slide-fixed',
  });
  mark.setAttr('panelIndex', sh.index);
  parent.add(mark);
}

/** Touch lock on the stile the shutter is pulled by: the one behind its travel. */
function drawTouchLock(parent: Parent, sh: ShutterPx, facePx: number): void {
  const onLeft = sh.slidesRight;
  const w = Math.max(2, Math.min(5, facePx * 0.42));
  const h = Math.max(7, Math.min(26, sh.rect.h * 0.11));
  const cx = onLeft ? sh.rect.x + facePx / 2 : sh.rect.x + sh.rect.w - facePx / 2;
  const lock = new Konva.Rect({
    x: cx - w / 2,
    y: sh.rect.y + sh.rect.h / 2 - h / 2,
    width: w,
    height: h,
    fill: '#4a4f55',
    stroke: '#2b2e33',
    strokeWidth: 0.75,
    cornerRadius: w / 2,
    listening: false,
    name: 'slide-handle',
  });
  lock.setAttrs({ panelIndex: sh.index, edge: onLeft ? 'left' : 'right' });
  parent.add(lock);
}

/** Circled track number at the foot of a shutter's glass. */
function drawTrackBadge(parent: Parent, glass: PxRect, text: string, track: number): void {
  if (glass.w < 30 || glass.h < 60) return;
  const radius = 7;
  const cx = glass.x + glass.w / 2;
  const cy = glass.y + glass.h - radius - 5;
  const badge = new Konva.Group({ listening: false, name: 'track-badge' });
  badge.setAttrs({ track, text });
  badge.add(
    new Konva.Circle({ x: cx, y: cy, radius, fill: '#ffffff', stroke: COL.label, strokeWidth: 1, opacity: 0.95 })
  );
  badge.add(
    new Konva.Text({
      x: cx - radius,
      y: cy - 4.5,
      width: radius * 2,
      align: 'center',
      text,
      fontSize: 9,
      fontStyle: 'bold',
      fill: COL.label,
    })
  );
  parent.add(badge);
}

/**
 * The fly-mesh shutter where it is parked: a slim light frame, a fine
 * hatch, its name and its track. It is drawn inside the bands of the glass
 * shutter it is parked with, so both frames can be seen.
 */
function drawFlyMesh(
  parent: Parent,
  at: PxRect,
  sashFace: number,
  ctx: RenderCtx,
  slide: SlideSpec,
  trackCount: number
): void {
  if (at.w <= 4 || at.h <= 4) return;
  const tiny = ctx.detail === 'tiny';
  const r = insetPx(at, Math.max(1, sashFace - 1));
  const facePx = sashFacePx(ctx, null, 'mesh', r);
  const mesh = new Konva.Group({ listening: false, name: 'fly-mesh' });
  mesh.setAttrs({ xPx: at.x, track: trackCount - 1 });
  const light = shadeColor(ctx.color === '#ffffff' ? '#eef1f4' : ctx.color, 0.35);
  mesh.add(
    new Konva.Rect({ x: r.x, y: r.y, width: r.w, height: r.h, fill: 'rgba(125, 135, 146, 0.16)', listening: false })
  );
  const g = insetPx(r, facePx);
  const step = tiny ? 4 : 5;
  mesh.add(
    new Konva.Shape({
      listening: false,
      name: 'fly-mesh-hatch',
      stroke: COL.mesh,
      strokeWidth: 0.5,
      opacity: 0.75,
      sceneFunc: (c, shape) => {
        c.beginPath();
        for (let x = g.x + step; x < g.x + g.w; x += step) {
          c.moveTo(x, g.y);
          c.lineTo(x, g.y + g.h);
        }
        for (let y = g.y + step; y < g.y + g.h; y += step) {
          c.moveTo(g.x, y);
          c.lineTo(g.x + g.w, y);
        }
        c.strokeShape(shape);
      },
    })
  );
  // The slim frame: a light band with a fine outline on both edges.
  mesh.add(
    new Konva.Rect({
      x: r.x + facePx / 2,
      y: r.y + facePx / 2,
      width: Math.max(1, r.w - facePx),
      height: Math.max(1, r.h - facePx),
      stroke: light,
      strokeWidth: facePx,
      listening: false,
      name: 'fly-mesh-frame',
    })
  );
  for (const edge of [r, g]) {
    mesh.add(
      new Konva.Rect({
        x: edge.x,
        y: edge.y,
        width: edge.w,
        height: edge.h,
        stroke: '#7b8591',
        strokeWidth: 0.75,
        listening: false,
      })
    );
  }
  if (!tiny && g.w >= 34) {
    const label = new Konva.Label({ x: g.x + 3, y: g.y + 3, listening: false, name: 'fly-mesh-label' });
    label.add(new Konva.Tag({ fill: '#ffffff', cornerRadius: 3, opacity: 0.9, stroke: '#7b8591', strokeWidth: 0.75 }));
    // Its own track: the half track of a 2.5 track, else the innermost one.
    const track = slide.tracks === '2.5 Track' ? 'half track' : `track ${trackCount}`;
    const text = g.w >= 118 ? `FLY MESH · ${track}` : g.w >= 62 ? 'FLY MESH' : 'MESH';
    label.add(new Konva.Text({ text, fontSize: 9, fontStyle: 'bold', padding: 3, fill: '#374151' }));
    label.setAttr('caption', text);
    mesh.add(label);
  }
  parent.add(mesh);
}
