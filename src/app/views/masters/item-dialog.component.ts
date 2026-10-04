import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';

import { SharedComponentsModule } from '../../shared/components/shared-components.module';
import { CatalogueAdapter } from './catalogue.adapter';
import { GLASS_COSTHEAD, ItemRow, MAX_RATE, fixSpelling, unitLabel } from './catalogue.model';

const MONEY = /^\d+(\.\d{1,2})?$/;

/**
 * Add or edit a glass type or a hardware item. Glass asks name, unit and rate;
 * hardware also asks its group (handle, roller, …) and which windows use it.
 */
@Component({
  selector: 'app-item-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DialogModule, ButtonModule, SharedComponentsModule],
  template: `
    <p-dialog
      [header]="title"
      [visible]="visible"
      (visibleChange)="$event ? null : close()"
      [modal]="true"
      closeAriaLabel="Close"
      [draggable]="false"
      [resizable]="false"
      [dismissableMask]="!saving"
      [style]="{ width: '520px' }"
      [breakpoints]="{ '640px': '94vw' }"
    >
      <form id="item-form" class="form-grid" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="field span-2">
          <label class="label" for="it-name">Name</label>
          <input
            class="input"
            id="it-name"
            formControlName="name"
            autocomplete="off"
            [placeholder]="glass ? '5 mm toughened glass' : 'Sliding roller, single wheel'"
            [class.is-invalid]="bad('name')"
            [attr.aria-invalid]="bad('name') ? 'true' : null"
          />
          <span class="error" *ngIf="bad('name')">Enter a name.</span>
        </div>

        <div class="field" *ngIf="!glass">
          <label class="label" for="it-group">Group</label>
          <select class="select" id="it-group" formControlName="costhead" [class.is-invalid]="bad('costhead')">
            <option value="" disabled>Choose a group</option>
            <option *ngFor="let group of groups" [value]="group">{{ fixSpelling(group) }}</option>
          </select>
          <span class="error" *ngIf="bad('costhead')">Choose a group.</span>
        </div>

        <div class="field" *ngIf="!glass">
          <label class="label" for="it-for">Used for</label>
          <select class="select" id="it-for" formControlName="category">
            <option value="">Every window</option>
            <option *ngFor="let category of categories" [value]="category">{{ fixSpelling(category) }}</option>
          </select>
        </div>

        <div class="field">
          <label class="label" for="it-rate">Rate</label>
          <div class="input-group" [class.is-invalid]="bad('cost')">
            <span aria-hidden="true">₹</span>
            <input
              id="it-rate"
              class="num"
              inputmode="decimal"
              autocomplete="off"
              formControlName="cost"
              [attr.aria-invalid]="bad('cost') ? 'true' : null"
              aria-describedby="it-rate-e"
            />
            <span class="unit">/ {{ unitLabel(form.value.unit) }}</span>
          </div>
          <span class="error" id="it-rate-e" *ngIf="bad('cost')">Enter a rate in rupees, for example 72 or 72.50.</span>
        </div>

        <div class="field">
          <label class="label" for="it-unit">Priced per</label>
          <select class="select" id="it-unit" formControlName="unit">
            <option *ngFor="let unit of unitOptions" [value]="unit">{{ unitLabel(unit) }}</option>
          </select>
        </div>

        <div class="field span-2" *ngIf="!glass">
          <label class="label" for="it-rule">How many per window <span class="muted">(optional)</span></label>
          <input class="input" id="it-rule" formControlName="conditions" autocomplete="off" placeholder="Each window 2 pc" />
          <span class="hint">Shown under the item name. It is a note for your team; it does not change the price.</span>
        </div>

        <div class="field span-2">
          <label class="label" for="it-note">Note <span class="muted">(optional)</span></label>
          <input class="input" id="it-note" formControlName="description" autocomplete="off" />
        </div>

        <app-callout class="span-2" tone="danger" *ngIf="error" role="alert">{{ error }}</app-callout>
      </form>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" [outlined]="true" [disabled]="saving" (onClick)="close()"></p-button>
        <button pButton type="submit" form="item-form" [label]="item ? 'Save' : title" [loading]="saving"></button>
      </ng-template>
    </p-dialog>
  `,
})
export class ItemDialogComponent implements OnChanges {
  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  /** The row to edit; null adds a new one. */
  @Input() item: ItemRow | null = null;
  /** True on the Glass tab, false on Hardware. */
  @Input() glass = false;
  /** Hardware groups already in the catalogue. */
  @Input() groups: string[] = [];
  /** "Used for" values already in the catalogue. */
  @Input() categories: string[] = [];
  @Input() units: string[] = [];
  /** Every item, to find the type a group uses. */
  @Input() items: ItemRow[] = [];
  @Output() saved = new EventEmitter<ItemRow>();

