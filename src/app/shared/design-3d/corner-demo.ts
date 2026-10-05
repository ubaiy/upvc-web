/**
 * THROWAWAY (super system roadmap, P0 item 5). One hard-coded coupled
 * corner for the design lab: the same window on two faces at 90° with a box
 * post between them. It exists to prove that a window group built in
 * face-local millimetres can be placed on any plane with one matrix, which
 * is what P2's structures do for real (`structure-mesh.ts`). Delete this
 * file when P2 lands; nothing outside the lab may use it.
 */

import { BoxGeometry, BufferGeometry, EdgesGeometry, Group, LineSegments, Matrix4, Mesh, Vector3 } from 'three';
import { WindowParts } from './window-parts';
import { WindowMaterials, WindowObject, buildWindowGroup } from './window-mesh';

/** Face-local axes (x along the sill, y up the plane, z = outward normal) to world. */
export function planeMatrix(origin: Vector3, u: Vector3, normal: Vector3): Matrix4 {
  const z = normal.clone().normalize();
  const y = new Vector3().crossVectors(z, u).normalize();
  const x = new Vector3().crossVectors(y, z);
  return new Matrix4().makeBasis(x, y, z).setPosition(origin);
}

export interface CornerDemo {
  root: Group;
  /** The second face: it opens and closes with the first. */
  face: WindowObject;
  /** Far corner of the pair, for fitting the camera. */
  max: Vector3;
  min: Vector3;
  dispose(): void;
}

export function buildCornerDemo(parts: WindowParts, materials: WindowMaterials): CornerDemo {
  const { widthMm: w, heightMm: h, depthMm: d } = parts;
  const root = new Group();
  const own: BufferGeometry[] = [];

  // The post: a square box of the frame's depth, standing where the two faces meet.
  const box = new BoxGeometry(d, h, d);
  const post = new Mesh(box, materials.profile);
  post.position.set(w + d / 2, h / 2, -d / 2);
  const edges = new EdgesGeometry(box);
  post.add(new LineSegments(edges, materials.edge));
  own.push(box, edges);
  root.add(post);

  // The second face runs back from the post: its sill points to −z, its outside to +x.
  const face = buildWindowGroup(parts, materials);
  face.root.matrixAutoUpdate = false;
  face.root.matrix.copy(planeMatrix(new Vector3(w + d, 0, -d), new Vector3(0, 0, -1), new Vector3(1, 0, 0)));
  root.add(face.root);

  return {
    root,
    face,
    min: new Vector3(0, 0, -d - w),
    max: new Vector3(w + d, h, 0),
    dispose: () => {
      own.forEach((g) => g.dispose());
      face.geometries.forEach((g) => g.dispose());
      root.removeFromParent();
      root.clear();
    },
  };
}
