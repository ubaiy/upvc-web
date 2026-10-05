/**
 * design-3d snapshot — the 3D twin of designPicture(): a PNG of a window at
 * a fixed size, on white, from the standing view.
 */

import { WindowDesign } from '../design-model';
import { DesignScene } from './scene';
import { DEFAULT_LOOK, WindowLook } from './window-mesh';
import { PartsOptions, buildWindowParts } from './window-parts';

export const SNAPSHOT_WIDTH_PX = 1600;
export const SNAPSHOT_HEIGHT_PX = 1200;

/** Picture of the window a live scene is showing (its sashes as open as they are on screen). */
export function scenePicture(scene: DesignScene): string {
  return scene.snapshot(SNAPSHOT_WIDTH_PX, SNAPSHOT_HEIGHT_PX);
}

/** Look of a design: its own profile colour, and the glass tint the host knows for its glass. */
export function lookOf(design: WindowDesign, glassTint?: string | null, glassTints?: Record<string, string> | null): WindowLook {
  return {
    glassTints: glassTints ?? undefined,
    profileColor: design.frame.profileColor || DEFAULT_LOOK.profileColor,
    glassTint: glassTint || DEFAULT_LOOK.glassTint,
  };
}

/**
 * Picture of a design with no view on screen: its own canvas and scene,
 * disposed before returning. Throws when the device has no WebGL.
 */
export function design3dPicture(
  design: WindowDesign,
  opts?: PartsOptions & { glassTint?: string | null; open?: number }
): string {
  const canvas = document.createElement('canvas');
  canvas.width = SNAPSHOT_WIDTH_PX;
  canvas.height = SNAPSHOT_HEIGHT_PX;
  const scene = new DesignScene(canvas);
  try {
    scene.setParts(buildWindowParts(design, opts), lookOf(design, opts?.glassTint));
    if (opts?.open) scene.setOpen(opts.open);
    return scenePicture(scene);
  } finally {
    scene.dispose();
  }
}
