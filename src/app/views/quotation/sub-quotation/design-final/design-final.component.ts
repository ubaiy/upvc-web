import {
  AfterViewInit,
  Component,
  ElementRef,
  OnInit,
  ViewChild,
} from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DropdownService } from '@coreui/angular';
import { cilLoopCircular } from '@coreui/icons';
import Konva from 'konva';
import { WindowFrame } from 'src/app/shared/class/designClass';
import {
  IAllDropDownsDto,
  AllDropdowns,
} from 'src/app/shared/model/common/allDropdowns.model';
import { IMasterListDto } from 'src/app/shared/model/masters/masterList.model';
import { IProfileColorDto } from 'src/app/shared/model/profile/profile-color.model';
import { IProfileDropdown } from 'src/app/shared/model/profile/profileDropdown.model';
import { IOpenDirectionDrpDto } from 'src/app/shared/model/quotation/open-directionDrp.model';
import { ConfirmationDialogService } from 'src/app/shared/services/confirmationdialog.service';
import { FinalService } from 'src/app/shared/services/final.service';
import { KonvaElementService } from 'src/app/shared/services/konva-element.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { ProfileService } from 'src/app/views/profile/profile.service';
import { QuotationService } from '../../quotation.service';
import * as sharedClasses from 'src/app/shared/class/sharedClasses';
import { SortEvent } from 'primeng/api';
import { Table } from 'primeng/table';
import * as designConst from 'src/app/shared/configs/design/constConfig';
@Component({
  selector: 'app-design-final',
  templateUrl: './design-final.component.html',
  styleUrls: ['./design-final.component.scss'],
})
export class DesignFinalComponent implements OnInit, AfterViewInit {
  edit: boolean = false;
  price: number = 0;
  quotationId: string = '';
  submitted: boolean = false;
  public circleIcon = cilLoopCircular;
  windowFrame: WindowFrame;
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
  mainForm: FormGroup;
  designForm: FormGroup;
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
  selectedGroup: Konva.Group | null;
  mullionSubmitted: boolean;
  ratio: number;
  mullionArray: any[] = [];
  pallaSelected: boolean;
  pallaForm: FormGroup;
  showHeightWidthOption: boolean;
  ouerRect: Konva.Rect;
  /**
   * Dropdown variables end
   */
  constructor(
    private _dialogService: ConfirmationDialogService,
    private _fb: FormBuilder,
    private _activeRoute: ActivatedRoute,
    private _designService: FinalService,
    private _konvaDesignService: KonvaElementService,
    private _dataService: QuotationService,
    private _dropdownService: DropdownService,
    private _router: Router,
    private _profileService: ProfileService,
    private _toastService: ToastService
  ) {
    this._setUpData();
    this.quotationId = this._activeRoute.snapshot.paramMap.get('id') || '';
    this.product_id = this._activeRoute.snapshot.paramMap.get('subId') || '';
    this._inits();
  }

  //#region lifecycle
  ngOnInit(): void {
    throw new Error('Method not implemented.');
  }
  ngAfterViewInit(): void {
    this.stage = new Konva.Stage({
      container: this.container.nativeElement,
      width: 700,
      height: 800,
    });
    this.stage.add(this.layer);
    this._initDesign();
    // Define window properties
  }
  //#endregion lifecycle

  //#region form getter
  get f() {
    return this.mainForm.controls;
  }

  get df() {
    return this.designForm.controls;
  }

  get pf() {
    return this.pallaForm.controls;
  }

  get mf() {
    return this.mullionForm.controls;
  }
  //#endregion form getter
  //#region public

  public submit() {
    if (this.rectSelected) {
      this._toastService.showError('Please complete the design first.');
    } else {
      let data = this.mainForm.value;
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
    if (this.mainForm.dirty && this.mainForm.touched) {
      this._dialogService.confirm(
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
    console.log('design save');
  }

  public resetDesign() {
    this._dialogService.confirm(
      'Are you sure!',
      'Are you sure you want to Reset the design ? ',
      'pi-info-circle',
      () => {
        this._initDesign();
      },
      () => {
        console.log('Action rejected');
      }
    );
  }

  public submitMullion() {
    console.log(this.mullionForm.value);
    if (this.mullionForm.valid && this.selectedGroup) {
      const data = this.selectedGroup.getAttr('data');
      const ogHeight = data.height;
      const ogWidth = data.width;
      const y = this.selectedGroup.y();
      const x = this.selectedGroup.x();
      // Get the direction from the form
      const direction = this.mullionForm.value.direction;
      // Calculate new dimensions based on direction
      if (direction === 'vertical') {
        const halfWidth = ogWidth / 2;
      } else {
        // Horizontal division
        const halfHeight = ogHeight / 2;
      }
      // this.selectedGroup.destroy();
    }
  }

  public updateAdjacentRects() {
    console.log('1');
    if (this.selectedGroup) {
      const scaleX =
        (this.pallaForm.value.width * this.ratio) / this.selectedGroup.width();
      const scaleY =
        (this.pallaForm.value.height * this.ratio) /
        this.selectedGroup.height();
      this.selectedGroup.scaleX(scaleX);
      this.selectedGroup.scaleY(scaleY);

      // Make sure to update the position if needed
      // For example, if you want to resize from the center:
      const deltaX =
        (this.selectedGroup.width() * scaleX - this.selectedGroup.width()) / 2;
      const deltaY =
        (this.selectedGroup.height() * scaleY - this.selectedGroup.height()) /
        2;
      this.selectedGroup.x(this.selectedGroup.x() - deltaX);
      this.selectedGroup.y(this.selectedGroup.y() - deltaY);

      // Batch draw to update the stage
      this.layer.batchDraw();
    }
  }

  public addMullion() {
    this.isMullion = true;
  }

  public customSort(event: SortEvent) {
    sharedClasses.customSort(event);
  }

  public clear(table: Table) {
    table.clear();
    this.inputValue = '';
  }

  public handleFormModal(event: any) {
    this.isMullion = event;
  }

  public cancelMullion() {
    this.isMullion = false;
    this.mullionForm.reset();
    this.mullionForm.updateValueAndValidity();
  }
  //#endregion public

  //#region private

  //#region forms

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
      mullion: new FormControl([]),
      parts: new FormControl([]),
      image: new FormControl(),
    });
    this._formValueChanges(fg);
    return fg;
  }

