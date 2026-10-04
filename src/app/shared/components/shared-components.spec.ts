import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';

import { ICON_NAMES } from './icon/icon-paths';
import { SharedComponentsModule } from './shared-components.module';
import { drawWindow, SAMPLE_WINDOWS } from './window-thumb/window-drawing';

@Component({
  template: `
    <app-page-header id="old" eyebrow="Sales" title="Customers" subtitle="All customers" [sticky]="true">
      <button actions type="button">Add New</button>
    </app-page-header>
    <app-page-header id="new" title="Mehta Villa Windows" [crumbs]="[{ label: 'Quotations', link: '/quotation' }, { label: 'Q-0014' }]"></app-page-header>
    <app-quote-status id="badge" [status]="status"></app-quote-status>
    <app-quote-status id="steps" [status]="status" variant="steps"></app-quote-status>
    <app-totals [lines]="[{ label: 'Subtotal', amount: 25039.21 }, { label: 'CGST 9%', amount: 2253.53 }]" [total]="141595.8"></app-totals>
    <app-stat label="Quoted this month" [value]="157402.17 | inr : 0" detail="8 quotations"></app-stat>
    <app-empty-state title="No quotations yet" text="Draw your first window."><button type="button">New quotation</button></app-empty-state>
    <app-callout tone="warn">Could not load.<button action type="button">Try again</button></app-callout>
    <app-window-thumb [spec]="spec" label="Two-sash casement window"></app-window-thumb>
    <app-icon id="known" name="plus"></app-icon>
  `,
})
class HostComponent {
  status = 'sent';
  spec = SAMPLE_WINDOWS['casement2'];
}

describe('shared components', () => {
  let fixture: ComponentFixture<HostComponent>;
  const el = (selector: string): HTMLElement => fixture.nativeElement.querySelector(selector);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [HostComponent],
      imports: [SharedComponentsModule, RouterTestingModule],
    }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('page header keeps the API the old screens use', () => {
    expect(el('#old h1').textContent).toBe('Customers');
    expect(el('#old .sub').textContent).toBe('All customers');
    expect(el('#old .page-actions button').textContent).toBe('Add New');
    expect(el('#old').textContent).not.toContain('Sales');
    expect(el('#old .crumbs')).toBeNull();
  });

  it('page header draws a breadcrumb with the current page last', () => {
    expect(el('#new .crumbs a').textContent).toBe('Quotations');
    expect(el('#new .crumbs [aria-current="page"]').textContent).toBe('Q-0014');
  });

  it('quote status shows a badge or the four steps', () => {
    expect(el('#badge .badge').textContent?.trim()).toBe('Sent');
    expect(el('#badge .badge').classList).toContain('badge-info');
    const steps = [...fixture.nativeElement.querySelectorAll('#steps .step')];
    expect(steps.length).toBe(4);
    expect(steps[0].classList).toContain('done');
    expect(steps[1].classList).toContain('now');
    expect(steps[1].getAttribute('aria-current')).toBe('step');
  });

  it('quote status treats an unknown status as draft and declined as a badge', () => {
    fixture.componentInstance.status = 'something-new';
    fixture.detectChanges();
    expect(el('#badge .badge').textContent?.trim()).toBe('Draft');
    fixture.componentInstance.status = 'declined';
    fixture.detectChanges();
    expect(el('#steps .steps')).toBeNull();
    expect(el('#steps .badge').classList).toContain('badge-danger');
  });

  it('totals format every amount in rupees with Indian grouping', () => {
    const cells = [...fixture.nativeElement.querySelectorAll('app-totals dd')].map((dd: Element) => dd.textContent);
    expect(cells).toEqual(['₹25,039.21', '₹2,253.53', '₹1,41,595.80']);
  });

  it('stat, empty state and callout render their content', () => {
    expect(el('app-stat .v').textContent).toBe('₹1,57,402');
    expect(el('app-empty-state h2').textContent).toBe('No quotations yet');
    expect(el('app-empty-state button').textContent).toBe('New quotation');
    expect(el('app-callout .callout').getAttribute('role')).toBe('alert');
    expect(el('app-callout button').textContent).toBe('Try again');
  });

  it('icon draws an svg hidden from screen readers', () => {
    const svg = el('#known svg');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelectorAll('path').length).toBeGreaterThan(0);
    expect(ICON_NAMES.length).toBeGreaterThan(50);
  });

  it('window thumbnail draws one glass pane per sash and names the drawing', () => {
    const svg = el('app-window-thumb svg');
    expect(svg.getAttribute('aria-label')).toBe('Two-sash casement window');
    expect(svg.querySelectorAll('rect[style*="url(#"]').length).toBe(2);
  });

  it('window drawing never lets spec text into the markup', () => {
    const hostile: any = { w: '"><script>x</script>', h: 1200, cols: [{ f: 'abc', t: '<b>' }] };
    const svg = drawWindow(hostile, 'g"><x', { width: 56, height: 44 });
    expect(svg).not.toContain('script');
    expect(svg).not.toContain('<b>');
    expect(svg).not.toContain('"><x');
  });
});
