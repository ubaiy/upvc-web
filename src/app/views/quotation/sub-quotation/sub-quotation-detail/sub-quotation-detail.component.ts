import { Component } from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastService } from 'src/app/shared/services/toast.service';
import { SortEvent } from 'primeng/api';
import { QuotationService } from '../../quotation.service';
import { ConfirmationDialogService } from 'src/app/shared/services/confirmationdialog.service';
import { ISubQuotationDetailDto } from 'src/app/shared/model/quotation/sub-quotation-detail.model';
import * as sharedClasses from 'src/app/shared/class/sharedClasses';
import { DropdownService } from 'src/app/shared/services/dropdown.service';
import { ProfileService } from 'src/app/views/masters/profile/profile.service';
import { IProfileDropdown } from 'src/app/shared/model/profile/profileDropdown.model';
import { IMasterListDto } from 'src/app/shared/model/masters/masterList.model';
import { Table } from 'primeng/table';
@Component({
  selector: 'app-sub-quotation-detail',
  templateUrl: './sub-quotation-detail.component.html',
  styleUrls: ['./sub-quotation-detail.component.scss'],
})
export class SubQuotationDetailComponent {
  editable: boolean = false;
  data: ISubQuotationDetailDto;
  form: FormGroup;
  submitted: boolean = false;
  categoryList: [] = [];
  productType: [] = [];
  sliddingTypes: [] = [];
  casementTypes: [] = [];
  glassList: IMasterListDto[] = [];
  mullionList: IProfileDropdown[] = [];
  handleList: IMasterListDto[] = [];
  pallaTypes: [] = [];
  profileList: IProfileDropdown[] = [];
  hingesType: [] = [];
  sashList: IProfileDropdown[] = [];
  price: number;
  costheadInfo: [] = [];
  inputValue: string = '';
  quotationId: string;
  handleBoolean: boolean = false;
  constructor(
    private _activeRoute: ActivatedRoute,
    private _router: Router,
    private _fb: FormBuilder,
    private _dataService: QuotationService,
    private confirmationDialogService: ConfirmationDialogService,
    private _toastService: ToastService,
    private _drpService: DropdownService,
    private _profileService: ProfileService
  ) {
    let data = this._activeRoute.snapshot.data;
    this.categoryList = data['categoryList'];
    this.productType = data['typeList'];
    this.glassList = data['glassList'];
    this.handleList = data['handlsList'];
    this.mullionList = data['mullionList'];
    this.editable = data['edit'];
    this.quotationId = this._activeRoute.snapshot.paramMap.get('id') || '';
    if (this.editable) {
      sharedClasses.parseJSONIfPresent(
        data['data'].quatation,
        'customer_address'
      );
    }
    this.data = data['data'];
    this.form = this._initForm();
    if (this.editable) {
      this.form.patchValue(this.data.old_post_data);
      this.costheadInfo = this.data.costhead_information.costhead;
    }
  }

  get f() {
    return this.form.controls;
  }

  public customSort(event: SortEvent) {
    sharedClasses.customSort(event);
  }

  public clear(table: Table) {
    table.clear();
    this.inputValue = '';
  }

  public toggleWarningModal() {
    if (this.form.dirty && this.form.touched) {
      this.confirmationDialogService.confirm(
        'Are you sure!',
        'Are you sure you want to Cancel ? ',
        'pi-info-circle',
        () => {
          this._router.navigate(['/customers']);
        },
        () => {
          console.log('Action rejected');
        }
      );
    } else {
      this._router.navigate(['/customers']);
    }
  }

  public submit() {
    this.submitted = true;
    if (this.form.valid) {
      this._dataService
        .quotationManageProduct(this.form.value)
        .subscribe((resp) => {
          console.log(resp);
        });
    }
  }

