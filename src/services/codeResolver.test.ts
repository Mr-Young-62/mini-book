import { describe, expect, it } from 'vitest';
import { resolveScannedCode } from './codeResolver';

describe('resolveScannedCode', () => {
  it('recognizes an ISBN-13 with an EAN add-on', () => {
    expect(resolveScannedCode('9780306406157 12')).toMatchObject({
      kind: 'isbn',
      isbn13: '9780306406157',
    });
  });

  it('recognizes an internal inventory code', () => {
    expect(resolveScannedCode('RDW-000123')).toMatchObject({
      kind: 'internal',
      code: 'RDW-000123',
    });
  });

  it('reports an ISBN-shaped code with a bad checksum', () => {
    expect(resolveScannedCode('9780306406158')).toMatchObject({
      kind: 'invalid_isbn',
      digits: '9780306406158',
    });
  });
});
