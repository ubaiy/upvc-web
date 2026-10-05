import { Location } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { RouterTestingModule } from '@angular/router/testing';

import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { Page404Component } from './page404.component';

describe('Page404Component', () => {
  let fixture: ComponentFixture<Page404Component>;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [Page404Component],
      imports: [RouterTestingModule, SharedComponentsModule],
    }).compileComponents();
    fixture = TestBed.createComponent(Page404Component);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('says the page was not found and sets the tab title', () => {
    expect(el.querySelector('h1')!.textContent).toBe('We could not find that page');
    expect(TestBed.inject(Title).getTitle()).toBe('Page not found · UPVC');
  });

  it('has one primary button, to Home', () => {
    const primary = el.querySelectorAll('.btn-primary');
    expect(primary.length).toBe(1);
    expect(primary[0].textContent).toContain('Go to Home');
    expect(primary[0].getAttribute('href')).toBe('/');
  });

  it('"Go back" returns to the previous page', () => {
    const back = spyOn(TestBed.inject(Location), 'back');
    (el.querySelector('button.btn-secondary') as HTMLButtonElement).click();
    expect(back).toHaveBeenCalled();
  });
});
