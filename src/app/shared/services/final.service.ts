import { Injectable } from '@angular/core';
import Konva from 'konva';
import * as designConst from 'src/app/shared/configs/design/constConfig';
import { KonvaElementService } from 'src/app/shared/services/konva-element.service';
const corners = designConst.lineConnectosDirections;
const directions = designConst.directionLines;
@Injectable({
  providedIn: 'root',
})
export class FinalService {
  xPos: number;
  yPos: number;
  frameWidth: number;
  frameHeight: number;
  fillColor: string;
  strokeColor: string;
  constructor(private _konvaDesignService: KonvaElementService) {}
  /**
   *
   * @param xPos x Position of the element
   * @param yPos y Position of the element
   * @param frameWidth Frame's width
   * @param frameHeight Frame's Height
   * @param fillColor Frame's Color
   * @param strokeColor Stroke Color
   * For initial Value setup
   */
  public setDataValues(
    xPos: number,
    yPos: number,
    frameWidth: number,
    frameHeight: number,
    fillColor: string,
    strokeColor: string
  ) {
    this.xPos = xPos;
    this.yPos = yPos;
    this.frameWidth = frameWidth;
    this.frameHeight = frameHeight;
    this.fillColor = fillColor;
    this.strokeColor = strokeColor;
  }

  /**
   * For initial level calculation
   */
  public calculations(
    stage: Konva.Stage,
    frameWidth: number,
    frameHeight: number
  ): { xPos: number; yPos: number; ratio: number } {
    const totalWidth = stage.width();
    const totalHeight = stage.height();
    const availableWidth = totalWidth - 2 * designConst.padding;
    const availableHeight = totalHeight - 2 * designConst.padding;
    const widthRatio = availableWidth / frameWidth;
    const heightRatio = availableHeight / frameHeight;
    const ratio = Math.min(widthRatio, heightRatio);
    const centerX = totalWidth / 2;
    const centerY = totalHeight / 2;
    const xPos = centerX - (frameWidth * ratio) / 2;
    const yPos = centerY - (frameHeight * ratio) / 2;
    return { xPos: xPos, yPos: yPos, ratio: ratio };
  }

  /**
   *  To create corner connector lines
   */
  public cornerConnectors(
    innerRect: Konva.Rect,
    xPos: number,
    yPos: number,
    frameWidth: number,
    frameHeight: number,
    ratio: number
  ): Konva.Group {
    const connectors = corners.map((corner) => {
      const innerRectCorner = {
        x: innerRect.x() + (corner.includes('Right') ? innerRect.width() : 0),
        y: innerRect.y() + (corner.includes('Bottom') ? innerRect.height() : 0),
      };
      const start =
        corner === 'TopLeft'
          ? { x: xPos, y: yPos }
          : corner === 'TopRight'
          ? { x: xPos + frameWidth * ratio, y: yPos }
          : corner === 'BottomLeft'
          ? { x: xPos, y: yPos + frameHeight * ratio }
          : { x: xPos + frameWidth * ratio, y: yPos + frameHeight * ratio };
      const line = this._konvaDesignService.createLine(start, innerRectCorner);
      return line;
    });
    const group = this._konvaDesignService.returnGroup(connectors);
    return group;
  }

  public addArrowLine(
    start: any,
    end: any,
    text: string,
    rotation: number,
    textPadding: number
  ): Konva.Group {
    const line = this._konvaDesignService.createLine(start, end);
    const arrowStartX =
      start.x + designConst.arrowLength * Math.cos((rotation * Math.PI) / 180);
    const arrowStartY =
      start.y + designConst.arrowLength * Math.sin((rotation * Math.PI) / 180);
    const arrowEndX =
      end.x - designConst.arrowLength * Math.cos((rotation * Math.PI) / 180);
    const arrowEndY =
      end.y - designConst.arrowLength * Math.sin((rotation * Math.PI) / 180);
    const arrowStart = this._konvaDesignService.createArrow(
      arrowStartX,
      arrowStartY,
      start
    );
    const arrowEnd = this._konvaDesignService.createArrow(
      arrowEndX,
      arrowEndY,
      end
    );
    const sizeText = this._konvaDesignService.createText(
      start,
      end,
      text,
      rotation,
      textPadding
    );
    const group = this._konvaDesignService.returnGroup([
      line,
      arrowStart,
      arrowEnd,
      sizeText,
    ]);
    return group;
  }

