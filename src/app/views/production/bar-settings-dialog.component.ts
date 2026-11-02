import { WriteDirective } from 'src/app/shared/access/write.directive';
import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';

import { SharedComponentsModule } from '../../shared/components/shared-components.module';
import { BarSettings, BarSettingsAnswer } from './production.model';
import { ProductionService } from './production.service';

const WHOLE = /^\d+$/;
const NUMBER = /^\d+(\.\d+)?$/;

/** "Bar settings" (card P6): the api's four numbers for the bar plan, with its refusal shown in the dialog. */
@Component({
  selector: 'app-bar-settings-dialog',
  standalone: true,
  imports: [WriteDirective, CommonModule, ReactiveFormsModule, DialogModule, ButtonModule, SharedComponentsModule],
  templateUrl: './bar-settings-dialog.component.html',
  styles: ['.bar-settings { display: grid; gap: var(--s-4); }'],
})
export class BarSettingsDialogComponent implements OnChanges, OnDestroy {
  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  /** The api's answer to a save. */
  @Output() saved = new EventEmitter<BarSettingsAnswer>();

  form: FormGroup = this.build();
  /** The api's standard values, for the help lines. */
  defaults: BarSettings | null = null;
  loading = false;
  loadError = '';
  submitted = false;
  saving = false;
  error = '';

  private loadSub?: Subscription;

  constructor(private fb: FormBuilder, private service: ProductionService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.submitted = false;
      this.saving = false;
      this.error = '';
      this.form = this.build();
      this.load();
    }
  }

  ngOnDestroy(): void {
    this.loadSub?.unsubscribe();
  }

  /** Asks the api for the values in force now. */
  load(): void {
    this.loadSub?.unsubscribe();
    this.loading = true;
    this.loadError = '';
    this.form.disable({ emitEvent: false });
    this.loadSub = this.service.getBarSettings().subscribe({
      next: (answer) => {
        this.loading = false;
        this.defaults = answer.defaults;
        this.form.enable({ emitEvent: false });
        this.form.patchValue(
          {
            bar_mm: String(answer.settings.bar_mm),
            steel_bar_mm: String(answer.settings.steel_bar_mm ?? answer.defaults?.steel_bar_mm ?? answer.settings.bar_mm),
            blade_mm: String(answer.settings.blade_mm),
            end_trim_mm: String(answer.settings.end_trim_mm),
            min_offcut_mm: String(answer.settings.min_offcut_mm),
          },
          { emitEvent: false }
        );
      },
      error: (err: Error) => {
        this.loading = false;
        this.loadError = err.message || 'The bar settings could not be loaded.';
      },
    });
  }

  bad(name: string): boolean {
    const control = this.form.get(name);
    return !!control && control.invalid && (this.submitted || control.touched);
  }

  close(): void {
    if (this.saving) {
      return;
    }
    this.loadSub?.unsubscribe();
    this.visible = false;
    this.visibleChange.emit(false);
  }

  submit(): void {
    this.submitted = true;
    this.error = '';
    if (this.saving || this.loading || this.loadError || this.form.invalid) {
      return;
    }
    const v = this.form.getRawValue();
    const body: BarSettings = {
      bar_mm: Number(v.bar_mm),
      steel_bar_mm: Number(v.steel_bar_mm),
      blade_mm: Number(v.blade_mm),
      end_trim_mm: Number(v.end_trim_mm),
      min_offcut_mm: Number(v.min_offcut_mm),
    };
    this.saving = true;
    this.service.saveBarSettings(body).subscribe({
      next: (answer) => {
        this.saving = false;
        this.saved.emit(answer);
        this.visible = false;
        this.visibleChange.emit(false);
      },
      error: (err: Error) => {
        this.saving = false;
        this.error = err.message || 'The bar settings were not saved. Try again.';
      },
    });
  }

  private build(): FormGroup {
    return this.fb.group({
      bar_mm: ['', [Validators.required, Validators.pattern(WHOLE), Validators.min(500), Validators.max(20000)]],
      steel_bar_mm: ['', [Validators.required, Validators.pattern(WHOLE), Validators.min(500), Validators.max(20000)]],
      blade_mm: ['', [Validators.required, Validators.pattern(NUMBER), Validators.min(0), Validators.max(20)]],
      end_trim_mm: ['', [Validators.required, Validators.pattern(NUMBER), Validators.min(0), Validators.max(200)]],
      min_offcut_mm: ['', [Validators.required, Validators.pattern(WHOLE), Validators.min(0), Validators.max(6000)]],
    });
  }
}
