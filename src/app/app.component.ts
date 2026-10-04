import { Component } from '@angular/core';
import { IconSetService } from '@coreui/icons-angular';
import { delay } from 'rxjs/operators';

import { iconSubset } from './icons/icon-subset';
import { LoaderService } from './shared/services/loader.service';

/**
 * The root: the routed screen plus the app's one toast outlet, one confirm
 * dialog, one undo toast and the loading overlay. The browser tab title is
 * set by PageTitleStrategy (containers/shell).
 */
@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  loading = false;

  constructor(iconSetService: IconSetService, loaderService: LoaderService) {
    // CoreUI icons, still used by the screens not rebuilt yet.
    iconSetService.icons = { ...iconSubset };
    // The interceptor emits inside change detection; wait a tick (NG0100).
    loaderService.isLoading.pipe(delay(0)).subscribe((value: boolean) => (this.loading = value));
  }
}
