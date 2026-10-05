import { IconName } from '../../shared/components/icon/icon-paths';

export interface NavPlace {
  label: string;
  /** Address, with its query string: `/profile?tab=pricing`. */
  link: string;
  /** The ability of GET me the place needs; none: every signed-in user. */
  ability?: string;
}

export interface NavItem {
  id: string;
  label: string;
  icon: IconName;
  link: string;
  /** Path prefixes that belong to this item, matched on whole path segments. */
  match: string[];
  /** The ability of GET me the item needs (card T117); none: every signed-in user. Never a role name. */
  ability?: string;
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
  { id: 'home', label: 'Home', icon: 'home', link: '/dashboard', match: ['/dashboard'], ability: 'quotations.view' },
  // A quotation's production documents (/production/:id) are part of the quotation.
  { id: 'quotations', label: 'Quotations', icon: 'file', link: '/quotation', match: ['/quotation', '/production'], ability: 'quotations.view' },
  { id: 'orders', label: 'Orders', icon: 'layers', link: '/orders', match: ['/orders'], ability: 'orders.view' },
  { id: 'customers', label: 'Customers', icon: 'users', link: '/customers', match: ['/customers'], ability: 'quotations.view' },
  // The saved domes, cabins, bays and roofs, and the 3D designer they open in (card T114).
  { id: 'bills', label: 'Bills', icon: 'receipt', link: '/bills', match: ['/bills'], ability: 'quotations.view' },
  { id: 'outstanding', label: 'Outstanding', icon: 'rupee', link: '/payments/outstanding', match: ['/payments'], ability: 'payments.view' },
  {
    id: 'catalogue',
    label: 'Catalogue',
    icon: 'box',
    link: '/catalogue',
    match: ['/catalogue', '/masters', '/bulk-price-update'],
    ability: 'catalogue.view',
    places: [
      { label: 'Profiles', link: '/masters/profile' },
      { label: 'Colours', link: '/masters/profile-color' },
      { label: 'Glass', link: '/masters/glass' },
      { label: 'Hardware', link: '/masters/hardware' },
      { label: 'Price file', link: '/bulk-price-update', ability: 'catalogue.write' },
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
      { label: 'Company', link: '/profile?tab=company', ability: 'settings.write' },
      { label: 'Team', link: '/profile?tab=team', ability: 'team.manage' },
      { label: 'Plan', link: '/profile?tab=plan', ability: 'billing.view' },
      { label: 'Pricing and tax', link: '/profile?tab=pricing', ability: 'prices.view_cost' },
      { label: 'Documents', link: '/profile?tab=documents', ability: 'settings.write' },
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

/** The menu of one user: the items and places whose ability `can` answers yes to. */
export function navFor(can: (ability?: string) => boolean, items: NavItem[] = NAV_ITEMS): NavItem[] {
  return items
    .filter((item) => can(item.ability))
    .map((item) => (item.places ? { ...item, places: item.places.filter((place) => can(place.ability)) } : item));
}
