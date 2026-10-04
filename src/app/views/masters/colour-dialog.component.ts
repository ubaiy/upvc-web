import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';

import { SharedComponentsModule } from '../../shared/components/shared-components.module';
import { CatalogueAdapter } from './catalogue.adapter';
import { ColourRow } from './catalogue.model';

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Add or edit a profile colour: a name and the colour itself. */
@Component({
  selector: 'app-colour-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DialogModule, ButtonModule, SharedComponentsModule],
  template: `
    <p-dialog
      [header]="colour ? 'Edit colour' : 'Add colour'"
      [visible]="visible"
      (visibleChange)="$event ? null : close()"
      [modal]="true"
      closeAriaLabel="Close"
      [draggable]="false"
      [resizable]="false"
      [dismissableMask]="!saving"
      [style]="{ width: '440px' }"
      [breakpoints]="{ '640px': '94vw' }"
    >
      <form id="colour-form" class="stack" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="field">
          <label class="label" for="cl-name">Name</label>
          <input
            class="input"
            id="cl-name"
            formControlName="color_name"
            placeholder="Golden oak"
            autocomplete="off"
            [class.is-invalid]="bad('color_name')"
            [attr.aria-invalid]="bad('color_name') ? 'true' : null"
          />
          <span class="error" *ngIf="bad('color_name')">Enter a name for the colour.</span>
        </div>
        <div class="field">
          <label class="label" for="cl-code">Colour</label>
          <div class="pick">
            <input
              type="color"
              aria-label="Pick the colour"
              [value]="swatch"
              (input)="form.patchValue({ color_code: $any($event.target).value })"
            />
            <input
              class="input"
              id="cl-code"
              formControlName="color_code"
              placeholder="#8a5a2b"
              autocomplete="off"
              spellcheck="false"
              [class.is-invalid]="bad('color_code')"
              [attr.aria-invalid]="bad('color_code') ? 'true' : null"
              aria-describedby="cl-code-h"
            />
          </div>
          <span class="error" id="cl-code-h" *ngIf="bad('color_code'); else codeHint">
            Enter a colour code such as #8a5a2b.
          </span>
          <ng-template #codeHint><span class="hint" id="cl-code-h">Shown on the window drawing and the quotation.</span></ng-template>
        </div>
        <app-callout tone="danger" *ngIf="error" role="alert">{{ error }}</app-callout>
      </form>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" [outlined]="true" [disabled]="saving" (onClick)="close()"></p-button>
        <button pButton type="submit" form="colour-form" [label]="colour ? 'Save colour' : 'Add colour'" [loading]="saving"></button>
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .stack { display: grid; gap: var(--s-4); }
      .pick { display: flex; gap: var(--s-2); align-items: center; }
      .pick input[type='color'] {
        flex: none; width: var(--h-control); height: var(--h-control); padding: 2px; cursor: pointer;
        border: 1px solid var(--c-border-strong); border-radius: var(--r-sm); background: var(--c-surface);
      }
    `,
  ],
})
export class ColourDialogComponent implements OnChanges {
  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Input() colour: ColourRow | null = null;
  @Output() saved = new EventEmitter<ColourRow>();

  form: FormGroup = this.build();
  submitted = false;
  saving = false;
  error = '';

  constructor(private fb: FormBuilder, private adapter: CatalogueAdapter) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.submitted = false;
      this.saving = false;
      this.error = '';
      this.form = this.build();
      if (this.colour) {
        this.form.patchValue(this.colour);
      }
    }
  }

  /** The native picker only takes a full six-digit code. */
  get swatch(): string {
    const code = this.form.value.color_code;
    return HEX.test(code) ? code : '#ffffff';
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
    this.saving = true;
    this.adapter
      .saveColour({ id: this.colour?.id, color_name: v.color_name.trim(), color_code: v.color_code.toLowerCase() })
      .subscribe({
        next: (row) => {
          this.saving = false;
          this.saved.emit(row);
          this.close();
        },
        error: (err) => {
          this.saving = false;
          this.error = this.adapter.message(err, 'The colour was not saved. Try again.');
        },
      });
  }

  private build(): FormGroup {
    const fb = this.fb ?? new FormBuilder();
    return fb.group({
      color_name: ['', [Validators.required, Validators.maxLength(100)]],
      color_code: ['#ffffff', [Validators.required, Validators.pattern(HEX)]],
    });
  }
}
