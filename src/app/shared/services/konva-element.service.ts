import { Injectable } from '@angular/core';
import * as designConst from '../configs/design/constConfig';
import Konva from 'konva';
@Injectable({
  providedIn: 'root',
})
export class KonvaElementService {
  constructor() {}

  /**
   * Help to create Konva Elements
   */
  public createRect(
    xPos: number,
    yPos: number,
    frameWidth: number,
    frameHeight: number,
    fillColor: string,
    strokeColor: string
  ): Konva.Rect {
    const rect = new Konva.Rect({
      x: xPos,
      y: yPos,
      width: frameWidth,
      height: frameHeight,
      fill: fillColor,
      stroke: strokeColor,
      strokeWidth: designConst.strokeWidth,
      cornerRadius: designConst.cornerRadius,
      pointerEvent: 'auto',
    });
    return rect;
  }

  public createLine(start: any, end: any) {
    return new Konva.Line({
      points: [start.x, start.y, end.x, end.y],
      stroke: 'black',
      strokeWidth: 2,
      pointerLength: 5, // Length of the arrowhead
      pointerWidth: 5, // Width of the arrowhead
    });
  }

  public createArrow(arrowX: number, arrowY: number, start: any) {
    return new Konva.Arrow({
      points: [arrowX, arrowY, start.x, start.y],
      stroke: 'black',
      fill: 'black',
      strokeWidth: 4,
      pointerLength: designConst.arrowLength,
      pointerWidth: designConst.arrowWidth,
    });
  }

  public createText(
    start: any,
    end: any,
    text: string,
    rotation: number,
    padding: number
  ) {
    return new Konva.Text({
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2,
      text: text,
      fontSize: 14,
      fontFamily: 'Arial',
      fill: 'red',
      verticalAlign: 'center',
      padding: padding,
      rotation: rotation,
    });
  }

  /**
   * Help to create group
   */
  public returnGroup(children: any): Konva.Group {
    const group = new Konva.Group();
    group.add(...children);
    return group;
  }
}
