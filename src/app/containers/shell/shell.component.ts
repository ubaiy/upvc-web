import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

import { IUserDto } from '../../shared/model/user.model';
import { AuthService } from '../../shared/services/auth.service';
import { LocalStoreService } from '../../shared/services/local-storage.service';
import { PRODUCT_NAME } from '../../shared/configs/product';
import { findNavItem, NAV_ITEMS, NavItem } from './nav';
import { WorkspaceService } from './workspace.service';

/** The old window designer needs the full width. Card D1 replaces it with a full-screen designer. */
/** How many menu items the phone's bottom bar shows before "More". */
const BAR_ITEMS = 4;

const WIDE_PAGES = /^\/quotation\/detail\/[^/]+\/(add|edit|super-system)(\/|$)/;

/**
 * The app shell: a light sidebar with the six menu items and the routed screen
 * beside it. At 1024 px and below the sidebar becomes an icon rail, and at
 * 640 px and below a bottom bar with four items and "More".
 * Spec: docs/product/ux/design-system.md §3, mockups/dashboard.html.
 */
@Component({
  selector: 'app-shell',
  templateUrl: './shell.component.html',
  styleUrls: ['./shell.component.scss'],
})
export class ShellComponent implements OnInit, OnDestroy {
  readonly mainItems = NAV_ITEMS.filter((item) => !item.foot);
  readonly footItems = NAV_ITEMS.filter((item) => item.foot);

  /** Phone: the first four items sit in the bottom bar, the rest under "More". */
  readonly barItems = NAV_ITEMS.slice(0, BAR_ITEMS);
  readonly moreItems = NAV_ITEMS.slice(BAR_ITEMS);

  company = '';
  userName = '';
  initials = '';

  active?: NavItem;
  wide = false;

  accountOpen = false;
  paletteOpen = false;
  moreOpen = false;

  @ViewChild('account') private account?: ElementRef<HTMLElement>;
  @ViewChild('searchButton') private searchButton?: ElementRef<HTMLElement>;
  @ViewChild('main') private main?: ElementRef<HTMLElement>;

  private subscriptions = new Subscription();

  constructor(
    private router: Router,
    private auth: AuthService,
    private store: LocalStoreService,
    private workspace: WorkspaceService
  ) {}

  ngOnInit(): void {
    this.subscriptions.add(
      this.workspace.workspace$.subscribe((workspace) => (this.company = workspace.name))
    );
    this.workspace.load();

    this.subscriptions.add(
      // After a page reload the service is empty until the next sign-in; the stored user fills the gap.
      this.auth.user$.subscribe((user) => this.setUser(user?.name ? user : this.store.getItem(this.auth.USER)))
    );

    this.setUrl(this.router.url);
    this.subscriptions.add(
      this.router.events
        .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
        .subscribe((event) => {
          this.setUrl(event.urlAfterRedirects);
          this.accountOpen = false;
          this.paletteOpen = false;
          this.moreOpen = false;
        })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  get companyName(): string {
    return this.company || PRODUCT_NAME;
  }

  isActive(item: NavItem): boolean {
    return this.active === item;
  }

  /** The open page is one of those under "More". */
  get moreActive(): boolean {
    return !!this.active && this.moreItems.includes(this.active);
  }

  toggleMore(): void {
    this.moreOpen = !this.moreOpen;
  }

  toggleAccount(): void {
    this.accountOpen = !this.accountOpen;
  }

  signOut(): void {
    this.accountOpen = false;
    this.moreOpen = false;
    this.auth.logout();
  }

  openPalette(): void {
    this.accountOpen = false;
    this.moreOpen = false;
    this.paletteOpen = true;
  }

  closePalette(): void {
    if (this.paletteOpen) {
      this.paletteOpen = false;
      // On a phone the sidebar and its search box are not drawn; focus() then does nothing.
      this.searchButton?.nativeElement.focus();
    }
  }

  skipToContent(event: Event): void {
    event.preventDefault();
    this.main?.nativeElement.focus();
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.paletteOpen ? this.closePalette() : this.openPalette();
    } else if (event.key === 'Escape') {
      this.accountOpen = false;
      this.moreOpen = false;
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.accountOpen && !this.account?.nativeElement.contains(event.target as Node)) {
      this.accountOpen = false;
    }
  }

  private setUrl(url: string): void {
    this.active = findNavItem(url);
    this.wide = WIDE_PAGES.test(url.split(/[?#]/)[0]);
  }

  private setUser(user: Partial<IUserDto> | null | undefined): void {
    const first = (user?.name ?? '').trim();
    const last = (user?.last_name ?? '').trim();
    this.userName = [first, last].filter(Boolean).join(' ') || 'Account';
    this.initials = ((first[0] ?? '') + (last[0] ?? first[1] ?? '')).toUpperCase() || '?';
  }
}
