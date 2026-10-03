import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { SortEvent } from 'primeng/api';
import { Table } from 'primeng/table';
import { from } from 'rxjs';
import { concatMap, finalize, toArray } from 'rxjs/operators';
import { IQuotationDto } from 'src/app/shared/model/quotation/quotation.model';
import { IProfileColorDto } from 'src/app/shared/model/profile/profile-color.model';
import { IMasterListDto } from 'src/app/shared/model/masters/masterList.model';
import { ICustomerDto } from 'src/app/shared/model/customer/customer.model';
import { IAreaDto } from 'src/app/shared/model/area/area.model';
import { ICustomerAdddressDto } from 'src/app/shared/model/customer/customerAddress.model';
import { ConfirmationDialogService } from 'src/app/shared/services/confirmationdialog.service';
import { QuotationService } from './quotation.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { CustomerService } from '../customers/customer.service';
import { AreaService } from '../area/area.service';
import { DropdownService } from 'src/app/shared/services/dropdown.service';

@Component({
  selector: 'app-quotation',
  templateUrl: './quotation.component.html',
  styleUrls: ['./quotation.component.scss'],
})
export class QuotationComponent {
  quotationList: IQuotationDto[] = [];
  inputValue: string = '';

  // Copy-quotation dialog state
  copyDropdownsLoaded: boolean = false;
  copyVisible: boolean = false;
  copySubmitted: boolean = false;
  copying: boolean = false;
  copyForm: FormGroup;
  sourceDetail: any = null;
  hasSliding: boolean = false;

  // Dropdown data for the copy dialog
  customerList: ICustomerDto[] = [];
  customerAddressList: ICustomerAdddressDto[] = [];
  areaList: IAreaDto[] = [];
  colors: IProfileColorDto[] = [];
  glassList: IMasterListDto[] = [];
  slidingTypes: string[] = [];

  constructor(
    private _activeRoute: ActivatedRoute,
    private _router: Router,
    private _fb: FormBuilder,
    private confirmationDialogService: ConfirmationDialogService,
    private _dataService: QuotationService,
    private _toastService: ToastService,
    private _customerService: CustomerService,
    private _areaService: AreaService,
    private _dropdownService: DropdownService
  ) {
    this.quotationList = this._activeRoute.snapshot.data['list'];
    this.quotationList?.forEach((e) => {
      e.customer_address = JSON.parse(e.customer_address);
    });
    this.copyForm = this._initCopyForm();
  }

  get cf() {
    return this.copyForm.controls;
  }

  public customSort(event: SortEvent) {
    if (event.data) {
      event.data.sort((data1, data2) => {
        if (event.field && event.order) {
          let value1 = data1[event.field];
          let value2 = data2[event.field];
          let result = null;

          if (value1 == null && value2 != null) result = -1;
          else if (value1 != null && value2 == null) result = 1;
          else if (value1 == null && value2 == null) result = 0;
          else if (typeof value1 === 'string' && typeof value2 === 'string')
            result = value1.localeCompare(value2);
          else result = value1 < value2 ? -1 : value1 > value2 ? 1 : 0;

          return event.order * result;
        } else {
          return 0;
        }
      });
    }
  }

  public clear(table: Table) {
    table.clear();
    this.inputValue = '';
  }

  public deleteQuotation(data: IQuotationDto) {
    this.confirmationDialogService.confirm(
      'Are you sure!',
      `Are you sure you want to Delete Quotation of ${data.name}? `,
      'pi-info-circle',
      () => {
        this._dataService.deleteQuotation(data.id).subscribe(
          (res) => {
            if (res.success) {
              this._toastService.showSuccess(res.message);
              this._dataService.getQuotationList().subscribe((res) => {
                if (res.success) {
                  this.quotationList = res.data;
                }
              });
            } else {
              this._toastService.showError(res.message);
            }
          },
          (err) => {
            this._toastService.showError(err.error.message);
          }
        );
      },
      () => {
        console.log('Action rejected');
      }
    );
  }

