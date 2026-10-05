import { NO_ERRORS_SCHEMA } from '@angular/core';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { IconSetService } from '@coreui/icons-angular';

import { AppComponent } from './app.component';
import { BehaviorSubject } from 'rxjs';

import { LoaderService } from './shared/services/loader.service';
import { RouteLoadingService, RouteLoadingState } from './shared/services/route-loading.service';

describe('AppComponent', () => {
  let routeLoading: { state$: BehaviorSubject<RouteLoadingState>; busy: boolean };

  beforeEach(async () => {
    routeLoading = { state$: new BehaviorSubject<RouteLoadingState>('none'), busy: false };
    await TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      declarations: [AppComponent],
      providers: [IconSetService, { provide: RouteLoadingService, useValue: routeLoading }],
      // The PrimeNG outlets are not under test here.
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
  });

  it('holds the app\'s one toast outlet, confirm dialog, undo toast and router outlet', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    for (const tag of ['p-toast', 'p-confirmDialog', 'app-undo-toast', 'router-outlet']) {
      expect(root.querySelectorAll(tag).length).withContext(tag).toBe(1);
    }
    expect(root.querySelector('p-toast')?.getAttribute('position')).toBe('bottom-center');
  });

  it('shows the loading overlay only while a request is open', fakeAsync(() => {
    const fixture = TestBed.createComponent(AppComponent);
    const loader = TestBed.inject(LoaderService);
    const spinner = () => fixture.nativeElement.querySelector('.app-loader') as HTMLElement;
    fixture.detectChanges();
    tick();
    fixture.detectChanges();
    expect(spinner().hidden).toBeTrue();

    loader.isLoading.next(true);
    tick();
    fixture.detectChanges();
    expect(spinner().hidden).toBeFalse();

    loader.isLoading.next(false);
    tick();
    fixture.detectChanges();
    expect(spinner().hidden).toBeTrue();
  }));

  it('one loading sign at a time: no ring while a screen shows its own skeleton or a route is waited for (card T138)', fakeAsync(() => {
    const fixture = TestBed.createComponent(AppComponent);
    const loader = TestBed.inject(LoaderService);
    const spinner = () => fixture.nativeElement.querySelector('.app-loader') as HTMLElement;
    const settle = () => {
      tick();
      fixture.detectChanges();
    };
    fixture.detectChanges();
    loader.isLoading.next(true);
    settle();
    expect(spinner().hidden).toBeFalse();

    loader.hush(1);
    settle();
    expect(spinner().hidden).withContext('own skeleton on screen').toBeTrue();
    loader.hush(-1);
    settle();
    expect(spinner().hidden).toBeFalse();

    routeLoading.busy = true;
    settle();
    expect(spinner().hidden).withContext('route skeleton').toBeTrue();
  }));

  it('draws the outline of the shell, and not the screen being left, until the first screen is known (card T138)', fakeAsync(() => {
    const fixture = TestBed.createComponent(AppComponent);
    const root: HTMLElement = fixture.nativeElement;
    const outlet = () => (root.querySelector('router-outlet') as HTMLElement).parentElement as HTMLElement;
    fixture.detectChanges();
    tick();
    fixture.detectChanges();
    expect(root.querySelector('app-boot-skeleton')).toBeNull();
    expect(outlet().style.display).toBe('contents');

    routeLoading.state$.next('boot');
    tick();
    fixture.detectChanges();
    expect(root.querySelector('app-boot-skeleton')).not.toBeNull();
    expect(outlet().style.display).toBe('none');

    routeLoading.state$.next('none');
    tick();
    fixture.detectChanges();
    expect(root.querySelector('app-boot-skeleton')).toBeNull();
    expect(outlet().style.display).toBe('contents');
  }));
});
