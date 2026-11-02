/**
 * What the Selection panel says about the panels that are selected: their
 * size, what they open as, why a choice is held back, the window of the
 * first one in a line, the glass of roof panes and what solid panels are made
 * of. Pure.
 */

import {
  Face,
  faceAreaSqMm,
  fillKey,
  FillKey,
  noWindowReason,
  panelSize,
  SHAPE_LABEL,
  Structure,
  windowFrameOf,
} from '../../shared/structure-model';
import { DesignerCatalog } from '../quotation/sub-quotation/sub-quotation-design/designer-catalog';
import { describeWindow } from './structure-choices';
import { windowDesigns } from './structure-windows';

export interface FaceInfo {
  title: string;
  shape: string;
  size: string;
  area: string;
  fill: FillKey | null;
  group: string;
  /** Why Sliding is not offered for this selection; '' when it is. */
  noSliding: string;
  /** Why a window cannot be this selection (a shape or a size no window has); '' when it can. */
  noWindow: string;
  /** The selected panels that are windows. */
  windowIds: string[];
  /** The window of the first of them in one line (glass, how it opens, its handle). */
  windowText: string;
  /** Roof panes of plain glass among the selection, and the glass chosen for them: '' = the structure's, 'mixed' = they differ. */
  glassPanes: number;
  glassValue: string;
  /** Solid panels among the selection, and what they are made of: '' = not chosen, 'mixed' = they differ. */
  solidPanes: number;
  solidValue: string;
}

/** Sliding leaves run on a straight head and sill: only a plain rectangle can have them. */
export function canSlide(face: Face): boolean {
  return panelSize(face).shape === 'rectangle';
}

const common = (values: string[]): string => (new Set(values).size > 1 ? 'mixed' : values[0] ?? '');

export function faceInfoOf(structure: Structure, selectedIds: string[], catalog: DesignerCatalog): FaceInfo | null {
  const chosen = structure.faces.filter((f) => selectedIds.includes(f.id));
  const first = structure.faces.find((f) => f.id === selectedIds[0]);
  if (!first) return null;
  const fills = new Set(chosen.map((f) => fillKey(f)));
  const area = chosen.reduce((sum, f) => sum + faceAreaSqMm(f), 0) / 1e6;
  const size = panelSize(first);
  const many = chosen.length > 1;
  const raked = chosen.filter((f) => !canSlide(f)).length;
  const noSliding = !raked
    ? ''
    : !many
      ? 'Sliding needs a rectangular panel: two leaves cannot run on a sloped or pointed frame.'
      : `Sliding needs rectangular panels: ${raked} of the ${chosen.length} selected ${raked === 1 ? 'is' : 'are'} not.`;
  const bare = chosen.filter((f) => !windowFrameOf(f)).length;
  const noWindow = !bare
    ? ''
    : !many
      ? noWindowReason(first)
      : `${bare} of the ${chosen.length} selected ${bare === 1 ? 'has' : 'have'} a shape or a size no window has, so ${bare === 1 ? 'it is' : 'they are'} plain glass.`;
  const windows = chosen.filter((f) => f.fill.kind === 'design');
  const firstWindow = windows[0] ? windowDesigns(structure).get(windows[0].id) : undefined;
  const glass = chosen.filter((f) => f.fill.kind === 'glass');
  const solid = chosen.filter((f) => f.fill.kind === 'panel');
  return {
    noSliding,
    noWindow,
    windowIds: windows.map((f) => f.id),
    windowText: firstWindow ? describeWindow(firstWindow, catalog) : '',
    glassPanes: glass.length,
    glassValue: common(glass.map((f) => (f.fill.kind === 'glass' && f.fill.glassId !== null ? String(f.fill.glassId) : ''))),
    solidPanes: solid.length,
    solidValue: common(solid.map((f) => (f.fill.kind === 'panel' && f.fill.productId !== null ? String(f.fill.productId) : ''))),
    title: !many ? first.label : `${chosen.length} panels`,
    shape: !many ? SHAPE_LABEL[size.shape] : chosen.every((f) => f.group === first.group) ? first.groupLabel : 'Several groups',
    size: !many ? `${size.text} mm` : '',
    area: `${area.toFixed(2)} m²`,
    fill: fills.size === 1 ? [...fills][0] : null,
    group: first.groupLabel,
  };
}
