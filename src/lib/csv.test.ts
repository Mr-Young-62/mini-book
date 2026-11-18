import { describe, expect, it } from 'vitest';
import { buildCsv, escapeCsvValue } from './csv';

describe('escapeCsvValue', () => {
  it('quotes plain text without changing it', () => {
    expect(escapeCsvValue('C# Programming')).toBe('"C# Programming"');
  });

  it('escapes embedded double quotes', () => {
    expect(escapeCsvValue('He said "hi"')).toBe('"He said ""hi"""');
  });

  it('prefixes spreadsheet formulas', () => {
    expect(escapeCsvValue('=SUM(1,1)')).toBe('"\'=SUM(1,1)"');
    expect(escapeCsvValue('+1')).toBe('"\'+1"');
    expect(escapeCsvValue('-1')).toBe("\"'-1\"");
    expect(escapeCsvValue('@cmd')).toBe('"\'@cmd"');
  });

  it('renders empty values for null and undefined', () => {
    expect(escapeCsvValue(null)).toBe('""');
    expect(escapeCsvValue(undefined)).toBe('""');
  });
});

describe('buildCsv', () => {
  it('joins header and rows with CRLF', () => {
    const csv = buildCsv(['Category', 'Count'], [['C# Programming', 1]]);

    expect(csv).toBe('"Category","Count"\r\n"C# Programming","1"');
  });
});
