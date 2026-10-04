import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject } from 'rxjs';

import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { imageProblem, maxImageBytes } from './image-rules';
import { ProfileComponent, SETTINGS_TABS } from './profile.component';

@Component({ standalone: true, template: '<p class="stub">stub</p>' })
class StubTabComponent {}

describe('ProfileComponent (Settings page)', () => {
  let fixture: ComponentFixture<ProfileComponent>;
  let params: BehaviorSubject<any>;

  const text = (selector: string) =>
    Array.from(fixture.nativeElement.querySelectorAll(selector) as NodeListOf<HTMLElement>).map((el) => (el.textContent ?? '').trim());

  beforeEach(async () => {
    params = new BehaviorSubject(convertToParamMap({}));
    await TestBed.configureTestingModule({
      declarations: [ProfileComponent],
      imports: [RouterTestingModule, SharedComponentsModule],
      providers: [{ provide: ActivatedRoute, useValue: { queryParamMap: params } }],
    }).compileComponents();
    fixture = TestBed.createComponent(ProfileComponent);
    // The real tabs load data; the page itself is under test here.
    (fixture.componentInstance as any).tabs = SETTINGS_TABS.map((tab) => ({ ...tab, component: StubTabComponent }));
    fixture.componentInstance.active = fixture.componentInstance.tabs[0];
    fixture.detectChanges();
  });

  it('is one page called Settings with the five sections', () => {
    expect(text('h1')).toEqual(['Settings']);
    expect(text('[role=tab]')).toEqual(['Company', 'Team', 'Pricing and tax', 'Documents', 'Your profile']);
  });

  it('opens on Company and marks it selected', () => {
    expect(text('[role=tab][aria-selected=true]')).toEqual(['Company']);
    expect(fixture.nativeElement.querySelector('[role=tabpanel]').getAttribute('aria-labelledby')).toBe('settings-tab-company');
    expect(text('.stub')).toEqual(['stub']);
  });

  it('follows the tab query parameter', () => {
    params.next(convertToParamMap({ tab: 'pricing' }));
    fixture.detectChanges();
    expect(text('[role=tab][aria-selected=true]')).toEqual(['Pricing and tax']);
  });

  it('falls back to Company for an unknown tab', () => {
    params.next(convertToParamMap({ tab: 'nope' }));
    fixture.detectChanges();
    expect(text('[role=tab][aria-selected=true]')).toEqual(['Company']);
  });

  it('gives every tab its own address', () => {
    const hrefs = Array.from(fixture.nativeElement.querySelectorAll('[role=tab]') as NodeListOf<HTMLAnchorElement>).map((a) =>
      a.getAttribute('href')
    );
    expect(hrefs).toEqual(SETTINGS_TABS.map((tab) => `/profile?tab=${tab.id}`));
  });
});

describe('imageProblem', () => {
  it('accepts raster images up to 2 MB and refuses the rest', () => {
    expect(imageProblem({ type: 'image/png', size: 1000 })).toBeNull();
    expect(imageProblem({ type: 'image/svg+xml', size: 1000 })).toContain('JPEG, PNG or WebP');
    expect(imageProblem({ type: 'image/jpeg', size: maxImageBytes + 1 })).toContain('2 MB');
  });
});
