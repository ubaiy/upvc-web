import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { AccessState, SubscriptionInfo } from 'src/app/shared/access/access.models';
import { AccessService } from 'src/app/shared/access/access.service';
import { PLAN_CONTACT, PLAN_OFFERS } from 'src/app/shared/configs/plans';
import { Team, TeamService, TeamUser, seatsLine, teamRefusal } from '../team.service';
import { PlansService } from '../plans.service';
import { PlanTabComponent, offersFor, periodLine } from './plan-tab.component';
import { TeamTabComponent } from './team-tab.component';

const user = (changes: Partial<TeamUser>): TeamUser => ({
  id: 3,
  name: 'Demo',
  last_name: 'User',
  email: 'demo@upvc.local',
  role: 'owner',
  role_name: 'Owner',
  status: 'active',
  last_login_at: '2026-10-05T10:00:00+00:00',
  invited_at: null,
  is_you: true,
  ...changes,
});

const RAVI = user({ id: 7, name: 'Ravi', last_name: null, email: 'ravi@example.com', role: 'sales', role_name: 'Sales', status: 'invited', last_login_at: null, is_you: false });
const MEENA = user({ id: 8, name: 'Meena', last_name: null, email: 'meena@example.com', role: 'accounts', role_name: 'Accounts', status: 'deactivated', is_you: false });

const TEAM: Team = {
  users: [user({}), RAVI, MEENA],
  seats: { used: 2, allowed: 5, free: true },
  roles: [
    { code: 'owner', name: 'Owner', description: 'Everything, including the team and the plan.' },
    { code: 'sales', name: 'Sales', description: 'Customers, quotations and orders. No cost or margin, no catalogue changes.' },
    { code: 'accounts', name: 'Accounts', description: 'Bills and payments, with cost and margin.' },
  ],
};

const SUB: SubscriptionInfo = {
  company: { id: 1, name: 'Hakimi Enterprise' },
  status: 'trial',
  read_only: false,
  plan: { code: 'growth', name: 'Growth', price: 2499, seats: 5, features: { feature_3d: false, max_quotations_per_month: 200, max_design_templates: null } },
  trial_ends_at: '2026-10-19',
  current_period_ends_at: null,
  ends_on: '2026-10-19',
  grace_ends_on: '2026-10-26',
  days_left: 14,
  seats: { used: 2, allowed: 5 },
  features: { feature_3d: false, max_quotations_per_month: 200, max_design_templates: null },
};

const refused = (status: number, body: any) => new HttpErrorResponse({ status, error: body });
const SEAT_LIMIT = refused(409, { success: false, code: 'seat_limit', message: 'Your plan allows 5 users and all are in use.', seats_used: 5, seats_allowed: 5 });
const LAST_OWNER = refused(409, { success: false, code: 'last_owner', message: 'The account needs an owner.' });

describe('team: seats and refusals in plain words', () => {
  it('says how many seats are used', () => {
    expect(seatsLine({ used: 3, allowed: 5, free: true })).toBe('3 of 5 seats used');
    expect(seatsLine({ used: 1, allowed: null, free: true })).toBe('1 seat used, no limit on your plan');
    expect(seatsLine(null)).toBe('');
  });

  it('seat_limit: what happened and what to do, with the way to the plans', () => {
    expect(teamRefusal(SEAT_LIMIT)).toEqual({
      text: 'Your plan allows 5 users and all are in use. Deactivate or remove someone, or move to a larger plan.',
      plan: true,
    });
    expect(teamRefusal(refused(409, { code: 'seat_limit' })).text).toBe('Every seat of your plan is in use. Deactivate or remove someone, or move to a larger plan.');
  });

  it('last_owner: make someone else owner first', () => {
    expect(teamRefusal(LAST_OWNER)).toEqual({ text: 'This is the only owner of the account. Make someone else an owner first, then try again.' });
  });

  it('a 422 says the api\'s first line; 402 and 403 by role are said once by the shared interceptor', () => {
    expect(teamRefusal(refused(422, { message: 'The given data was invalid.', errors: { email: ['The email has already been taken.'] } })).text).toBe(
      'The email has already been taken.'
    );
    expect(teamRefusal(refused(402, { code: 'subscription_locked', message: 'Read-only.' })).said).toBeTrue();
    expect(teamRefusal(refused(403, { code: 'forbidden_for_role', message: 'Your role (Sales) does not allow this.' })).said).toBeTrue();
    expect(teamRefusal(refused(0, null)).text).toContain('No connection');
    expect(teamRefusal(refused(409, { code: 'not_invited' })).text).toContain('already set a password');
  });
});

