import { IconName } from '../../shared/components/icon/icon-paths';

export interface NavPlace {
  label: string;
  /** Address, with its query string: `/profile?tab=pricing`. */
  link: string;
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
   * Places inside the item that the page finder (Ctrl K) offers by name.
   * Catalogue and Settings are one page each; these are their tabs.
   */
  places?: NavPlace[];
}

/** "Your profile" in the account menu: the last tab of Settings. */
export const PROFILE_LINK = '/profile?tab=you';

/**
 * The whole menu. Six items in docs/product/ux/design-system.md §1; Orders and
 * Outstanding were added with the order and payment screens (card T75).
 */
export const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', icon: 'home', link: '/dashboard', match: ['/dashboard'] },
  // A quotation's production documents (/production/:id) are part of the quotation.
  { id: 'quotations', label: 'Quotations', icon: 'file', link: '/quotation', match: ['/quotation', '/production'] },
  { id: 'orders', label: 'Orders', icon: 'layers', link: '/orders', match: ['/orders'] },
  { id: 'customers', label: 'Customers', icon: 'users', link: '/customers', match: ['/customers'] },
  // The saved domes, cabins, bays and roofs, and the 3D designer they open in (card T114).
  { id: 'bills', label: 'Bills', icon: 'receipt', link: '/bills', match: ['/bills'] },
  { id: 'outstanding', label: 'Outstanding', icon: 'rupee', link: '/payments/outstanding', match: ['/payments'] },
  {
    id: 'catalogue',
    label: 'Catalogue',
    icon: 'box',
    link: '/catalogue',
    match: ['/catalogue', '/masters', '/bulk-price-update'],
    places: [
      { label: 'Profiles', link: '/masters/profile' },
      { label: 'Colours', link: '/masters/profile-color' },
      { label: 'Glass', link: '/masters/glass' },
      { label: 'Hardware', link: '/masters/hardware' },
      { label: 'Price file', link: '/bulk-price-update' },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: 'settings',
    link: '/settings',
    match: ['/settings', '/profile', '/type-margin', '/payment-terms', '/area', '/crm'],
    foot: true,
    places: [
      { label: 'Company', link: '/profile?tab=company' },
      { label: 'Team', link: '/profile?tab=team' },
      { label: 'Pricing and tax', link: '/profile?tab=pricing' },
      { label: 'Documents', link: '/profile?tab=documents' },
      { label: 'Your profile', link: PROFILE_LINK },
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
