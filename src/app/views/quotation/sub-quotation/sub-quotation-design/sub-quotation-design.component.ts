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
const isMobile =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
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
  palla_type_openable: number[];
  palla_type_slidding: number[];
  openningDirections: IOpenDirectionDrpDto[];
  product_id: any;
  isMullion: boolean;
  isAddMullion: boolean;
  mullionForm: FormGroup;
  selectedRect: Konva.Rect;
  mullionSubmitted: boolean;
  ratio: number;
  mullionArray: any[] = [];
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
    this.mullionForm = this._mullionFormInit();
    this.quotationId = this._activeRoute.snapshot.paramMap.get('id') || '';
    this.product_id = this._activeRoute.snapshot.paramMap.get('subId') || '';
  }

  public handleFormModal(event: any) {
    this.isMullion = event;
  }

  public submitMullion() {
    this.mullionSubmitted = true;
    if (this.mullionForm.valid && this.selectedRect) {
      let data = this.selectedRect.getAttr('data');
      let ogHeight = data.height;
      let ogWidth = data.width;
      var height = ogHeight * this.ratio - 2 * designConst.innerRectGap;
      var width = ogWidth * this.ratio - 2 * designConst.innerRectGap;
      console.log(data);
      var y = this.selectedRect.y();
      var x = this.selectedRect.x();
      var smallerRectWidth,
        smallerRectHeight,
        smallerRect1X,
        smallerRect2X,
        smallerRect1: Konva.Rect,
        smallerRect2: Konva.Rect,
        smallerRect1Y,
        smallerRect2Y,
        directionLine1: any,
        directionLine2: any,
        text1: any,
        text2: any;
      if (this.mullionForm.value.direction === 'vertical') {
        smallerRectWidth = width / 2 - 10;
        smallerRectHeight = height;
        smallerRect1X = x;
        smallerRect2X = x + width / 2 + 10;
        smallerRect1 = this._konvaDesignService.createRect(
          smallerRect1X,
          y,
          smallerRectWidth,
          smallerRectHeight,
          designConst.defaultRectColor,
          designConst.strokeDefaultColor,
          ogHeight,
          ogWidth / 2 + 1.5 * designConst.innerRectGap
        );
        smallerRect2 = this._konvaDesignService.createRect(
          smallerRect2X,
          y,
          smallerRectWidth,
          smallerRectHeight,
          designConst.defaultRectColor,
          designConst.strokeDefaultColor,
          ogHeight,
          ogWidth / 2 + 1.5 * designConst.innerRectGap
        );

        // Create the direction lines and text for width
        directionLine1 = new Konva.Line({
          points: [
            smallerRect1X + smallerRectWidth,
            y,
            smallerRect1X + smallerRectWidth,
            y + height,
          ],
          stroke: 'black',
          strokeWidth: 2,
        });

        directionLine2 = new Konva.Line({
          points: [smallerRect2X, y, smallerRect2X, y + height],
          stroke: 'black',
          strokeWidth: 2,
        });

        text1 = new Konva.Text({
          x: smallerRect1X + smallerRectWidth / 2,
          y: y - 20,
          text: smallerRectWidth.toString(),
          fontSize: 14,
          fill: 'black',
        });

        text2 = new Konva.Text({
          x: smallerRect2X + smallerRectWidth / 2,
          y: y - 20,
          text: smallerRectWidth.toString(),
          fontSize: 14,
          fill: 'black',
        });
        let mullion = {
          direction: this.mullionForm.value.direction,
          length: height / this.ratio + 2 * designConst.innerRectGap,
          product_id: this.mullionForm.value.profile_id,
        };
        this.mullionArray.push(mullion);
        console.log(this.mullionArray);
      } else {
        smallerRectWidth = width;
        smallerRectHeight = height / 2 - 10;
        smallerRect1Y = y;
        smallerRect2Y = y + height / 2 + 10;
        smallerRect1 = this._konvaDesignService.createRect(
          x,
          smallerRect1Y,
          smallerRectWidth,
          smallerRectHeight,
          designConst.defaultRectColor,
          designConst.strokeDefaultColor,
          ogHeight / 2 + 1.5 * designConst.innerRectGap,
          ogWidth
        );
        smallerRect2 = this._konvaDesignService.createRect(
          x,
          smallerRect2Y,
          smallerRectWidth,
          smallerRectHeight,
          designConst.defaultRectColor,
          designConst.strokeDefaultColor,
          ogHeight / 2 + 1.5 * designConst.innerRectGap,
          ogWidth
        );
        // Create the direction lines and text for height
        directionLine1 = new Konva.Line({
          points: [
            x,
            smallerRect1Y + smallerRectHeight,
            x + width,
            smallerRect1Y + smallerRectHeight,
          ],
          stroke: 'black',
          strokeWidth: 2,
        });

        directionLine2 = new Konva.Line({
          points: [x, smallerRect2Y, x + width, smallerRect2Y],
          stroke: 'black',
          strokeWidth: 2,
        });

        text1 = new Konva.Text({
          x: x - 30,
          y: smallerRect1Y + smallerRectHeight / 2,
          text: smallerRectHeight.toString(),
          fontSize: 14,
          fill: 'black',
        });

        text2 = new Konva.Text({
          x: x - 30,
          y: smallerRect2Y + smallerRectHeight / 2,
          text: smallerRectHeight.toString(),
          fontSize: 14,
          fill: 'black',
        });
        let mullion = {
          direction: this.mullionForm.value.direction,
          length: width / this.ratio + 2 * designConst.innerRectGap,
          product_id: this.mullionForm.value.profile_id,
        };
        this.mullionArray.push(mullion);
        console.log(this.mullionArray);
      }
      smallerRect1.on('click', () => {
        this._handleInnerRectClick(smallerRect1);
      });
      smallerRect1.on('tap', () => {
        this._handleInnerRectClick(smallerRect1);
      });
      smallerRect2.on('click', () => {
        this._handleInnerRectClick(smallerRect2);
      });
      smallerRect2.on('tap', () => {
        this._handleInnerRectClick(smallerRect2);
      });
      this.selectedRect.remove();
      this.layer.add(smallerRect1);
      this.layer.add(smallerRect2);
      this.layer.add(directionLine1);
      this.layer.add(directionLine2);
      // this.layer.add(text1);
      // this.layer.add(text2);
      const allRects = this.layer.find('Rect');
      allRects?.forEach((e: any) => {
        if (e.fill() === designConst.selectedRectColor) {
          e.fill(designConst.defaultRectColor);
        }
      });
      this.mullionForm.reset();
      this.mullionForm.updateValueAndValidity();
      this.isMullion = false;
      this.rectSelected = false;
    } else {
      if (this.selectedRect) {
        this._toastService.showError('Please fill all the required fields');
      } else {
        this._toastService.showError('Please select area first');
      }
    }
    this._manageProduct();
  }

  public cancelMullion() {
    this.isMullion = false;
  }

  /**
   * Lifecycle method start
   */
  ngAfterViewInit() {
    this.designSpecificationForm = this._designSpecFormInit();
    // this.
    //  = [this.designSpecificationForm.value];
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

  get mf() {
    return this.mullionForm.controls;
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

  public addMullion() {
    this.isMullion = true;
  }

  private _mullionFormInit(): FormGroup {
    const fg = this._fb.group({
      profile_id: new FormControl('', [Validators.required]),
      direction: new FormControl('', [Validators.required]),
      length: new FormControl(''),
    });

    return fg;
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
        // this._handleInnerRectDeselect(this.mainRect);
        this.designSpecificationForm = this._designSpecFormInit();
        // this.designSpecArray = [this.designSpecificationForm.value];
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
    this._handleInnerRectDeselect(this.selectedRect);
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
    this.glassList = this.dropdowns.costhead;
    this.categoryList = this.dropdowns.category;
    this.typeList = this.dropdowns.product_type;
    this.glassList = this.dropdowns.costhead;
    this.sliddingTypes = this.dropdowns.slidding_type;
    this.hingesType = this.dropdowns.hinges_type;
    this.casementTypes = this.dropdowns.casement_type;
    this.palla_type_openable = this.dropdowns.palla_type_openable;
    this.palla_type_slidding = this.dropdowns.palla_type_slidding;
    this.openningDirections = this.dropdowns.opening_direction;
    this.colors = this.dropdowns.profile_color;
    this.mullionList = data['mullionList'];
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
      quatation_product_id: new FormControl(
        this.product_id ? this.product_id : ''
      ),
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
      sash_id: new FormControl(''),
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
    // height?.valueChanges.subscribe(handleValueChange);
    // width?.valueChanges.subscribe(handleValueChange);
    height?.valueChanges.subscribe((res) => {
      if (res) {
        this.clearLayerChildren();
        this._updateCanvas();
        this._manageProduct();
      }
    });
    width?.valueChanges.subscribe((res) => {
      if (res) {
        this.clearLayerChildren();
        this._updateCanvas();
        this._manageProduct();
      }
    });
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
          this.isAddMullion = false;
          sashIdControl.setValidators([Validators.required]);
          if (res === 'Casement' && casementTypeControl.value === 'Openable') {
            pallaTypeControl.setValue(1);
          } else if (res === 'Slidding') {
            pallaTypeControl.setValue(2);
          }
          pallaTypeControl.setValidators([Validators.required]);
          handleIdControl.setValidators([Validators.required]);
          this._profileList();
          this._sashList();
          this._handleList();
        } else {
          this.isAddMullion = true;
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
          pallaTypeControl.setValue(2);
          pallaTypeControl.setValidators([Validators.required]);
          isTrackControl.setValue('2 Track');
          isTrackControl.setValidators([Validators.required]);
          hingesTypeControl.setValue('');
          hingesTypeControl.clearValidators();
          hingesTypeControl.updateValueAndValidity();
        }

        if (res === 'Casement' && casementTypeControl.value === 'Openable') {
          pallaTypeControl.setValue(1);
          pallaTypeControl.setValidators([Validators.required]);
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
          pallaTypeControl.setValue(1);
          pallaTypeControl.setValidators([Validators.required]);
          this._profileList();
          this._sashList();
          this._handleList();
          [
            sashIdControl,
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
        this._updateCanvas();
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
        this._handleList();
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
    this.designSpecificationForm.get('height')?.setValue(data.height);
    this.designSpecificationForm.get('width')?.setValue(data.width);
    this.designSpecificationForm.get('color')?.setValue(data.color);
    data.mullions = this.mullionArray;
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
        this.df['sash_id'].patchValue(
          this.sashList[0] ? this.sashList[0].id : ''
        );
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
    let frameWidth = this.f['width'].value;
    let frameHeight = this.f['height'].value;
    let xPos, yPos, ratio;
    let data = this.selectedRect?.getAttr('data');
    if (this.selectedRect && this.ratio && data) {
      frameWidth = data.width;
      frameHeight = data.height;
      xPos = this.selectedRect.x() - designConst.innerRectGap;
      yPos = this.selectedRect.y() - designConst.innerRectGap;
      ratio = this.ratio;
    } else {
      xPos = this._designService.calculations(
        this.stage,
        frameWidth,
        frameHeight
      ).xPos;
      yPos = this._designService.calculations(
        this.stage,
        frameWidth,
        frameHeight
      ).yPos;
      ratio = this._designService.calculations(
        this.stage,
        frameWidth,
        frameHeight
      ).ratio;
      this.ratio = ratio;
    }
    console.log(frameHeight, frameWidth);
    const profile_color = this.f['profile_color'].value;
    if (this.isFrameSizeValid(frameWidth, frameHeight)) {
      // this.clearLayerChildren();
      if (!data) {
        this._createOuterFrame(
          1,
          xPos,
          yPos,
          ratio,
          frameWidth,
          frameHeight,
          profile_color,
          true
        );
        this._createInnerFrame(xPos, yPos, ratio, frameWidth, frameHeight);
      }
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
    // return width >= 300 && width <= 5800 && height >= 300 && height <= 5800;
    return true;
  }

  private _createOuterFrame(
    i: number,
    xPos: number,
    yPos: number,
    ratio: number,
    frameWidth: number,
    frameHeight: number,
    profile_color: string,
    is_direction: boolean
  ) {
    const windowRect = this._createRect(
      xPos,
      yPos,
      frameWidth * ratio,
      frameHeight * ratio,
      profile_color,
      designConst.strokeDefaultColor,
      frameWidth,
      frameHeight
    );
    if (false) {
      const directionInfo = this._designService.addLineAndArrow(
        xPos,
        yPos,
        frameWidth,
        frameHeight,
        ratio
      );
      this.layer.add(directionInfo);
    }
    this.layer.add(windowRect);
  }

  private _createInnerFrame(
    xPos: number,
    yPos: number,
    ratio: number,
    frameWidth: number,
    frameHeight: number
  ) {
    const rect = this._createRect(
      xPos + designConst.innerRectGap,
      yPos + designConst.innerRectGap,
      frameWidth * ratio - 2 * designConst.innerRectGap,
      frameHeight * ratio - 2 * designConst.innerRectGap,
      this.rectSelected
        ? designConst.selectedRectColor
        : this.df['glazz_id'].value == 20
        ? 'black'
        : designConst.defaultRectColor,
      designConst.strokeDefaultColor,
      frameHeight,
      frameWidth,
      'main'
    );
    if (isMobile) {
      // Attach touch event handlers for mobile
      rect.on('tap', () => {
        this._handleInnerRectClick(rect);
      });
    } else {
      // Attach click event handlers for non-mobile
      rect.on('click', () => {
        this._handleInnerRectClick(rect);
      });
    }
    const lineConnectors = this._designService.cornerConnectors(
      rect,
      xPos,
      yPos,
      frameWidth,
      frameHeight,
      ratio
    );
    this.layer.add(rect);
    this.layer.add(lineConnectors);
  }

  private _handleInnerRectClick(innerRect: Konva.Rect) {
    // if (palla) {
    //   if (
    //     innerRect.fill() === designConst.defaultRectColor ||
    //     innerRect.fill() === designConst.noGlassRectColor
    //   ) {
    //     const allRects = this.layer.find('Rect');
    //     allRects?.forEach((e: any) => {
    //       if (e.fill() === designConst.selectedRectColor) {
    //         e.fill(designConst.defaultRectColor);
    //       }
    //     });
    //     this.isAddMullion = true;
    //     this.rectSelected = true;
    //     innerRect.fill(designConst.selectedRectColor);
    //     this.selectedRect = innerRect;
    //   } else {
    //     this.isAddMullion = false;
    //     this.rectSelected = false;
    //     innerRect.fill(designConst.defaultRectColor);
    //   }
    // } else {
    if (
      innerRect.fill() === designConst.defaultRectColor ||
      innerRect.fill() === designConst.noGlassRectColor
    ) {
      this._handleInnerRectSelect(innerRect);
    } else {
      this._handleInnerRectDeselect(innerRect);
    }
    // }
  }

  private _handleInnerRectSelect(innerRect: Konva.Rect) {
    if (this.rectSelected && this.designSpecificationForm.invalid) {
      this._toastService.showError('Please fill all the required fields first');
    } else {
      const allRects = this.layer.find('Rect');
      allRects?.forEach((e: any) => {
        if (e.fill() === designConst.selectedRectColor) {
          e.fill(designConst.defaultRectColor);
        }
      });
      this.selectedRect = innerRect;
      innerRect.fill(designConst.selectedRectColor);
      this.designSpecificationForm = this._designSpecFormInit();
      // this.designSpecificationForm.updateValueAndValidity();
      this.rectSelected = true;
      this.isAddMullion = true;
      this.designSpecificationForm = this._designSpecFormInit(
        this.designSpecArray[0]
      );
    }
  }

  private _handleInnerRectDeselect(innerRect: Konva.Rect) {
    if (this.designSpecificationForm.invalid) {
      this._toastService.showError(
        'Please fill all the required fields first.'
      );
    } else {
      this.isAddMullion = false;
      innerRect.fill(
        this.df['glazz_id'].value == 20
          ? designConst.noGlassRectColor
          : designConst.defaultRectColor
      );
      this.designSpecificationForm.reset();
      this.designSpecificationForm.updateValueAndValidity();
      this.rectSelected = false;
    }
  }

  private _createRect(
    x: number,
    y: number,
    width: number,
    height: number,
    fill: string,
    stroke: string,
    frameWidth: number,
    frameHeight: number,
    type?: string
  ): Konva.Rect {
    const rect = this._konvaDesignService.createRect(
      x,
      y,
      width,
      height,
      fill,
      stroke,
      frameWidth,
      frameHeight,
      type
    );
    return rect;
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
    const divisionWidth =
      (frameWidth * ratio - 2 * designConst.innerRectGap) / divisions;
    for (let i = 0; i < divisions; i++) {
      const divisionXPos = xPos + designConst.innerRectGap + i * divisionWidth;
      const divisionYPos = yPos + designConst.innerRectGap;
      this._drawDivisionRect(
        i,
        divisionXPos,
        divisionYPos,
        ratio,
        divisionWidth,
        frameHeight,
        profile_color
      );
    }
  }

  private _drawDivisionRect(
    i: number,
    xPos: number,
    yPos: number,
    ratio: number,
    frameWidth: number,
    frameHeight: number,
    profile_color: string
  ) {
    this.isAddMullion = false;
    const windowRect = this._konvaDesignService.createRect(
      xPos,
      yPos,
      frameWidth,
      frameHeight * ratio - designConst.innerRectGap * 2,
      profile_color,
      designConst.strokeDefaultColor,
      frameWidth,
      frameHeight
    );
    const innerRect = this._konvaDesignService.createRect(
      xPos + designConst.innerRectGap,
      yPos + designConst.innerRectGap,
      frameWidth - 2 * designConst.innerRectGap,
      frameHeight * ratio - designConst.innerRectGap * 4,
      this.df['glazz_id'].value == 20
        ? designConst.noGlassRectColor
        : designConst.defaultRectColor,
      designConst.strokeDefaultColor,
      frameWidth,
      frameHeight
    );
    innerRect.on('click', (e: KonvaEventObject<MouseEvent>) => {
      this._handlePallaRectClick(innerRect);
    });
    innerRect.on('tap', (e: KonvaEventObject<MouseEvent>) => {
      this._handlePallaRectClick(innerRect);
    });
    // const handle = this._designService.handle({
    //   x: xPos + frameWidth - designConst.innerRectGap,
    //   y: frameHeight * ratio - designConst.innerRectGap * 3,
    //   rotationDeg: 180,
    // });
    this.layer.add(windowRect);
    this.layer.add(innerRect);
    // this.layer.add(handle);
  }

  private _handlePallaRectClick(innerRect: Konva.Rect) {
    // if (this.designSpecificationForm.invalid) {
    // } else {
    const allRects = this.layer.find('Rect');
    allRects?.forEach((e: any) => {
      if (e.fill() === designConst.selectedRectColor) {
        e.fill(designConst.defaultRectColor);
      }
    });
    this.selectedRect = innerRect;
    if (
      innerRect.fill() === designConst.defaultRectColor ||
      innerRect.fill() === designConst.noGlassRectColor
    ) {
      innerRect.fill(designConst.selectedRectColor);
      this.isAddMullion = true;
    } else {
      innerRect.fill(
        this.df['glazz_id'].value == 20
          ? designConst.noGlassRectColor
          : designConst.defaultRectColor
      );
      this.isAddMullion = false;
    }
    // }
  }

  private clearLayerChildren() {
    this.layer.removeChildren();
  }

  /**
   * Design Functions end
   */
}
