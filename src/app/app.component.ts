import { Component, OnInit } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';

import { IconSetService } from '@coreui/icons-angular';
import { iconSubset } from './icons/icon-subset';
import { Title } from '@angular/platform-browser';
import { delay } from 'rxjs/operators';
import { LoaderService } from './shared/services/loader.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit {
  title = 'Hakimi Enterprise';
  loading: boolean;
  value: number = 10;
  constructor(
    private router: Router,
    private titleService: Title,
    private iconSetService: IconSetService,
    private loaderService: LoaderService
  ) {
    titleService.setTitle(this.title);
    // iconSet singleton
    iconSetService.icons = { ...iconSubset };
    // interceptor emits synchronously inside change detection; defer a tick (NG0100)
    this.loaderService.isLoading.pipe(delay(0)).subscribe((v: boolean) => {
      this.loading = v;
    });
    this.loaderService.value.subscribe((v: any) => {
      this.value = v;
    });
  }

  ngOnInit(): void {
    this.router.events.subscribe((evt) => {
      if (!(evt instanceof NavigationEnd)) {
        return;
      }
    });
  }
}
