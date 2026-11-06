import { describe, it, expect } from 'vitest';
import { dataDistanteDeHoje } from '@/lib/dataSuspeita';

describe('dataDistanteDeHoje', () => {
  it('pede confirmação para data 2 anos atrás', () => {
    expect(dataDistanteDeHoje('2024-11-04', '2026-11-06')).toBe(true);
  });
  it('pede confirmação para data mais de 1 ano à frente', () => {
    expect(dataDistanteDeHoje('2027-11-07', '2026-11-06')).toBe(true);
  });
  it('não pede para data dentro de 1 ano', () => {
    expect(dataDistanteDeHoje('2026-01-15', '2026-11-06')).toBe(false);
    expect(dataDistanteDeHoje('2027-11-06', '2026-11-06')).toBe(false);
  });
});
