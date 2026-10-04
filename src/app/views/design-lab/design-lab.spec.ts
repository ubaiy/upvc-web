// Design Lab (card T40): the production guard, the built-in presets and
// the saved-template round trip through the api row shape.
import 'zone.js/testing';

import { HttpClient } from '@angular/common/http';
import {
  checkInvariants,
  createTemplate,
  fromTemplateRow,
  instantiateTemplate,
  serialize,
  toPayload,
  toTemplateRequest,
} from 'src/app/shared/design-model';
import { AuthService } from 'src/app/shared/services/auth.service';
import { environment } from 'src/environments/environment';
import { environment as prodEnvironment } from 'src/environments/environment.prod';
import { designLabEnabled } from './design-lab.guard';
import { DesignTemplateStore } from './design-template-store.service';
import { LAB_PRESETS } from './lab-presets';

describe('design-lab guard', () => {
  it('is on for the dev environment and off for production', () => {
    expect(designLabEnabled(environment)).toBeTrue();
    expect(designLabEnabled(prodEnvironment)).toBeFalse();
    // A build with no flag at all stays closed.
    expect(designLabEnabled({})).toBeFalse();
  });
});

describe('design-lab presets', () => {
  it('every preset is a valid design that produces a payload', () => {
    expect(LAB_PRESETS.length).toBeGreaterThanOrEqual(17);
    for (const p of LAB_PRESETS) {
      const d = p.build();
      expect(checkInvariants(d)).withContext(p.key).toEqual([]);
      expect(() => toPayload(d)).withContext(p.key).not.toThrow();
    }
  });

  it('covers sliding, doors, tilt & turn and all four shaped frames', () => {
    const designs = LAB_PRESETS.map((p) => p.build());
    const shapes = new Set(designs.map((d) => d.frame.shape.kind));
    expect([...shapes].sort()).toEqual(['arch-top', 'circle', 'rect', 'trapezoid', 'triangle']);
    expect(designs.some((d) => d.productType === 'Door' && d.door?.leaves === 2)).toBeTrue();
    expect(serialize(designs.find((d) => d.door?.leaves === 1)!)).toContain('"threshold"');
    expect(designs.some((d) => serialize(d).includes('Tilt & Turn'))).toBeTrue();
    expect(designs.some((d) => serialize(d).includes('"fixed":true'))).toBeTrue();
    expect(designs.some((d) => serialize(d).includes('2.5 Track'))).toBeTrue();
  });

  it('every preset can be placed at another size as a template', () => {
    for (const p of LAB_PRESETS) {
      const d = p.build();
      const t = createTemplate(d, p.label, { tags: p.tags });
      const w = Math.round(d.frame.widthMm * 1.2);
      const h = d.frame.shape.kind === 'circle' ? w : Math.round(d.frame.heightMm * 1.1);
      const placed = instantiateTemplate(t, w, h).design;
      expect(placed.frame.widthMm).withContext(p.key).toBe(w);
      expect(checkInvariants(placed)).withContext(p.key).toEqual([]);
    }
  });
});

describe('DesignTemplateStore (no login: this browser)', () => {
  const KEY = 'upvc.design-lab.templates';
  let store: DesignTemplateStore;
  let kept: string | null;

  beforeEach(() => {
    kept = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    store = new DesignTemplateStore(
      null as unknown as HttpClient,
      { getToken: () => '' } as unknown as AuthService
    );
  });

  afterEach(() => {
    if (kept === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, kept);
  });

  it('saves a template in the api row shape and reads it back identical', async () => {
    expect(store.mode).toBe('local');
    const design = LAB_PRESETS.find((p) => p.key === 'door-double-top-light')!.build();
    const template = createTemplate(design, 'Front door', {
      tags: ['door', 'entrance'],
      resizeRule: 'preserve-locks',
    });
    const row = await store.add(toTemplateRequest(template));
    expect(row.id).toBe(1);
    expect(row.product_type).toBe('Door');
    // preserve-locks travels in its own field, not as a tag…
    expect(row.tags).toEqual(['door', 'entrance']);
    expect(row.resize_rule).toBe('preserve-locks');

    const rows = await store.list();
    expect(rows.length).toBe(1);
    const back = fromTemplateRow(rows[0]);
    // …and is stripped again on read.
    expect(back.tags).toEqual(['door', 'entrance']);
    expect(back.resizeRule).toBe('preserve-locks');
    expect(serialize(back.design)).toBe(serialize(design));
  });

  it('lists newest first, numbers ids and deletes by id', async () => {
    const d = LAB_PRESETS[0].build();
    const a = await store.add(toTemplateRequest(createTemplate(d, 'A')));
    const b = await store.add(toTemplateRequest(createTemplate(d, 'B')));
    expect([a.id, b.id]).toEqual([1, 2]);
    expect((await store.list()).map((r) => r.name)).toEqual(['B', 'A']);
    await store.remove(1);
    expect((await store.list()).map((r) => r.name)).toEqual(['B']);
  });

  it('uses the api when a login token is present', () => {
    const withToken = new DesignTemplateStore(
      null as unknown as HttpClient,
      { getToken: () => 'token' } as unknown as AuthService
    );
    expect(withToken.mode).toBe('api');
  });
});
