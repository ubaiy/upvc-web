import Konva from 'konva';

export const getFramePoints = (
  direction: number,
  frameWidth: number,
  frameHeight: number,
  margin: number
): number[] => {
  const points: {
    [key: number]: number[];
  } = {
    1: [
      frameWidth,
      0,
      frameWidth,
      frameHeight,
      frameWidth - margin,
      frameHeight - margin,
      frameWidth - margin,
      margin,
    ],
    2: [0, 0, margin, margin, margin, frameHeight - margin, 0, frameHeight],
    3: [0, 0, frameWidth, 0, frameWidth - margin, margin, margin, margin],
    4: [
      0,
      frameHeight,
      margin,
      frameHeight - margin,
      frameWidth - margin,
      frameHeight - margin,
      frameWidth,
      frameHeight,
    ],
  };
  return points[direction];
};

export const getGlass = (
  frameWidth: number,
  frameHeight: number,
  margin: number,
  glass?: string
): Konva.Rect => {
  return new Konva.Rect({
    x: margin,
    y: margin,
    width: frameWidth - 2 * margin,
    height: frameHeight - 2 * margin,
    fill: glass == 'No glass' ? 'black' : 'lightblue',
  });
};

export const createFrameLine = (
  points: number[],
  color: string
): Konva.Line => {
  return new Konva.Line({
    points: points,
    fill: color,
    closed: true,
    stroke: 'black',
    strokeWidth: 2,
  });
};

export const createMullion = (points: number[], color: string): Konva.Line => {
  return new Konva.Line({
    points: points,
    fill: color,
    closed: true,
    stroke: 'black',
    strokeWidth: 2,
    draggable: true,
  });
};

export const getMullionPoints = (
  type: number,
  frameWidth: number,
  frameHeight: number,
  margin: number
): number[] => {
  const mrg = margin / 2;
  const points: {
    [key: number]: number[];
  } = {
    1: [
      frameWidth / 2 - mrg,
      margin,
      frameWidth / 2 - mrg,
      frameHeight - margin,
      frameWidth / 2 + mrg,
      frameHeight - margin,
      frameWidth / 2 + mrg,
      margin,
    ],
    2: [
      margin,
      frameHeight / 2 - mrg,
      frameWidth - margin,
      frameHeight / 2 - mrg,
      frameWidth - margin,
      frameHeight / 2 + mrg,
      margin,
      frameHeight / 2 + mrg,
    ],
  };
  return points[type];
};
