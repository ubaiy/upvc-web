// Small SVG renderer for window thumbnails and static drawings. A port of
// drawWindow() in docs/product/ux/mockups/assets/shell.js. It draws with the
// same tokens as the designer (--c-frame, --c-frame-line, --c-glass-1/2,
// --c-dim, --c-accent), so a thumbnail follows the theme.
//
// This is not the designer. It takes a simple columns-and-rows description;
// the screen that owns the real design data maps it to a WindowSpec.

/** How a pane opens. L / R: side hung, hinge on that side. sl / sr: slides left / right. */
export type PaneType = 'fixed' | 'L' | 'R' | 'top' | 'tilt' | 'sl' | 'sr';

export interface WindowPane {
  /** Share of the parent's width (column) or height (row), 0 to 1. */
  f: number;
  t?: PaneType;
  /** Stack of panes inside this column, top to bottom. */
  rows?: { f: number; t: PaneType }[];
}

export interface WindowSpec {
  /** Overall width and height in mm. */
  w: number;
  h: number;
  cols: WindowPane[];
}

export interface WindowDrawOptions {
  /** Size of the drawing in px. */
  width?: number;
  height?: number;
  /** Draw dimension lines in mm below and beside the frame. */
  dims?: boolean;
  /** Index of the pane to mark as selected, in drawing order. */
  selected?: number;
}

/** The sample windows used in the mockups and the component gallery. */
export const SAMPLE_WINDOWS: Record<string, WindowSpec> = {
  fixed: { w: 1500, h: 1200, cols: [{ f: 1, t: 'fixed' }] },
  casement2: { w: 1800, h: 1200, cols: [{ f: 0.5, t: 'L' }, { f: 0.5, t: 'R' }] },
  mixed3: { w: 2200, h: 1200, cols: [{ f: 0.3, t: 'L' }, { f: 0.4, t: 'fixed' }, { f: 0.3, t: 'R' }] },
  slider2: { w: 1800, h: 1200, cols: [{ f: 0.5, t: 'sr' }, { f: 0.5, t: 'sl' }] },
  slider3: { w: 2400, h: 1380, cols: [{ f: 0.333, t: 'sr' }, { f: 0.334, t: 'fixed' }, { f: 0.333, t: 'sl' }] },
  toplight: { w: 1200, h: 1500, cols: [{ f: 1, rows: [{ f: 0.3, t: 'top' }, { f: 0.7, t: 'fixed' }] }] },
  tilt: { w: 900, h: 1350, cols: [{ f: 1, t: 'tilt' }] },
  door: { w: 1000, h: 2100, cols: [{ f: 1, t: 'L' }] },
  vent: { w: 600, h: 600, cols: [{ f: 1, t: 'top' }] },
};

/** A finite number rounded to two decimals; anything else becomes 0, so no input reaches the markup as text. */
function n(value: unknown): number {
  const x = Number(value);
  return Number.isFinite(x) ? Math.round(x * 100) / 100 : 0;
}

/**
 * Returns the inner markup of an `<svg viewBox="0 0 width height">`.
 * `gradientId` must be unique on the page.
 */
