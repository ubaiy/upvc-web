import {
  Component,
  AfterViewInit,
  ElementRef,
  ViewChild,
  ViewEncapsulation,
} from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IProfileColorDto } from 'src/app/shared/model/profile/profile-color.model';
import { ConfirmationDialogService } from 'src/app/shared/services/confirmationdialog.service';
import Konva from 'konva';
import { FinalService } from 'src/app/shared/services/final.service';
import * as designConst from 'src/app/shared/configs/design/constConfig';
import { KonvaElementService } from 'src/app/shared/services/konva-element.service';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { KonvaEventObject } from 'konva/lib/Node';
import {
  AllDropdowns,
  IAllDropDownsDto,
} from 'src/app/shared/model/common/allDropdowns.model';
import { IProfileDropdown } from 'src/app/shared/model/profile/profileDropdown.model';
import * as sharedClasses from 'src/app/shared/class/sharedClasses';
import { SortEvent } from 'primeng/api';
import { Table } from 'primeng/table';
import { IMasterListDto } from 'src/app/shared/model/masters/masterList.model';
import { IOpenDirectionDrpDto } from 'src/app/shared/model/quotation/open-directionDrp.model';
import { ProfileService } from 'src/app/views/masters/profile/profile.service';
import { DropdownService } from 'src/app/shared/services/dropdown.service';
import { QuotationService } from '../../quotation.service';
@Component({
  selector: 'app-design',
  templateUrl: './design.component.html',
  styleUrls: ['./design.component.scss'],
  encapsulation: ViewEncapsulation.ShadowDom,
})
export class DesignComponent implements AfterViewInit {
  price: number = 0;
  form: FormGroup;
  designSpecificationForm: FormGroup;
  submitted: boolean = false;
  colors: IProfileColorDto[];
  edit: boolean = false;
  quotationId: string;
  stage: Konva.Stage;
  layer = new Konva.Layer();
  frameGroups: any[] = [];
  @ViewChild('container') container: ElementRef;
  ref: DynamicDialogRef | undefined;
  visible: boolean;
  heightWidthBoolean: boolean;
  costheadInfo: any[] = [];
  inputValue: string = '';
  editable: boolean = false;
  quatation_product_id: number;
  categoryList: string[] = [];
  typeList: string[] = [];
  glassList: IMasterListDto[];
  profileList: IProfileDropdown[] = [];
  mullionList: IProfileDropdown[] = [];
  handleList: IMasterListDto[] = [];
  ventilationTypes: IMasterListDto[] = [];
  sliddingTypes: string[] = [];
  hingesType: string[] = [];
  sashList: IProfileDropdown[] = [];
  casementTypes: string[] = [];
  palla_types: number[];
  openningDirections: IOpenDirectionDrpDto[];
  data: any;
  dropdowns: IAllDropDownsDto = new AllDropdowns();
  rectSelected: boolean = false;
  constructor(
    private _activeRoute: ActivatedRoute,
    private confirmationDialogService: ConfirmationDialogService,
    private _router: Router,
    private _fb: FormBuilder,
    private _designService: FinalService,
    private _konvaDesignService: KonvaElementService,
    public dialogService: DialogService,
    private _profileService: ProfileService,
    private _masterDataSerice: DropdownService,
    private _dataService: QuotationService
  ) {
    this._setUpData();
    this.form = this._initForm();
    this.designSpecificationForm = this._initDesignForm();
    this._price();
  }

  ngAfterViewInit() {
    this.stage = new Konva.Stage({
      container: this.container.nativeElement,
      width: 700,
      height: 800,
    });
    this.stage.add(this.layer);
    this._updateCanvas();
  }

  public clear(table: Table) {
    table.clear();
    this.inputValue = '';
  }

  public customSort(event: SortEvent) {
    sharedClasses.customSort(event);
  }

  get f() {
    return this.form.controls;
  }

  get df() {
    return this.designSpecificationForm.controls;
  }

  public submit() {
    var dataURL = this.stage.toDataURL();
    var link = document.createElement('a');
    link.href = dataURL;
    link.download = 'konva_image.png';
    link.click();
  }

