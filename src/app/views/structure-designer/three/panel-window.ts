/**
 * A wall panel's window in the 3D view. The window of shared/design-3d is
 * built in its own millimetres (x along the sill, y up, z out of the frame);
 * this puts it on the plane of its panel: the corner of the frame on the
 * corner of the panel, the frame centred on the plane of the bars.
 */

import { Matrix4, Vector3 } from 'three';
import { Face, faceNormal } from '../../../shared/structure-model';

/** Window millimetres to world millimetres. The frame is `depthMm` deep and stands centred on the plane of the panel. */
export function panelPlacement(face: Face, depthMm: number): Matrix4 {
  const { origin, u, v } = face.plane;
  const n = faceNormal(face);
  const m = new Matrix4();
  m.makeBasis(new Vector3(...u), new Vector3(...v), new Vector3(...n));
  m.setPosition(origin[0] + (n[0] * depthMm) / 2, origin[1] + (n[1] * depthMm) / 2, origin[2] + (n[2] * depthMm) / 2);
  return m;
}

/** A point of the window (its own millimetres) in the world. */
export function windowPoint(placement: Matrix4, x: number, y: number, z: number): Vector3 {
  return new Vector3(x, y, z).applyMatrix4(placement);
}
