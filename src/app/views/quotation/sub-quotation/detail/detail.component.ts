import { Component, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators,
  FormControl,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IMasterListDto } from 'src/app/shared/model/masters/masterList.model';
import { IProfileDropdown } from 'src/app/shared/model/profile/profileDropdown.model';
import { ProfileService } from 'src/app/views/masters/profile/profile.service';
import { QuotationService } from '../../quotation.service';
import { debounceTime } from 'rxjs/operators';
import { SortEvent } from 'primeng/api';
import * as sharedClasses from 'src/app/shared/class/sharedClasses';
import { Table } from 'primeng/table';
import { ToastService } from 'src/app/shared/services/toast.service';
import { ConfirmationDialogService } from 'src/app/shared/services/confirmationdialog.service';
import Konva from 'konva';
import { DesignService } from 'src/app/shared/services/design.service';
import { IProfileColorDto } from 'src/app/shared/model/profile/profile-color.model';
import { IOpenDirectionDrpDto } from 'src/app/shared/model/quotation/open-directionDrp.model';
@Component({
  selector: 'app-detail',
  templateUrl: './detail.component.html',
  styleUrls: ['./detail.component.scss'],
})
export class DetailComponent implements AfterViewInit {
  editable: boolean;
  visible: boolean = false;
  form: FormGroup;
  submitted: boolean;
  categoryList: string[] = [];
  typeList: string[] = [];
  glassList: IMasterListDto[];
  profileList: IProfileDropdown[] = [];
  mullionList: IProfileDropdown[] = [];
  handleList: IMasterListDto[] = [];
  ventilationTypes: IMasterListDto[] = [];
  sliddingTypes: [] = [];
  hingesType: string[] = [];
  sashList: IProfileDropdown[] = [];
  casementTypes: [] = [];
  price: number;
  costheadInfo: any[] = [];
  inputValue: string = '';
  quotationId: string = '';
  data: any;
  quatation_product_id: any;
  errorMessage: string = '';
  @ViewChild('container', { static: false }) container: ElementRef;
  stage: Konva.Stage;
  layer = new Konva.Layer();
  padding: number = 60;
  palla_types: number[];
  colors: IProfileColorDto[];
  openningDirections: IOpenDirectionDrpDto[];
  pallaForm: FormGroup;
  private frameGroups: Konva.Group[] = [];
  constructor(
    private _activeRoute: ActivatedRoute,
    private _fb: FormBuilder,
    private _profileService: ProfileService,
    private _dataService: QuotationService,
    private _router: Router,
    private confirmationDialogService: ConfirmationDialogService,
    private _toastService: ToastService,
    private _designService: DesignService
  ) {
    this._setUpData();
    this.quotationId = this._activeRoute.snapshot.paramMap.get('id') || '';
    this.form = this._initForm();
  }

  get f() {
    return this.form.controls;
  }

  ngAfterViewInit(): void {
    this.stage = new Konva.Stage({
      container: this.container.nativeElement,
      width: 700,
      height: 800,
    });
    this.stage.add(this.layer);
    this.updateCanvas();
  }

  public updateCanvas(
    glass_type?: string,
    numberOfGroups: number = this.f['palla_type'].value
  ) {
    this.clearLayerChildren();
    const frameWidth = parseInt(this.f['width'].value, 10);
    const frameHeight = parseInt(this.f['height'].value, 10);
    const totalWidth = this.stage.width();
    const windowWidth = totalWidth / numberOfGroups;
    const ratio = windowWidth / frameWidth;
    for (let i = 0; i < numberOfGroups; i++) {
      const group = this.createFrameGroup(
        frameWidth,
        frameHeight,
        ratio,
        glass_type
      );
      group.x(i * windowWidth + windowWidth / 2 - (frameWidth * ratio) / 2);
      group.y(
        Math.round(this.stage.height() / 2 - (frameHeight * ratio) / 2) + 0.5
      );
      group.on('click', () => {
        console.log(`Group ${i} clicked`);
        this.visible = true;
        this.pallaForm = this._initPallaForm(group);
      });

      this.frameGroups.push(group);
    }
    this.layer.add(...this.frameGroups);
  }

  private clearLayerChildren() {
    this.layer.removeChildren();
    this.frameGroups = [];
  }

  private createFrameGroup(
    frameWidth: number,
    frameHeight: number,
    ratio: number,
    glass_type?: string
  ): Konva.Group {
    const group = new Konva.Group();
    const frameGroup = this._designService
      .createFrame(
        frameWidth,
        frameHeight,
        this.padding,
        this.f['casement_type'].value == 'Openable',
        parseInt(this.f['open_direction'].value),
        this.f['palla_type'].value,
        this.f['profile_color'].value,
        this.f['handle_id'].value,
        glass_type
      )
      .scale({ x: ratio, y: ratio });
    group.add(frameGroup);
    return group;
  }

  public clear(table: Table) {
    table.clear();
    this.inputValue = '';
  }

  public customSort(event: SortEvent) {
    sharedClasses.customSort(event);
  }

