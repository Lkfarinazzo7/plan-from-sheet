import type { PipelineItem } from '@/components/pipeline/PipelineCard';

export function getPendencias(item: PipelineItem): string[] {
  const p: string[] = [];
  if (!item.operadora_id) p.push('operadora');
  if (!item.valor_mensal || Number(item.valor_mensal) <= 0) p.push('valor');
  if (!item.data_vigencia) p.push('vigência');
  if (!item.numero_proposta) p.push('nº proposta');
  const dp: any = (item as any).dados_proposta || {};
  if (!dp.cnpj_cpf) p.push(item.tipo === 'PJ' ? 'CNPJ' : 'CPF');
  if (!dp.vidas) p.push('vidas');
  return p;
}
