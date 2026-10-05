import { finalize } from 'rxjs/operators';
import { Component, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Editor, Toolbar } from 'ngx-editor';
import { ToastService } from 'src/app/shared/services/toast.service';
import { ConfirmationDialogService } from 'src/app/shared/services/confirmationdialog.service';
import { HeaderService } from '../header.service';
@Component({
  selector: 'app-details',
  templateUrl: './details.component.html',
  styleUrls: ['./details.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class DetailsComponent implements OnInit, OnDestroy {
  editable: boolean = false;
  form: FormGroup;
  submitted: boolean = false;
  editor: Editor;
  toolbar: Toolbar = [
    ['bold', 'italic'],
    ['underline', 'strike'],
    ['code', 'blockquote'],
    ['ordered_list', 'bullet_list'],
    [{ heading: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] }],
    ['link', 'image'],
    ['text_color', 'background_color'],
    ['align_left', 'align_center', 'align_right', 'align_justify'],
  ];
  constructor(
    private _activeRoute: ActivatedRoute,
    private _router: Router,
    private _fb: FormBuilder,
    private _dataService: HeaderService,
    private confirmationDialogService: ConfirmationDialogService,
    private _toastService: ToastService
  ) {
    let data = this._activeRoute.snapshot.data;
    this.editable = data['edit'];
    this.form = this._initForm();
    if (this.editable) {
      this.form.patchValue(data['data']);
    }
  }

  get f() {
    return this.form.controls;
  }

  ngOnInit(): void {
    this.editor = new Editor();
  }

  ngOnDestroy(): void {
    this.editor.destroy();
  }

  public toggleWarningModal() {
    if (this.form.dirty && this.form.touched) {
      this.confirmationDialogService.discardChanges(() => {
          this._router.navigate(['/crm/header']);
        });
    } else {
      this._router.navigate(['/crm/header']);
    }
  }

  public closeModal() {
    this._router.navigate(['/crm/header']);
  }

  /** True while a save is on its way: a second press does nothing. */
  saving = false;

  public submit() {
    this.submitted = true;
    if (this.saving) {
      return;
    }
    if (this.form.valid) {
      this.saving = true;
      if (this.editable) {
        this._dataService
          .editHeader(this.form.getRawValue()).pipe(finalize(() => (this.saving = false)))
          .subscribe((res) => {
            if (res.success) {
              this._toastService.showSuccess(res.message);
              this._router.navigate(['/crm/header']);
            } else {
              this._toastService.showError(res.message);
              this._router.navigate(['/crm/header']);
            }
          });
      } else {
        this._dataService
          .addHeader(this.form.getRawValue()).pipe(finalize(() => (this.saving = false)))
          .subscribe((res) => {
            if (res.success) {
              this._toastService.showSuccess(res.message);
              this._router.navigate(['/crm/header']);
            } else {
              this._toastService.showError(res.message);
              this._router.navigate(['/crm/header']);
            }
          });
      }
    }
  }

  private _initForm(): FormGroup {
    let fg = this._fb.group({
      id: [''],
      name: ['', [Validators.required]],
      description: ['', [Validators.required]],
      detail: ['', [Validators.required, Validators.email]],
      editorContent: [''],
    });
    return fg;
  }
}