describe('TeamTabComponent', () => {
  let fixture: ComponentFixture<TeamTabComponent>;
  let service: jasmine.SpyObj<TeamService>;
  let state$: BehaviorSubject<AccessState>;
  let access: { state$: BehaviorSubject<AccessState>; readonly state: AccessState; refreshSubscription: jasmine.Spy };
  let el: HTMLElement;

  const text = (selector: string) => Array.from(document.querySelectorAll(selector)).map((node) => (node.textContent ?? '').replace(/\s+/g, ' ').trim());
  const row = (id: number) => el.querySelector(`tr[data-user="${id}"]`) as HTMLElement;
  const click = (target: Element | null) => {
    (target as HTMLElement).click();
    fixture.detectChanges();
  };
  const type = (id: string, value: string) => {
    const input = document.getElementById(id) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };

  beforeEach(async () => {
    service = jasmine.createSpyObj<TeamService>('TeamService', ['team', 'invite', 'resendInvite', 'setRole', 'deactivate', 'reactivate', 'remove']);
    service.team.and.returnValue(of(TEAM));
    // the owner: the dialogs' buttons follow team.manage (card T143)
    state$ = new BehaviorSubject<AccessState>({ me: { company: { id: 1, name: 'Hakimi Enterprise' }, abilities: ['team.manage', 'billing.view'] } as any, subscription: SUB });
    access = { state$, get state() { return state$.value; }, refreshSubscription: jasmine.createSpy('refreshSubscription') };
    await TestBed.configureTestingModule({
      imports: [TeamTabComponent, RouterTestingModule, NoopAnimationsModule],
      providers: [
        { provide: TeamService, useValue: service },
        { provide: AccessService, useValue: access },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(TeamTabComponent);
    fixture.detectChanges();
    el = fixture.nativeElement;
  });

  afterEach(() => fixture.destroy());

  it('lists the people with role, status and last sign-in, and the seats', () => {
    expect(text('.seats')).toEqual(['2 of 5 seats used']);
    expect(row(3).textContent).toContain('Demo User (you)');
    expect(row(3).textContent).toContain('Owner');
    expect(row(7).textContent).toContain('Invited');
    expect(row(7).textContent).toContain('Not yet');
    expect(row(8).textContent).toContain('Deactivated');
    expect(row(7).querySelector('.act-resend')).withContext('a new link only for an invited user').not.toBeNull();
    expect(row(3).querySelector('.act-resend')).toBeNull();
    expect(row(8).querySelector('.act-reactivate')).not.toBeNull();
    expect(row(8).querySelector('.act-deactivate')).toBeNull();
    expect(el.textContent).not.toContain('undefined');
  });

  it('invites with name, e-mail and role, and shows the link to copy with the company named in it', async () => {
    service.invite.and.returnValue(
      of({ user: RAVI, invite: { link: 'http://localhost:4200/#/auth/reset-password?token=abc&email=asha%40example.com&invite=1', expires_at: '2026-10-08T10:00:00+00:00' } })
    );
    click(el.querySelector('button.invite'));
    await fixture.whenStable();
    fixture.detectChanges();
    type('inv-name', ' Asha ');
    type('inv-email', 'asha@example.com');
    fixture.detectChanges();
    fixture.componentInstance.sendInvite();
    fixture.detectChanges();

    expect(service.invite).toHaveBeenCalledOnceWith({ name: 'Asha', email: 'asha@example.com', role: 'sales' });
    const link = el.querySelector('.invite-link input') as HTMLInputElement;
    expect(link.value).toBe('http://localhost:4200/#/auth/reset-password?token=abc&email=asha%40example.com&invite=1&company=Hakimi%20Enterprise');
    expect(text('.invite-link .card-head')[0]).toContain('We do not send e-mails yet');
    expect(service.team).withContext('the list is read again').toHaveBeenCalledTimes(2);
    expect(access.refreshSubscription).toHaveBeenCalled();
  });

  it('sends nothing for an empty name or a bad e-mail, and says which', () => {
    fixture.componentInstance.openInvite();
    fixture.componentInstance.form.email = 'not-an-address';
    fixture.componentInstance.sendInvite();
    expect(service.invite).not.toHaveBeenCalled();
    expect(fixture.componentInstance.nameError).toBe('Enter the name');
    expect(fixture.componentInstance.emailError).toBe('This does not look like an e-mail address');
  });

  it('seat_limit on an invitation: the message stays in the dialog with the way to the plans', () => {
    service.invite.and.returnValue(throwError(() => SEAT_LIMIT));
    const page = fixture.componentInstance;
    page.openInvite();
    page.form = { name: 'Asha', email: 'asha@example.com', role: 'sales' };
    page.sendInvite();
    fixture.detectChanges();
    expect(page.dialog).toBe('invite');
    expect(page.refusal).toEqual({ text: 'Your plan allows 5 users and all are in use. Deactivate or remove someone, or move to a larger plan.', plan: true });
    expect(page.invited).toBeNull();
  });

  it('says so before the owner tries when every seat is used', () => {
    service.team.and.returnValue(of({ ...TEAM, seats: { used: 5, allowed: 5, free: false } }));
    fixture.componentInstance.load();
    fixture.detectChanges();
    expect(text('.seats-full')[0]).toContain('Every seat of your plan is in use');
    expect(el.querySelector('.seats-full a')?.getAttribute('href')).toContain('tab=plan');
  });

  it('changes a role', () => {
    service.setRole.and.returnValue(of({ user: { ...RAVI, role: 'accounts', role_name: 'Accounts' } }));
    const page = fixture.componentInstance;
    page.openRole(RAVI);
    page.newRole = 'accounts';
    page.saveRole();
    fixture.detectChanges();
    expect(service.setRole).toHaveBeenCalledOnceWith(7, 'accounts');
    expect(text('.team-notice')[0]).toContain('Ravi is now Accounts.');
  });

  it('last_owner on a change of role: make someone else owner first', () => {
    service.setRole.and.returnValue(throwError(() => LAST_OWNER));
    const page = fixture.componentInstance;
    page.openRole(TEAM.users[0]);
    page.newRole = 'sales';
    page.saveRole();
    expect(page.refusal?.text).toBe('This is the only owner of the account. Make someone else an owner first, then try again.');
    expect(page.dialog).toBe('role');
  });

  it('deactivates, reactivates and removes after asking, and says the result', () => {
    const page = fixture.componentInstance;
    service.deactivate.and.returnValue(of({ user: RAVI }));
    service.reactivate.and.returnValue(of({ user: MEENA }));
    service.remove.and.returnValue(of({}));

    click(row(7).querySelector('.act-deactivate'));
    expect(page.confirmTitle).toBe('Deactivate Ravi?');
    expect(service.deactivate).withContext('nothing is sent before the owner confirms').not.toHaveBeenCalled();
    page.confirm();
    expect(service.deactivate).toHaveBeenCalledOnceWith(7);
    expect(page.notice?.text).toBe('Ravi is deactivated and signed out. The seat is free.');

    page.ask(MEENA, 'reactivate');
    page.confirm();
    expect(service.reactivate).toHaveBeenCalledOnceWith(8);
    expect(page.notice?.text).toBe('Meena can sign in again.');

    page.ask(MEENA, 'remove');
    expect(page.confirmText).toContain('cannot be undone');
    page.confirm();
    expect(service.remove).toHaveBeenCalledOnceWith(8);
    expect(page.notice?.text).toBe('Meena is removed. The seat is free.');
  });

  it('seat_limit on reactivate and last_owner on remove are shown above the list', () => {
    const page = fixture.componentInstance;
    service.reactivate.and.returnValue(throwError(() => SEAT_LIMIT));
    page.ask(MEENA, 'reactivate');
    page.confirm();
    fixture.detectChanges();
    expect(text('.team-notice')[0]).toContain('Your plan allows 5 users and all are in use.');
    expect(el.querySelector('.team-notice a')?.getAttribute('href')).toContain('tab=plan');

    service.remove.and.returnValue(throwError(() => LAST_OWNER));
    page.ask(TEAM.users[0], 'remove');
    page.confirm();
    fixture.detectChanges();
    expect(text('.team-notice')[0]).toContain('Make someone else an owner first');
  });

  it('makes a new link for an invited user', () => {
    service.resendInvite.and.returnValue(of({ user: RAVI, invite: { link: 'http://x/#/auth/reset-password?token=new&email=r&invite=1', expires_at: '2026-10-08T10:00:00+00:00' } }));
    const page = fixture.componentInstance;
    page.ask(RAVI, 'resend');
    page.confirm();
    expect(service.resendInvite).toHaveBeenCalledOnceWith(7);
    expect(page.invited?.link).toContain('token=new');
  });

  it('a locked company: every change button is off and says why, with the way to the Plan page', () => {
    state$.next({ me: null, subscription: { ...SUB, status: 'locked', read_only: true } });
    fixture.detectChanges();
    const buttons = Array.from(el.querySelectorAll('button.invite, .person-actions button')) as HTMLButtonElement[];
    expect(buttons.length).toBeGreaterThan(5);
    expect(buttons.every((button) => button.disabled)).toBeTrue();
    expect(buttons[0].title).toContain('read-only');
    expect(el.querySelector('app-callout a')?.getAttribute('href')).toContain('tab=plan');
  });

  it('says so when the team cannot be loaded', () => {
    service.team.and.returnValue(throwError(() => refused(500, {})));
    const other = TestBed.createComponent(TeamTabComponent);
    other.detectChanges();
    expect(other.nativeElement.textContent).toContain('We could not load your team.');
    other.destroy();
  });
});

describe('plan page', () => {
  it('draws the company\'s own plan from GET subscription and the others from the one list', () => {
    const offers = offersFor({ ...SUB, plan: { code: 'growth', name: 'Growth', price: 2999, seats: 6, features: { feature_3d: true, max_quotations_per_month: 250, max_design_templates: null } } });
    expect(offers.map((offer) => offer.code)).toEqual(['starter', 'growth', 'business']);
    expect(offers[1]).toEqual({ code: 'growth', name: 'Growth', price: 2999, seats: 6, quotationsPerMonth: 250, designTemplates: null, has3d: true });
    expect(offers[0]).toEqual(PLAN_OFFERS[0]);
    expect(offersFor(null)).toEqual(PLAN_OFFERS);
  });

  it('says the period in plain words', () => {
    expect(periodLine(SUB)).toBe('Free trial until 19 Oct 2026 (14 days left)');
    expect(periodLine({ ...SUB, status: 'active', ends_on: null, days_left: null })).toBe('No end date');
    expect(periodLine({ ...SUB, status: 'active', ends_on: '2027-01-04', days_left: 91 })).toBe('Paid until 4 Jan 2027 (91 days left)');
    expect(periodLine({ ...SUB, status: 'grace', ends_on: '2026-10-02', grace_ends_on: '2026-10-09', days_left: 4 })).toBe(
      'Payment was due on 2 Oct 2026. Read-only after 9 Oct 2026 (4 days left)'
    );
  });

  describe('PlanTabComponent', () => {
    let fixture: ComponentFixture<PlanTabComponent>;
    let el: HTMLElement;

    beforeEach(async () => {
      const state$ = new BehaviorSubject<AccessState>({ me: null, subscription: SUB });
      await TestBed.configureTestingModule({
        imports: [PlanTabComponent, NoopAnimationsModule],
        providers: [
          { provide: AccessService, useValue: { state$, refreshSubscription: () => undefined } },
          // GET plans is covered by plans.service.spec.ts; here the api has no such route (404): the web's copy.
          { provide: PlansService, useValue: { list: () => of({ source: 'fallback', offers: PLAN_OFFERS }) } },
        ],
      }).compileComponents();
      fixture = TestBed.createComponent(PlanTabComponent);
      fixture.detectChanges();
      el = fixture.nativeElement;
    });

    afterEach(() => fixture.destroy());

    it('shows the plan, status, period and seats, and the three plans with 3D on Business only', () => {
      const facts = (el.querySelector('.facts') as HTMLElement).textContent!.replace(/\s+/g, ' ');
      expect(facts).toContain('Growth');
      expect(facts).toContain('₹2,499 a month before GST');
      expect(facts).toContain('Free trial');
      expect(facts).toContain('Free trial until 19 Oct 2026 (14 days left)');
      expect(facts).toContain('2 of 5 used');
      expect(facts).toContain('Available on the Business plan.');
      const offers = Array.from(el.querySelectorAll('.offer')) as HTMLElement[];
      expect(offers.map((offer) => offer.getAttribute('data-plan'))).toEqual(['starter', 'growth', 'business']);
      expect(offers.map((offer) => offer.querySelector('.amount')!.textContent)).toEqual(['₹999', '₹2,499', '₹4,999']);
      expect(offers.map((offer) => offer.querySelector('.three-d')!.classList.contains('off'))).toEqual([true, true, false]);
      expect(offers.map((offer) => offer.querySelector('button')!.textContent!.trim())).toEqual(['Change to this plan', 'Buy this plan', 'Upgrade']);
      expect(el.textContent).not.toMatch(/undefined|NaN/);
    });

    it('"Upgrade" opens how to pay by hand and takes no payment', () => {
      (el.querySelector('.offer[data-plan="business"] button') as HTMLElement).click();
      fixture.detectChanges();
      expect(fixture.componentInstance.chosen?.code).toBe('business');
      const how = (document.querySelector('.how') as HTMLElement).textContent!.replace(/\s+/g, ' ');
      expect(document.querySelector('.p-dialog-title')?.textContent).toContain(PLAN_CONTACT.heading);
      expect(how).toContain('Business, ₹4,999 a month before GST.');
      expect(how).toContain(PLAN_CONTACT.lines[0]);
      expect(how).toContain('No payment is taken on this page');
      expect(document.querySelector('.how input, .how form')).withContext('no card or payment field').toBeNull();
    });
  });
});
