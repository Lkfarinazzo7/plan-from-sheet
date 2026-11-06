import { describe, it, expect } from 'vitest';
import { periodRange, periodLabel, isValidPeriod } from '@/lib/exportPeriod';

describe('exportPeriod', () => {
  it('janeiro a outubro de 2026', () => {
    expect(periodRange(0, 2026, 9, 2026)).toEqual({ start: '2026-01-01', end: '2026-10-31' });
  });
  it('fevereiro bissexto', () => {
    expect(periodRange(1, 2028, 1, 2028).end).toBe('2028-02-29');
  });
  it('rótulo do arquivo', () => {
    expect(periodLabel(0, 2026, 9, 2026)).toBe('Jan-2026_a_Out-2026');
  });
  it('início depois do fim é inválido', () => {
    expect(isValidPeriod(10, 2026, 9, 2026)).toBe(false);
  });
});
