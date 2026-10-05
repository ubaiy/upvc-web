import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { IUserDto } from 'src/app/shared/model/user.model';
import { AuthService } from 'src/app/shared/services/auth.service';
import { LocalStoreService } from 'src/app/shared/services/local-storage.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { imageProblem } from '../image-rules';
import { ProfileService } from '../profile.service';
import { ChangePasswordCardComponent } from './change-password-card.component';

/** Settings → Your profile: the signed-in person's own name, phone and photo, and their password. */
@Component({
  selector: 'app-settings-your-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SharedComponentsModule, ChangePasswordCardComponent],
  templateUrl: './your-profile-tab.component.html',
  styleUrls: ['../settings-tab.scss', './your-profile-tab.component.scss'],
})
export class YourProfileTabComponent implements OnInit {
  state: 'loading' | 'error' | 'ready' = 'loading';
  user: IUserDto | null = null;
  photoUrl: string | null = null;
  photoError = '';
  uploading = false;
  form: FormGroup;
  submitted = false;
  saving = false;
  saveError = '';

  constructor(
    private fb: FormBuilder,
    private profile: ProfileService,
    private auth: AuthService,
    private store: LocalStoreService,
    private toast: ToastService
  ) {
    this.form = this.fb.group({
      name: ['', [Validators.required]],
      last_name: ['', [Validators.required]],
      email: [{ value: '', disabled: true }],
      phone: ['', [Validators.required, Validators.pattern(/^[0-9+ -]{8,15}$/)]],
    });
  }

  get f() {
    return this.form.controls;
  }

  get initials(): string {
    return ((this.user?.name ?? '').charAt(0) + (this.user?.last_name ?? '').charAt(0)).toUpperCase();
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.state = 'loading';
    this.profile.getProfile().subscribe({
      next: (res) => {
        if (res?.success) {
          this.apply(res.data);
          this.state = 'ready';
        } else {
          this.state = 'error';
        }
      },
      error: () => (this.state = 'error'),
    });
  }

  invalid(name: string): boolean {
    const control = this.f[name];
    return control.invalid && (control.touched || this.submitted);
  }

  onPhotoChosen(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    this.photoError = imageProblem(file) ?? '';
    if (this.photoError) {
      return;
    }
    const body = new FormData();
    body.append('profile', file);
    this.uploading = true;
    this.profile.updateProfilePhoto(body).subscribe({
      next: (res) => {
        this.uploading = false;
        if (res?.success) {
          this.toast.showSuccess('Photo updated');
          this.refresh();
        } else {
          this.photoError = res?.message || 'The photo could not be uploaded.';
        }
      },
      error: (err) => {
        this.uploading = false;
        this.photoError = err?.error?.message || 'The photo could not be uploaded.';
      },
    });
  }

  save(): void {
    this.submitted = true;
    this.saveError = '';
    if (this.form.invalid || this.saving) {
      return;
    }
    // The endpoint takes the whole user; fields this form does not show go back unchanged.
    const body = { ...this.user, ...this.form.getRawValue() } as IUserDto;
    this.saving = true;
    this.profile.updateProfile(body).subscribe({
      next: (res) => {
        this.saving = false;
        if (res?.success) {
          this.submitted = false;
          this.toast.showSuccess('Your profile is saved');
          this.refresh();
        } else {
          this.saveError = res?.message || 'Your profile could not be saved. Please try again.';
        }
      },
      error: (err) => {
        this.saving = false;
        this.saveError = err?.error?.message || 'Your profile could not be saved. Please try again.';
      },
    });
  }

  /** Re-reads the user and tells the shell, which shows the name and photo. */
  private refresh(): void {
    this.profile.getProfile().subscribe((res) => {
      if (res?.success) {
        this.apply(res.data);
        this.store.setItem('User', res.data);
        this.store.setItem('profile', res.data.profile);
        this.auth.user$.next(res.data);
        this.auth.profile$.next(res.data.profile);
      }
    });
  }

  private apply(user: IUserDto): void {
    this.user = user;
    this.photoUrl = user.profile || null;
    this.form.reset({ name: user.name, last_name: user.last_name, email: user.email, phone: user.phone });
  }
}
