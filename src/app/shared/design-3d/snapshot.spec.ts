import { LAB_PRESETS } from 'src/app/views/design-lab/lab-presets';
import { webglAvailable } from './scene';
import { SNAPSHOT_HEIGHT_PX, SNAPSHOT_WIDTH_PX, design3dPicture, lookOf } from './snapshot';

function design(key: string) {
  const found = LAB_PRESETS.find((p) => p.key === key);
  if (!found) throw new Error(`no lab preset '${key}'`);
  return found.build();
}

/** Decode a PNG data URL through the browser and read some pixels. */
async function pixels(dataUrl: string): Promise<{ w: number; h: number; at: (x: number, y: number) => number[] }> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.drawImage(img, 0, 0);
  return {
    w: canvas.width,
    h: canvas.height,
    at: (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data),
  };
}

describe('design-3d snapshot', () => {
  it('takes the look of a design from its own colour, white when it has none', () => {
    const d = design('single-fixed');
    expect(lookOf(d).profileColor).toBe('#ffffff');
    expect(lookOf({ ...d, frame: { ...d.frame, profileColor: '#5e3b23' } }, '#9aa3ad')).toEqual({
      profileColor: '#5e3b23',
      glassTint: '#9aa3ad',
    });
  });

  it('gives a 1600 × 1200 PNG on white, the same bytes every time', async () => {
    if (!webglAvailable()) {
      pending('no WebGL in this browser');
      return;
    }
    const d = design('two-sash-casement');
    const png = design3dPicture(d, { open: 0.5 });
    expect(png.startsWith('data:image/png;base64,')).toBeTrue();
    const p = await pixels(png);
    expect([p.w, p.h]).toEqual([SNAPSHOT_WIDTH_PX, SNAPSHOT_HEIGHT_PX]);
    // White sheet at the corners, something drawn in the middle band.
    for (const [x, y] of [[2, 2], [p.w - 3, 2], [2, p.h - 3], [p.w - 3, p.h - 3]]) {
      expect(p.at(x, y)).toEqual([255, 255, 255, 255]);
    }
    let drawn = 0;
    for (let x = 100; x < p.w - 100; x += 20) {
      if (p.at(x, p.h / 2).some((v, i) => i < 3 && v < 250)) drawn++;
    }
    expect(drawn).toBeGreaterThan(5);
    // A fixed camera and no clock in the picture: a second take is identical.
    expect(design3dPicture(d, { open: 0.5 })).toBe(png);
  });

  it('paints the profile in the colour of the design', async () => {
    if (!webglAvailable()) {
      pending('no WebGL in this browser');
      return;
    }
    const d = design('single-fixed');
    const dark = await pixels(design3dPicture({ ...d, frame: { ...d.frame, profileColor: '#3c4044' } }));
    const white = await pixels(design3dPicture(d));
    // Dark pixels along a line across the window: the gasket in both, the two jambs only in the dark one.
    const darkPixels = (p: { at: (x: number, y: number) => number[] }): number => {
      let n = 0;
      for (let x = 100; x < 1500; x += 4) if (p.at(x, 600)[0] < 110) n++;
      return n;
    };
    expect(darkPixels(dark)).toBeGreaterThan(darkPixels(white) + 8);
  });
});
