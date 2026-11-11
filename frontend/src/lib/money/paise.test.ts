import { describe, expect, it } from 'vitest';
import {
  formatBigIntIndian,
  formatPaiseToInr,
  parseInrInputToPaise,
  sumPaise,
  toPaiseBigInt,
} from '@/lib/money/paise';

describe('Integer-paise financial helpers', () => {
  it('formats paise strings and bigints using Indian numbering without float drift', () => {
    expect(formatPaiseToInr('6500000')).toBe('₹65,000.00');
    expect(formatPaiseToInr(100000n)).toBe('₹1,000.00');
    expect(formatPaiseToInr('9999')).toBe('₹99.99');
    expect(formatPaiseToInr('12450000')).toBe('₹1,24,500.00');
    expect(formatPaiseToInr('0')).toBe('₹0.00');
    expect(formatPaiseToInr('-50050')).toBe('-₹500.50');
    expect(formatPaiseToInr(null)).toBe('—');
  });

  it('handles values larger than Number.MAX_SAFE_INTEGER cleanly', () => {
    const huge = 123456789012345678n;
    expect(formatBigIntIndian(huge)).toBe('1,23,45,67,89,01,23,45,678');
  });

  it('parses decimal INR strings to exact integer paise without IEEE-754 drift', () => {
    expect(parseInrInputToPaise('19.99')).toBe(1999n);
    expect(parseInrInputToPaise('65,000')).toBe(6500000n);
    expect(parseInrInputToPaise('₹1,245.5')).toBe(124550n);
    expect(() => parseInrInputToPaise('12.345')).toThrow();
    expect(() => parseInrInputToPaise('-10')).toThrow();
  });

  it('sums mixed paise inputs safely in BigInt', () => {
    expect(sumPaise(['10000', 25000n, null, undefined, '50'])).toBe(35050n);
    expect(toPaiseBigInt('42')).toBe(42n);
  });
});

