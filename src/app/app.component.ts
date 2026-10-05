import { Component } from '@angular/core';
import { IconSetService } from '@coreui/icons-angular';
import { delay } from 'rxjs/operators';

import { iconSubset } from './icons/icon-subset';
import { LoaderService } from './shared/services/loader.service';
import { RouteLoadingService } from './shared/services/route-loading.service';

/**
 * The root: the routed screen plus the app's one toast outlet, one confirm
 * dialog, one undo toast and the loading overlay. The browser tab title is
 * set by PageTitleStrategy (containers/shell).
 *
 * Loading, one sign at a time (card T138): the ring and bar are hidden while a screen draws its own
 * skeleton (appOwnLoading) and while a route is being waited for (RouteLoadingService). Before the
 * first screen of a signed-in user is known, the outline of the shell is drawn in place of an empty page.
 */
@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  loading = false;
  /** A screen is showing its own skeleton. */
  hushed = false;
  /** GET me / GET subscription are open and no shell is on screen yet. */
  booting = false;

  constructor(iconSetService: IconSetService, loaderService: LoaderService, public routeLoading: RouteLoadingService) {
    // CoreUI icons, still used by the screens not rebuilt yet.
    iconSetService.icons = { ...iconSubset };
    // The interceptor emits inside change detection; wait a tick (NG0100).
    loaderService.isLoading.pipe(delay(0)).subscribe((value: boolean) => (this.loading = value));
    loaderService.hushed.pipe(delay(0)).subscribe((value: boolean) => (this.hushed = value));
    routeLoading.state$.pipe(delay(0)).subscribe((state) => (this.booting = state === 'boot'));
  }
}
