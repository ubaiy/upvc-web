// The project's karma entry does not load zone.js/testing itself (see the
// design-model specs); load it here so Angular's global beforeEach works.
import 'zone.js/testing';

import Konva from 'konva';
import { mixedExampleB, singleFixed } from '../design-model/testing/fixtures';
import { PICTURE_HEIGHT_PX, PICTURE_WIDTH_PX, designPicture } from './canvas-export';

/** Width and height of a PNG data URL, read from its header. */
export function pngSize(dataUrl: string): { width: number; height: number } {
  const bytes = atob(dataUrl.split(',')[1].slice(0, 44));
  const int = (at: number): number =>
    ((bytes.charCodeAt(at) << 24) | (bytes.charCodeAt(at + 1) << 16) | (bytes.charCodeAt(at + 2) << 8) | bytes.charCodeAt(at + 3)) >>> 0;
  return { width: int(16), height: int(20) };
}

describe('design-canvas canvas-export (the saved picture of a window, N1)', () => {
  const opts = { frameFaceMm: 60 };

  it('is a PNG of one fixed size, whatever the window', () => {
    for (const design of [singleFixed(), mixedExampleB()]) {
      const png = designPicture(design, opts);
      expect(png.startsWith('data:image/png;base64,')).toBeTrue();
      expect(pngSize(png)).toEqual({ width: PICTURE_WIDTH_PX, height: PICTURE_HEIGHT_PX });
    }
  });

  it('is the same picture every time: nothing of the screen goes into it', () => {
    const design = mixedExampleB();
    const wide = designPicture(design, opts);
    const before = document.body.style.width;
    document.body.style.width = '390px';
    const narrow = designPicture(design, opts);
    document.body.style.width = before;
    expect(narrow).toBe(wide);
  });

  it('draws on a stage of its own, off the page, with no handles, selection or other edit marks', () => {
    let seen: Konva.Stage | null = null;
    let marks = -1;
    const real = Konva.Stage.prototype.toDataURL;
    spyOn(Konva.Stage.prototype, 'toDataURL').and.callFake(function (this: Konva.Stage, config: any) {
      seen = this;
      marks = this.find('.frame-handle, .selection-highlight, .panel-highlight, .ghost-line, .drag-readout, .focus-ring').length;
      expect(document.body.contains(this.container())).toBeFalse();
      expect(this.find('.canvas-bg').length).toBe(1);
      return real.call(this, config);
    });

    designPicture(singleFixed(), opts);

    expect(marks).toBe(0);
    expect(seen!.width()).toBe(PICTURE_WIDTH_PX);
    expect(seen!.height()).toBe(PICTURE_HEIGHT_PX);
  });

  it('makes a smaller picture of the same drawing for a thumbnail', () => {
    expect(pngSize(designPicture(singleFixed(), { ...opts, pixelRatio: 0.25 }))).toEqual({
      width: PICTURE_WIDTH_PX / 4,
      height: PICTURE_HEIGHT_PX / 4,
    });
  });
});