  public bulkUpdate(all: boolean) {
    const quotationIds: {
      quatation_ids: string[];
    } = {
      quatation_ids: [],
    };
    if (all) {
      this.quotationList.forEach((e) => {
        quotationIds.quatation_ids.push(e.id.toString());
      });
    } else {
      this.quotationList.forEach((e) => {
        if (e.selected) {
          quotationIds.quatation_ids.push(e.id.toString());
        }
      });
    }

    if (quotationIds.quatation_ids.length) {
      this._dataService.updateBulkPrice(quotationIds).subscribe(
        (res) => {
          if (res.success) {
            this._toastService.showSuccess(res.message);
            this.quotationList.forEach((e) => {
              e.selected = false;
            });
            this._dataService.getQuotationList().subscribe((res) => {
              if (res.success) {
                this.quotationList = res.data;
              }
            });
          } else {
            this._toastService.showError(res.message);
          }
        },
        (err) => {
          this._toastService.showError(err.error.message);
        }
      );
    } else {
      this._toastService.showError('Please select quotation!');
    }
  }

  /**
   * Copy Quotation start
   */
  /** Fetch the dialog's dropdown data once, on the first open (not in ngOnInit). */
  private _loadCopyDropdowns(): void {
    if (this.copyDropdownsLoaded) {
      return;
    }
    this.copyDropdownsLoaded = true;
    this._areaService.getAreaList().subscribe((res) => {
      if (res.success) this.areaList = res.data;
    });
    this._customerService.getCustomerList().subscribe((res) => {
      if (res.success) this.customerList = res.data;
    });
    this._dropdownService.allDropDowns().subscribe((res) => {
      if (res.success) {
        this.colors = res.data.profile_color;
        this.glassList = res.data.costhead;
        this.slidingTypes = res.data.slidding_type || [];
      }
    });
  }

  private _initCopyForm(): FormGroup {
    const fg = this._fb.group({
      area_id: ['', [Validators.required]],
      customer_id: ['', [Validators.required]],
      customer_address_id: ['', [Validators.required]],
      color_id: [''], // '' = keep original profile color
      glazz_id: [''], // '' = keep original glass
      is_track: [''], // '' = keep original track (sliding windows only)
    });
    fg.controls.customer_id.valueChanges.subscribe((res) => {
      if (res) {
        this._customerService
          .getCustomerAddressList({ customer_id: res })
          .subscribe((list) => {
            if (list.success) {
              this.customerAddressList = list.data;
            }
          });
      } else {
        this.customerAddressList = [];
      }
    });
    return fg;
  }

  public openCopy(quotation: IQuotationDto): void {
    this.copySubmitted = false;
    this.sourceDetail = null;
    this._loadCopyDropdowns();
    // Pull the full quotation (header + line items with their saved specs).
    this._dataService.getQuotationDetail(quotation.id).subscribe(
      (res) => {
        if (!res.success) {
          this._toastService.showError(res.message);
          return;
        }
        const detail: any = res.data;
        this.sourceDetail = detail;

        // Show the Track option only when the quotation contains sliding windows.
        this.hasSliding = (detail.quatation_product || []).some((line: any) => {
          const opd = this._getOldPostData(line);
          return opd?.category_type === 'Slidding';
        });

        let addressId: any = '';
        try {
          const addr =
            typeof detail.customer_address === 'string'
              ? JSON.parse(detail.customer_address)
              : detail.customer_address;
          addressId = addr?.id ?? '';
        } catch {
          addressId = '';
        }

        // Preload the source customer's addresses, then prefill the form.
        this._customerService
          .getCustomerAddressList({ customer_id: detail.customer_id })
          .subscribe((list) => {
            if (list.success) this.customerAddressList = list.data;
            // Coerce ids to strings so they match the <option> string values even
            // after the address list re-renders (avoids a first-open prefill miss).
            // emitEvent:false — the address list is already loaded above; letting
            // customer_id.valueChanges refetch replaces the options after the
            // prefill and drops the selected address back to the placeholder.
            this.copyForm.reset(
              {
                area_id: detail.area_id != null ? String(detail.area_id) : '',
                customer_id: detail.customer_id != null ? String(detail.customer_id) : '',
                customer_address_id:
                  addressId != null && addressId !== '' ? String(addressId) : '',
                color_id: '',
                glazz_id: '',
                is_track: '',
              },
              { emitEvent: false }
            );
          });

        this.copyVisible = true;
      },
      (err) => {
        this._toastService.showError(err?.error?.message || 'Unable to load quotation');
      }
    );
  }

