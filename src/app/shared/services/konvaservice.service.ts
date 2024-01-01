// konva.service.ts
import { Injectable } from '@angular/core';
import Konva from 'konva';

@Injectable({
  providedIn: 'root',
})
export class KonvaService {
  stage: Konva.Stage;
  layer: Konva.Layer;
  windowRect: Konva.Rect;

  initializeStage(containerId: string) {
    this.stage = new Konva.Stage({
      container: containerId,
      width: window.innerWidth,
      height: window.innerHeight,
    });
    this.layer = new Konva.Layer();
    this.stage.add(this.layer);
  }

  createWindow(width: number, height: number) {
    this.windowRect = new Konva.Rect({
      x: 50,
      y: 50,
      width,
      height,
      fill: 'white',
      stroke: 'black',
      strokeWidth: 2,
      draggable: true,
      resizable: true,
    });

    this.layer.add(this.windowRect);
    this.stage.draw();
  }

  updateWindowSize(width: number, height: number) {
    this.windowRect.width(width);
    this.windowRect.height(height);
    this.stage.draw();
  }
}