  private _designFormInit(obj?: any) {
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

  private _mullionFormInit(): FormGroup {
    const fg = this._fb.group({
      profile_id: new FormControl('', [Validators.required]),
      direction: new FormControl('', [Validators.required]),
      length: new FormControl(''),
    });

    return fg;
  }

  private _initPallaForm(): FormGroup {
    let fg = this._fb.group({
      height: new FormControl('', [Validators.required]),
      width: new FormControl('', [Validators.required]),
    });
    return fg;
  }

  //#endregion forms
  //#region value changes
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
        this._clearLayerChildren();
        this._updateCanvas();
        this._manageProduct();
      }
    });
    width?.valueChanges.subscribe((res) => {
      if (res) {
        this._clearLayerChildren();
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
    console.log(fg);
  }
  //#endregion value changes
  //#region design
  private _clearLayerChildren() {
    this.layer.removeChildren();
  }

  private _updateCanvas() {}
  //#endregion design

  //#region manage
  private _manageProduct() {
    let data = this.mainForm.getRawValue();
    this.designForm.get('height')?.setValue(data.height);
    this.designForm.get('width')?.setValue(data.width);
    this.designForm.get('color')?.setValue(data.color);
    data.mullion = this.mullionArray;
    this.designSpecArray[0] = this.designForm.value;
    data.parts = [this.designForm.value];
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
  //#endregion manage
  //#region data setup and inits
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

  private _inits() {
    this.mainForm = this._initForm();
    this.designForm = this._designFormInit();
    this.pallaForm = this._initPallaForm();
    this.mullionForm = this._mullionFormInit();
  }

  private _initDesign() {
    this._clearLayerChildren();
    this._inits();
    this.mainForm.updateValueAndValidity();
    this.designForm.updateValueAndValidity();
    this.mullionForm.updateValueAndValidity();
    this.pallaForm.updateValueAndValidity();
    var windowWidth = this.f['width'].value;
    var windowHeight = this.f['height'].value;
    var profile_color = this.f['profile_color'].value;
    const { xPos, yPos, ratio } = this._designService.calculations(
      this.stage,
      windowWidth,
      windowHeight
    );
    this.ratio = this._designService.calculations(
      this.stage,
      windowWidth,
      windowHeight
    ).ratio;
    const outer = this._konvaDesignService.createRect(
      xPos,
      yPos,
      windowWidth * ratio,
      windowHeight * ratio,
      profile_color,
      designConst.strokeDefaultColor,
      windowHeight,
      windowWidth
    );
    // this.layer.add(outer);
    const inner = this._konvaDesignService.createRect(
      xPos + designConst.innerRectGap,
      yPos + designConst.innerRectGap,
      windowWidth * ratio - 2 * designConst.innerRectGap,
      windowHeight * ratio - 2 * designConst.innerRectGap,
      designConst.defaultRectColor,
      designConst.strokeDefaultColor,
      windowHeight,
      windowWidth
    );
    const group = new Konva.Group();
    group.add(outer);
    group.add(inner);
    this.layer.add(group);
    this.stage.add(this.layer);
    group.setAttr('data', {
      height: windowHeight,
      width: windowWidth,
      form: this.designForm.value,
    });
    group.on('click', (e) => {
      this._handleClickOfRect(group);
    });
    group.on('tap', (e) => {
      this._handleClickOfRect(group);
    });
    this._manageProduct();
  }

  private _handleClickOfRect(rect: Konva.Group) {
    this.isAddMullion = true;
    if (this.designForm.invalid && this.selectedGroup === rect) {
    } else {
      if (this.selectedGroup) {
        this.selectedGroup = null;
      }
      // rect.fill(designConst.selectedRectColor);
      this.selectedGroup = rect;
      this.designForm = this._designFormInit();
      this.showHeightWidthOption = true;
    }
  }
  //#endregion data setup and inits
  //#endregion private
}