export function drawWindow(spec: WindowSpec, gradientId: string, options: WindowDrawOptions = {}): string {
  const W = n(options.width) || 56;
  const H = n(options.height) || 44;
  const dims = !!options.dims;
  const mmW = Math.max(1, n(spec?.w));
  const mmH = Math.max(1, n(spec?.h));
  const cols = Array.isArray(spec?.cols) && spec.cols.length ? spec.cols : [{ f: 1, t: 'fixed' as PaneType }];

  const padL = dims ? 54 : 1;
  const padB = dims ? 62 : 1;
  const padT = dims ? 10 : 1;
  const padR = dims ? 10 : 1;
  const scale = Math.min((W - padL - padR) / mmW, (H - padT - padB) / mmH);
  const fw = mmW * scale;
  const fh = mmH * scale;
  const x0 = padL + (W - padL - padR - fw) / 2;
  const y0 = padT + (H - padT - padB - fh) / 2;
  const frame = Math.max(dims ? 10 : 2.5, 62 * scale);
  const mullion = frame * 0.8;
  const sash = Math.max(dims ? 7 : 1.5, frame * 0.7);
  const lineWidth = dims ? 1.5 : 1;
  const line = `stroke:var(--c-frame-line);stroke-width:${lineWidth};`;
  const thin = `fill:none;stroke:var(--c-dim);stroke-width:${dims ? 1 : 0.7};`;
  const id = gradientId.replace(/[^a-zA-Z0-9_-]/g, '');

  const out: string[] = [];
  let paneIndex = 0;

  const rect = (x: number, y: number, w: number, h: number, style: string, rx = 0) =>
    out.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(Math.max(0, w))}" height="${n(Math.max(0, h))}"${rx ? ` rx="${rx}"` : ''} style="${style}"/>`);
  const vee = (a: number[], b: number[], c: number[], dashed = false) =>
    out.push(`<polyline points="${n(a[0])},${n(a[1])} ${n(b[0])},${n(b[1])} ${n(c[0])},${n(c[1])}" style="${thin}${dashed ? 'stroke-dasharray:4 3;' : ''}"/>`);

  out.push(
    `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--c-glass-1)"/><stop offset="1" style="stop-color:var(--c-glass-2)"/></linearGradient></defs>`
  );
  rect(x0, y0, fw, fh, `fill:var(--c-frame);${line}`, 1);

  const pane = (x: number, y: number, w: number, h: number, type: PaneType) => {
    const selected = options.selected === paneIndex++;
    let gx = x;
    let gy = y;
    let gw = w;
    let gh = h;
    if (type !== 'fixed') {
      rect(x, y, w, h, `fill:var(--c-frame);${line}`);
      gx += sash;
      gy += sash;
      gw -= 2 * sash;
      gh -= 2 * sash;
    }
    rect(gx, gy, gw, gh, `fill:url(#${id});${line}`);
    if (type === 'L' || type === 'tilt') vee([gx + gw, gy], [gx, gy + gh / 2], [gx + gw, gy + gh]);
    if (type === 'R') vee([gx, gy], [gx + gw, gy + gh / 2], [gx, gy + gh]);
    if (type === 'top') vee([gx, gy + gh], [gx + gw / 2, gy], [gx + gw, gy + gh]);
    if (type === 'tilt') vee([gx, gy], [gx + gw / 2, gy + gh], [gx + gw, gy], true);
    if (type === 'sl' || type === 'sr') {
      const ax = gx + gw * 0.3;
      const bx = gx + gw * 0.7;
      const cy = gy + gh / 2;
      const dir = type === 'sr' ? 1 : -1;
      const tip = dir > 0 ? bx : ax;
      const head = dims ? 6 : 2.5;
      out.push(
        `<path d="M${n(ax)} ${n(cy)}H${n(bx)}M${n(tip - dir * head)} ${n(cy - head)}L${n(tip)} ${n(cy)}L${n(tip - dir * head)} ${n(cy + head)}" style="${thin}"/>`
      );
    }
    if (dims && (type === 'L' || type === 'R' || type === 'tilt')) {
      const hx = type === 'R' ? x + sash * 0.25 : x + w - sash * 0.75;
      rect(hx, y + h / 2 - 14, sash * 0.5, 28, 'fill:var(--c-frame-line)', 2);
    }
    if (selected) {
      rect(x - 1, y - 1, w + 2, h + 2, 'fill:var(--c-accent);fill-opacity:.10;stroke:var(--c-accent);stroke-width:2', 2);
    }
  };

  const ix = x0 + frame;
  const iy = y0 + frame;
  const iw = fw - 2 * frame;
  const ih = fh - 2 * frame;
  const count = cols.length;
  const usable = iw - mullion * (count - 1);
  const edges: { x: number; w: number; mm: number }[] = [];
  let cx = ix;
  for (const col of cols) {
    const share = Math.max(0, n(col.f));
    const cw = usable * share;
    const mm = Math.round((mmW - 124 - 50 * (count - 1)) * share);
    if (Array.isArray(col.rows) && col.rows.length) {
      const usableH = ih - mullion * (col.rows.length - 1);
      let cy = iy;
      for (const row of col.rows) {
        const rh = usableH * Math.max(0, n(row.f));
        pane(cx, cy, cw, rh, row.t);
        cy += rh + mullion;
      }
    } else {
      pane(cx, iy, cw, ih, col.t ?? 'fixed');
    }
    edges.push({ x: cx, w: cw, mm });
    cx += cw + mullion;
  }

  if (dims) {
    const dimLine = 'stroke:var(--c-dim);stroke-width:1;fill:none;';
    const text = 'font:500 12px var(--font-sans);fill:var(--c-text-2);font-variant-numeric:tabular-nums';
    const strong = `${text};font-weight:600;fill:var(--c-text)`;
    const y1 = y0 + fh + 20;
    const y2 = y0 + fh + 46;
    for (const e of edges) {
      out.push(`<path d="M${n(e.x)} ${n(y1 - 5)}v10M${n(e.x + e.w)} ${n(y1 - 5)}v10M${n(e.x)} ${n(y1)}h${n(e.w)}" style="${dimLine}"/>`);
      rect(e.x + e.w / 2 - 24, y1 - 9, 48, 18, 'fill:var(--c-surface)', 4);
      out.push(`<text x="${n(e.x + e.w / 2)}" y="${n(y1 + 4)}" text-anchor="middle" style="${text}">${n(e.mm)}</text>`);
    }
    out.push(`<path d="M${n(x0)} ${n(y2 - 5)}v10M${n(x0 + fw)} ${n(y2 - 5)}v10M${n(x0)} ${n(y2)}h${n(fw)}" style="${dimLine}"/>`);
    rect(x0 + fw / 2 - 36, y2 - 9, 72, 18, 'fill:var(--c-surface)', 4);
    out.push(`<text x="${n(x0 + fw / 2)}" y="${n(y2 + 4)}" text-anchor="middle" style="${strong}">${n(mmW)} mm</text>`);
    const xl = x0 - 24;
    out.push(`<path d="M${n(xl - 5)} ${n(y0)}h10M${n(xl - 5)} ${n(y0 + fh)}h10M${n(xl)} ${n(y0)}v${n(fh)}" style="${dimLine}"/>`);
    rect(xl - 9, y0 + fh / 2 - 36, 18, 72, 'fill:var(--c-surface)', 4);
    out.push(
      `<text transform="translate(${n(xl + 4)} ${n(y0 + fh / 2)}) rotate(-90)" text-anchor="middle" style="${strong}">${n(mmH)} mm</text>`
    );
  }
  return out.join('');
}
