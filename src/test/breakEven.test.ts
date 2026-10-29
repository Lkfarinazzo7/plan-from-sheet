import { describe, it, expect } from 'vitest';
import { calcularBreakEven, BREAK_EVEN_PADRAO } from '@/lib/breakEven';

describe('calculadora de ponto de equilíbrio', () => {
  it('padrões 2,8 / 80 / 10 / 20 dão margem 1,7 por real', () => {
    const r = calcularBreakEven({ custoFixo: 34000, ...BREAK_EVEN_PADRAO });
    expect(r.margemPorReal).toBeCloseTo(1.7);
    expect(r.producaoNecessaria).toBeCloseTo(20000);
    expect(r.margem).toBeCloseTo(34000);
  });
  it('margem zero ou negativa não tem empate', () => {
    const r = calcularBreakEven({ custoFixo: 1000, multiplicadorComissao: 1, pctCorretor: 80, pctSupervisor: 10, pctLead: 20 });
    expect(r.possivel).toBe(false);
    expect(r.producaoNecessaria).toBeNull();
  });
  it('valor simulado com premissas alteradas', () => {
    const r = calcularBreakEven({ custoFixo: 10000, multiplicadorComissao: 3, pctCorretor: 50, pctSupervisor: 0, pctLead: 50 });
    expect(r.producaoNecessaria).toBeCloseTo(5000);
  });
});
