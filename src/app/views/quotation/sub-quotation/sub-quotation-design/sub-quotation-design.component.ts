import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import Konva from 'konva';
import { SortEvent } from 'primeng/api';
import { Table } from 'primeng/table';
import * as sharedClasses from 'src/app/shared/class/sharedClasses';
import {
  AllDropdowns,
  IAllDropDownsDto,
} from 'src/app/shared/model/common/allDropdowns.model';
import { IProfileColorDto } from 'src/app/shared/model/profile/profile-color.model';
import { IProfileDropdown } from 'src/app/shared/model/profile/profileDropdown.model';
import { FinalService } from 'src/app/shared/services/final.service';
import { KonvaElementService } from 'src/app/shared/services/konva-element.service';
import * as designConst from 'src/app/shared/configs/design/constConfig';
import { KonvaEventObject } from 'konva/lib/Node';
import { IMasterListDto } from 'src/app/shared/model/masters/masterList.model';
import { IOpenDirectionDrpDto } from 'src/app/shared/model/quotation/open-directionDrp.model';
import { QuotationService } from '../../quotation.service';
import { DropdownService } from 'src/app/shared/services/dropdown.service';
import { ConfirmationDialogService } from 'src/app/shared/services/confirmationdialog.service';
import { ProfileService } from 'src/app/views/masters/profile/profile.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { cilLoopCircular } from '@coreui/icons';
@Component({
  selector: 'app-sub-quotation-design',
  templateUrl: './sub-quotation-design.component.html',
  styleUrls: ['./sub-quotation-design.component.scss'],
})
export class SubQuotationDesignComponent implements AfterViewInit {
  edit: boolean = false;
  price: number = 0;
  quotationId: string = '';
  submitted: boolean = false;
  public circleIcon = cilLoopCircular;
  /**
   * Table variables start
   */
  costheadInfo: any[] = [];
  inputValue: string = '';
  /**
   * Table variables end
   */
  /**
   * Design variables start
   */
  stage: Konva.Stage;
  layer = new Konva.Layer();
  @ViewChild('design') container: ElementRef;
  rectSelected: boolean = false;
  mainRect: Konva.Rect;
  /**
   * Design variables end
   */
  /**
   * Form variables start
   */
  form: FormGroup;
  designSpecificationForm: FormGroup;
  designSpecArray: any[] = [];
  /**
   * Form variables end
   */
  /**
   * Dropdown variables start
   */
  dropdowns: IAllDropDownsDto = new AllDropdowns();
  categoryList: string[] = [];
  colors: IProfileColorDto[] = [];
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
  /**
   * Dropdown variables end
   */
  constructor(
    private _fb: FormBuilder,
    private _activeRoute: ActivatedRoute,
    private _designService: FinalService,
    private _konvaDesignService: KonvaElementService,
    private _dataService: QuotationService,
    private _dropdownService: DropdownService,
    private confirmationDialogService: ConfirmationDialogService,
    private _router: Router,
    private _profileService: ProfileService,
    private _toastService: ToastService
  ) {
    this._setUpData();
    this.form = this._initForm();
    this.quotationId = this._activeRoute.snapshot.paramMap.get('id') || '';
  }

  /**
   * Lifecycle method start
   */
  ngAfterViewInit() {
    this.designSpecificationForm = this._designSpecFormInit();
    this.designSpecArray = [this.designSpecificationForm.value];
    this._manageProduct();
    this.stage = new Konva.Stage({
      container: this.container.nativeElement,
      width: 700,
      height: 800,
    });
    this.stage.add(this.layer);
    this._updateCanvas();
  }
  /**
   * Lifecycle method end
   */

  /**
   * Form Getters start
   */

  get f() {
    return this.form.controls;
  }

  get df() {
    return this.designSpecificationForm.controls;
  }
  /**
   * Form Getters end
   */

  /**
   *
   * @param table Table Object
   * Table functions start
   */
  public clear(table: Table) {
    table.clear();
    this.inputValue = '';
  }

