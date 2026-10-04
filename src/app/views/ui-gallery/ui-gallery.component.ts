import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MenuItem } from 'primeng/api';

import { ICON_NAMES } from '../../shared/components/icon/icon-paths';
import { Crumb } from '../../shared/components/page-header/page-header.component';
import { QuoteStatus } from '../../shared/components/quote-status/quote-status.component';
import { TotalsLine } from '../../shared/components/totals/totals.component';
import { SAMPLE_WINDOWS } from '../../shared/components/window-thumb/window-drawing';
import { ToastService } from '../../shared/services/toast.service';

interface SampleQuote {
  name: string;
  customer: string;
  status: QuoteStatus;
  total: number;
  date: string;
}

/**
 * /ui: every token, class, shared component and themed PrimeNG control on one
 * page. It is the acceptance surface for the design system: compare it with
 * docs/product/ux/mockups/components.html in light, dark and right-to-left.
 * Sample data only; nothing here talks to the API.
 */
@Component({
  selector: 'app-ui-gallery',
  templateUrl: './ui-gallery.component.html',
  styleUrls: ['./ui-gallery.component.scss'],
})
export class UiGalleryComponent implements OnInit, OnDestroy {
  readonly swatches = [
    'bg', 'surface', 'surface-2', 'border-strong', 'text-2', 'text',
    'accent', 'accent-soft', 'success', 'warning', 'danger', 'info',
  ];
  readonly iconNames = ICON_NAMES;
  readonly windows = Object.entries(SAMPLE_WINDOWS).map(([name, spec]) => ({ name, spec }));
  readonly bigWindow = SAMPLE_WINDOWS['mixed3'];
  readonly statuses: QuoteStatus[] = ['draft', 'sent', 'accepted', 'billed', 'declined'];

  readonly crumbs: Crumb[] = [{ label: 'Quotations', link: '/quotation' }, { label: 'Q-0014' }];
  readonly totals: TotalsLine[] = [
    { label: 'Subtotal', amount: 25039.21 },
    { label: 'CGST 9%', amount: 2253.53 },
    { label: 'SGST 9%', amount: 2253.53 },
  ];

  readonly quotes: SampleQuote[] = [
    { name: 'Sharma Flat Renovation', customer: 'Sharma Residency', status: 'billed', total: 14159.58, date: '2 Oct' },
    { name: 'Mehta Villa Windows', customer: 'Amit Mehta', status: 'sent', total: 29546.27, date: '28 Sep' },
    { name: 'Modern Homes, Block C', customer: 'Modern Homes LLP', status: 'accepted', total: 16660.41, date: '27 Sep' },
    { name: 'Kulkarni Bungalow', customer: 'S. Kulkarni', status: 'draft', total: 9813.29, date: '25 Sep' },
    { name: 'Patel Shop Front', customer: 'Patel Traders', status: 'declined', total: 141595.8, date: '19 Sep' },
    { name: 'Desai Balcony Doors', customer: 'R. Desai', status: 'draft', total: 38420, date: '12 Sep' },
  ];

  readonly glassOptions = [
    { label: '5 mm plain glass', value: 'plain5' },
    { label: '6 mm toughened glass', value: 'tough6' },
    { label: '5 mm frosted glass', value: 'frost5' },
    { label: '20 mm double glazed unit', value: 'dgu20' },
  ];
  readonly openingOptions = [
    { label: 'Fixed', value: 'fixed' },
    { label: 'Opens', value: 'opens' },
    { label: 'Slides', value: 'slides' },
  ];
  readonly tabItems: MenuItem[] = [{ label: 'All' }, { label: 'Draft' }, { label: 'Sent' }, { label: 'Accepted' }, { label: 'Billed' }];
  readonly rowMenu: MenuItem[] = [
    { label: 'Duplicate', icon: 'pi pi-copy' },
    { label: 'Download PDF', icon: 'pi pi-download' },
    { separator: true },
    { label: 'Delete', icon: 'pi pi-trash', styleClass: 'danger' },
  ];

  customer = 'Amit Mehta';
  glass = 'plain5';
  width = 2200;
  flyMesh = true;
  opening = 'opens';
  segment = 'opens';
  activeTab = this.tabItems[0];
  dialogOpen = false;

  theme: 'light' | 'dark' = 'light';
  dir: 'ltr' | 'rtl' = 'ltr';

  /** What the page was showing before /ui changed it, restored on leave. */
  private previous: { theme: string | null; dir: string | null };

  constructor(private route: ActivatedRoute, private toast: ToastService) {}

  ngOnInit(): void {
    const root = document.documentElement;
    this.previous = { theme: root.getAttribute('data-theme'), dir: root.getAttribute('dir') };
    // Same switches as the mockups: /ui?theme=dark and /ui?dir=rtl
    const query = this.route.snapshot.queryParamMap;
    this.setTheme(query.get('theme') === 'dark' ? 'dark' : 'light');
    this.setDir(query.get('dir') === 'rtl' ? 'rtl' : 'ltr');
  }

  ngOnDestroy(): void {
    const root = document.documentElement;
    this.restore(root, 'data-theme', this.previous.theme);
    this.restore(root, 'dir', this.previous.dir);
  }

  setTheme(theme: 'light' | 'dark'): void {
    this.theme = theme;
    this.restore(document.documentElement, 'data-theme', theme === 'dark' ? 'dark' : null);
  }

  setDir(dir: 'ltr' | 'rtl'): void {
    this.dir = dir;
    this.restore(document.documentElement, 'dir', dir === 'rtl' ? 'rtl' : null);
  }

  reset(): void {
    this.setTheme('light');
    this.setDir('ltr');
  }

  showToast(kind: 'success' | 'error'): void {
    kind === 'success'
      ? this.toast.showSuccess('Quotation copied.')
      : this.toast.showError('We could not save the window. Try again.');
  }

  private restore(element: HTMLElement, attribute: string, value: string | null): void {
    value === null ? element.removeAttribute(attribute) : element.setAttribute(attribute, value);
  }
}
