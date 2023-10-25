import { Injectable } from '@angular/core';
import Konva from 'konva';
import * as frameConfigs from '../../configs/design/framePoints.config';

@Injectable({
  providedIn: 'root',
})
export class FrameService {
  color: string;
  frameWidth: number;
  frameHeight: number;
  margin: number;
  margin2: number;
  palla_type: number;
  direction: number;
  glass?: string;

  createGroup(
    frameWidth: number,
    frameHeight: number,
    color: string,
    margin: number,
    glass_type?: string
  ): Konva.Group {
    this.margin = margin;
    this.color = color;
    this.frameHeight = frameHeight;
    this.frameWidth = frameWidth;
    this.margin2 = margin * 2;
    this.glass = glass_type;
    const group = new Konva.Group({ draggable: false });
    for (let i = 1; i <= 4; i++) {
      const points = frameConfigs.getFramePoints(
        i,
        this.frameWidth,
        this.frameHeight,
        this.margin
      );
      const line = frameConfigs.createFrameLine(points, color);
      group.add(line);
    }
    const glass = frameConfigs.getGlass(
      frameWidth,
      frameHeight,
      margin,
      glass_type
    );
    group.add(glass);
    // const points = frameConfigs.getMullionPoints(
    //   2,
    //   this.frameWidth,
    //   this.frameHeight,
    //   this.margin
    // );
    // group.add(frameConfigs.createMullion(points, color));
    // const point = frameConfigs.getMullionPoints(
    //   1,
    //   this.frameWidth,
    //   this.frameHeight,
    //   this.margin
    // );
    // group.add(frameConfigs.createMullion(point, color));
    return group;
  }
}