  public toggleWarningModal() {
    if (this.form.dirty && this.form.touched) {
      this.confirmationDialogService.confirm(
        'Are you sure!',
        'Are you sure you want to Cancel ? ',
        'pi-info-circle',
        () => {
          this._router.navigate([`/quotation/detail/${this.quotationId}`]);
        },
        () => {
          console.log('Action rejected');
        }
      );
    } else {
      this._router.navigate([`/quotation/detail/${this.quotationId}`]);
    }
  }

  private _initForm() {
    let fg = this._fb.group({
      quatation_id: new FormControl(),
      quatation_product_id: new FormControl(),
      is_saved: new FormControl(false),
      quantity: new FormControl(1, [Validators.required]),
      color: new FormControl(
        {
          id: 4,
          color_name: 'Default',
          color_code: '#ffffff',
          is_default: 1,
          selected: true,
        },
        [Validators.required]
      ),
      width: new FormControl(1500, [
        Validators.required,
        Validators.min(200),
        Validators.max(5800),
      ]),
      height: new FormControl(1200, [
        Validators.required,
        Validators.min(200),
        Validators.max(5800),
      ]),
      profile_color: new FormControl('#ffffff', [Validators.required]),
      mullions: new FormControl([]),
      parts: new FormControl([]),
    });
    this._formValueChanges(fg);
    return fg;
  }

  private _initDesignForm(obj?: any): FormGroup {
    const fg = this._fb.group({
      mullion_quantity: new FormControl(),
      product_id: new FormControl(),
      category_type: new FormControl('Casement', [Validators.required]),
      color_id: new FormControl(this.form.get('color')?.value.id),
      sash_id: new FormControl(),
      casement_type: new FormControl('Fixed'),
      palla_type: new FormControl(),
      hinges_type: new FormControl(),
      is_track: new FormControl(),
      product_type: new FormControl('Window'),
      handle_id: new FormControl(),
      is_cupler: new FormControl(false),
      is_louvers: new FormControl(false),
      is_lshape: new FormControl(false),
      height: new FormControl(this.f['height'].value),
      width: new FormControl(this.f['height'].value),
      total: new FormControl(),
      glazz_id: new FormControl(this.glassList[0].id),
      ventilation_id: new FormControl(0),
      ventilation_height: new FormControl(0),
      ventilation_width: new FormControl(0),
      ventilation_glazz_id: new FormControl(0),
    });
    fg.controls.product_id.patchValue(this.profileList[0].id);
    this._designFormValueChanges(fg);
    return fg;
  }

  private _formValueChanges(fg: FormGroup) {
    fg.controls['color'].valueChanges.subscribe((value: any) => {
      if (value.id) {
        fg.controls['profile_color'].patchValue(value.color_code);
        this._updateCanvas();
      }
    });
    fg.controls['height'].valueChanges.subscribe((value) => {
      if (value) {
        if (value <= 5800 && value >= 200) {
          this._updateCanvas();
        }
      }
    });
    fg.controls['width'].valueChanges.subscribe((value) => {
      if (value) {
        if (value <= 5800 && value >= 200) {
          this._updateCanvas();
        }
      }
    });
  }

  private _designFormValueChanges(fg: FormGroup) {
    fg.controls['category_type'].valueChanges.subscribe((res) => {
      if (res) {
        this._getFrame();
        this._getSash();
      }
    });
    fg.controls['product_type'].valueChanges.subscribe((res) => {
      if (res) {
        this._getFrame();
        this._getSash();
        this._getHandle();
      }
    });
    fg.controls['casement_type'].valueChanges.subscribe((res) => {
      if (res) {
        this._getFrame();
        this._getSash();
        this._getHandle();
      }
    });
    fg.controls['casement_type'].valueChanges.subscribe((res) => {
      if (res) {
        this._getFrame();
        this._getSash();
        this._getHandle();
      }
    });
    fg.controls['is_track'].valueChanges.subscribe((res) => {
      if (res) {
        this._getFrame();
        this._getSash();
        this._getHandle();
      }
    });
    fg.controls['palla_type'].valueChanges.subscribe((res) => {
      if (res) {
        this._updateCanvas();
      }
    });
  }

