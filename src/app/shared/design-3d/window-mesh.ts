/**
 * design-3d window mesh — turns the pure WindowParts description into
 * three.js objects. Parts fixed to the frame are merged into ONE geometry
 * per material; each opening sash or sliding shutter is its own group with
 * one geometry per material, so a window is a handful of draw calls.
 */

import {
  BufferGeometry,
  Color,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import { MovingGroup, PartMaterial, WindowParts } from './window-parts';

export interface WindowLook {
  /** Profile colour (hex) from `frame.profileColor`; white when the design has none. */
  profileColor: string;
  /** Glass tint (hex). */
  glassTint: string;
  /** Tint (hex) by glass id, for panes glazed differently from the window. */
  glassTints?: Record<string, string>;
}

export const DEFAULT_LOOK: WindowLook = { profileColor: '#ffffff', glassTint: '#c4e4f1' };

export type WindowMaterials = Record<PartMaterial, MeshStandardMaterial> & {
  /** Thin line on every hard edge of a profile, so a white bar reads on a white sheet. */
  edge: LineBasicMaterial;
};

/** Faces that meet at less than this are one surface (the facets of a curved bar). */
const EDGE_ANGLE_DEG = 60;

export function createMaterials(): WindowMaterials {
  return {
    // uPVC: a little gloss, so the eased edges and the lights of the room show on it.
    profile: new MeshStandardMaterial({ color: 0xffffff, roughness: 0.34, metalness: 0, envMapIntensity: 0.7 }),
    // Cheap glass: no transmission pass, so a phone pays for one blended layer only.
    // It is see-through by opacity and reads as glass by the room it reflects.
    glass: new MeshStandardMaterial({
      color: 0xc4e4f1,
      roughness: 0.03,
      metalness: 0.1,
      envMapIntensity: 2.2,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
      side: DoubleSide,
    }),
    gasket: new MeshStandardMaterial({ color: 0x17191c, roughness: 0.85, metalness: 0, envMapIntensity: 0.4 }),
    mesh: new MeshStandardMaterial({
      color: 0x3a4047,
      roughness: 0.9,
      metalness: 0,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      side: DoubleSide,
    }),
    // Brushed metal: handle and threshold.
    hardware: new MeshStandardMaterial({ color: 0xc5c9ce, roughness: 0.3, metalness: 0.92, envMapIntensity: 1.1 }),
    edge: new LineBasicMaterial({ color: 0x55606b, transparent: true, opacity: 0.55 }),
  };
}

function safeColor(hex: string, fallback: string): Color {
  return new Color(/^#[0-9a-f]{6}$/i.test(hex) ? hex : fallback);
}

export function applyLook(materials: WindowMaterials, look: WindowLook): void {
  materials.profile.color.copy(safeColor(look.profileColor, DEFAULT_LOOK.profileColor));
  materials.glass.color.copy(safeColor(look.glassTint, DEFAULT_LOOK.glassTint));
  // The edge line is the profile colour, darkened: grey on white, near black on a dark foil.
  materials.edge.color.copy(materials.profile.color).multiplyScalar(0.42);
}

export function disposeMaterials(materials: WindowMaterials): void {
  Object.values(materials).forEach((m) => m.dispose());
}

export interface Mover {
  def: MovingGroup;
  group: Group;
}

/** A pane in its own glass with no known tint still has to read as another glass. */
const OWN_GLASS_TINTS = ['#8fa9bd', '#c9a27a', '#9fd3b4'];

export interface WindowObject {
  root: Group;
  /** Glass materials of panes in their own glass; they live and die with the window. */
  ownMaterials: MeshStandardMaterial[];
  movers: Mover[];
  geometries: BufferGeometry[];
  triangles: number;
}

/** One group in face-local mm; the caller places it (a structure face is this group × its plane matrix). */
export function buildWindowGroup(parts: WindowParts, materials: WindowMaterials, look?: WindowLook): WindowObject {
  const root = new Group();
  const geometries: BufferGeometry[] = [];
  const movers = new Map<string, Mover>();
  for (const def of parts.groups) {
    const group = new Group();
    group.position.set(def.pivot[0], def.pivot[1], def.pivot[2]);
    root.add(group);
    movers.set(def.id, { def, group });
  }

  // Merge: one buffer per (moving group, material).
  const buckets = new Map<
    string,
    { groupId: string | null; material: PartMaterial; glassId?: string; pos: number[][]; nrm: number[][] }
  >();
  const ownGlass = new Map<string, MeshStandardMaterial>();
  const glassOf = (glassId: string): MeshStandardMaterial => {
    let m = ownGlass.get(glassId);
    if (!m) {
      m = materials.glass.clone();
      const fallback = OWN_GLASS_TINTS[ownGlass.size % OWN_GLASS_TINTS.length];
      m.color.copy(safeColor(look?.glassTints?.[glassId] ?? '', fallback));
      // A little denser than the window's glass, so the tint shows against the room.
      m.opacity = 0.55;
      ownGlass.set(glassId, m);
    }
    return m;
  };
  let triangles = 0;
  for (const part of parts.parts) {
    const key = `${part.groupId ?? ''}|${part.material}|${part.glassId ?? ''}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { groupId: part.groupId, material: part.material, glassId: part.glassId, pos: [], nrm: [] };
      buckets.set(key, bucket);
    }
    bucket.pos.push(part.positions);
    bucket.nrm.push(part.normals);
    triangles += part.positions.length / 9;
  }
  buckets.forEach((bucket) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(bucket.pos.flat(), 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(bucket.nrm.flat(), 3));
    geometries.push(geometry);
    const mesh = new Mesh(geometry, bucket.glassId ? glassOf(bucket.glassId) : materials[bucket.material]);
    if (bucket.material === 'profile') {
      const edges = new EdgesGeometry(geometry, EDGE_ANGLE_DEG);
      geometries.push(edges);
      mesh.add(new LineSegments(edges, materials.edge));
    }
    const mover = bucket.groupId ? movers.get(bucket.groupId) : undefined;
    if (mover) {
      // The group's origin is the hinge line, so the mesh goes back by the pivot.
      mesh.position.set(-mover.def.pivot[0], -mover.def.pivot[1], -mover.def.pivot[2]);
      mover.group.add(mesh);
    } else {
      root.add(mesh);
    }
  });
  return { root, movers: [...movers.values()], geometries, triangles, ownMaterials: [...ownGlass.values()] };
}

/** t = 0 closed … 1 fully open. */
export function setOpen(obj: WindowObject, t: number): void {
  const k = Math.min(1, Math.max(0, t));
  for (const { def, group } of obj.movers) {
    if (def.kind === 'hinge') {
      group.rotation.set(def.axis[0] * def.travel * k, def.axis[1] * def.travel * k, def.axis[2] * def.travel * k);
    } else {
      group.position.set(
        def.pivot[0] + def.axis[0] * def.travel * k,
        def.pivot[1] + def.axis[1] * def.travel * k,
        def.pivot[2] + def.axis[2] * def.travel * k
      );
    }
  }
}

export function disposeWindow(obj: WindowObject): void {
  obj.geometries.forEach((g) => g.dispose());
  obj.ownMaterials.forEach((m) => m.dispose());
  obj.root.removeFromParent();
  obj.root.clear();
}
