/**
 * The 3D view of the window being designed (card T113).
 *
 * design-3d and three.js are one lazy chunk: it is fetched the first time
 * "3D" is pressed, never with the designer. The view only reads the
 * document; editing stays in the 2D drawing. When the chunk cannot be
 * fetched or the device has no WebGL, the designer stays on 2D and `note`
 * says why: the drawing area is never left empty.
 */

import { ComponentRef, Type, ViewContainerRef } from '@angular/core';
import type { Design3dComponent } from 'src/app/shared/design-3d/design-3d.component';
import { WindowDesign } from 'src/app/shared/design-model';

export interface View3dInputs {
  design: WindowDesign;
  /** Tint of the window's glass, when the catalogue's name gives one. */
  glassTint: string | null;
  /** Tints by glass id, for panes in their own glass. */
  glassTints: Record<string, string>;
  frameFaceMm: number;
}

export interface View3dChunk {
  Design3dComponent: Type<Design3dComponent>;
  webglAvailable: () => boolean;
}

export const NO_WEBGL_NOTE = '3D is not available on this device or browser. The 2D drawing is shown instead.';
export const NO_CHUNK_NOTE = '3D could not be loaded. Check the connection and press 3D again. The 2D drawing is shown instead.';

const loadChunk = (): Promise<View3dChunk> => import('src/app/shared/design-3d/design-3d.component');

export class Designer3dView {
  /** True while the 3D view is what the drawing area shows. */
  on = false;
  loading = false;
  /** Why the designer stayed on 2D; '' when there is nothing to say. */
  note = '';

  private ref: ComponentRef<Design3dComponent> | null = null;

  constructor(private readonly load: () => Promise<View3dChunk> = loadChunk) {}

  async open(host: ViewContainerRef | undefined, inputs: () => View3dInputs): Promise<void> {
    if (this.on || this.loading || !host) return;
    this.loading = true;
    this.note = '';
    try {
      const chunk = await this.load();
      if (!chunk.webglAvailable()) {
        this.note = NO_WEBGL_NOTE;
        return;
      }
      const ref = host.createComponent(chunk.Design3dComponent);
      this.ref = ref;
      ref.setInput('product', true);
      this.on = true;
      this.sync(inputs());
      ref.changeDetectorRef.detectChanges();
      // WebGL was there but the renderer could not start (context refused, driver blocked).
      if (ref.instance.unavailable) {
        this.close();
        this.note = NO_WEBGL_NOTE;
      }
    } catch {
      this.close();
      this.note = NO_CHUNK_NOTE;
    } finally {
      this.loading = false;
    }
  }

  /** The view follows the document: called after every change while 3D is open. */
  sync(inputs: View3dInputs): void {
    const ref = this.ref;
    if (!ref) return;
    ref.setInput('design', inputs.design);
    ref.setInput('glassTint', inputs.glassTint);
    ref.setInput('glassTints', inputs.glassTints);
    ref.setInput('frameFaceMm', inputs.frameFaceMm);
  }

  close(): void {
    this.ref?.destroy();
    this.ref = null;
    this.on = false;
  }
}
