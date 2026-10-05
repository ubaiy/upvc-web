/**
 * design-canvas renderer — the key under the saved picture (drawing-key.ts
 * says what goes in it). Small glyphs with a few words each, wrapped over
 * as many rows as the picture's width needs.
 */

import Konva from 'konva';
import { KeyGlyph, KeyItem } from '../drawing-key';
import { COL, Parent } from './render-common';

const ROW_H = 16;
const GLYPH_W = 20;
const GAP = 14;
const FONT = 10;

/** Height the key of `items` needs on a stage `stageWPx` wide (0 = no key). */
export function legendHeightPx(items: KeyItem[], stageWPx: number): number {
  return items.length ? rowsOf(items, stageWPx).length * ROW_H + 8 : 0;
}

interface Placed {
  item: KeyItem;
  w: number;
}

function widthOf(item: KeyItem): number {
  const text = new Konva.Text({ text: item.text, fontSize: FONT });
  const w = text.width();
  text.destroy();
  return GLYPH_W + 4 + w;
}

function rowsOf(items: KeyItem[], stageWPx: number): Placed[][] {
  const max = stageWPx - 24;
  const rows: Placed[][] = [[]];
  let used = 0;
  for (const item of items) {
    const w = widthOf(item);
    if (used && used + GAP + w > max) {
      rows.push([]);
      used = 0;
    }
    rows[rows.length - 1].push({ item, w });
    used += (used ? GAP : 0) + w;
  }
  return rows;
}

/** The key, centred along the bottom edge of the stage. */
export function drawLegend(
  parent: Parent,
  items: KeyItem[],
  stageWPx: number,
  stageHPx: number
): void {
  if (!items.length) return;
  const rows = rowsOf(items, stageWPx);
  const group = new Konva.Group({ listening: false, name: 'drawing-key' });
  group.setAttr('items', items.map((i) => i.glyph));
  let y = stageHPx - rows.length * ROW_H - 4;
  for (const row of rows) {
    const total = row.reduce((a, p) => a + p.w, 0) + GAP * (row.length - 1);
    let x = (stageWPx - total) / 2;
    for (const { item, w } of row) {
      drawGlyph(group, item, x, y);
      group.add(
        new Konva.Text({
          x: x + GLYPH_W + 4,
          y: y + (ROW_H - FONT) / 2,
          text: item.text,
          fontSize: FONT,
          fill: COL.dim,
          name: 'drawing-key-text',
        })
      );
      x += w + GAP;
    }
    y += ROW_H;
  }
  parent.add(group);
}

function drawGlyph(group: Konva.Group, item: KeyItem, x: number, y: number): void {
  const top = y + 2;
  const h = ROW_H - 4;
  const mid = top + h / 2;
  const line = (points: number[], dashed: boolean): void => {
    group.add(
      new Konva.Line({ points, stroke: COL.symbol, strokeWidth: 1.25, dash: dashed ? [3, 2] : [] })
    );
  };
  const box = (): void => {
    group.add(
      new Konva.Rect({ x, y: top, width: GLYPH_W, height: h, stroke: COL.stroke, strokeWidth: 0.75, fill: '#ffffff' })
    );
  };
  const glyph: KeyGlyph = item.glyph;
  switch (glyph) {
    case 'opens-out':
    case 'opens-in': {
      box();
      const dashed = glyph === 'opens-in';
      line([x + GLYPH_W, top, x, mid], dashed);
      line([x + GLYPH_W, top + h, x, mid], dashed);
      break;
    }
    case 'tilt':
      box();
      line([x, top, x + GLYPH_W / 2, top + h], true);
      line([x + GLYPH_W, top, x + GLYPH_W / 2, top + h], true);
      break;
    case 'slides':
      group.add(
        new Konva.Arrow({
          points: [x + 1, mid, x + GLYPH_W - 1, mid],
          stroke: COL.symbol,
          fill: COL.symbol,
          strokeWidth: 1.5,
          pointerLength: 5,
          pointerWidth: 5,
        })
      );
      break;
    case 'fixed-shutter':
      group.add(
        new Konva.Text({ x, y: top, width: GLYPH_W, align: 'center', text: 'F', fontSize: 11, fontStyle: 'bold', fill: COL.symbol })
      );
      break;
    case 'mesh': {
      box();
      for (let gx = x + 4; gx < x + GLYPH_W; gx += 4) {
        group.add(new Konva.Line({ points: [gx, top, gx, top + h], stroke: COL.mesh, strokeWidth: 0.5 }));
      }
      for (let gy = top + 4; gy < top + h; gy += 4) {
        group.add(new Konva.Line({ points: [x, gy, x + GLYPH_W, gy], stroke: COL.mesh, strokeWidth: 0.5 }));
      }
      break;
    }
    case 'track':
      group.add(
        new Konva.Circle({ x: x + GLYPH_W / 2, y: mid, radius: 6, stroke: COL.label, strokeWidth: 1, fill: '#ffffff' })
      );
      group.add(
        new Konva.Text({ x, y: mid - 4.5, width: GLYPH_W, align: 'center', text: '1', fontSize: 9, fontStyle: 'bold', fill: COL.label })
      );
      break;
    default:
      group.add(new Konva.Rect({ x, y: top, width: GLYPH_W, height: h, fill: '#374151', cornerRadius: 3 }));
      group.add(
        new Konva.Text({ x, y: top + 1.5, width: GLYPH_W, align: 'center', text: item.code ?? 'G', fontSize: 9, fontStyle: 'bold', fill: '#ffffff' })
      );
      break;
  }
}
