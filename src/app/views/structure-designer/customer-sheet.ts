/**
 * The customer sheet of a structure (card T114): one picture a fabricator can
 * send or print. It carries the 3D view, the name, the overall size and a short
 * parts summary under the company name. There is no price on it: the web does
 * not know one, and must not work one out.
 */

import { FILL_LABEL, FillKey, Structure, Summary } from '../../shared/structure-model';

export interface SheetFacts {
  name: string;
  /** "Dome", "Cabin / enclosure". */
  kind: string;
  /** "3,000 × 3,000 × 1,000 mm". */
  overall: string;
  /** Panels by type: "Fixed glass" 24, "Door" 1. */
  panels: { label: string; count: number }[];
  panelCount: number;
  /** "7.95 m²". */
  glassArea: string;
}

export interface SheetInput extends SheetFacts {
  /** The fabricator's company name, from the shell. */
  company: string;
  /** The 3D picture as a data URL, 4 : 3. */
  picture: string;
  /** The day on the sheet; today when left out. */
  date?: Date;
}

const ORDER: FillKey[] = ['fixed', 'casement', 'top-hung', 'sliding', 'door', 'panel', 'open'];
const group = (n: number): string => Math.round(n).toLocaleString('en-IN');

/** What the sheet says about a structure, taken from the same summary the parts panel shows. */
export function sheetFacts(structure: Structure, summary: Summary, kind: string): SheetFacts {
  const counts = new Map<FillKey, number>();
  for (const row of summary.panels) counts.set(row.fill, (counts.get(row.fill) ?? 0) + row.count);
  const o = summary.overall;
  return {
    name: structure.name,
    kind,
    overall: `${group(o.widthMm)} × ${group(o.depthMm)} × ${group(o.heightMm)} mm`,
    panels: ORDER.filter((k) => counts.has(k)).map((k) => ({ label: FILL_LABEL[k], count: counts.get(k) as number })),
    panelCount: summary.panelCount,
    glassArea: `${summary.glassAreaSqM.toFixed(2)} m²`,
  };
}

export const SHEET_WIDTH = 1600;
const PAD = 72;
const FONT = '"Inter", "Segoe UI", system-ui, sans-serif';
const INK = '#1a1d1f';
const INK_2 = '#565c61';
const LINE = '#e5e4de';
const ACCENT = '#0e6f6a';

/** Draw the sheet. The height follows the number of panel types. */
export function customerSheet(input: SheetInput): Promise<HTMLCanvasElement> {
  return loadImage(input.picture).then((picture) => {
    const pictureW = SHEET_WIDTH - PAD * 2;
    const pictureH = Math.round((pictureW * 3) / 4);
    const rows = Math.max(3, input.panels.length + 1);
    const top = 190;
    const factsTop = top + pictureH + 196;
    const height = factsTop + rows * 46 + 150;

    const canvas = document.createElement('canvas');
    canvas.width = SHEET_WIDTH;
    canvas.height = height;
    const g = canvas.getContext('2d');
    if (!g) throw new Error('no 2D canvas');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, SHEET_WIDTH, height);
    g.textBaseline = 'alphabetic';

    // Who it is from.
    g.fillStyle = ACCENT;
    g.fillRect(PAD, 76, 10, 62);
    text(g, input.company || 'UPVC', PAD + 30, 124, `600 46px ${FONT}`, INK, SHEET_WIDTH - PAD * 2 - 330);
    const day = (input.date ?? new Date()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    g.textAlign = 'right';
    text(g, day, SHEET_WIDTH - PAD, 124, `400 28px ${FONT}`, INK_2);
    g.textAlign = 'left';

    // The picture.
    g.drawImage(picture, PAD, top, pictureW, pictureH);
    g.strokeStyle = LINE;
    g.lineWidth = 2;
    g.strokeRect(PAD, top, pictureW, pictureH);

    // What it is.
    text(g, input.name, PAD, top + pictureH + 78, `600 52px ${FONT}`, INK, pictureW);
    text(g, input.kind, PAD, top + pictureH + 120, `400 28px ${FONT}`, INK_2, pictureW);

    // Left column: size and glass. Right column: panels by type.
    const colW = pictureW / 2 - 30;
    let y = factsTop;
    for (const [label, value] of [
      ['Overall size (width × depth × height)', input.overall],
      ['Glass area', input.glassArea],
    ]) {
      text(g, label, PAD, y, `400 24px ${FONT}`, INK_2, colW);
      text(g, value, PAD, y + 44, `600 36px ${FONT}`, INK, colW);
      y += 112;
    }
    const x = PAD + pictureW / 2 + 30;
    y = factsTop;
    text(g, `Panels (${input.panelCount})`, x, y, `400 24px ${FONT}`, INK_2, colW);
    for (const row of input.panels) {
      y += 46;
      text(g, row.label, x, y, `400 30px ${FONT}`, INK, colW - 110);
      g.textAlign = 'right';
      text(g, String(row.count), x + colW, y, `600 30px ${FONT}`, INK);
      g.textAlign = 'left';
      g.fillStyle = LINE;
      g.fillRect(x, y + 13, colW, 2);
    }

    g.fillStyle = LINE;
    g.fillRect(PAD, height - 104, pictureW, 2);
    text(g, 'Sizes are overall design sizes in millimetres. Final sizes are confirmed after a site survey.', PAD, height - 56, `400 24px ${FONT}`, INK_2, pictureW);
    return canvas;
  });
}

function text(g: CanvasRenderingContext2D, value: string, x: number, y: number, font: string, colour: string, maxWidth?: number): void {
  g.font = font;
  g.fillStyle = colour;
  let shown = value;
  // A long name is cut with an ellipsis, never squeezed.
  if (maxWidth) while (shown.length > 1 && g.measureText(shown).width > maxWidth) shown = shown.slice(0, -2).trimEnd() + '…';
  g.fillText(shown, x, y);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((done, fail) => {
    const img = new Image();
    img.onload = () => done(img);
    img.onerror = () => fail(new Error('The picture could not be read.'));
    img.src = src;
  });
}
