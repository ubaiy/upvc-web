import { Component, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { SortEvent } from 'primeng/api';
import { IAllDropDownsDto } from 'src/app/shared/model/common/allDropdowns.model';
import { IProfileColorDto } from 'src/app/shared/model/profile/profile-color.model';
import { ConfirmationDialogService } from 'src/app/shared/services/confirmationdialog.service';
import * as sharedClasses from 'src/app/shared/class/sharedClasses';
import { Table } from 'primeng/table';
import Konva from 'konva';
import { FrameService } from 'src/app/shared/services/design-services/frame.service';
import { QuotationService } from '../../quotation.service';
import { IProfileDropdown } from 'src/app/shared/model/profile/profileDropdown.model';
@Component({
  selector: 'app-design',
  templateUrl: './design.component.html',
  styleUrls: ['./design.component.scss'],
})
export class DesignComponent implements AfterViewInit {
  edit: boolean = false; // edit boolean
  form: FormGroup; // form group
  data: any; // Edit data
  quotationId: string = ''; // quotation Id
  submitted: boolean; // submit boolean for validation
  price: number = 0; // price value for total
  costheadInfo: any[] = []; // Costhead table variable
  inputValue: string = ''; // costhead table search input
  quatation_product_id: any; // product Id of quotation
  padding: number = 60;
  layer = new Konva.Layer();
  @ViewChild('container', { static: false }) container: ElementRef;
  stage: Konva.Stage;
  private frameGroups: Konva.Group[] = [];
  visible: boolean = false;
  //<!==============================Dropdown Variables=====================================>
  dropdowns: IAllDropDownsDto; // All Dropdown variable
  colors: IProfileColorDto[] = []; // Profile Color Dropdown
  selectedColor: IProfileColorDto; // Selected Color Variable
  profileList: IProfileDropdown[] = []; // Profile Lists
  //<!===================================================================>

  constructor(
    private _activeRoute: ActivatedRoute,
    private confirmationDialogService: ConfirmationDialogService,
    private _fb: FormBuilder,
    private _router: Router,
    private _designService: FrameService,
    private _dataService: QuotationService
  ) {
    this.quotationId = this._activeRoute.snapshot.paramMap.get('id') || '';
    this._setUpData();
    this.form = this._initForm();
  }

  /**
   * Life cycle hooks
   */
  ngAfterViewInit(): void {
    this.stage = new Konva.Stage({
      container: this.container.nativeElement,
      width: 700,
      height: 800,
    });
    this.stage.add(this.layer);
    this.updateCanvas();
  }

  /**
   * getter methods
   */
  get f() {
    return this.form.controls;
  }

  /**
   * Update canvas
   */
  public updateCanvas(glass_type?: string, numberOfGroups: number = 1) {
    this.clearLayerChildren();
    const frameWidth = parseInt(this.f['width'].value, 10);
    const frameHeight = parseInt(this.f['height'].value, 10);
    const totalWidth = this.stage.width();
    const windowWidth = totalWidth / numberOfGroups;
    const ratio = windowWidth / frameWidth;
    for (let i = 0; i < numberOfGroups; i++) {
      const group = this.createGroup(
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
        this._initGroupForm(group);
      });

      this.frameGroups.push(group);
    }
    this.layer.add(...this.frameGroups);
  }

  /**
   * Clear Layer Groups Function
   */

  private clearLayerChildren() {
    this.layer.removeChildren();
    this.frameGroups = [];
  }

  /**
   * Create Frame
   */
  private createGroup(
    frameWidth: number,
    frameHeight: number,
    ratio: number,
    glass_type?: string,
    mullion?: number
  ): Konva.Group {
    const group = new Konva.Group();
    const frameGroup = this._designService
      .createGroup(
        frameWidth,
        frameHeight,
        this.f['profile_color'].value,
        this.padding,
        glass_type
      )
      .scale({ x: ratio, y: ratio });
    group.add(frameGroup);
    return group;
  }

  /**
   * Submit Function
   */
  public submit() {
    console.log(this.form.value);
  }

  /**
   * Costhead table sort function
   */
  public customSort(event: SortEvent) {
    sharedClasses.customSort(event);
  }

  /**
   * Costhead table clear filter function
   */
  public clear(table: Table) {
    table.clear();
    this.inputValue = '';
  }

  /**
   * Cancel function
   */

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

  /**
   * Main Form Init Method
   */
  private _initForm(): FormGroup {
    const fg = this._fb.group({
      quotationId: new FormControl(),
      quantity: new FormControl(1, [Validators.required]),
      color: new FormControl({}, [Validators.required]),
      width: new FormControl(1500, [
        Validators.required,
        Validators.min(500),
        Validators.max(5800),
      ]),
      height: new FormControl(1200, [
        Validators.required,
        Validators.min(500),
        Validators.max(5800),
      ]),
      profile_color: new FormControl('#ffffff', [Validators.required]),
    });
    if (this.edit) {
      fg.patchValue(this.data);
      this.colors.map((a) => {
        if (a.id == this.data.color_id) {
          fg.controls.color.patchValue(a);
        }
      });
    } else {
      this.colors.map((a) => {
        if (a.is_default) {
          fg.controls.color.patchValue(a);
        }
      });
    }
    this._getInitalRate(fg);
    fg.controls.height.valueChanges.subscribe((res) => {
      if (res) {
        if (res <= 5800) {
          if (fg.controls.width.value) {
            if (fg.controls.width.value <= 5800) {
              this.updateCanvas();
            }
          }
        }
      }
    });
    fg.controls.width.valueChanges.subscribe((res) => {
      if (res) {
        if (res <= 5800) {
          if (fg.controls.height.value) {
            if (fg.controls.height.value <= 5800) {
              this.updateCanvas();
            }
          }
        }
      }
    });
    return fg;
  }

  private _initGroupForm(group: Konva.Group): FormGroup {
    const fg = this._fb.group({
      mullion: new FormControl(''),
    });
    fg.controls.mullion.valueChanges.subscribe((res) => {
      if (res) {
      }
    });
    return fg;
  }

  /**
   * Data setup method
   */
  private _setUpData() {
    let data = this._activeRoute.snapshot.data;
    this.dropdowns = data['dropdowns'];
    this.edit = data['edit'];
    this.data = data['details'];
    this.profileList = data['profileList'];
    this.colors = this.dropdowns.profile_color;
    if (this.edit) {
      this.data = data['details'].costhead_information.old_post_data;
      this.quatation_product_id = data['details'].id;
    }
  }

  /**
   * Inital pricing api call
   */

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
}
