export type ComissaoItem = {
  contratoId: string;
  contratoNome: string;
  operadoraNome: string;
  dataImplantacao: string | null;
  papel: 'Supervisor A' | 'Supervisor B' | 'Corretor';
  campoPago: 'supervisor_a_pago' | 'supervisor_b_pago' | 'corretor_pago';
  pessoaId: string;
  pessoaNome: string;
  percentual: number | null;
  valor: number;
  pago: boolean;
};

export function calculateCommissionValue(
  baseValue: unknown,
  personId: unknown,
  percentage: unknown,
  savedValue: unknown,
): number {
  if (!personId) return 0;
  if (savedValue !== null && savedValue !== undefined && savedValue !== '') {
    const parsed = Number(savedValue);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const base = Number(baseValue) || 0;
  const pct = percentage === null || percentage === undefined || percentage === ''
    ? null
    : Number(percentage);
  return pct !== null && Number.isFinite(pct) ? (base * pct) / 100 : 0;
}

export function extractComissoes(contratos: any[]): ComissaoItem[] {
  const itens: ComissaoItem[] = [];
  for (const c of contratos || []) {
    const push = (
      papel: ComissaoItem['papel'],
      campoPago: ComissaoItem['campoPago'],
      pessoaId: string | null,
      pessoaNome: string | undefined,
      percentual: number | null,
      valorSalvo: number | null,
      pago: boolean,
    ) => {
      if (!pessoaId) return;
      itens.push({
        contratoId: c.id,
        contratoNome: c.nome,
        operadoraNome: c.operadoras?.nome || '—',
        dataImplantacao: c.data_implantacao || null,
        papel,
        campoPago,
        pessoaId,
        pessoaNome: pessoaNome || 'Desconhecido',
        percentual: percentual != null ? Number(percentual) : null,
        valor: calculateCommissionValue(c.valor_contrato, pessoaId, percentual, valorSalvo),
        pago: !!pago,
      });
    };
    push('Supervisor A', 'supervisor_a_pago', c.supervisor_a_id, c.supervisor_a?.nome, c.supervisor_a_percentual, c.supervisor_a_valor, c.supervisor_a_pago);
    push('Supervisor B', 'supervisor_b_pago', c.supervisor_b_id, c.supervisor_b?.nome, c.supervisor_b_percentual, c.supervisor_b_valor, c.supervisor_b_pago);
    push('Corretor', 'corretor_pago', c.corretor_id, c.corretor?.nome, c.corretor_percentual, c.corretor_valor, c.corretor_pago);
  }
  return itens;
}
