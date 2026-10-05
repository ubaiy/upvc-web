/**
 * design-canvas export — the picture of a window for paper (the quotation
 * PDF, the production sheets) and for the lists.
 *
 * Drawn on a stage of its own that is never put on the page, always at the
 * same size and fitted to it, with no selection, handles, ghost or zoom. So
 * the picture of a design is the same whatever screen it was drawn on: a
 * phone and a desktop save identical pictures.
 */

import Konva from 'konva';
import { WindowDesign, layout } from '../design-model';
import { GlassTints, glassTintFor, renderDesign } from './canvas-renderer';
import { ViewFrom, computeView } from './canvas-view';

/** Size of the saved picture in px at pixelRatio 1. */
export const PICTURE_WIDTH_PX = 800;
export const PICTURE_HEIGHT_PX = 600;

export interface PictureOpts {
  frameFaceMm: number;
  glassTints?: GlassTints | null;
  viewFrom?: ViewFrom;
  /** 1 = 800 × 600. Lower it for a thumbnail; the drawing itself does not change. */
  pixelRatio?: number;
}

/** PNG data URL of `design`, independent of any canvas on screen. */
export function designPicture(design: WindowDesign, opts: PictureOpts): string {
  const stage = new Konva.Stage({
    container: document.createElement('div'),
    width: PICTURE_WIDTH_PX,
    height: PICTURE_HEIGHT_PX,
    listening: false,
  });
  try {
    const layer = new Konva.Layer({ listening: false });
    stage.add(layer);
    const { widthMm, heightMm } = design.frame;
    const viewFrom = opts.viewFrom ?? 'outside';
    renderDesign(
      layer,
      design,
      layout(design, { frameFaceMm: opts.frameFaceMm }),
      computeView(PICTURE_WIDTH_PX, PICTURE_HEIGHT_PX, widthMm, heightMm, 1, 0, 0, viewFrom === 'inside'),
      { selection: null, showFrameHandle: false },
      {
        stageWPx: PICTURE_WIDTH_PX,
        stageHPx: PICTURE_HEIGHT_PX,
        frameFaceMm: opts.frameFaceMm,
        profileColor: design.frame.profileColor ?? '#ffffff',
        glassTint: glassTintFor(design.glazing.glassId, opts.glassTints ?? null),
        viewFrom,
      }
    );
    return stage.toDataURL({ pixelRatio: opts.pixelRatio ?? 1, mimeType: 'image/png' });
  } finally {
    stage.destroy();
  }
}
