import { Component, Input } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';

import { ClassToggleService, HeaderComponent } from '@coreui/angular';
import { AuthService } from 'src/app/shared/services/auth.service';
import { LocalStoreService } from 'src/app/shared/services/local-storage.service';

@Component({
  selector: 'app-default-header',
  templateUrl: './default-header.component.html',
})
export class DefaultHeaderComponent extends HeaderComponent {
  @Input() sidebarId: string = 'sidebar';

  public newMessages = new Array(4);
  public newTasks = new Array(5);
  public newNotifications = new Array(5);
  public imageSrc: string = '../../../../assets/images/defaultProfile.webp';
  constructor(
    private classToggler: ClassToggleService,
    private _authService: AuthService,
    private _router: Router,
    private _ls: LocalStoreService
  ) {
    super();
    this._authService.profile$.subscribe((res) => {
      if (res) {
        this.imageSrc = res;
      } else {
        this.imageSrc = '../../../../assets/images/defaultProfile.webp';
      }
    });
    if (this._ls.getItem('profile')) {
      this.imageSrc = this._ls.getItem('profile');
    }
  }

  public logout() {
    this._authService.logout();
  }

  public profileRedirect() {
    this._router.navigate(['/profile']);
  }
}
