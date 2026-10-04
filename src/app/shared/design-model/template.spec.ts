/**
 * Design-template tests (Phase 2 item 2.3): snapshotting, parametric
 * instantiation (proportional vs preserve-locks), clamp warnings, and
 * persistence round-trips.
 */

import { checkInvariants } from './invariants';
import {
  createDesign,
  setDividerMm,
  splitPane,
} from './operations';
import { toPayload } from './payload';
import {
  createTemplate,
  instantiateTemplate,
  parseTemplate,
  serializeTemplate,
  TEMPLATE_SCHEMA,
} from './template';
import { SplitNode, WindowDesign } from './types';

/** 1500×1200, vertical mullion at 690 (two 660 panes). */
function mullioned(): WindowDesign {
  let d = createDesign({
    frame: { widthMm: 1500, heightMm: 1200, productId: 8, colorId: 4 },
    glazing: { glassId: 1 },
  });
  d = splitPane(d, 'p1', 'x', 690, { dividerProfileId: 55, dividerFaceMm: 60 });
  return d;
}

describe('createTemplate', () => {
  it('snapshots the design deeply and trims metadata', () => {
    const d = mullioned();
    const t = createTemplate(d, '  Standard bedroom  ', {
      tags: [' bedroom ', '', 'standard'],
      resizeRule: 'preserve-locks',
    });
    expect(t.schema).toBe(TEMPLATE_SCHEMA);
    expect(t.name).toBe('Standard bedroom');
    expect(t.tags).toEqual(['bedroom', 'standard']);
    expect(t.thumbnail).toEqual({ kind: 'none' });
    // Deep copy: mutating the template leaves the source design alone.
    (t.design.root as SplitNode).positionsMm[0] = 999;
    expect((d.root as SplitNode).positionsMm[0]).toBe(690);
  });

  it('rejects an empty name', () => {
    expect(() => createTemplate(mullioned(), '   ')).toThrowError(/name/);
  });
});

describe('instantiateTemplate — proportional', () => {
  it('rescales every divider with the frame, ignoring locks', () => {
    // Lock the divider via typed mm first: proportional must IGNORE it.
    let d = mullioned();
    d = setDividerMm(d, 'p1', 0, 690);
    const t = createTemplate(d, 'prop', { resizeRule: 'proportional' });
    const { design, warnings } = instantiateTemplate(t, 3000, 2400);
    expect(warnings).toEqual([]);
    expect(design.frame.widthMm).toBe(3000);
    expect(design.frame.heightMm).toBe(2400);
    // Daylight 1380 → 2880; centreline 690 (midpoint) → 1440 (midpoint).
    expect((design.root as SplitNode).positionsMm[0]).toBeCloseTo(1440, 6);
    expect(checkInvariants(design)).toEqual([]);
    // The instance prices like a freshly drawn window of that size.
    const payload = toPayload(design);
    expect(payload.width).toBe(3000);
    expect(payload.parts.length).toBe(2);
    expect(payload.parts[0].width).toBe(1410); // (2880 − 60) / 2
  });

  it('keeps proportions at a smaller size too', () => {
    const t = createTemplate(mullioned(), 'small');
    const { design } = instantiateTemplate(t, 750, 600);
    // Daylight 630; divider at midpoint 315.
    expect((design.root as SplitNode).positionsMm[0]).toBeCloseTo(315, 6);
    expect(checkInvariants(design)).toEqual([]);
  });
});

describe('instantiateTemplate — preserve-locks', () => {
  it('locked dividers keep their mm, unlocked ones scale', () => {
    let d = mullioned();
    d = setDividerMm(d, 'p1', 0, 500); // locked at 500 mm
    const t = createTemplate(d, 'locked', { resizeRule: 'preserve-locks' });
    const { design, warnings } = instantiateTemplate(t, 3000, 2400);
    expect(warnings).toEqual([]);
    expect((design.root as SplitNode).positionsMm[0]).toBe(500); // kept
    expect((design.root as SplitNode).lockedMm[0]).toBeTrue();
    expect(checkInvariants(design)).toEqual([]);
  });

  it('warns when a locked divider must clamp to fit', () => {
    let d = mullioned();
    d = setDividerMm(d, 'p1', 0, 1000); // locked near the right edge
    const t = createTemplate(d, 'clamp', { resizeRule: 'preserve-locks' });
    // 700 frame → 580 daylight: a 1000 mm lock cannot survive.
    const { design, warnings } = instantiateTemplate(t, 700, 900);
    expect(warnings.some((w) => w.includes('locked divider'))).toBeTrue();
    expect(checkInvariants(design)).toEqual([]);
  });
});

describe('instantiateTemplate — frame clamping', () => {
  it('clamps to the 200–5800 bounds and reports it', () => {
    const t = createTemplate(mullioned(), 'huge');
    const { design, warnings } = instantiateTemplate(t, 9000, 9000);
    expect(design.frame.widthMm).toBe(5800);
    expect(warnings.some((w) => w.includes('clamped'))).toBeTrue();
    expect(checkInvariants(design)).toEqual([]);
  });

  it('floors at the design’s required minimum', () => {
    const t = createTemplate(mullioned(), 'tiny');
    const { design, warnings } = instantiateTemplate(t, 100, 100);
    // Two 50-mm panes + 60 bar + 2×60 frame = 280 wide minimum.
    expect(design.frame.widthMm).toBe(280);
    expect(design.frame.heightMm).toBe(200);
    expect(warnings.length).toBe(1);
    expect(checkInvariants(design)).toEqual([]);
  });
});

describe('template persistence', () => {
  it('serialize → parse round-trips byte-identically', () => {
    const t = createTemplate(mullioned(), 'rt', {
      tags: ['a'],
      thumbnail: { kind: 'dataUrl', value: 'data:image/png;base64,xyz' },
      resizeRule: 'preserve-locks',
    });
    const back = parseTemplate(serializeTemplate(t));
    expect(JSON.stringify(back)).toBe(JSON.stringify(t));
  });

  it('accepts an already-deserialized object', () => {
    const t = createTemplate(mullioned(), 'obj');
    const back = parseTemplate(JSON.parse(serializeTemplate(t)) as object);
    expect(back.name).toBe('obj');
  });

  it('rejects malformed input', () => {
    expect(() => parseTemplate('{nope')).toThrowError(/not valid JSON/);
    expect(() => parseTemplate({})).toThrowError(/schema/);
    expect(() =>
      parseTemplate({ schema: TEMPLATE_SCHEMA, name: '', resizeRule: 'proportional', design: {} })
    ).toThrowError(/name/);
    const t = createTemplate(mullioned(), 'bad-rule') as unknown as {
      resizeRule: string;
    };
    t.resizeRule = 'stretchy';
    expect(() => parseTemplate(JSON.stringify(t))).toThrowError(/resizeRule/);
  });

  it('defaults a missing/unknown thumbnail to none and filters tags', () => {
    const t = createTemplate(mullioned(), 'thumbs');
    const raw = JSON.parse(serializeTemplate(t)) as Record<string, unknown>;
    delete raw['thumbnail'];
    raw['tags'] = ['ok', 42, null];
    const back = parseTemplate(raw as object);
    expect(back.thumbnail).toEqual({ kind: 'none' });
    expect(back.tags).toEqual(['ok']);
  });
});
