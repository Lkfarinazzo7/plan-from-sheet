import { describe, expect, it } from 'vitest';
import { calculateCommissionValue, extractComissoes } from '@/lib/commissionHelpers';

describe('calculateCommissionValue', () => {
  it('respeita um valor manual igual a zero', () => {
    expect(calculateCommissionValue(1000, 'pessoa-1', 10, 0)).toBe(0);
  });

  it('calcula pelo percentual apenas quando não há valor manual', () => {
    expect(calculateCommissionValue(1000, 'pessoa-1', 10, null)).toBe(100);
  });

  it('não gera comissão sem pessoa responsável', () => {
    expect(calculateCommissionValue(1000, null, 10, 100)).toBe(0);
  });
});

describe('extractComissoes', () => {
  it('ignora slots vazios e preserva valor zero', () => {
    const result = extractComissoes([{
      id: 'contrato-1',
      nome: 'Cliente A',
      valor_contrato: 1000,
      supervisor_a_id: null,
      supervisor_a_percentual: 10,
      supervisor_a_valor: 100,
      supervisor_a_pago: false,
      supervisor_b_id: null,
      corretor_id: 'corretor-1',
      corretor: { nome: 'Corretor' },
      corretor_percentual: 10,
      corretor_valor: 0,
      corretor_pago: false,
    }]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ pessoaId: 'corretor-1', valor: 0 });
  });
});
