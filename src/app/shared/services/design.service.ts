import { Injectable } from '@angular/core';
import Konva from 'konva';

@Injectable({
  providedIn: 'root',
})
export class DesignService {
  color: string;
  frameWidth: number;
  frameHeight: number;
  margin: number;
  margin2: number;
  palla_type: number;
  direction: number;
  glass?: string;
  createFrame(
    frameWidth: number,
    frameHeight: number,
    margin: number,
    sash: boolean,
    direction: number,
    palla_type: number,
    color: string,
    handle: number,
    glass_type?: string
  ): Konva.Group {
    this.color = color;
    this.margin = margin;
    this.frameHeight = frameHeight;
    this.frameWidth = frameWidth;
    this.palla_type = palla_type;
    this.direction = direction;
    this.margin2 = margin * 2;
    this.glass = glass_type;
    const group = new Konva.Group({ draggable: false });
    const top = this.createFrameLine(this._getFramePoints(3));
    const left = this.createFrameLine(this._getFramePoints(2));
    const bottom = this.createFrameLine(this._getFramePoints(4));
    const right = this.createFrameLine(this._getFramePoints(1));
    const glass = this.createGlass();
    group.add(glass, top, left, bottom, right);
    if (sash) {
      const sashFrame = this.createSash();
      const handle = this._handle(this._handleConfigs());
      const directionLine = this.createDirectionLine();
      group.add(...sashFrame, ...directionLine, handle);
    }
    return group;
  }

  private _getFramePoints(direction: number) {
    const points: {
      [key: number]: number[];
    } = {
      1: [
        this.frameWidth,
        0,
        this.frameWidth,
        this.frameHeight,
        this.frameWidth - this.margin,
        this.frameHeight - this.margin,
        this.frameWidth - this.margin,
        this.margin,
      ],
      2: [
        0,
        0,
        this.margin,
        this.margin,
        this.margin,
        this.frameHeight - this.margin,
        0,
        this.frameHeight,
      ],
      3: [
        0,
        0,
        this.frameWidth,
        0,
        this.frameWidth - this.margin,
        this.margin,
        this.margin,
        this.margin,
      ],
      4: [
        0,
        this.frameHeight,
        this.margin,
        this.frameHeight - this.margin,
        this.frameWidth - this.margin,
        this.frameHeight - this.margin,
        this.frameWidth,
        this.frameHeight,
      ],
    };
    return points[direction];
  }

  private _handleConfigs(): {
    x: number;
    y: number;
    rotationDeg: number;
  } {
    const handleConfigurations: {
      [key: string]: { x: number; y: number; rotationDeg: number };
    } = {
      3: {
        x: this.frameWidth / 2,
        y: this.frameHeight - this.margin - 30,
        rotationDeg: 90,
      },
      4: { x: this.frameWidth / 2, y: this.margin + 30, rotationDeg: 90 },
      2: { x: this.margin + 30, y: this.frameHeight / 2, rotationDeg: 0 },
      1: {
        x: this.frameWidth - this.margin - 30,
        y: this.frameHeight / 2,
        rotationDeg: 0,
      },
      5: { x: this.margin + 30, y: this.frameHeight / 2, rotationDeg: 0 },
      6: {
        x: this.frameWidth - this.margin - 30,
        y: this.frameHeight / 2,
        rotationDeg: 0,
      },
      7: { x: this.margin + 30, y: this.frameHeight / 2, rotationDeg: 0 },
      8: {
        x: this.frameWidth - this.margin - 30,
        y: this.frameHeight / 2,
        rotationDeg: 0,
      },
      9: { x: this.margin + 30, y: this.frameHeight / 2, rotationDeg: 0 },
      10: {
        x: this.frameWidth - this.margin - 30,
        y: this.frameHeight / 2,
        rotationDeg: 0,
      },
    };
    return handleConfigurations[this.direction];
  }

  private _handle(handleProps: { x: number; y: number; rotationDeg: number }) {
    const { x, y, rotationDeg } = handleProps;
    const handle = new Konva.Shape({
      x: x,
      y: y,
      fill: 'white',
      sceneFunc: (ctx, shape) => {
        ctx.beginPath();
        ctx.rect(-20, -20, 40, 50);
        ctx.rect(-14, -5, 28, 80);
        ctx.fillStrokeShape(shape);
      },
      rotationDeg: rotationDeg,
      stroke: 'black',
      strokeWidth: 1,
    });
    return handle;
  }

