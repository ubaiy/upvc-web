import { Directive, OnDestroy, OnInit } from '@angular/core';

import { LoaderService } from '../../services/loader.service';

/**
 * Put on the skeleton a screen draws for itself while it opens:
 *
 *   <div class="dz-loading" *ngIf="!ready" appOwnLoading> … </div>
 *
 * While the element is on screen the app's ring and bar stay hidden, so there is one loading sign and
 * not two. For a single request `quiet('loader')` does the same; this is for a screen whose opening
 * requests are made in several places.
 */
@Directive({ selector: '[appOwnLoading]' })
export class OwnLoadingDirective implements OnInit, OnDestroy {
  constructor(private loader: LoaderService) {}

  ngOnInit(): void {
    this.loader.hush(1);
  }

  ngOnDestroy(): void {
    this.loader.hush(-1);
  }
}
