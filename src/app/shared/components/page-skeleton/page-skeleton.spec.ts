import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { LoaderService } from '../../services/loader.service';
import { SharedComponentsModule } from '../shared-components.module';

@Component({
  template: `
    <div class="own" *ngIf="opening" appOwnLoading><span class="skeleton"></span></div>
    <div class="second" *ngIf="second" appOwnLoading></div>
    <app-page-skeleton *ngIf="page"></app-page-skeleton>
    <app-boot-skeleton *ngIf="boot"></app-boot-skeleton>
  `,
})
class HostComponent {
  opening = false;
  second = false;
  page = false;
  boot = false;
}

describe('loading, one way (card T138)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ declarations: [HostComponent], imports: [SharedComponentsModule] });
  });

  it('appOwnLoading: the app loader is hushed while a screen shows its own skeleton, and only then', () => {
    const fixture = TestBed.createComponent(HostComponent);
    const loader = TestBed.inject(LoaderService);
    fixture.detectChanges();
    expect(loader.hushed.value).toBeFalse();

    fixture.componentInstance.opening = true;
    fixture.componentInstance.second = true;
    fixture.detectChanges();
    expect(loader.hushed.value).toBeTrue();

    fixture.componentInstance.opening = false;
    fixture.detectChanges();
    expect(loader.hushed.value).withContext('another skeleton is still on screen').toBeTrue();

    fixture.componentInstance.second = false;
    fixture.detectChanges();
    expect(loader.hushed.value).toBeFalse();
  });

  it('page skeleton: rows of skeleton lines hidden from a screen reader, and one status line for it', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.page = true;
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelectorAll('app-page-skeleton .psk-row .skeleton').length).toBe(6);
    expect(root.querySelector('.psk')?.getAttribute('aria-hidden')).toBe('true');
    const status = root.querySelectorAll('[role="status"]');
    expect(status.length).toBe(1);
    expect(status[0].textContent?.trim()).toBe('Loading the page');
    expect(root.textContent).not.toContain('Loading...');
  });

  it('boot skeleton: the outline of the shell with a page skeleton in it, no text on screen', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.boot = true;
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('.bsk-side')).not.toBeNull();
    expect(root.querySelector('.bsk-bar')).not.toBeNull();
    expect(root.querySelectorAll('.bsk-main .page app-page-skeleton').length).toBe(1);
    const status = root.querySelectorAll('[role="status"]');
    expect(status.length).toBe(1);
    expect(status[0].classList.contains('sr-only')).toBeTrue();
    expect(status[0].textContent?.trim()).toBe('Opening the app');
  });
});
