import { Injectable } from '@angular/core';
import Konva from 'konva';

@Injectable({
  providedIn: 'root',
})
export class DesignService {
  createCasementWindow(
    canvasWidth: number,
    canvasHeight: number,
    frameColor: string,
    glassColor: string,
    frameWidth: number,
    frameHeight: number
  ): Konva.Group {
    const group = new Konva.Group();

    const borderSpace = 40; // Adjust the space between the canvas border and the window

    const availableWidth = canvasWidth - borderSpace * 2;
    const availableHeight = canvasHeight - borderSpace * 2;

    const scaleWidth = availableWidth / frameWidth;
    const scaleHeight = availableHeight / frameHeight;
    const scale = Math.min(scaleWidth, scaleHeight);

    const scaledFrameWidth = frameWidth * scale;
    const scaledFrameHeight = frameHeight * scale;

    const xPos = (canvasWidth - scaledFrameWidth) / 2;
    const yPos = (canvasHeight - scaledFrameHeight) / 2;

    const frame = new Konva.Rect({
      x: xPos,
      y: yPos,
      width: scaledFrameWidth,
      height: scaledFrameHeight,
      fill: frameColor,
      stroke: 'black',
      strokeWidth: 4,
    });

    const glass = new Konva.Rect({
      x: xPos + borderSpace / 2,
      y: yPos + borderSpace / 2,
      width: scaledFrameWidth - borderSpace,
      height: scaledFrameHeight - borderSpace,
      fill: glassColor,
      stroke: 'black',
      strokeWidth: 2,
    });

    const labelOffset = 20; // Offset to move labels inward

    const widthTextX = xPos + scaledFrameWidth / 2;
    const widthTextY = yPos + scaledFrameHeight + labelOffset;
    const heightTextX = xPos - labelOffset;
    const heightTextY = yPos + scaledFrameHeight / 2;

    const widthText = new Konva.Text({
      x: widthTextX,
      y: widthTextY,
      text: `Width: ${frameWidth}`,
      fontSize: 14,
      fill: 'black',
      align: 'center',
    });

    const heightText = new Konva.Text({
      x: heightTextX,
      y: heightTextY,
      text: `Height: ${frameHeight}`,
      fontSize: 14,
      fill: 'black',
      rotation: -90,
    });

    group.add(frame);
    group.add(glass);
    group.add(widthText);
    group.add(heightText);

    return group;
  }
}