  private _initForm(): FormGroup {
    let fg = this._fb.group({
      quatation_id: [''],
      quantity: [1, [Validators.required]],
      mullion_quantity: [0],
      category_name: ['', [Validators.required]],
      casement_type: [''],
      quatation_product_id: [''],
      palla_type: [''],
      hinges_type: [''],
      is_track: [''],
      product_type: ['', [Validators.required]],
      handle_id: [''],
      is_cupler: [false],
      is_louvers: [false],
      is_lshape: [false],
      product_id: ['', [Validators.required]],
      sash_id: [''],
      mullion_id: [''],
      height: [500, [Validators.required, Validators.max(5800)]],
      width: [500, [Validators.required, Validators.max(5800)]],
      is_saved: [false],
      glazz_id: [1, [Validators.required]],
      flymesh_id: [''],
      ventilation_id: [''],
      total: [''],
    });

    fg.controls.category_name.valueChanges.subscribe((res) => {
      if (res === 'Casement') {
        this.handleBoolean = false;
        fg.controls.handle_id.removeValidators([Validators.required]);
        fg.controls.handle_id.updateValueAndValidity();
        this._dataService.getCasementTypes().subscribe((res) => {
          if (res.success) {
            this.casementTypes = res.data;
            this.sliddingTypes = [];
            fg.controls.casement_type.setValidators([Validators.required]);
            fg.controls.casement_type.setValue('Fixed');
            fg.controls.is_track.removeValidators([Validators.required]);
            fg.controls.is_track.updateValueAndValidity();
            fg.controls.casement_type.updateValueAndValidity();
            fg.controls.sash_id.removeValidators([Validators.required]);
            fg.controls.sash_id.updateValueAndValidity();
            this.sashList = [];
          }
        });
        let q = {
          category_name: fg.controls.category_name.value,
          track: fg.controls.is_track.value,
          sub_category_name: 'Frame',
          casement_type: fg.controls.casement_type.value,
          product_type: fg.controls.product_type.value,
        };
        this._profileService.productDropdown(q).subscribe((res) => {
          if (res.success) {
            this.profileList = res.data;
            fg.controls.product_id.setValue(this.profileList[0].id.toString());
          }
        });
      } else if (res === 'Slidding') {
        this.handleBoolean = true;
        fg.controls.handle_id.addValidators([Validators.required]);
        fg.controls.handle_id.updateValueAndValidity();
        fg.controls.casement_type.setValue('');
        this._dataService.getSliddingTypes().subscribe((res) => {
          if (res.success) {
            this.sliddingTypes = res.data;
            this.casementTypes = [];
            fg.controls.is_track.setValidators([Validators.required]);
            fg.controls.casement_type.removeValidators([Validators.required]);
            fg.controls.is_track.updateValueAndValidity();
            fg.controls.casement_type.updateValueAndValidity();
          }
        });
        let query = {
          category_name: fg.controls.category_name.value,
          track: fg.controls.is_track.value,
          sub_category_name: 'Sash',
          casement_type: fg.controls.casement_type.value,
          product_type: fg.controls.product_type.value,
        };
        this._profileService.productDropdown(query).subscribe((res) => {
          if (res.success) {
            fg.controls.sash_id.setValidators([Validators.required]);
            fg.controls.sash_id.updateValueAndValidity();
            this.sashList = res.data;
          }
        });
        let q = {
          category_name: fg.controls.category_name.value,
          track: fg.controls.is_track.value,
          sub_category_name: 'Frame',
          casement_type: fg.controls.casement_type.value,
          product_type: fg.controls.product_type.value,
        };
        this._profileService.productDropdown(q).subscribe((res) => {
          if (res.success) {
            this.profileList = res.data;
            fg.controls.product_id.setValue(this.profileList[0].id.toString());
          }
        });
        this.pallaTypes = [];
        this.hingesType = [];
        fg.controls.palla_type.removeValidators([Validators.required]);
        fg.controls.palla_type.updateValueAndValidity();
        fg.controls.hinges_type.removeValidators([Validators.required]);
        fg.controls.hinges_type.updateValueAndValidity();
      }
    });
    fg.controls.casement_type.valueChanges.subscribe((res) => {
      if (res === 'Openable') {
        this.handleBoolean = true;
        fg.controls.handle_id.addValidators([Validators.required]);
        fg.controls.handle_id.updateValueAndValidity();
        this._drpService.getHingesDropdown().subscribe((resp) => {
          if (resp.success) {
            this.hingesType = resp.data;
            fg.controls.hinges_type.setValidators([Validators.required]);
            fg.controls.hinges_type.updateValueAndValidity();
          } else {
            this.hingesType = [];
          }
        });
        this._dataService.getPallaTypes().subscribe((res) => {
          if (res.success) {
            this.pallaTypes = res.data;
            fg.controls.palla_type.setValidators([Validators.required]);
            fg.controls.palla_type.updateValueAndValidity();
          }
        });
        let query = {
          category_name: fg.controls.category_name.value,
          track: fg.controls.is_track.value,
          sub_category_name: 'Sash',
          casement_type: fg.controls.casement_type.value,
          product_type: fg.controls.product_type.value,
        };
        this._profileService.productDropdown(query).subscribe((res) => {
          if (res.success) {
            fg.controls.sash_id.setValidators([Validators.required]);
            fg.controls.sash_id.updateValueAndValidity();
            this.sashList = res.data;
          }
        });
        let q = {
          category_name: fg.controls.category_name.value,
          track: fg.controls.is_track.value,
          sub_category_name: 'Frame',
          casement_type: fg.controls.casement_type.value,
          product_type: fg.controls.product_type.value,
        };
        this._profileService.productDropdown(q).subscribe((res) => {
          if (res.success) {
            this.profileList = res.data;
            fg.controls.product_id.setValue(this.profileList[0].id.toString());
          }
        });
      } else {
        if (fg.controls.category_name.value !== 'Slidding') {
          this.handleBoolean = false;
          fg.controls.handle_id.removeValidators([Validators.required]);
          fg.controls.handle_id.updateValueAndValidity();
          fg.controls.sash_id.removeValidators([Validators.required]);
          fg.controls.sash_id.updateValueAndValidity();
        }
        this.pallaTypes = [];
        this.sashList = [];
        this.hingesType = [];
        fg.controls.palla_type.removeValidators([Validators.required]);
        fg.controls.palla_type.updateValueAndValidity();

        fg.controls.hinges_type.removeValidators([Validators.required]);
        fg.controls.hinges_type.updateValueAndValidity();
      }
    });
    fg.get('product_type')?.setValue('Window');
    fg.get('category_name')?.setValue('Casement');
    fg.valueChanges.subscribe((res) => {
      if (res.product_id) {
        this._dataService
          .quotationManageProduct(this.form.value)
          .subscribe((resp) => {
            if (resp.success) {
              this.price = resp.data.total;
              this.costheadInfo = resp.data.costhead_information.costhead;
            } else {
              this.price = 0;
            }
          });
      }
    });
    return fg;
  }
}
