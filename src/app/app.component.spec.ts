import { NO_ERRORS_SCHEMA } from '@angular/core';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { IconSetService } from '@coreui/icons-angular';

import { AppComponent } from './app.component';
import { LoaderService } from './shared/services/loader.service';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      declarations: [AppComponent],
      providers: [IconSetService],
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
    const spinner = () => fixture.nativeElement.querySelector('p-progressSpinner') as HTMLElement;
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
});
