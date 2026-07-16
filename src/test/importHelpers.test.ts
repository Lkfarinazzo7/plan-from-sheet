import { describe, expect, it } from 'vitest';
import { parseDateFlexible, parseValorBR } from '@/lib/importHelpers';

describe('parseValorBR', () => {
  it.each([
    ['R$ 1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['1.500', 1500],
    ['10.25', 10.25],
  ])('converte %s para %s', (input, expected) => {
    expect(parseValorBR(input)).toBe(expected);
  });
});

describe('parseDateFlexible', () => {
  it('converte datas brasileiras e rejeita datas impossíveis', () => {
    expect(parseDateFlexible('31/05/2026')).toBe('2026-05-31');
    expect(parseDateFlexible('31/02/2026')).toBe('');
  });

  it('preserva datas ISO válidas', () => {
    expect(parseDateFlexible('2026-07-16')).toBe('2026-07-16');
  });
});
