import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { BehaviorSubject, of } from 'rxjs';

import { AccessState, SubscriptionInfo } from 'src/app/shared/access/access.models';
import { AccessService } from 'src/app/shared/access/access.service';
import { subscription } from 'src/app/shared/access/access.spec';
import { PLAN_OFFERS } from 'src/app/shared/configs/plans';
import { environment } from 'src/environments/environment';
import { PlanList, PlansService, toPlanOffers } from './plans.service';
import { PlanTabComponent } from './tabs/plan-tab.component';

const URL = `${environment.API_URL}/plans`;

/** GET plans as the api answers it (phase-55 log, T139.5 b), with prices that are NOT the web's copy. */
const ANSWER = {
  success: true,
  data: {
    plans: [
      { id: 1, code: 'starter', name: 'Starter', price_paise: 119900, price: 1199, seats: 3, features: { feature_3d: false, max_quotations_per_month: 40, max_design_templates: 10 }, trial_days: 14, grace_days: 7, is_current: false },
      { id: 2, code: 'growth', name: 'Growth', price_paise: 249900, price: 2499, seats: 5, features: { feature_3d: false, max_quotations_per_month: 200, max_design_templates: null }, trial_days: 14, grace_days: 7, is_current: true },
      { id: 4, code: 'pro', name: 'Pro', price_paise: 799900, price: 7999, seats: 25, features: { feature_3d: true, max_quotations_per_month: null, max_design_templates: null }, trial_days: 14, grace_days: 7, is_current: false },
    ],
    current_plan: 'growth',
  },
  message: 'Plans get successfully',
};

describe('Plans from the api (card T143)', () => {
  it('reads the rows as the page draws them: limits are the number keys of features, null is no limit', () => {
    expect(toPlanOffers(ANSWER.data)).toEqual([
      { code: 'starter', name: 'Starter', price: 1199, seats: 3, quotationsPerMonth: 40, designTemplates: 10, has3d: false },
      { code: 'growth', name: 'Growth', price: 2499, seats: 5, quotationsPerMonth: 200, designTemplates: null, has3d: false },
      { code: 'pro', name: 'Pro', price: 7999, seats: 25, quotationsPerMonth: null, designTemplates: null, has3d: true },
    ]);
    expect(toPlanOffers(null)).toEqual([]);
    expect(toPlanOffers({ plans: [{ name: 'no code' }, null] })).toEqual([]);
    // rupees from paise when `price` is not sent
    expect(toPlanOffers({ plans: [{ code: 'x', price_paise: 99900 }] })[0].price).toBe(999);
  });

  describe('PlansService', () => {
    let service: PlansService;
    let http: HttpTestingController;

    beforeEach(() => {
      TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
      service = TestBed.inject(PlansService);
      http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => http.verify());

    function ask(): { got: () => PlanList; request: ReturnType<HttpTestingController['expectOne']> } {
      let list: PlanList | undefined;
      service.list().subscribe((l) => (list = l));
      return { got: () => list as PlanList, request: http.expectOne(URL) };
    }

    it('200: the api\'s plans, in the api\'s order', () => {
      const { got, request } = ask();
      expect(request.request.method).toBe('GET');
      request.flush(ANSWER);
      expect(got().source).toBe('api');
      expect(got().offers.map((offer) => offer.code)).toEqual(['starter', 'growth', 'pro']);
    });

    it('404 (an api without the route): the web\'s own copy', () => {
      const { got, request } = ask();
      request.flush({ message: 'Not found' }, { status: 404, statusText: 'Not Found' });
      expect(got()).toEqual({ source: 'fallback', offers: PLAN_OFFERS });
    });

    for (const status of [0, 403, 500]) {
      it(`${status}: not the web's copy; the page is told the list is not known`, () => {
        const { got, request } = ask();
        if (status === 0) {
          request.error(new ProgressEvent('error'));
        } else {
          request.flush({ message: 'no' }, { status, statusText: 'no' });
        }
        expect(got()).toEqual({ source: 'failed', offers: [] });
      });
    }

    it('200 without rows: not known either', () => {
      const { got, request } = ask();
      request.flush({ success: true, data: { plans: [] } });
      expect(got().source).toBe('failed');
    });
  });

  describe('Plan page', () => {
    let fixture: ComponentFixture<PlanTabComponent>;
    let plans: jasmine.SpyObj<PlansService>;
    const SUB: SubscriptionInfo = subscription({ plan: { code: 'growth', name: 'Growth', price: 2499, seats: 5, features: { feature_3d: false, max_quotations_per_month: 200, max_design_templates: null } } });

    function open(list: PlanList): HTMLElement {
      plans = jasmine.createSpyObj<PlansService>('PlansService', ['list']);
      plans.list.and.returnValue(of(list));
      const state$ = new BehaviorSubject<AccessState>({ me: null, subscription: SUB });
      TestBed.configureTestingModule({
        imports: [PlanTabComponent, NoopAnimationsModule],
        providers: [
          { provide: AccessService, useValue: { state$, refreshSubscription: () => undefined } },
          { provide: PlansService, useValue: plans },
        ],
      });
      fixture = TestBed.createComponent(PlanTabComponent);
      fixture.detectChanges();
      return fixture.nativeElement;
    }

    afterEach(() => fixture.destroy());

    const cards = (el: HTMLElement) => Array.from(el.querySelectorAll('.offer')) as HTMLElement[];

    it('draws the api\'s plans: names, prices, seats and 3D are the api\'s, not the web\'s copy', () => {
      const el = open({ source: 'api', offers: toPlanOffers(ANSWER.data) });
      expect(cards(el).map((card) => card.getAttribute('data-plan'))).toEqual(['starter', 'growth', 'pro']);
      expect(cards(el).map((card) => card.querySelector('.amount')!.textContent)).toEqual(['₹1,199', '₹2,499', '₹7,999']);
      expect(cards(el)[0].textContent).toContain('3 users');
      expect(cards(el)[0].textContent).toContain('Quotations a month: 40');
      expect(cards(el)[2].textContent).toContain('Quotations a month: No limit');
      expect(cards(el).map((card) => card.querySelector('.three-d')!.classList.contains('off'))).toEqual([true, true, false]);
      expect(cards(el)[1].textContent).toContain('Your plan');
      expect(el.querySelector('[data-plans="failed"]')).toBeNull();
      expect(el.textContent).not.toMatch(/undefined|NaN/);
    });

    it('404: the web\'s three plans', () => {
      const el = open({ source: 'fallback', offers: PLAN_OFFERS });
      expect(cards(el).map((card) => card.getAttribute('data-plan'))).toEqual(['starter', 'growth', 'business']);
      expect(el.querySelector('[data-plans="failed"]')).toBeNull();
    });

    it('no answer: the company\'s own plan from GET subscription, one line and "Try again", which asks again', () => {
      const el = open({ source: 'failed', offers: [] });
      expect(cards(el).map((card) => card.getAttribute('data-plan'))).toEqual(['growth']);
      const callout = el.querySelector('[data-plans="failed"]') as HTMLElement;
      expect(callout.textContent).toContain('We could not load the other plans.');
      plans.list.and.returnValue(of({ source: 'api', offers: toPlanOffers(ANSWER.data) }));
      callout.querySelector('button')!.click();
      fixture.detectChanges();
      expect(plans.list).toHaveBeenCalledTimes(2);
      expect(cards(el).length).toBe(3);
      expect(el.querySelector('[data-plans="failed"]')).toBeNull();
    });
  });
});
