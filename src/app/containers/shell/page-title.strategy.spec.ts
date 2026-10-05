import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, TitleStrategy } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject } from 'rxjs';

import { SharedComponentsModule } from '../../shared/components/shared-components.module';
import { PRODUCT_NAME, documentTitle } from '../../shared/configs/product';
import { AuthService } from '../../shared/services/auth.service';
import { LocalStoreService } from '../../shared/services/local-storage.service';
import { CommandPaletteComponent } from './command-palette.component';
import { PageTitleStrategy } from './page-title.strategy';
import { ShellComponent } from './shell.component';
import { WorkspaceService } from './workspace.service';

@Component({ template: '' })
class BlankComponent {}

describe('browser tab title', () => {
  let router: Router;
  let title: Title;
  const workspace$ = new BehaviorSubject({ name: '' });

  beforeEach(async () => {
    workspace$.next({ name: '' });
    await TestBed.configureTestingModule({
      declarations: [ShellComponent, CommandPaletteComponent, BlankComponent],
      imports: [
        SharedComponentsModule,
        RouterTestingModule.withRoutes([
          {
            path: '',
            component: ShellComponent,
            children: [
              { path: 'quotation', component: BlankComponent },
              { path: 'masters/profile', component: BlankComponent, title: 'Catalogue' },
              { path: 'customers/add', component: BlankComponent, data: { title: 'New customer' } },
            ],
          },
          { path: 'auth/login', component: BlankComponent, title: 'Sign in' },
          { path: 'ui', component: BlankComponent },
        ]),
      ],
      providers: [
        { provide: TitleStrategy, useExisting: PageTitleStrategy },
        { provide: AuthService, useValue: { user$: new BehaviorSubject({ name: 'Husain' }), USER: 'User' } },
        { provide: WorkspaceService, useValue: { workspace$, load: () => undefined } },
        { provide: LocalStoreService, useValue: { getItem: () => null } },
      ],
    }).compileComponents();
    router = TestBed.inject(Router);
    title = TestBed.inject(Title);
  });

  it('writes the product name in one place', () => {
    expect(documentTitle()).toBe(PRODUCT_NAME);
    expect(documentTitle('Sign in')).toBe(`Sign in · ${PRODUCT_NAME}`);
    expect(documentTitle('Bills', 'Hakimi Enterprise')).toBe('Bills · Hakimi Enterprise');
    expect(documentTitle('Bills', '  ')).toBe(`Bills · ${PRODUCT_NAME}`);
  });

  it('inside the shell: the page, then the company, which may arrive late', async () => {
    await router.navigateByUrl('/quotation');
    expect(title.getTitle()).withContext('menu label, company not loaded yet').toBe('Quotations · ' + PRODUCT_NAME);

    workspace$.next({ name: 'Hakimi Enterprise' });
    expect(title.getTitle()).toBe('Quotations · Hakimi Enterprise');

    await router.navigateByUrl('/masters/profile');
    expect(title.getTitle()).withContext('route title').toBe('Catalogue · Hakimi Enterprise');

    await router.navigateByUrl('/customers/add');
    expect(title.getTitle()).withContext('data.title of an older route').toBe('New customer · Hakimi Enterprise');
  });

  it('outside the shell: the page, then the product, never the company', async () => {
    workspace$.next({ name: 'Hakimi Enterprise' });
    await router.navigateByUrl('/auth/login');
    expect(title.getTitle()).toBe('Sign in · ' + PRODUCT_NAME);

    await router.navigateByUrl('/ui');
    expect(title.getTitle()).withContext('no title on the route').toBe(PRODUCT_NAME);
  });
});
