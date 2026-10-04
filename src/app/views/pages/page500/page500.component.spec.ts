import { Location } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { RouterTestingModule } from '@angular/router/testing';

import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { Page500Component } from './page500.component';

describe('Page500Component', () => {
  let fixture: ComponentFixture<Page500Component>;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [Page500Component],
      imports: [RouterTestingModule, SharedComponentsModule],
    }).compileComponents();
    fixture = TestBed.createComponent(Page500Component);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('says the fault is ours and sets the tab title', () => {
    expect(el.querySelector('h1')!.textContent).toBe('Something went wrong on our side');
    expect(TestBed.inject(Title).getTitle()).toBe('Something went wrong · UPVC');
  });

  it('has one primary button, "Try again", which returns to the page that failed', () => {
    const back = spyOn(TestBed.inject(Location), 'back');
    const primary = el.querySelectorAll('.btn-primary');
    expect(primary.length).toBe(1);
    expect(primary[0].textContent).toContain('Try again');
    (primary[0] as HTMLButtonElement).click();
    expect(back).toHaveBeenCalled();
  });

  it('offers a way Home', () => {
    expect(el.querySelector('a.btn-secondary')!.getAttribute('href')).toBe('/');
  });
});
