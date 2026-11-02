import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { PRICE_DEBOUNCE_MS, StructureDesignerComponent } from './structure-designer.component';
import { SAMPLE_PRICE } from './structure-line.service.spec';
import { openDesigner } from './testing';

const API = environment.API_URL;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Containers whose content is wider than they are: something would scroll sideways or be cut off. */
function tooWide(root: HTMLElement, selectors: string[]): string[] {
  const out: string[] = [];
  for (const selector of selectors) {
    root.querySelectorAll<HTMLElement>(selector).forEach((e) => {
      if (e.scrollWidth > e.clientWidth + 1) out.push(`${selector}: content ${e.scrollWidth} in ${e.clientWidth}`);
    });
  }
  return out;
}

const pageScroll = (): string[] => {
  const doc = document.documentElement;
  return doc.scrollWidth > doc.clientWidth + 1 ? [`page: ${doc.scrollWidth} in ${doc.clientWidth}`] : [];
};

const DESIGNER = ['.sd-top', '.sd-price', '.sd-panel', '.sd-sec', '.sd-pop--details', '.sd-choose', '.sd-table'];
const DIALOG = ['.pd-box', '.pd-head', '.pd-body', '.pd-draw', '.pd-side', '.pd-inspector', '.pd-tools', '.pd-foot'];

// The test page is a frame of the karma page: it is given each width in turn, so the media queries of the
// designer answer as they do on a phone (390), a laptop (1440) and a wide screen (1920).
describe('the structure designer fits the width of the screen', () => {
  let fixture: ComponentFixture<StructureDesignerComponent>;
  const frame = window.frameElement as HTMLElement | null;
  const before = frame?.style.width ?? '';

  afterEach(() => {
    fixture?.destroy();
    if (frame) frame.style.width = before;
  });

  for (const width of [390, 1440, 1920]) {
    it(`has no sideways scroll at ${width} wide: panels open, price details, a roof pane, the dialog of a panel`, async () => {
      if (!frame) return pending('the test page is not in a frame, so its width cannot be set');
      frame.style.width = `${width}px`;
      await sleep(50);
      expect(window.innerWidth).withContext('the page has the width asked').toBe(width);

      fixture = await openDesigner({ kind: 'cabin' }, { id: '12' });
      const c = fixture.componentInstance;
      const el: HTMLElement = fixture.nativeElement;
      await sleep(PRICE_DEBOUNCE_MS + 80);
      TestBed.inject(HttpTestingController).match(`${API}/quatation/structure/price`)[0].flush({ success: true, data: SAMPLE_PRICE });
      c.togglePanel('left', true);
      c.togglePanel('right', true);
      c.selectFaces(['front-1']);
      c.detailsOpen = true;
      fixture.detectChanges();
      expect(el.querySelectorAll(DESIGNER.join(',')).length).withContext('the checks look at something').toBeGreaterThan(8);
      expect(pageScroll()).withContext('wall panel, price details').toEqual([]);
      expect(tooWide(el, DESIGNER)).withContext('wall panel, price details').toEqual([]);

      c.detailsOpen = false;
      c.sheetOpen = true;
      c.selectFaces(['roof-1']);
      fixture.detectChanges();
      expect(pageScroll()).withContext('roof pane').toEqual([]);
      expect(tooWide(el, DESIGNER)).withContext('roof pane').toEqual([]);

      c.selectFaces(['front-1']);
      c.editPanel();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const box = el.querySelector<HTMLElement>('.pd-box')!;
      expect(pageScroll()).withContext('dialog').toEqual([]);
      expect(tooWide(el, DIALOG)).withContext('dialog, drawing').toEqual([]);
      const rect = box.getBoundingClientRect();
      const page = document.documentElement.clientWidth;
      expect(rect.left).toBeGreaterThanOrEqual(0);
      expect(rect.right).toBeLessThanOrEqual(page + 1);
      if (width <= 900) {
        expect(rect.width).withContext('the dialog fills a phone').toBeGreaterThanOrEqual(page - 1);
        el.querySelector<HTMLButtonElement>('[data-pd="view-options"]')!.click();
        fixture.detectChanges();
        expect(tooWide(el, DIALOG)).withContext('dialog, options').toEqual([]);
        expect(el.querySelector<HTMLElement>('.pd-side')!.getBoundingClientRect().width).toBeGreaterThan(page - 2);
      } else {
        expect(rect.width).withContext('the dialog is large but not the whole page').toBeLessThanOrEqual(1280);
      }
    });
  }
});
