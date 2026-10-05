import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, Subject, firstValueFrom, of, throwError } from 'rxjs';

import { ApiHttpService } from '../services/api-http.service';
import { AuthService } from '../services/auth.service';
import { Me } from './access.models';
import { AccessService } from './access.service';
import { OwnRatesComponent } from './own-rates.component';
import { EXAMPLE_RATES_TEXT, exampleRatesBanner, hasExampleRates } from './starter-catalogue';

const EXAMPLE = { code: 'classic_example', example_rates: true, note: 'Example rates.' };
const OWN = { code: 'own_rates', example_rates: false, note: null };

function me(abilities: string[], starter: unknown = EXAMPLE): Me {
  return {
    user: { id: 1, name: 'Asha', email: 'asha@shree.example' },
    company: { id: 6, name: 'Shree Windows', starter_catalogue: starter },
    role: abilities.includes('settings.write') ? 'owner' : 'sales',
    role_name: 'x',
    abilities,
    is_platform_admin: false,
  } as unknown as Me;
}

/** The two places that draw the action: the line of the shell and the first step of the welcome page. */
@Component({
  template: `
    <div class="line" *ngIf="banner()"><span>{{ text }}</span><app-own-rates></app-own-rates></div>
    <app-own-rates class="step" [primary]="true"></app-own-rates>
  `,
})
class HostComponent {
  readonly text = EXAMPLE_RATES_TEXT;
  constructor(private access: AccessService) {}
  banner(): boolean {
    return !!exampleRatesBanner(this.access.state, '/dashboard');
  }
}

describe('"These are my rates now" (T146)', () => {
  let fixture: ComponentFixture<HostComponent>;
  let service: AccessService;
  let get: jasmine.Spy;
  let post: jasmine.Spy;
  let current: Me;
  let answer: () => Observable<unknown>;

  const el = (): HTMLElement => fixture.nativeElement;
  const buttons = (): HTMLButtonElement[] => Array.from(el().querySelectorAll<HTMLButtonElement>('button.own-rates'));
  const dialog = (): HTMLElement | null => el().querySelector('app-confirm-dialog');
  const dialogButton = (label: string): HTMLButtonElement =>
    Array.from(el().querySelectorAll<HTMLButtonElement>('app-confirm-dialog button')).find((b) => b.textContent!.trim() === label)!;

  async function start(first: Me): Promise<void> {
    current = first;
    answer = () => of({ success: true, data: { changed: true, starter_catalogue: OWN } });
    get = jasmine.createSpy('get').and.callFake((url: string) =>
      url === 'me' ? of({ success: true, data: current }) : of({ success: true, data: { status: 'trial', days_left: 14 } })
    );
    post = jasmine.createSpy('post').and.callFake(() => answer());
    TestBed.configureTestingModule({
      declarations: [HostComponent],
      imports: [OwnRatesComponent],
      providers: [
        { provide: ApiHttpService, useValue: { get, post } },
        { provide: AuthService, useValue: { getToken: () => 'token-1' } },
      ],
    });
    service = TestBed.inject(AccessService);
    await firstValueFrom(service.load());
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  }

  it('the owner has the action in the line and in step 1; a press asks first and sends nothing', async () => {
    await start(me(['settings.write']));
    expect(buttons().map((b) => b.textContent!.trim())).toEqual(['These are my rates now', 'These are my rates now']);
    buttons()[0].click();
    fixture.detectChanges();
    const words = dialog()!.textContent!;
    expect(words).toContain('Are the rates in the catalogue your own now?');
    expect(words).toContain('The line about example rates goes away for everyone in your company.');
    expect(words).toContain('No rate is changed');
    expect(words).toContain('This cannot be undone from the app.');
    expect(post).not.toHaveBeenCalled();

    dialogButton('Not yet').click();
    fixture.detectChanges();
    expect(dialog()).toBeNull();
    expect(post).not.toHaveBeenCalled();
    expect(buttons().length).toBe(2);
  });

  it('after the yes: POST confirm, GET me again, and the line and both buttons are gone without a reload', async () => {
    await start(me(['settings.write']));
    buttons()[0].click();
    fixture.detectChanges();
    current = me(['settings.write'], OWN);
    dialogButton('Yes, these are my rates').click();
    fixture.detectChanges();

    expect(post.calls.allArgs().map((args) => [args[0], args[1]])).toEqual([['company/starter-catalogue/confirm', {}]]);
    expect(get.calls.allArgs().map((args) => args[0])).toEqual(['me', 'subscription', 'me']);
    // the object is still there after the confirm: it is example_rates that is read
    expect((service.state.me!.company as any).starter_catalogue).toEqual(OWN);
    expect(hasExampleRates(service.state)).toBeFalse();
    expect(dialog()).toBeNull();
    expect(el().querySelector('.line')).toBeNull();
    expect(buttons().length).toBe(0);
    expect(service.state.subscription).withContext('the plan is kept').toBeTruthy();
  });

  it('when GET me does not answer afterwards, the mark of the confirm answer is used', async () => {
    await start(me(['settings.write']));
    buttons()[1].click();
    fixture.detectChanges();
    get.and.callFake(() => throwError(() => ({ status: 0 })));
    dialogButton('Yes, these are my rates').click();
    fixture.detectChanges();
    expect(hasExampleRates(service.state)).toBeFalse();
    expect(service.state.me!.company!.name).toBe('Shree Windows');
    expect(buttons().length).toBe(0);
  });

  it('only settings.write sees the action: sales reads the line and has no button', async () => {
    await start(me(['quotations.write', 'catalogue.view']));
    expect(el().querySelector('.line')!.textContent).toContain(EXAMPLE_RATES_TEXT);
    expect(buttons().length).toBe(0);
  });

  it('no action for a company without the mark, also when the object is there', async () => {
    await start(me(['settings.write'], OWN));
    expect(buttons().length).toBe(0);
    expect(el().querySelector('.line')).toBeNull();
  });

  it('a refusal stays in the dialog in plain words and nothing changes; the buttons wait while it runs', async () => {
    await start(me(['settings.write']));
    const pending = new Subject<unknown>();
    answer = () => pending;
    buttons()[0].click();
    fixture.detectChanges();
    dialogButton('Yes, these are my rates').click();
    fixture.detectChanges();
    expect(el().querySelector<HTMLButtonElement>('app-confirm-dialog .btn-primary')!.disabled).toBeTrue();
    pending.error({ status: 403, error: { code: 'forbidden_for_role' } });
    fixture.detectChanges();
    expect(dialog()!.querySelector('.refusal')!.textContent).toContain('Only the owner of the account can say this.');
    expect(hasExampleRates(service.state)).toBeTrue();
    expect(buttons().length).toBe(2);
  });
});