  public submit() {
    this.submitted = true;
    if (this.form.valid) {
      let data = this.form.getRawValue();
      data.is_saved = true;
      data.image = this.stage.toDataURL();
      this._dataService.quotationManageProduct(data).subscribe(
        (resp) => {
          if (resp.success) {
            this._router.navigate([`/quotation/detail/${this.quotationId}`]);
            this._toastService.showSuccess(resp.message);
          } else {
            this._toastService.showError(resp.message);
          }
        },
        (err) => {
          this._toastService.showError(err.error.message);
        }
      );
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

  private _setUpData() {
    let data = this._activeRoute.snapshot.data;
    this.editable = data['edit'];
    this.colors = data['colors'];
    if (this.editable) {
      this.data = data['data'].costhead_information.old_post_data;
      this.quatation_product_id = data['data'].id;
    } else {
      this.colors.map((a) => {
        if (a.is_default) {
          a.selected = true;
        }
      });
    }
    this.categoryList = data['categoryList'];
    this.typeList = data['typeList'];
    this.glassList = data['glassList'];
    this.profileList = data['profileList'];
    this.mullionList = data['mullionList'];
    this.casementTypes = data['casementTypeList'];
    this.handleList = data['handlsList'];
    this.hingesType = data['hingesList'];
    this.sliddingTypes = data['sliddingTypes'];
    this.ventilationTypes = data['ventilationTypes'];
    this.palla_types = data['pallaTypes'];
    this.openningDirections = data['openningDirection'];
  }

  private _initForm(): FormGroup {
    let fg = this._fb.group({
      quatation_id: new FormControl(this.quotationId),
      quantity: new FormControl('1', [Validators.required]),
      category_name: new FormControl('Casement', [Validators.required]),
      mullion_quantity: new FormControl(''),
      casement_type: new FormControl('Fixed'),
      open_direction: new FormControl(1),
      quatation_product_id: new FormControl(''),
      palla_type: new FormControl(1),
      hinges_type: new FormControl(''),
      is_track: new FormControl(''),
      product_type: new FormControl('Window', [Validators.required]),
      handle_id: new FormControl(''),
      is_cupler: new FormControl(false),
      is_louvers: new FormControl(false),
      is_lshape: new FormControl(false),
      product_id: new FormControl('', [Validators.required]),
      sash_id: new FormControl(''),
      mullion_id: new FormControl(''),
      is_ventilation: new FormControl(false),
      profile_color: new FormControl('#ffffff', [Validators.required]),
      color_id: new FormControl('', [Validators.required]),
      color: new FormControl({}, [Validators.required]),
      height: new FormControl('1000', [
        Validators.required,
        Validators.max(5800),
        Validators.min(500),
      ]),
      width: new FormControl('1000', [
        Validators.required,
        Validators.max(5800),
        Validators.min(500),
      ]),
      is_saved: new FormControl(false),
      glazz_id: new FormControl('1', [Validators.required]),
      costhead_information: new FormControl([]),
      product_information: new FormControl([]),
      ventilation_id: new FormControl(''),
      ventilation_height: new FormControl(''),
      ventilation_width: new FormControl(''),
      ventilation_glazz_id: new FormControl(''),
    });
    if (!this.editable) {
      fg.controls.product_id.patchValue(this.profileList[0].id);
    }
    if (this.editable) {
      fg.patchValue(this.data);
      fg.controls.quatation_product_id.patchValue(this.quatation_product_id);
      fg.controls.is_saved.patchValue(false);
      this.colors.map((a) => {
        if (a.id == this.data.color_id) {
          a.selected = true;
          fg.controls.color.patchValue(a);
        }
      });
    }
    this._valueChangeEvents(fg);
    if (this.editable) {
      fg.controls.product_type.patchValue(this.data.product_type);
    }
    this._getInitalRate(fg);
    return fg;
  }

  private _valueChangeEvents(fg: FormGroup) {
    const controlsToReset = [
      'casement_type',
      'palla_type',
      'hinges_type',
      'ventilation_id',
      'ventilation_height',
      'ventilation_width',
      'ventilation_glazz_id',
    ];
    const controlsToValidate = ['handle_id', 'is_track'];
    const resetControls = (controls: string[]) => {
      controls.forEach((controlName) => {
        const control = fg.get(controlName);
        control?.setValue('');
        control?.clearValidators();
        control?.updateValueAndValidity();
      });
    };
    const validateControls = (controls: string[]) => {
      controls.forEach((controlName) => {
        const control = fg.get(controlName);
        control?.setValidators([Validators.required]);
        control?.updateValueAndValidity();
      });
    };
    const categoryControl = fg.get('category_name');
    const is_track = fg.get('is_track');
    const product_type = fg.get('product_type');
    const product_id = fg.get('product_id');
    const casement_type = fg.get('casement_type');
    const height = fg.get('height');
    const width = fg.get('width');
    const palla_type = fg.get('palla_type');
    const open_direction = fg.get('open_direction');
    const color_id = fg.get('color_id');
    const color = fg.get('color');
    const profile_color = fg.get('profile_color');
    const glazz_id = fg.get('glazz_id');
    const handle_id = fg.get('handle_id');
    const sash_id = fg.get('sash_id');
    const hinges_type = fg.get('hinges_type');
    glazz_id?.valueChanges.subscribe((res) => {
      if (res) {
        this.glassList.find((a) => {
          if (a.id == res) {
            this.updateCanvas(a?.name);
          }
        });
      }
    });
    color?.valueChanges.subscribe((res) => {
      if (res.id) {
        color_id?.patchValue(res.id);
        profile_color?.patchValue(res.color_code);
        this.updateCanvas();
      }
    });
    palla_type?.valueChanges.subscribe((res) => {
      if (!res) return;
      if (res) {
        this.updateCanvas();
      }
    });
    height?.valueChanges.subscribe((res) => {
      if (!res) return;
      if (res) {
        this.updateCanvas();
      }
    });
    width?.valueChanges.subscribe((res) => {
      if (!res) return;
      if (res) {
        this.updateCanvas();
      }
    });

    open_direction?.valueChanges.subscribe((res) => {
      if (!res) return;
      if (res) {
        this.updateCanvas();
      }
    });
    categoryControl?.valueChanges.subscribe((res) => {
      if (!res) return;
      if (res === 'Slidding') {
        resetControls(controlsToReset);
        validateControls(controlsToValidate);
      } else if (res === 'Casement') {
        resetControls(controlsToValidate);
        validateControls(controlsToReset);
      }
    });
    const formFieldsToWatch = [
      'category_name',
      'is_track',
      'casement_type',
      'product_type',
    ];
    formFieldsToWatch.forEach((fieldName) => {
      const control = fg.get(fieldName);
      control?.valueChanges.pipe(debounceTime(700)).subscribe(() => {
        const q = {
          category_name: categoryControl?.value,
          track: is_track?.value,
          sub_category_name: 'Frame',
          casement_type: casement_type?.value,
          product_type: product_type?.value,
        };
        this._profileService.productDropdown(q).subscribe((response) => {
          if (response.success) {
            this.profileList = response.data;
            product_id?.setValue(this.profileList[0].id.toString());
          }
        });
        if (casement_type?.value != 'Fixed') {
          validateControls([
            'sash_id',
            'palla_type',
            'open_direction',
            'handle_id',
            'hinges_type',
          ]);
          if (
            !palla_type?.value &&
            !open_direction?.value &&
            !handle_id?.value &&
            !hinges_type?.value
          ) {
            palla_type?.patchValue(1);
            open_direction?.patchValue(1);
            handle_id?.patchValue(this.handleList[0].id);
            hinges_type?.patchValue('Flate Hinges');
          }

          const q1 = {
            category_name: categoryControl?.value,
            track: is_track?.value,
            sub_category_name: 'Sash',
            casement_type: casement_type?.value,
            product_type: product_type?.value,
          };
          this._profileService.productDropdown(q1).subscribe((response) => {
            if (response.success) {
              this.sashList = response.data;
              sash_id?.patchValue(this.sashList[0].id);
            }
          });
        } else if (casement_type?.value == 'Fixed') {
          this.updateCanvas();
          resetControls([
            'sash_id',
            'palla_type',
            'open_direction',
            'hinges_type',
            'handle_id',
          ]);
        } else {
          resetControls(['is_ventilation']);
        }
      });
    });

    const controlsToSkip = [
      'quatation_id',
      'quatation_product_id',
      'is_ventilation',
      'is_saved',
    ];
    fg?.valueChanges.pipe(debounceTime(700)).subscribe(() => {
      const skipChange = controlsToSkip.some(
        (controlName) => this.form.get(controlName)?.dirty
      );
      if (!skipChange) {
        this._handleControlChange();
      }
    });
    fg.controls['is_ventilation'].valueChanges.subscribe((res) => {
      if (res) {
        validateControls([
          'ventilation_id',
          'ventilation_height',
          'ventilation_width',
          'ventilation_glazz_id',
        ]);
      } else {
        resetControls([
          'ventilation_id',
          'ventilation_height',
          'ventilation_width',
          'ventilation_glazz_id',
        ]);
      }
    });
  }

  private _handleControlChange() {
    this._dataService.quotationManageProduct(this.form.value).subscribe(
      (resp) => {
        if (resp.success) {
          this.price = resp.data.total;
          this.costheadInfo = resp.data.costhead_information.costhead;
          resp.data.product_information.forEach((e) => {
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
        } else {
          this.errorMessage = resp.message;
          this.price = 0;
        }
      },
      (err) => {
        this.errorMessage = err.error.message;
      }
    );
  }

  private _getInitalRate(fg: FormGroup) {
    this._dataService.quotationManageProduct(fg.value).subscribe((resp) => {
      if (resp.success) {
        this.price = resp.data.total;
        this.costheadInfo = resp.data.costhead_information.costhead;
        resp.data.product_information.forEach((e) => {
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
      } else {
        this.price = 0;
      }
    });
  }

  private _initPallaForm(group: Konva.Group): FormGroup {
    let fg = this._fb.group({
      open_direction: ['', [Validators.required]],
    });
    fg.controls.open_direction.valueChanges.subscribe(res => {

    })
    return fg;
  }
}