  public handleCopyModal(visible: boolean): void {
    this.copyVisible = visible;
    if (!visible) {
      this.copySubmitted = false;
    }
  }

  public closeCopy(): void {
    this.copyVisible = false;
    this.copySubmitted = false;
  }

  public submitCopy(): void {
    this.copySubmitted = true;
    if (this.copyForm.invalid || !this.sourceDetail) {
      return;
    }

    const lines: any[] = this.sourceDetail.quatation_product || [];
    if (!lines.length) {
      this._toastService.showError('This quotation has no windows/doors to copy.');
      return;
    }

    const fv = this.copyForm.getRawValue();
    this.copying = true;

    const header = {
      area_id: fv.area_id,
      customer_id: fv.customer_id,
      customer_address_id: fv.customer_address_id,
      quatation_name: (this.sourceDetail.quatation_name || '') + ' (Copy)',
    };

    this._dataService.addQuotationDetail(header).subscribe(
      (hres) => {
        if (!hres.success) {
          this.copying = false;
          this._toastService.showError(hres.message);
          return;
        }
        const newId = hres.data.id;

        const payloads = lines
          .map((line) =>
            this._buildLinePayload(line, newId, fv.color_id, fv.glazz_id, fv.is_track)
          )
          .filter((p) => !!p);

        if (!payloads.length) {
          this.copying = false;
          this._toastService.showSuccess('Quotation copied successfully');
          this.copyVisible = false;
          this._router.navigate([`quotation/detail/${newId}`]);
          return;
        }

        // Post each window/door sequentially so the grand-total recalculation
        // on the server stays consistent.
        from(payloads)
          .pipe(
            concatMap((payload) =>
              this._dataService.quotationManageProduct(payload)
            ),
            toArray(),
            finalize(() => {
              this.copying = false;
            })
          )
          .subscribe({
            next: () => {
              this._toastService.showSuccess('Quotation copied successfully');
              this.copyVisible = false;
              this._router.navigate([`quotation/detail/${newId}`]);
            },
            error: (err) => {
              this._toastService.showError(
                err?.error?.message || 'Failed to copy some windows/doors.'
              );
            },
          });
      },
      (err) => {
        this.copying = false;
        this._toastService.showError(err?.error?.message || 'Failed to copy quotation.');
      }
    );
  }

  /**
   * Build a manage-product payload for a copied line, mirroring what the design
   * screen posts. The original spec is read from costhead_information.old_post_data
   * and the chosen profile color / glass (if any) is applied before recalculation.
   */
  private _getOldPostData(line: any): any {
    let ci = line?.costhead_information;
    if (typeof ci === 'string') {
      try {
        ci = JSON.parse(ci);
      } catch {
        ci = null;
      }
    }
    return ci?.old_post_data ?? null;
  }

  private _buildLinePayload(
    line: any,
    newQuatationId: number,
    colorId: any,
    glazzId: any,
    trackId: any
  ): any {
    const opd = this._getOldPostData(line);
    if (!opd) {
      return null;
    }

    const part: any = { ...opd };
    if (colorId) part.color_id = colorId;
    if (glazzId) part.glazz_id = glazzId;
    // Track override only makes sense for sliding windows.
    if (trackId && part.category_type === 'Slidding') {
      part.is_track = trackId;
    }

    const colorObj = this.colors.find((c) => c.id === Number(part.color_id));

    return {
      quatation_id: newQuatationId,
      is_saved: true,
      quantity: line.quantity,
      width: opd.width,
      height: opd.height,
      color: colorObj,
      profile_color: colorObj?.color_code || '#ffffff',
      mullion: opd.mullion || [],
      parts: [part],
      // Carry the window/door preview image over to the copy.
      image: line.image || null,
    };
  }
  /**
   * Copy Quotation end
   */
}