  private _updateCanvas() {
    this.clearLayerChildren();
    const frameWidth = this.f['width'].value;
    const frameHeight = this.f['height'].value;
    const profile_color = this.f['profile_color'].value;
    const divisions = this.df['palla_type'].value;
    if (
      frameWidth >= 200 &&
      frameWidth <= 5800 &&
      frameHeight >= 200 &&
      frameHeight <= 5800
    ) {
      const { xPos, yPos, ratio } = this._designService.calculations(
        this.stage,
        frameWidth,
        frameHeight
      );
      this._createFrame(
        xPos,
        yPos,
        ratio,
        frameWidth,
        frameHeight,
        profile_color
      );
      if (divisions > 1) {
        const divisionWidth =
          (frameWidth * ratio - 2 * designConst.innerRectGap) / divisions;
        for (let i = 0; i < divisions; i++) {
          const divisionXPos =
            xPos + designConst.innerRectGap + i * divisionWidth;
          this._drawDivisionRect(
            divisionXPos,
            yPos + designConst.innerRectGap,
            ratio,
            divisionWidth,
            frameHeight,
            profile_color,
            frameWidth,
            frameHeight
          );
        }
      }
      this.layer.draw();
    }
  }

  private _createFrame(
    xPos: number,
    yPos: number,
    ratio: number,
    frameWidth: number,
    frameHeight: number,
    profile_color: string
  ) {
    const windowRect = this._konvaDesignService.createRect(
      xPos,
      yPos,
      frameWidth * ratio,
      frameHeight * ratio,
      profile_color,
      designConst.strokeDefaultColor
    );
    const innerRect = this._konvaDesignService.createRect(
      xPos + designConst.innerRectGap,
      yPos + designConst.innerRectGap,
      frameWidth * ratio - 2 * designConst.innerRectGap,
      frameHeight * ratio - 2 * designConst.innerRectGap,
      this.rectSelected
        ? designConst.selectedRectColor
        : designConst.defaultRectColor,
      designConst.strokeDefaultColor
    );
    innerRect.on('click', (e: KonvaEventObject<MouseEvent>) => {
      document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
      });
      if (innerRect.fill() === designConst.defaultRectColor) {
        innerRect.fill(designConst.selectedRectColor);
        this.rectSelected = true;
        this.designSpecificationForm = this._initDesignForm(innerRect);
      } else {
        innerRect.fill(designConst.defaultRectColor);
        this.rectSelected = false;
        this.designSpecificationForm.reset();
        this.designSpecificationForm.updateValueAndValidity();
      }
    });
    const lineConnectors = this._designService.cornerConnectors(
      innerRect,
      xPos,
      yPos,
      frameWidth,
      frameHeight,
      ratio
    );
    const directionInfo = this._designService.addLineAndArrow(
      xPos,
      yPos,
      frameWidth,
      frameHeight,
      ratio
    );
    const handle = this._designService.handle({
      x: frameWidth,
      y: frameHeight * ratio,
      rotationDeg: 0,
    });
    this.layer.add(windowRect);
    this.layer.add(innerRect);
    this.layer.add(lineConnectors);
    this.layer.add(directionInfo);
    this.layer.add(handle);
  }
  private clearLayerChildren() {
    this.layer.removeChildren();
    this.frameGroups = [];
  }

  private _drawDivisionRect(
    xPos: number,
    yPos: number,
    ratio: number,
    frameWidth: number,
    frameHeight: number,
    profile_color: string,
    orignalFrameWidth: number,
    orignalFrameHeight: number
  ) {
    const divisions = this.df['palla_type'].value;
    const windowRect = this._konvaDesignService.createRect(
      xPos,
      yPos,
      frameWidth,
      frameHeight * ratio - designConst.innerRectGap * 2,
      profile_color,
      designConst.strokeDefaultColor
    );
    const innerRect = this._konvaDesignService.createRect(
      xPos + designConst.innerRectGap,
      yPos + designConst.innerRectGap,
      frameWidth - 2 * designConst.innerRectGap,
      frameHeight * ratio - designConst.innerRectGap * 4,
      designConst.defaultRectColor,
      designConst.strokeDefaultColor
    );
    // innerRect.on('click', (e: KonvaEventObject<MouseEvent>) => {
    //   document.addEventListener('contextmenu', (e) => {
    //     e.preventDefault();
    //   });
    //   if (innerRect.fill() === designConst.defaultRectColor) {
    //     innerRect.fill(designConst.selectedRectColor);
    //     this.rectSelected = true;
    //     this.designSpecificationForm = this._initDesignForm(innerRect);
    //   } else {
    //     innerRect.fill(designConst.defaultRectColor);
    //     this.rectSelected = false;
    //     this.designSpecificationForm.reset();
    //     this.designSpecificationForm.updateValueAndValidity();
    //   }
    // });
    const handle = this._designService.handle({
      x: frameWidth * ratio * 2 + xPos,
      y: frameHeight * ratio - designConst.innerRectGap * 2,
      rotationDeg: 0,
    });
    // const handle2 = this._designService.handle({
    //   x: (orignalFrameWidth * ratio) / 2 + designConst.innerRectGap * 2 + 10,
    //   y: orignalFrameHeight * ratio - designConst.innerRectGap * 2,
    //   rotationDeg: 180,
    // });
    console.log(handle);
    const d = innerRect.x() + innerRect.width();
    const zeroValue = 0;
    const end = { X: d, y: zeroValue };
    const start = { x: xPos, y: yPos };
    const lineConnectors = this._konvaDesignService.createLine(start, end);
    const directionInfo = this._designService.addLineAndArrow(
      xPos,
      yPos,
      orignalFrameWidth / divisions - designConst.innerRectGap * 4,
      orignalFrameHeight - designConst.innerRectGap * 4,
      ratio
    );
    this.layer.add(windowRect);
    this.layer.add(innerRect);
    this.layer.add(lineConnectors);
    this.layer.add(handle);
    // this.layer.add(handle2);
    this.layer.add(directionInfo);
  }
  private _setUpData() {
    let data = this._activeRoute.snapshot.data;
    this.dropdowns = this._activeRoute.snapshot.data['dropdowns'];
    this.edit = this._activeRoute.snapshot.data['edit'];
    if (this.editable) {
      this.data = data['data'].costhead_information.old_post_data;
      this.quatation_product_id = data['data'].id;
      this.colors = this.dropdowns.profile_color;
    } else {
      this.colors = this.dropdowns.profile_color.map((a) => {
        if (a.is_default === 1) {
          a.selected = true;
        } else {
          a.selected = false;
        }
        return a;
      });
    }
    this.categoryList = data['productCategory'];
    this.typeList = this.dropdowns.product_type;
    this.glassList = data['glassList'];
    this.profileList = data['profileList'];
    this.mullionList = data['mullionList'];
    this.casementTypes = this.dropdowns.casement_type;
    this.hingesType = this.dropdowns.hinges_type;
    this.sliddingTypes = this.dropdowns.slidding_type;
    this.palla_types = this.dropdowns.palla_type;
    this.openningDirections = this.dropdowns.opening_direction;
  }

  private _getFrame() {
    const query = {
      category_name: this.df['category_type'].value,
      track: this.df['is_track'].value,
      sub_category_name: 'Frame',
      casement_type: this.df['casement_type'].value,
      product_type: this.df['product_type'].value,
    };
    this._profileService.productDropdown(query).subscribe((res) => {
      if (res.success) {
        this.profileList = res.data;
        this.df['product_id'].patchValue(res.data[0].id);
      }
    });
  }

  private _getHandle() {
    const query = {
      costhead: 'Handle',
      type: '',
      category: this.df['category_type'].value,
      search: '',
    };
    this._masterDataSerice.getCostHeadDataDropdown(query).subscribe((res) => {
      if (res.success) {
        this.handleList = res.data;
        this.df['handle_id'].patchValue(res.data[0]);
      }
    });
  }

  private _getSash() {
    const query = {
      category_name: this.df['category_type'].value,
      track: this.df['is_track'].value,
      sub_category_name: 'Sash',
      casement_type: this.df['casement_type'].value,
      product_type: this.df['product_type'].value,
    };
    this._profileService.productDropdown(query).subscribe((res) => {
      if (res.success) {
        this.sashList = res.data;
      }
    });
  }

  private _price() {
    let data = this.form.value;
    let d = this.designSpecificationForm.value;
    data.parts.push(d);
    this._dataService.quotationManageProduct(data).subscribe((res) => {
      console.log(res);
      if (res.success) {
      }
    });
  }
}
