//loader.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class LoaderService {
  public isLoading = new BehaviorSubject(false);
  public value: any = new BehaviorSubject(0);
  /** True while a screen shows its own skeleton (appOwnLoading): the app's ring and bar stay hidden. */
  public hushed = new BehaviorSubject(false);

  private hushCount = 0;

  constructor() {}

  /** +1 when a screen's own skeleton appears, -1 when it goes. */
  hush(change: 1 | -1): void {
    this.hushCount = Math.max(0, this.hushCount + change);
    this.hushed.next(this.hushCount > 0);
  }
}
