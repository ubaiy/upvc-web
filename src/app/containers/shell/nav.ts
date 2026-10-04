import { IconName } from '../../shared/components/icon/icon-paths';

export interface NavTab {
  label: string;
  link: string;
  /** Path prefixes that light this tab up. Defaults to `link`. */
  match?: string[];
}

export interface NavItem {
  id: string;
  label: string;
  icon: IconName;
  link: string;
  /** Path prefixes that belong to this item, matched on whole path segments. */
  match: string[];
  /** Sits at the foot of the sidebar instead of the main list. */
  foot?: boolean;
  /**
   * Section tabs the shell draws above the page.
   *
   * Interim: Catalogue and Settings are each one page with tabs in the new
   * design (cards U5 and U7). Until those cards land, the tabs link to the old
   * separate screens, so every one of them stays reachable from six menu items.
   * U5 and U7 remove `tabs` from their item when their page draws its own.
   */
  tabs?: NavTab[];
}

/** The whole menu: six items. Spec: docs/product/ux/design-system.md §1. */
export const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', icon: 'home', link: '/dashboard', match: ['/dashboard'] },
  { id: 'quotations', label: 'Quotations', icon: 'file', link: '/quotation', match: ['/quotation'] },
  { id: 'customers', label: 'Customers', icon: 'users', link: '/customers', match: ['/customers'] },
  { id: 'bills', label: 'Bills', icon: 'receipt', link: '/bills', match: ['/bills'] },
  {
    id: 'catalogue',
    label: 'Catalogue',
    icon: 'box',
    link: '/catalogue',
    match: ['/catalogue', '/masters', '/bulk-price-update'],
    tabs: [
      { label: 'Profiles', link: '/masters/profile' },
      { label: 'Colours', link: '/masters/profile-color' },
      { label: 'Glass', link: '/masters/glass', match: ['/masters/glass', '/masters/Glazzing'] },
      { label: 'Hardware', link: '/masters/hardware', match: ['/masters/hardware', '/masters/Hardware'] },
      { label: 'Update rates', link: '/bulk-price-update' },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: 'settings',
    link: '/settings',
    match: ['/settings', '/profile', '/type-margin', '/payment-terms', '/area', '/crm'],
    foot: true,
    tabs: [
      { label: 'Company', link: '/profile' },
      { label: 'Margins', link: '/type-margin' },
      { label: 'Payment terms', link: '/payment-terms' },
      { label: 'Areas', link: '/area' },
      { label: 'Document header', link: '/crm/header' },
      { label: 'Document footer', link: '/crm/footer' },
    ],
  },
];

/** True when `url` is `prefix` or sits below it. `/masters/profile` does not match `/masters/profile-color`. */
export function pathMatches(url: string, prefix: string): boolean {
  const path = url.split(/[?#]/)[0];
  return path === prefix || path.startsWith(prefix + '/');
}

export function findNavItem(url: string, items: NavItem[] = NAV_ITEMS): NavItem | undefined {
  return items.find((item) => item.match.some((prefix) => pathMatches(url, prefix)));
}

export function findNavTab(url: string, item: NavItem | undefined): NavTab | undefined {
  return item?.tabs?.find((tab) => (tab.match ?? [tab.link]).some((prefix) => pathMatches(url, prefix)));
}