  public addLineAndArrow(
    xPos: number,
    yPos: number,
    frameWidth: number,
    frameHeight: number,
    ratio: number
  ): Konva.Group {
    const lines: any[] = [];
    directions.forEach((c) => {
      const isTop = c.includes('top');
      const isBottom = c.includes('bottom');
      const isLeft = c.includes('left');
      const start: any = {
          x:
            isTop || isBottom
              ? xPos
              : isLeft
              ? xPos - 15
              : xPos + frameWidth * ratio + 15,
          y: isTop
            ? yPos - 15
            : isBottom
            ? yPos + frameHeight * ratio + 15
            : isLeft
            ? yPos
            : yPos + frameHeight * ratio,
        },
        end: any = {
          x:
            isTop || isBottom
              ? xPos + frameWidth * ratio
              : isLeft
              ? xPos - 15
              : xPos + frameWidth * ratio + 15,
          y: isTop
            ? yPos - 15
            : isBottom
            ? yPos + frameHeight * ratio + 15
            : isLeft
            ? yPos + frameHeight * ratio
            : yPos + 10,
        },
        text: string = `${isTop || isBottom ? frameWidth : frameHeight} mm`,
        rotation: number = isTop || isBottom ? 0 : isLeft ? 90 : -90;
      const textPadding: number = isTop ? -20 : 8;
      lines.push(this.addArrowLine(start, end, text, rotation, textPadding));
    });
    const group = this._konvaDesignService.returnGroup(lines);
    return group;
  }

  public addLineAndArrowVertical(
    xPos: number,
    yPos: number,
    frameWidth: number,
    ratio: number
  ): Konva.Group {
    const lines: any[] = [];
    const start: any = {
        x: xPos,
        y: yPos,
      },
      end: any = {
        x: xPos + frameWidth * ratio,
        y: yPos - 15,
      },
      text: string = `${frameWidth} mm`,
      rotation: number = 0;
    const textPadding: number = -20;
    lines.push(this.addArrowLine(start, end, text, rotation, textPadding));
    const group = this._konvaDesignService.returnGroup(lines);
    return group;
  }

  public addLineAndArrowHorizontal(
    xPos: number,
    yPos: number,
    frameHeight: number,
    ratio: number
  ): Konva.Group {
    const lines: any[] = [];
    directions.forEach((c) => {
      const start: any = {
          x: xPos - 15,
          y: yPos,
        },
        end: any = {
          x: xPos - 15,
          y: yPos + frameHeight * ratio,
        },
        text: string = `${frameHeight} mm`,
        rotation: number = 90;
      const textPadding: number = 8;
      lines.push(this.addArrowLine(start, end, text, rotation, textPadding));
    });
    const group = this._konvaDesignService.returnGroup(lines);
    return group;
  }

  public handle(handleProps: { x: number; y: number; rotationDeg: number }) {
    const { x, y, rotationDeg } = handleProps;
    const handle = new Konva.Shape({
      x: x,
      y: y,
      fill: 'white',
      sceneFunc: (ctx, shape) => {
        ctx.beginPath();
        ctx.rect(-20, -15, 20, 30);
        ctx.rect(-14, -5, 14, 10);
        ctx.closePath();
        ctx.fillStrokeShape(shape);
      },
      rotationDeg: rotationDeg,
      stroke: 'black',
      strokeWidth: 1,
    });
    return handle;
  }
}