  createDirectionLine(): Konva.Shape[] {
    const lines: Konva.Shape[] = [];
    const directionsToCheck = [1, 2, 3, 4];
    if (directionsToCheck.includes(this.direction)) {
      lines.push(this._createDirectionLine(this.direction));
    } else if (this.direction === 5) {
      lines.push(this._createDirectionLine(2));
      lines.push(this._createDirectionLine(3));
    } else if (this.direction === 6) {
      lines.push(this._createDirectionLine(1));
      lines.push(this._createDirectionLine(3));
    } else if (this.direction === 7) {
      lines.push(this._createDirectionLine(2));
      lines.push(this._createDirectionLine(4));
    } else if (this.direction === 8) {
      lines.push(this._createDirectionLine(1));
      lines.push(this._createDirectionLine(4));
    } else if (this.direction === 9) {
      lines.push(this._createDirectionLine(2));
      lines.push(this._createDirectionLine(4));
      lines.push(this._createDirectionLine(3));
    } else {
      lines.push(this._createDirectionLine(1));
      lines.push(this._createDirectionLine(4));
      lines.push(this._createDirectionLine(3));
    }
    return lines;
  }

  private _createDirectionLine(direction: number): Konva.Shape {
    const padding = this.margin;
    const frameHeight = this.frameHeight;
    const frameWidth = this.frameWidth;
    const padding2 = this.margin2;
    let points = [
      [padding * 2, padding * 2],
      [frameWidth - padding - padding, frameHeight / 2],
      [padding * 2, frameHeight - padding * 2],
      [frameWidth - padding - padding, frameHeight / 2],
    ];
    if (direction === 2) {
      points = [
        [frameWidth - padding * 2, padding * 2],
        [padding + padding, frameHeight / 2],
        [frameWidth - padding * 2, frameHeight - padding * 2],
        [padding + padding, frameHeight / 2],
      ];
    } else if (direction === 3) {
      points = [
        [padding2, padding2],
        [frameWidth / 2, frameHeight - padding2],
        [frameWidth - padding2, padding2],
        [frameWidth / 2, frameHeight - padding2],
      ];
    } else if (direction === 4) {
      points = [
        [padding * 2, frameHeight - padding * 2],
        [frameWidth / 2, padding * 2],
        [frameWidth / 2, padding * 2],
        [frameWidth - padding * 2, frameHeight - padding * 2],
      ];
    }

    return new Konva.Shape({
      sceneFunc: function (ctx) {
        ctx.fillStyle = 'black';
        ctx.lineWidth = 1;
        points.forEach((point, index) => {
          if (index === 0) {
            ctx.moveTo(point[0], point[1]);
          } else {
            ctx.lineTo(point[0], point[1]);
          }
        });

        ctx.stroke();
      },
    });
  }

  createFrameLine(points: number[]): Konva.Line {
    return new Konva.Line({
      points: points,
      fill: this.color,
      closed: true,
      stroke: 'black',
      strokeWidth: 2,
    });
  }

  createGlass(): Konva.Rect {
    return new Konva.Rect({
      x: this.margin,
      y: this.margin,
      width: this.frameWidth - 2 * this.margin,
      height: this.frameHeight - 2 * this.margin,
      fill: this.glass == 'No glass' ? 'black' : 'lightblue',
    });
  }

  createSash(): Konva.Line[] {
    const sashTopPoints = [
      this.margin,
      this.margin2,
      this.frameWidth - this.margin2,
      this.margin2,
      this.frameWidth - this.margin,
      this.margin,
      this.margin,
      this.margin,
    ];
    const sashLeftPoints = [
      this.margin,
      this.margin,
      this.margin2,
      this.margin2,
      this.margin2,
      this.frameHeight - this.margin2,
      this.margin,
      this.frameHeight - this.margin,
    ];
    const sashBottomPoints = [
      this.margin,
      this.frameHeight - this.margin,
      this.margin2,
      this.frameHeight - this.margin2,
      this.frameWidth - this.margin2,
      this.frameHeight - this.margin2,
      this.frameWidth - this.margin,
      this.frameHeight - this.margin,
    ];
    const sashRightPoints = [
      this.frameWidth - this.margin,
      this.margin,
      this.frameWidth - this.margin,
      this.frameHeight - this.margin,
      this.frameWidth - this.margin2,
      this.frameHeight - this.margin2,
      this.frameWidth - this.margin2,
      this.margin2,
    ];

    return [
      this.createFrameLine(sashTopPoints),
      this.createFrameLine(sashLeftPoints),
      this.createFrameLine(sashBottomPoints),
      this.createFrameLine(sashRightPoints),
    ];
  }
}
