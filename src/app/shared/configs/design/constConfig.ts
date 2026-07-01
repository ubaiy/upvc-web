// Physical profile dimensions in mm — used to derive pixel insets via ratio (px/mm).
// TODO: replace these defaults once the profile API exposes a nominal_width_mm field.
//       Wire frameThicknessMm to the selected frame profile data and mullionWidthMm to
//       the selected mullion profile data in sub-quotation-design.component.ts.
export const frameThicknessMm = 60;  // Typical UPVC 60-series frame/sash profile
export const mullionWidthMm = 60;    // Typical UPVC mullion/transom profile
export const minFramePx = 2;         // Pixel floor — keeps frame visible at extreme zoom-out

// Legacy pixel constant kept for updateAdjacentRects(); do not use for new frame-inset math.
export const innerRectGap = 25;
export const padding = 60;
export const strokeWidth = 4;
export const cornerRadius = 0;
export const arrowLength = 5;
export const arrowWidth = 8;
export const lineConnectosDirections = [
  'TopLeft',
  'TopRight',
  'BottomLeft',
  'BottomRight',
];
export const directionLines = ['top', 'left'];

export const mullionDirections = [
  { key: 1, value: 'Vertical' },
  { key: 2, value: 'Horizontal' },
];
export const selectedRectColor = 'lightgreen';
export const defaultRectColor = 'lightblue';
export const noGlassRectColor = 'black';
export const strokeDefaultColor = 'black';
