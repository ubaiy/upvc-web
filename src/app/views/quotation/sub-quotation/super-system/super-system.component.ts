import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import Konva from 'konva';
import * as designConst from 'src/app/shared/configs/design/constConfig';
@Component({
  selector: 'app-super-system',
  templateUrl: './super-system.component.html',
  styleUrls: ['./super-system.component.scss'],
})
export class SuperSystemComponent implements AfterViewInit {
  editable: boolean;
  price: number;
  form: FormGroup;
  submitted: boolean;
  @ViewChild('container', { static: false }) container: ElementRef;
  stage: Konva.Stage;
  layer = new Konva.Layer();
  constructor(private _activeRoute: ActivatedRoute, private _fb: FormBuilder) {
    this._setUpData();
  }
  ngAfterViewInit() {
    this.stage = new Konva.Stage({
      container: this.container.nativeElement,
      width: 700,
      height: 800,
    });
    this.stage.add(this.layer);
    var rect = new Konva.Rect({
      x: 160,
      y: 60,
      width: 1200,
      height: 1500,
      fill: designConst.defaultRectColor,
      name: 'rect',
      stroke: designConst.strokeDefaultColor,
      strokeWidth: designConst.strokeWidth,
      draggable: true,
    });
    this.layer.add(rect);

    var text = new Konva.Text({
      x: 5,
      y: 5,
    });
    this.layer.add(text);

    // create new transformer
    var tr = new Konva.Transformer({
      rotateEnabled: false,
    });
    this.layer.add(tr);
    tr.nodes([rect]);
  }

  get f() {
    return this.form.controls;
  }

  public submit() {
    console.log('submit');
  }

  private _setUpData() {
    let data = this._activeRoute.snapshot.data;
    this.editable = data['edit'];
    this.form = this._initForm();
  }

  private _initForm(): FormGroup {
    const fg = this._fb.group({
      height: [''],
      width: [''],
      quantity: [''],
    });
    return fg;
  }
}
