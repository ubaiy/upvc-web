/**
 * structure-model bar sections — THE one table of bar roles.
 *
 * The generators and the 3D view know roles only through this table. The
 * sizes are drawing sizes of a plain box section; they are not a supplier's
 * profile. When the catalogue rows with these roles are wired in (products
 * .role, face_width_mm, profile_depth_mm, section_outline), this table is
 * replaced by those rows and no other file changes.
 */

export interface BarSection {
  role: string;
  label: string;
  /** Geometry class of architecture.md §2.4. */
  class: 'inline' | 'corner' | 'edge' | 'ridge' | 'rib';
  /** Seen face width and depth of the drawn box, mm. */
  widthMm: number;
  depthMm: number;
}

export const BAR_SECTIONS: readonly BarSection[] = [
  { role: 'frame', label: 'Frame', class: 'edge', widthMm: 60, depthMm: 70 },
  { role: 'mullion', label: 'Mullion', class: 'inline', widthMm: 60, depthMm: 70 },
  { role: 'transom', label: 'Transom', class: 'inline', widthMm: 60, depthMm: 70 },
  { role: 'coupler', label: 'Coupler', class: 'inline', widthMm: 50, depthMm: 80 },
  { role: 'corner_post', label: 'Corner post', class: 'corner', widthMm: 90, depthMm: 90 },
  { role: 'eave', label: 'Eave beam', class: 'corner', widthMm: 80, depthMm: 100 },
  { role: 'wall_plate', label: 'Wall plate', class: 'edge', widthMm: 70, depthMm: 90 },
  { role: 'rafter', label: 'Rafter', class: 'rib', widthMm: 50, depthMm: 90 },
  { role: 'hip', label: 'Hip rafter', class: 'rib', widthMm: 60, depthMm: 100 },
  { role: 'ridge', label: 'Ridge', class: 'ridge', widthMm: 80, depthMm: 110 },
  { role: 'rib', label: 'Rib', class: 'rib', widthMm: 50, depthMm: 80 },
  { role: 'ring', label: 'Ring', class: 'rib', widthMm: 50, depthMm: 80 },
];

const FALLBACK: BarSection = { role: '', label: 'Bar', class: 'inline', widthMm: 50, depthMm: 70 };

/** The row of a role; an unknown role is still drawn, as a plain bar. */
export function barSection(role: string): BarSection {
  return BAR_SECTIONS.find((s) => s.role === role) ?? { ...FALLBACK, role, label: role || FALLBACK.label };
}

/** Hub roles and what the user reads for them. */
export const HUB_LABELS: Readonly<Record<string, string>> = {
  crown: 'Crown hub',
  node: 'Node connector',
  ridge_end: 'Ridge end boss',
  corner: 'Corner connector',
};

export function hubLabel(role: string): string {
  return HUB_LABELS[role] ?? role;
}
