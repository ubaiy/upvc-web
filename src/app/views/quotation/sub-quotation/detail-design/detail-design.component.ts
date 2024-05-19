import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';
import Konva from 'konva';
import { DesignService } from 'src/app/shared/services/window-design/design.service';
@Component({
  selector: 'app-detail-design',
  templateUrl: './detail-design.component.html',
  styleUrls: ['./detail-design.component.scss'],
})
export class DetailDesignComponent implements AfterViewInit {
  @ViewChild('container', { static: false }) container: ElementRef;
  form: FormGroup;
  stage: Konva.Stage;
  layer: Konva.Layer;

  constructor(private fb: FormBuilder, private designService: DesignService) {
    this.form = this.fb.group({
      width: [
        1000,
        [Validators.required, Validators.min(500), Validators.max(2000)],
      ],
      height: [
        800,
        [Validators.required, Validators.min(500), Validators.max(1500)],
      ],
    });
  }

  ngAfterViewInit(): void {
    this.stage = new Konva.Stage({
      container: this.container.nativeElement,
      width: this.form.value.width,
      height: this.form.value.height,
    });

    this.layer = new Konva.Layer();
    this.stage.add(this.layer);

    this.form.valueChanges.subscribe(() => this.generateWindowDesign());
    this.generateWindowDesign();
  }

  generateWindowDesign(): void {
    this.layer.destroyChildren(); // Clear the previous design

    const frameWidth = this.form.value.width;
    const frameHeight = this.form.value.height;

    const frameColor = 'white';
    const glassColor = 'lightblue';

    // const windowGroup = this.designService.createCasementWindow(
    //   this.stage.width(),
    //   this.stage.height(),
    //   frameColor,
    //   glassColor,
    //   frameWidth,
    //   frameHeight
    // );

    // this.layer.add(windowGroup);
    this.stage.batchDraw();
  }
}
