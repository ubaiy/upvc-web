import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { DialogModule } from 'primeng/dialog';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { WorkspaceService } from '../../../../containers/shell/workspace.service';
import { SharedComponentsModule } from '../../../../shared/components/shared-components.module';
import { ToastService } from '../../../../shared/services/toast.service';
import { QuotationService } from '../../quotation.service';
import { toQuotationView } from '../detail/quotation-detail.model';
import { sampleQuotation } from '../detail/quotation-detail.testing';
import { SendQuotationDialogComponent } from './send-quotation-dialog.component';

describe('SendQuotationDialogComponent', () => {
  let fixture: ComponentFixture<SendQuotationDialogComponent>;
  let component: SendQuotationDialogComponent;
  let service: jasmine.SpyObj<QuotationService>;
  let toast: jasmine.SpyObj<ToastService>;
  let chat: { close: jasmine.Spy; location: { href: string } };

  const body = (): HTMLElement => document.body;
  const button = (label: string): HTMLButtonElement =>
    Array.from(body().querySelectorAll<HTMLButtonElement>('.send button')).find((b) => (b.textContent || '').includes(label))!;
  const ok = (data: any) => of({ success: true, data, message: '' } as any);

  function open(overrides: any = {}): void {
    component.quotation = toQuotationView(sampleQuotation(overrides));
    component.visible = true;
    component.ngOnChanges({ visible: { currentValue: true, previousValue: false, firstChange: false, isFirstChange: () => false } });
    fixture.detectChanges();
  }

  beforeEach(() => {
    service = jasmine.createSpyObj('QuotationService', ['getQuotationPreview', 'sendQuotation', 'getQuotationPdf']);
    service.getQuotationPreview.and.returnValue(of('<html><head></head><body><p>QUOTATION Q-0003</p></body></html>'));
    service.getQuotationPdf.and.returnValue(of({ blob: new Blob(['pdf']), fileName: 'Quotation-Q-0003-Ahmed-Al-Rashid.pdf' }));
    toast = jasmine.createSpyObj('ToastService', ['showSuccess', 'showError']);
    chat = { close: jasmine.createSpy('close'), location: { href: '' } };
    spyOn(window, 'open').and.returnValue(chat as any);
    TestBed.configureTestingModule({
      declarations: [SendQuotationDialogComponent],
      imports: [NoopAnimationsModule, FormsModule, SharedComponentsModule, DialogModule],
      providers: [
        { provide: QuotationService, useValue: service },
        { provide: ToastService, useValue: toast },
        { provide: WorkspaceService, useValue: { workspace$: new BehaviorSubject({ name: 'Hakimi Enterprise' }) } },
      ],
    });
    fixture = TestBed.createComponent(SendQuotationDialogComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => fixture.destroy());

  it('previews the document by quotation id, in a sandboxed frame', () => {
    open();
    expect(service.getQuotationPreview).toHaveBeenCalledWith(14);
    const frame = body().querySelector('iframe.doc') as HTMLIFrameElement;
    expect(frame).not.toBeNull();
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.getAttribute('title')).toBe('Preview of quotation Q-0003');
    expect(frame.getAttribute('srcdoc')).toContain('QUOTATION Q-0003');
  });

  it('offers WhatsApp, Email and Download, filled in from the customer', () => {
    open();
    expect(button('Send on WhatsApp')).toBeTruthy();
    expect(button('Send by email')).toBeTruthy();
    expect(button('Download PDF')).toBeTruthy();
    expect(component.phone).toBe('9812345670');
    expect(component.email).toBe('ahmed@example.com');
    expect(body().querySelector('.send')?.textContent).toContain('₹20,730.00');
  });

  it('sends on WhatsApp: opens the chat the API returns and reports the quotation as sent', () => {
    open();
    service.sendQuotation.and.returnValue(ok({ whatsapp_url: 'https://wa.me/919812345670?text=Hello' }));
    const sent = jasmine.createSpy('sent');
    component.sent.subscribe(sent);
    button('Send on WhatsApp').click();
    expect(service.sendQuotation).toHaveBeenCalledWith(14, {
      channel: 'whatsapp',
      phone: '9812345670',
      message: 'Hello Ahmed Al-Rashid, here is quotation Q-0003 from Hakimi Enterprise for ₹20,730.00.',
    });
    expect(chat.location.href).toBe('https://wa.me/919812345670?text=Hello');
    expect(sent).toHaveBeenCalledWith('whatsapp');
  });

  it('asks for a mobile number before WhatsApp when the customer has none', () => {
    open({ customer: { id: 2, name: 'Ahmed Al-Rashid', phone: '', email: '' } });
    button('Send on WhatsApp').click();
    fixture.detectChanges();
    expect(service.sendQuotation).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
    expect(body().querySelector('#send-phone-error')?.textContent).toContain('10-digit mobile number');
  });

  it('shows the WhatsApp message and the email subject before sending, and sends them as changed (m9)', () => {
    open();
    const message = body().querySelector('#send-message') as HTMLTextAreaElement;
    const subject = body().querySelector('#send-subject') as HTMLInputElement;
    expect(body().querySelector('label[for="send-message"]')).not.toBeNull();
    expect(body().querySelector('label[for="send-subject"]')).not.toBeNull();
    expect(component.message).toContain('here is quotation Q-0003');
    expect(component.subject).toBe('Quotation Q-0003 from Hakimi Enterprise');
    expect(message && subject).toBeTruthy();

    component.message = 'Namaste Ahmedbhai, the revised quotation is here.';
    service.sendQuotation.and.returnValue(ok({ whatsapp_url: 'https://wa.me/919812345670?text=x' }));
    button('Send on WhatsApp').click();
    expect(service.sendQuotation.calls.mostRecent().args[1].message).toBe('Namaste Ahmedbhai, the revised quotation is here.');

    component.subject = 'Windows for the villa';
    component.email = 'ahmed@example.com';
    service.sendQuotation.and.returnValue(ok({ emailed_to: 'ahmed@example.com' }));
    button('Send by email').click();
    expect(service.sendQuotation.calls.mostRecent().args[1].subject).toBe('Windows for the villa');
  });

  it('leaves room for the scroll bar, so the preview has no sideways one', () => {
    open();
    const html = String((component.preview as any)?.changingThisBreaksApplicationSecurity || '');
    expect(html).toContain('overflow-x:hidden');
    const zoom = Number(/zoom:([0-9.]+)/.exec(html)?.[1]);
    // Never the full width of the pane: 18 px stay free for the scroll bar.
    expect(zoom).toBeGreaterThan(0);
    expect(zoom * 794).toBeLessThanOrEqual(794 - 18);
  });

  it('emails the quotation to the address typed', () => {
    open({ customer: { id: 2, name: 'Ahmed Al-Rashid', phone: '9812345670', email: '' } });
    button('Send by email').click();
    fixture.detectChanges();
    expect(body().querySelector('#send-email-error')?.textContent).toContain('email address');

    component.email = 'ahmed@example.com';
    service.sendQuotation.and.returnValue(ok({ emailed_to: 'ahmed@example.com' }));
    button('Send by email').click();
    expect(service.sendQuotation).toHaveBeenCalledWith(14, {
      channel: 'email',
      to: 'ahmed@example.com',
      subject: 'Quotation Q-0003 from Hakimi Enterprise',
    });
    expect(toast.showSuccess).toHaveBeenCalledWith('Emailed to ahmed@example.com. The quotation is marked as sent.');
  });

  it('marks the quotation sent on Download, then fetches the PDF by id', () => {
    open();
    service.sendQuotation.and.returnValue(ok({}));
    button('Download PDF').click();
    expect(service.sendQuotation).toHaveBeenCalledWith(14, { channel: 'download' });
    expect(service.getQuotationPdf).toHaveBeenCalledWith(14);
  });

  it('shows a refusal under the button and does not report the quotation as sent', () => {
    open();
    service.sendQuotation.and.returnValue(of({ status: 0, message: 'The email could not be sent; check the mail settings.' } as any));
    const sent = jasmine.createSpy('sent');
    component.sent.subscribe(sent);
    button('Send by email').click();
    fixture.detectChanges();
    expect(body().querySelector('#send-email-error')?.textContent).toContain('The email could not be sent');
    expect(sent).not.toHaveBeenCalled();
  });

  it('closes the blank tab when WhatsApp fails', () => {
    open();
    service.sendQuotation.and.returnValue(throwError(() => ({ status: 0 })));
    button('Send on WhatsApp').click();
    expect(chat.close).toHaveBeenCalled();
    expect(component.errorFor('whatsapp')).toContain('not sent');
  });

  it('can still send when the preview does not load', () => {
    service.getQuotationPreview.and.returnValue(throwError(() => ({ status: 500 })));
    open();
    expect(body().querySelector('.pane')?.textContent).toContain('We could not load the preview');
    expect(button('Send on WhatsApp').disabled).toBeFalse();
  });
});
