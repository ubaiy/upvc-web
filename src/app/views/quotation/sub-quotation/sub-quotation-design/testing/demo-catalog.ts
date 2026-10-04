/**
 * Test catalogue with the ids of the demo database (read 2026-10-04), so
 * the specs complete designs the way the running demo does.
 */

import { DesignerCatalog } from '../designer-catalog';

const colour = { id: 1, color_name: 'Default', color_code: '#ffffff', is_default: 1 };

export function demoCatalog(): DesignerCatalog {
  return {
    glass: [
      { id: 1, label: '5mm plain glass', isDefault: true },
      { id: 2, label: '4mm Plain glass', isDefault: false },
      { id: 15, label: '6+6 DGU glass reflactive', isDefault: false },
    ],
    colours: [{ id: 1, label: 'Default', hex: '#ffffff', isDefault: true, row: colour }],
    hinges: ['Flate Hinges', 'Friction', '3D Hinges'],
    tracks: ['2 Track', '2.5 Track', '3 Track'],
    mullions: [{ id: 29, label: 'P60-Z · Mullion' }],
    systems: {
      'Window|Casement|Fixed|': { frames: [{ id: 26, label: 'P60-K-X-R' }], sashes: [] },
      'Window|Casement|Openable|': {
        frames: [{ id: 32, label: 'P60-FZT(I)' }],
        sashes: [
          { id: 27, label: 'P60-WKS-R' },
          { id: 28, label: 'P60-MS' },
          { id: 56, label: 'P60-NKMS-R' },
        ],
      },
      'Window|Slidding||2 Track': {
        frames: [{ id: 33, label: 'T60-KB' }],
        sashes: [
          { id: 35, label: 'T-MS-R' },
          { id: 36, label: 'T95-S-R' },
          { id: 40, label: 'T88-S-R' },
        ],
      },
      'Window|Slidding||3 Track': {
        frames: [{ id: 34, label: 'T112-K' }],
        sashes: [
          { id: 35, label: 'T-MS-R' },
          { id: 36, label: 'T95-S-R' },
          { id: 40, label: 'T88-S-R' },
        ],
      },
      'Door|Casement|Fixed|': { frames: [{ id: 26, label: 'P60-K-X-R' }], sashes: [] },
      'Door|Casement|Openable|': {
        frames: [{ id: 32, label: 'P60-FZT(I)' }],
        sashes: [
          { id: 27, label: 'P60-WKS-R' },
          { id: 28, label: 'P60-MS' },
          { id: 56, label: 'P60-NKMS-R' },
        ],
      },
    },
    handles: {
      Casement: [
        { id: 55, label: 'Casement Handle', door: false, window: true },
        { id: 59, label: 'T Handle', door: false, window: true },
        { id: 63, label: 'Bathroom door lock', door: true, window: false },
        { id: 66, label: 'Casement Espage Keep', door: true, window: true },
      ],
    },
  };
}
