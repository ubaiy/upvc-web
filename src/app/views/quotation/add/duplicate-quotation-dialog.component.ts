import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { from } from 'rxjs';
import { concatMap, finalize, toArray } from 'rxjs/operators';

import { IMasterListDto } from 'src/app/shared/model/masters/masterList.model';
import { IProfileColorDto } from 'src/app/shared/model/profile/profile-color.model';
import { DropdownService } from 'src/app/shared/services/dropdown.service';
import { QuotationService } from '../quotation.service';
import { errorText, QuotationRow } from '../quotation-list.model';
import { CustomerOption } from './quotation-dialog.component';

interface Choice {
  label: string;
  value: any;
}

const KEEP: Choice = { label: 'Keep original', value: '' };

/**
 * "Duplicate" from a quotation's row menu: the same windows for the same or
 * another customer, with an optional change of colour, glass or track. Each
 * window is priced again by the API, so the copy carries today's prices.
 */
@Component({
  selector: 'app-duplicate-quotation-dialog',
  templateUrl: './duplicate-quotation-dialog.component.html',
})
export class DuplicateQuotationDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() quotation: QuotationRow | null = null;

  @Output() closed = new EventEmitter<void>();

  /** Id of the new quotation. */
  @Output() saved = new EventEmitter<number>();

  form: FormGroup;
  customers: CustomerOption[] = [];
  colorChoices: Choice[] = [KEEP];
  glassChoices: Choice[] = [KEEP];
  trackChoices: Choice[] = [KEEP];
  hasSliding = false;
  loading = false;
  loadError = '';
  submitted = false;
  copying = false;
  saveError = '';
  /** A copy that was created but did not get every window. */
  partialId: number | null = null;

  private colors: IProfileColorDto[] = [];
  private sourceDetail: any = null;

  constructor(
    private _fb: FormBuilder,
    private _dataService: QuotationService,
    private _dropdownService: DropdownService
  ) {
    this.form = this._fb.group({
      customer_id: [null],
      quatation_name: [''],
      color_id: [''], // '' = keep the original profile colour
      glazz_id: [''], // '' = keep the original glass
      is_track: [''], // '' = keep the original track (sliding windows only)
    });
  }

  get windowCount(): number {
    return (this.sourceDetail?.quatation_product || []).length;
  }

  get customerError(): string {
    return this.submitted && !this.form.controls['customer_id'].value ? 'Choose a customer.' : '';
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible && this.quotation) {
      this.load();
    }
  }

  load(): void {
    const source = this.quotation;
    if (!source) {
      return;
    }
    this.submitted = false;
    this.saveError = '';
    this.loadError = '';
    this.partialId = null;
    this.sourceDetail = null;
    this.loading = true;
    this.form.reset({
      customer_id: source.customerId,
      quatation_name: `${source.name} (Copy)`,
      color_id: '',
      glazz_id: '',
      is_track: '',
    });

    this._dataService.getCustomerOptions().subscribe({
      next: (res) => {
        if (res?.success) {
          this.customers = (res.data || [])
            .map((c: any) => ({ id: Number(c.id), name: (c.name || '').toString(), phone: (c.phone || '').toString() }))
            .sort((a: CustomerOption, b: CustomerOption) => a.name.localeCompare(b.name));
        }
      },
      error: () => (this.loadError = 'We could not load your customers.'),
    });
    this._dropdownService.allDropDowns().subscribe({
      next: (res) => {
        if (res?.success) {
          this.colors = res.data.profile_color || [];
          this.colorChoices = [KEEP, ...this.colors.map((c) => ({ label: c.color_name, value: c.id }))];
          this.glassChoices = [
            KEEP,
            ...(res.data.costhead || []).map((g: IMasterListDto) => ({ label: g.name, value: g.id })),
          ];
          this.trackChoices = [KEEP, ...(res.data.slidding_type || []).map((t: string) => ({ label: t, value: t }))];
        }
      },
      error: () => undefined, // The copy still works with the original colour and glass.
    });
    // The full quotation: header plus each window with its saved specification.
    this._dataService
      .getQuotationDetail(source.id)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (res) => {
          if (!res?.success) {
            this.loadError = res?.message || 'We could not load this quotation.';
            return;
          }
          this.sourceDetail = res.data;
          // The track choice only makes sense when there is a sliding window.
          this.hasSliding = (this.sourceDetail.quatation_product || []).some(
            (line: any) => this._getOldPostData(line)?.category_type === 'Slidding'
          );
        },
        error: (err) => (this.loadError = errorText(err, 'We could not load this quotation.')),
      });
  }

  close(): void {
    if (!this.copying) {
      this.closed.emit();
    }
  }

  openPartial(): void {
    if (this.partialId) {
      this.saved.emit(this.partialId);
    }
  }

  submit(): void {
    this.submitted = true;
    this.saveError = '';
    if (this.copying || this.customerError || !this.sourceDetail) {
      return;
    }
    const fv = this.form.getRawValue();
    const lines: any[] = this.sourceDetail.quatation_product || [];
    this.copying = true;

    const header = {
      customer_id: fv.customer_id,
      quatation_name: (fv.quatation_name || '').trim() || `${this.quotation?.name || ''} (Copy)`,
    };

    this._dataService.addQuotationDetail(header).subscribe({
      next: (hres) => {
        if (!hres?.success) {
          this.copying = false;
          this.saveError = hres?.message || 'We could not copy the quotation. Try again.';
          return;
        }
        const newId = Number(hres.data.id);
        const payloads = lines
          .map((line) => this._buildLinePayload(line, newId, fv.color_id, fv.glazz_id, fv.is_track))
          .filter((p) => !!p);

        if (!payloads.length) {
          this.copying = false;
          this.saved.emit(newId);
          return;
        }

        // One window at a time, so the total the server keeps stays consistent.
        from(payloads)
          .pipe(
            concatMap((payload) => this._dataService.quotationManageProduct(payload)),
            toArray(),
            finalize(() => (this.copying = false))
          )
          .subscribe({
            next: () => this.saved.emit(newId),
            error: (err) => {
              this.partialId = newId;
              this.saveError = errorText(err, 'Some windows could not be copied. Open the copy to check it.');
            },
          });
      },
      error: (err) => {
        this.copying = false;
        this.saveError = errorText(err, 'We could not copy the quotation. Try again.');
      },
    });
  }

  /** The specification a window was saved with, kept by the API in costhead_information.old_post_data. */
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

  /**
   * The manage-product payload for one copied window, as the design screen
   * posts it, with the chosen colour, glass or track applied before pricing.
   */
  private _buildLinePayload(line: any, newQuatationId: number, colorId: any, glazzId: any, trackId: any): any {
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
      // Carry the window's preview image over to the copy.
      image: line.image || null,
    };
  }
}
