export interface BreakEvenInput {
  custoFixo: number;
  /** Comissão recebida da operadora, em múltiplos do valor do contrato (ex.: 2.8). */
  multiplicadorComissao: number;
  /** Percentuais sobre o valor do contrato (ex.: 80 = 80%). */
  pctCorretor: number;
  pctSupervisor: number;
  pctLead: number;
}

export const BREAK_EVEN_PADRAO = { multiplicadorComissao: 2.8, pctCorretor: 80, pctSupervisor: 10, pctLead: 20 };

export interface BreakEvenResult {
  margemPorReal: number;
  possivel: boolean;
  producaoNecessaria: number | null;
  comissaoRecebida: number;
  corretor: number;
  supervisor: number;
  lead: number;
  margem: number;
}

export function calcularBreakEven(i: BreakEvenInput): BreakEvenResult {
  const n = (v: number) => (Number.isFinite(v) ? v : 0);
  const margemPorReal = n(i.multiplicadorComissao) - (n(i.pctCorretor) + n(i.pctSupervisor) + n(i.pctLead)) / 100;
  const possivel = margemPorReal > 0;
  const custo = Math.max(0, n(i.custoFixo));
  const p = possivel ? custo / margemPorReal : null;
  const base = p ?? 0;
  return {
    margemPorReal,
    possivel,
    producaoNecessaria: p,
    comissaoRecebida: base * n(i.multiplicadorComissao),
    corretor: base * n(i.pctCorretor) / 100,
    supervisor: base * n(i.pctSupervisor) / 100,
    lead: base * n(i.pctLead) / 100,
    margem: base * margemPorReal,
  };
}