  public customSort(event: SortEvent) {
    sharedClasses.customSort(event);
  }

  /**
   * Table functions end
   */

  /**
   * Submit and Cancel Function start
   */

  public resetDesign() {
    this.confirmationDialogService.confirm(
      'Are you sure!',
      'Are you sure you want to Reset the design ? ',
      'pi-info-circle',
      () => {
        this.clearLayerChildren();
        this.form = this._initForm();
        this.rectSelected = false;
        this._handleInnerRectDeselect(this.mainRect);
        this.designSpecificationForm = this._designSpecFormInit();
        this.designSpecArray = [this.designSpecificationForm.value];
        this._manageProduct();
        this.stage = new Konva.Stage({
          container: this.container.nativeElement,
          width: 700,
          height: 800,
        });
        this.stage.add(this.layer);
        this._updateCanvas();
      },
      () => {
        console.log('Action rejected');
      }
    );
  }

  public submit() {
    if (this.rectSelected) {
      this._toastService.showError('Please complete the design first.');
    } else {
      let data = this.form.value;
      data.is_saved = true;
      data.quatation_id = this.quotationId ? this.quotationId : null;
      data.parts = this.designSpecArray;
      console.log(this.designSpecArray);
      data.image = this.stage.toDataURL();
      this._dataService.quotationManageProduct(data).subscribe((res) => {
        if (res.success) {
          this.costheadInfo = res.data.costhead_information.costhead;
          this.price = res.data.total;
          this._router.navigate([`/quotation/detail/${this.quotationId}`]);
          this._toastService.showSuccess(res.message);
        }
      });
    }
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

  public saveDesign() {
    this._handleInnerRectDeselect(this.mainRect);
  }

  /**
   * Submit and Cancel Function end
   */

  /**
   * Data initialization start
   */
  private _setUpData() {
    const data = this._activeRoute.snapshot.data;
    this.dropdowns = data['dropdowns'];
    this.edit = data['edit'];
    this.profileList = data['profileList'];
    console.log(data);
    this.glassList = this.dropdowns.costhead;
    this.categoryList = this.dropdowns.category;
    this.typeList = this.dropdowns.product_type;
    this.glassList = this.dropdowns.costhead;
    this.sliddingTypes = this.dropdowns.slidding_type;
    this.hingesType = this.dropdowns.hinges_type;
    this.casementTypes = this.dropdowns.casement_type;
    this.palla_types = this.dropdowns.palla_type;
    this.openningDirections = this.dropdowns.opening_direction;
    this.colors = this.dropdowns.profile_color;
  }
  /**
   * Data initialization end
   */
  /**
   * Form Function start
   */
  private _initForm() {
    let fg = this._fb.group({
      quatation_id: new FormControl(),
      quatation_product_id: new FormControl(),
      is_saved: new FormControl(false),
      quantity: new FormControl(1, [Validators.required]),
      color: new FormControl(
        this.colors.find((e) => e.is_default),
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
      image: new FormControl(),
    });
    this._formValueChanges(fg);
    return fg;
  }

  private _designSpecFormInit(obj?: any) {
    const fg = this._fb.group({
      designId: new FormControl(),
      category_type: new FormControl('Casement', [Validators.required]),
      mullion_quantity: new FormControl(),
      product_id: new FormControl(this.profileList[0].id, [
        Validators.required,
      ]),
      color_id: new FormControl(this.f['color'].value.id),
      sash_id: new FormControl(),
      casement_type: new FormControl('Fixed'),
      palla_type: new FormControl(),
      hinges_type: new FormControl(),
      is_track: new FormControl(),
      product_type: new FormControl('Window', [Validators.required]),
      handle_id: new FormControl(),
      is_cupler: new FormControl(false),
      is_louvers: new FormControl(false),
      is_lshape: new FormControl(false),
      height: new FormControl(this.f['height'].value),
      width: new FormControl(this.f['width'].value),
      total: new FormControl(),
      glazz_id: new FormControl(this.glassList[0].id),
      ventilation_id: new FormControl(),
      ventilation_height: new FormControl(),
      ventilation_width: new FormControl(),
      ventilation_glazz_id: new FormControl(),
      fly_mesh: new FormControl(),
      palla: new FormControl(),
    });
    if (obj) {
      fg.patchValue(obj);
    }
    this._designFormValueChange(fg);

    return fg;
  }

  private _formValueChanges(fg: FormGroup) {
    const height = fg.get('height');
    const width = fg.get('width');
    const color = fg.get('color');
    const profile_color = fg.get('profile_color');
    const quantity = fg.get('quantity');
    const handleValueChange = (res: any) => {
      if (!res) return;
      this._updateCanvas();
      this._manageProduct();
    };
    height?.valueChanges.subscribe(handleValueChange);
    width?.valueChanges.subscribe(handleValueChange);
    quantity?.valueChanges.subscribe((res) => {
      if (res) {
        this._manageProduct();
      }
    });
    color?.valueChanges.subscribe((value: any) => {
      if (value.id) {
        profile_color?.patchValue(value.color_code);
        handleValueChange(value);
      }
    });
  }

  private _designFormValueChange(fg: FormGroup) {
    const casementTypeControl = fg.controls['casement_type'];
    const sashIdControl = fg.controls['sash_id'];
    const pallaTypeControl = fg.controls['palla_type'];
    const hingesTypeControl = fg.controls['hinges_type'];
    const isTrackControl = fg.controls['is_track'];
    const handleIdControl = fg.controls['handle_id'];
    const category = fg.controls['category_type'];
    const glass_id = fg.controls['glazz_id'];
    const fly_mesh = fg.controls['fly_mesh'];
    const product_type = fg.controls['product_type'];
    category.valueChanges.subscribe((res) => {
      if (res) {
        casementTypeControl.setValue(res === 'Casement' ? 'Fixed' : '');
        casementTypeControl.setValidators(
          res === 'Casement' ? [Validators.required] : []
        );
        if (
          (res === 'Casement' && casementTypeControl.value === 'Openable') ||
          res === 'Slidding'
        ) {
          sashIdControl.setValidators([Validators.required]);
          pallaTypeControl.setValue(2);
          pallaTypeControl.setValidators([Validators.required]);
          handleIdControl.setValidators([Validators.required]);
          this._profileList();
          this._sashList();
          this._handleList();
        } else {
          [
            sashIdControl,
            pallaTypeControl,
            hingesTypeControl,
            isTrackControl,
            handleIdControl,
          ].forEach((control) => {
            control.setValue('');
            control.clearValidators();
          });
        }

        if (res === 'Slidding') {
          isTrackControl.setValue('2 Track');
          isTrackControl.setValidators([Validators.required]);
          hingesTypeControl.setValue('');
          hingesTypeControl.clearValidators();
          hingesTypeControl.updateValueAndValidity();
        }

        if (res === 'Casement' && casementTypeControl.value === 'Openable') {
          hingesTypeControl.setValidators([Validators.required]);
        }
        [
          casementTypeControl,
          sashIdControl,
          pallaTypeControl,
          hingesTypeControl,
          isTrackControl,
          handleIdControl,
        ].forEach((control) => control.updateValueAndValidity());
      }
      this._manageProduct();
      this._updateCanvas();
    });

    casementTypeControl.valueChanges.subscribe((res) => {
      if (res) {
        if (category.value === 'Casement' && res === 'Openable') {
          this._profileList();
          this._sashList();
          this._handleList();
          [
            sashIdControl,
            pallaTypeControl,
            hingesTypeControl,
            isTrackControl,
            handleIdControl,
          ].forEach((control) => {
            control.setValue('');
            control.clearValidators();
          });
          hingesTypeControl.setValidators([Validators.required]);
        } else {
          this._profileList();
        }
        [
          sashIdControl,
          pallaTypeControl,
          hingesTypeControl,
          isTrackControl,
          handleIdControl,
        ].forEach((control) => control.updateValueAndValidity());
      }
      this._manageProduct();
      this._updateCanvas();
    });

    sashIdControl.valueChanges.subscribe((res) => {
      if (res) {
        this._manageProduct();
      }
    });

    pallaTypeControl.valueChanges.subscribe((res) => {
      if (res) {
        this._updateCanvas();
        this._manageProduct();
      }
    });
    isTrackControl.valueChanges.subscribe((res) => {
      if (res) {
        if (res === '2.5 Track' || res === '3 Track') {
          fly_mesh.setValue(true);
          fly_mesh.setValidators([Validators.required]);
        } else {
          fly_mesh.setValue('');
          fly_mesh.clearValidators();
        }
        fly_mesh.updateValueAndValidity();
        this._profileList();
        this._sashList();
        this._manageProduct();
      }
    });
    fly_mesh.valueChanges.subscribe((res) => {
      this._updateCanvas();
      this._manageProduct();
    });
    handleIdControl.valueChanges.subscribe((res) => {
      if (res) {
        this._manageProduct();
      }
    });
    glass_id.valueChanges.subscribe((res) => {
      if (res) {
        this._manageProduct();
      }
    });
    handleIdControl.valueChanges.subscribe((res) => {
      if (res) {
        this._manageProduct();
      }
    });
    hingesTypeControl.valueChanges.subscribe((res) => {
      if (res) {
        this._manageProduct();
      }
    });
    product_type.valueChanges.subscribe((res) => {
      if (res) {
        this._manageProduct();
      }
    });
  }
  /**
   * Form Function end
   */

  /**
   * Api Calls start
   */
  private _manageProduct() {
    let data = this.form.getRawValue();
    this.designSpecArray[0] = this.designSpecificationForm.value;
    data.parts = [this.designSpecificationForm.value];
    this._dataService.quotationManageProduct(data).subscribe((res) => {
      if (res.success) {
        this.costheadInfo = res.data.costhead_information.costhead;
        res.data.product_information.forEach((e) => {
          let data: any = {
            id: e.id,
            product_no: e.id,
            name: `${e.profile_code} - ${e.profile_name}`,
            type: e.category,
            costhead: e.category,
            cost: e.rate_meter,
            totalCost: e.totalCost,
            quantity: e.quantity,
          };
          this.costheadInfo.push(data);
        });
        this.price = res.data.total;
      }
    });
  }

  private _profileList() {
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
        this.df['product_id'].patchValue(this.profileList[0].id);
      }
    });
  }

  private _sashList() {
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

  private _handleList() {
    const query = {
      costhead: 'Handle',
      type: '',
      category: this.df['category_type'].value,
      search: '',
    };
    this._dropdownService.getCostHeadDataDropdown(query).subscribe((res) => {
      if (res.success) {
        this.handleList = res.data;
      }
    });
  }
  /**
   * Api Calls end
   */

  /**
   * Design Functions start
   */

  private _updateCanvas() {
    const frameWidth = this.f['width'].value;
    const frameHeight = this.f['height'].value;
    const profile_color = this.f['profile_color'].value;
    if (this.isFrameSizeValid(frameWidth, frameHeight)) {
      this.clearLayerChildren();
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
      this._createPalla(
        xPos,
        yPos,
        ratio,
        frameWidth,
        frameHeight,
        profile_color
      );
      this.layer.draw();
    }
  }

  private isFrameSizeValid(width: number, height: number): boolean {
    return width >= 300 && width <= 5800 && height >= 300 && height <= 5800;
  }

  private _createFrame(
    xPos: number,
    yPos: number,
    ratio: number,
    frameWidth: number,
    frameHeight: number,
    profile_color: string
  ) {
    const windowRect = this._createRect(
      xPos,
      yPos,
      frameWidth * ratio,
      frameHeight * ratio,
      profile_color,
      designConst.strokeDefaultColor
    );
    this.mainRect = this._createRect(
      xPos + designConst.innerRectGap,
      yPos + designConst.innerRectGap,
      frameWidth * ratio - 2 * designConst.innerRectGap,
      frameHeight * ratio - 2 * designConst.innerRectGap,
      this.rectSelected
        ? designConst.selectedRectColor
        : designConst.defaultRectColor,
      designConst.strokeDefaultColor
    );
    this.mainRect.on('click', (e: KonvaEventObject<MouseEvent>) => {
      this._handleInnerRectClick(this.mainRect);
    });
    const lineConnectors = this._designService.cornerConnectors(
      this.mainRect,
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
    this.layer.add(windowRect);
    this.layer.add(this.mainRect);
    this.layer.add(lineConnectors);
    this.layer.add(directionInfo);
  }

  private _handleInnerRectClick(innerRect: Konva.Rect) {
    if (innerRect.fill() === designConst.defaultRectColor) {
      this._handleInnerRectSelect(innerRect);
    } else {
      this._handleInnerRectDeselect(innerRect);
    }
  }

  private _handleInnerRectSelect(innerRect: Konva.Rect) {
    innerRect.fill(designConst.selectedRectColor);
    this.rectSelected = true;
    this.designSpecificationForm.reset();
    this.designSpecificationForm.updateValueAndValidity();
    this.designSpecificationForm = this._designSpecFormInit(
      this.designSpecArray[0]
    );
  }

  private _handleInnerRectDeselect(innerRect: Konva.Rect) {
    console.log(this.designSpecificationForm);
    if (this.designSpecificationForm.invalid) {
      this._toastService.showError(
        'Please fill all the required fields first.'
      );
    } else {
      innerRect.fill(designConst.defaultRectColor);
      this.rectSelected = false;
    }
  }

  private _createRect(
    x: number,
    y: number,
    width: number,
    height: number,
    fill: string,
    stroke: string
  ): Konva.Rect {
    return this._konvaDesignService.createRect(
      x,
      y,
      width,
      height,
      fill,
      stroke
    );
  }

  private _createPalla(
    xPos: number,
    yPos: number,
    ratio: number,
    frameWidth: number,
    frameHeight: number,
    profile_color: string
  ) {
    const divisions = this.df['palla_type'].value;
    if (divisions > 1) {
      const divisionWidth =
        (frameWidth * ratio - 2 * designConst.innerRectGap) / divisions;
      for (let i = 0; i < divisions; i++) {
        const divisionXPos =
          xPos + designConst.innerRectGap + i * divisionWidth;
        this._drawDivisionRect(
          i,
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
  }

  private _drawDivisionRect(
    i: number,
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
    innerRect.on('click', (e: KonvaEventObject<MouseEvent>) => {
      this._handlePallaRectClick(innerRect);
    });
    let handle;
    if (i % 2) {
      handle = this._designService.handle({
        x: xPos + frameWidth - designConst.innerRectGap,
        y: orignalFrameHeight * ratio - designConst.innerRectGap * 2,
        rotationDeg: 180,
      });
    } else {
      handle = this._designService.handle({
        x: xPos + designConst.innerRectGap,
        y: orignalFrameHeight * ratio - designConst.innerRectGap * 2,
        rotationDeg: 0,
      });
    }
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
    this.layer.add(directionInfo);
  }

  private _handlePallaRectClick(innerRect: Konva.Rect) {
    if (this.designSpecificationForm.invalid) {
    } else {
      if (innerRect.fill() === designConst.defaultRectColor) {
        innerRect.fill(designConst.selectedRectColor);
      } else {
        innerRect.fill(designConst.defaultRectColor);
      }
    }
  }

  private clearLayerChildren() {
    this.layer.removeChildren();
  }

  /**
   * Design Functions end
   */
}