  readonly fixSpelling = fixSpelling;
  readonly unitLabel = unitLabel;
  form: FormGroup = this.build();
  submitted = false;
  saving = false;
  error = '';

  constructor(private fb: FormBuilder, private adapter: CatalogueAdapter) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.open();
    }
  }

  get title(): string {
    const what = this.glass ? 'glass' : 'hardware';
    return this.item ? `Edit ${what}` : `Add ${what}`;
  }

  /** The API's units, plus the one this row already has ("Rmt", "Pair"). */
  get unitOptions(): string[] {
    const current = this.item?.unit;
    const base = this.units.length ? this.units : ['Sq M', 'Unit', 'Meter'];
    return current && !base.includes(current) ? [...base, current] : base;
  }

  bad(name: string): boolean {
    const control = this.form.get(name);
    return !!control && control.invalid && (this.submitted || control.touched);
  }

  close(): void {
    this.visible = false;
    this.visibleChange.emit(false);
  }

  submit(): void {
    this.submitted = true;
    this.error = '';
    if (this.form.invalid || this.saving) {
      return;
    }
    const v = this.form.value;
    const costhead = this.glass ? GLASS_COSTHEAD : v.costhead;
    const body: Partial<ItemRow> = {
      ...(this.item ?? {}),
      name: v.name.trim(),
      costhead,
      // A group keeps the type its other items have; a new group uses its own name.
      type:
        this.item && this.item.costhead === costhead
          ? this.item.type
          : this.items.find((i) => i.costhead === costhead)?.type ?? costhead,
      cost: Number(v.cost),
      unit: v.unit,
      category: v.category || null,
      description: (v.description ?? '').trim(),
      ...(this.glass ? {} : { conditions: (v.conditions ?? '').trim() }),
    };
    this.saving = true;
    this.adapter.saveItem(body).subscribe({
      next: (row) => {
        this.saving = false;
        this.saved.emit(row);
        this.close();
      },
      error: (err) => {
        this.saving = false;
        this.error = this.adapter.message(err, 'Not saved. Try again.');
      },
    });
  }

  private open(): void {
    this.submitted = false;
    this.saving = false;
    this.error = '';
    this.form = this.build();
    if (this.item) {
      this.form.patchValue({
        ...this.item,
        category: this.item.category ?? '',
        description: this.item.description ?? '',
        conditions: this.item.conditions ?? '',
      });
    } else {
      this.form.patchValue({ unit: this.glass ? 'Sq M' : 'Unit' });
    }
  }

  private build(): FormGroup {
    const fb = this.fb ?? new FormBuilder();
    return fb.group({
      name: ['', [Validators.required, Validators.maxLength(190)]],
      costhead: [this.glass ? GLASS_COSTHEAD : '', [Validators.required]],
      category: [''],
      cost: ['', [Validators.required, Validators.pattern(MONEY), Validators.min(0), Validators.max(MAX_RATE)]],
      unit: ['Unit', [Validators.required]],
      description: ['', [Validators.maxLength(250)]],
      conditions: ['', [Validators.maxLength(255)]],
    });
  }
}
