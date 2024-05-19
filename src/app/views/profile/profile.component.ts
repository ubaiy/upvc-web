import { Location } from '@angular/common';
import { Component } from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { IUserDto } from 'src/app/shared/model/user.model';
import { AuthService } from 'src/app/shared/services/auth.service';
import { ConfirmationDialogService } from 'src/app/shared/services/confirmationdialog.service';
import { LocalStoreService } from 'src/app/shared/services/local-storage.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { ProfileService } from './profile.service';
export const validImageTypes = [
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/jpg',
];

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
})
export class ProfileComponent {
  form: FormGroup;
  submitted: boolean = false;
  imageSrc: string = '../../assets/images/defaultProfile.webp';
  userDetail: IUserDto;
  constructor(
    private _fb: FormBuilder,
    private confirmationDialogService: ConfirmationDialogService,
    private location: Location,
    private _toastService: ToastService,
    private _ls: LocalStoreService,
    private _authService: AuthService,
    private _activeRoute: ActivatedRoute,
    private _dataService: ProfileService
  ) {
    this.userDetail = this._activeRoute.snapshot.data['data'];
    if (this.userDetail.profile) {
      this.imageSrc = this.userDetail.profile;
    }
    this.form = this._initForm();
  }

  get f() {
    return this.form.controls;
  }

  public toggleWarningModal() {
    if (this.form.dirty && this.form.touched) {
      this.confirmationDialogService.confirm(
        'Are you sure!',
        'Are you sure you want to Cancel ? ',
        'pi-info-circle',
        () => {
          this.location.back();
        },
        () => {
          console.log('Action rejected');
        }
      );
    } else {
      this.location.back();
    }
  }

  public onFileChange(event: any) {
    if (event.target.files && event.target.files.length) {
      const reader = new FileReader();
      if (!validImageTypes.includes(event.target.files[0]['type'])) {
        this._toastService.showError('Image file is invalid.');
      } else if (event.target.files[0].size > 5000001) {
        this._toastService.showError('Please upload image of less than 5mb.');
      } else {
        const file = event.target.files[0];
        reader.onload = (e) => {
          var img = new Image();
          img.onload = () => {
            this.imageSrc = reader.result as string;
            if (this.imageSrc) {
              let form = new FormData();
              form.append('profile', file);
              this._dataService.updateProfilePhoto(form).subscribe((res) => {
                if (res.success) {
                  this._toastService.showSuccess(res.message);
                  this._dataService.getProfile().subscribe((res) => {
                    if (res.success) {
                      this.userDetail = res.data;
                      this._ls.setItem('profile', this.userDetail.profile);
                      this._authService.profile$.next(this.imageSrc);
                    }
                  });
                  return;
                } else {
                  this._toastService.showError(res.message);
                  return;
                }
              });
            }
          };
          img.onerror = () => {
            this._toastService.showError(
              file.name + ' ' + 'this file is corrupted'
            );
            return;
          };
          img.src = e.target?.result as string;
        };
        reader.readAsDataURL(file);
      }
    }
  }

  public submit() {
    console.log(this.form.value);
    if (this.form.valid) {
      this.form.controls['email'].enable();
      this._dataService
        .updateProfile(this.form.getRawValue())
        .subscribe((res) => {
          this.form.controls['email'].disable();
          if (res.success) {
            this._toastService.showSuccess(res.message);
            this._dataService.getProfile().subscribe((res) => {
              if (res.success) {
                this.userDetail = res.data;
                this._authService.user$.next(this.userDetail);
                this._ls.setItem('User', this.userDetail);
                this._authService.profile$.next(this.imageSrc);
              }
            });
          }
          console.log(res);
        });
    } else {
      this._toastService.showError('Please fill all the required fields.');
    }
  }

  private _initForm(): FormGroup {
    const fg = this._fb.group({
      name: new FormControl('', [Validators.required]),
      last_name: new FormControl('', [Validators.required]),
      email: new FormControl(''),
      phone: new FormControl('', [Validators.required]),
      gst_no: new FormControl(''),
    });
    fg.patchValue(this.userDetail);
    fg.controls.email.disable();
    return fg;
  }
}
