import { Component } from '@angular/core';
import { fakeAsync, flush, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';

import { OLD_ADDRESSES } from './old-addresses';

@Component({ template: '' })
class BlankComponent {}

describe('addresses of the removed old screens (card T138)', () => {
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [BlankComponent],
      imports: [
        RouterTestingModule.withRoutes([
          { path: 'profile', component: BlankComponent },
          ...OLD_ADDRESSES,
          { path: '**', component: BlankComponent, data: { notFound: true } },
        ]),
      ],
    });
    router = TestBed.inject(Router);
  });

  const cases: [string, string][] = [
    ['/crm', '/profile?tab=documents'],
    ['/crm/header', '/profile?tab=documents'],
    ['/crm/header/add', '/profile?tab=documents'],
    ['/crm/header/edit/3', '/profile?tab=documents'],
    ['/crm/footer', '/profile?tab=documents'],
    ['/crm/footer/edit/7', '/profile?tab=documents'],
    ['/area', '/profile'],
    ['/area/anything', '/profile'],
  ];

  for (const [from, to] of cases) {
    it(from + ' leads to ' + to, fakeAsync(() => {
      router.navigateByUrl(from);
      flush();
      expect(router.url).toBe(to);
    }));
  }

  it('leaves other addresses alone', fakeAsync(() => {
    router.navigateByUrl('/areas');
    flush();
    expect(router.url).toBe('/areas');
  }));
});
