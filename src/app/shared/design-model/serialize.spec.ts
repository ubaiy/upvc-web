/**
 * Persistence tests: serialize→parse identity, schema validation, and the
 * migration registry (a frozen fixture per schema version, forever).
 */

import {
  clearMigrations,
  migrate,
  parse,
  parseStrict,
  ParseError,
  registerMigration,
  serialize,
} from './serialize';
import { DESIGN_SCHEMA } from './types';
import {
  mixedExampleB,
  singleFixed,
  slidingThreeTrackMesh,
  twoSashOpenable,
} from './testing/fixtures';

describe('serialize / parse', () => {
  afterEach(() => clearMigrations());

  it('parse(serialize(m)) equals m for every fixture', () => {
    for (const d of [
      singleFixed(),
      twoSashOpenable(),
      slidingThreeTrackMesh(),
      mixedExampleB(),
    ]) {
      expect(parse(serialize(d))).toEqual(d);
      // Byte-stable too: re-serializing the parsed document is identical.
      expect(serialize(parse(serialize(d)))).toBe(serialize(d));
    }
  });

  it('accepts an already-deserialized object (old_post_data.design)', () => {
    const d = mixedExampleB();
    expect(parse(JSON.parse(serialize(d)))).toEqual(d);
  });

  it('rejects malformed JSON and malformed documents', () => {
    expect(() => parse('{not json')).toThrowError(ParseError);
    expect(() => parse({} as object)).toThrowError(ParseError);
    expect(() =>
      parse({ ...singleFixed(), root: undefined } as unknown as object)
    ).toThrowError(ParseError);
  });

  it('rejects an unknown schema with no registered migration', () => {
    const doc = { ...singleFixed(), schema: 'upvc.design/999' };
    expect(() => parse(doc)).toThrowError(ParseError);
  });

  it('migrates an older schema through the registry', () => {
    // Frozen v0 fixture: pretend v0 lacked the glazing key.
    registerMigration({
      from: 'upvc.design/0',
      to: DESIGN_SCHEMA,
      migrate: (doc) => ({
        glazing: { glassId: null, barsH: 0, barsV: 0 },
        ...(doc as object),
        schema: DESIGN_SCHEMA,
      }),
    });
    const v0 = { ...singleFixed(), schema: 'upvc.design/0' } as Record<string, unknown>;
    delete v0['glazing'];
    const migrated = parse(v0);
    expect(migrated.schema).toBe(DESIGN_SCHEMA);
    expect(migrated.glazing).toEqual({ glassId: null, barsH: 0, barsV: 0 });
    expect(migrated.frame.widthMm).toBe(1500);
  });

  it('chains multi-step migrations and detects non-terminating chains', () => {
    registerMigration({
      from: 'upvc.design/-1',
      to: 'upvc.design/0',
      migrate: (doc) => ({ ...(doc as object), schema: 'upvc.design/0' }),
    });
    registerMigration({
      from: 'upvc.design/0',
      to: DESIGN_SCHEMA,
      migrate: (doc) => ({ ...(doc as object), schema: DESIGN_SCHEMA }),
    });
    const old = { ...singleFixed(), schema: 'upvc.design/-1' };
    expect(migrate(old).schema).toBe(DESIGN_SCHEMA);

    clearMigrations();
    registerMigration({
      from: 'upvc.design/0',
      to: 'upvc.design/0',
      migrate: (doc) => doc, // never advances
    });
    expect(() => migrate({ ...singleFixed(), schema: 'upvc.design/0' }))
      .toThrowError(ParseError);
  });

  it('parseStrict also enforces value invariants', () => {
    const bad = singleFixed();
    (bad.frame as { widthMm: number }).widthMm = 10; // below the 200 clamp
    expect(() => parseStrict(JSON.parse(serialize(bad)))).toThrow();
    expect(parseStrict(serialize(mixedExampleB()))).toBeTruthy();
  });
});
