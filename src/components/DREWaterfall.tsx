import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/format';
import type { DREResult } from '@/hooks/useFinancialData';

interface Props { dre: DREResult | null | undefined; isLoading?: boolean; }
const regimeLabel = { competencia: 'Competência', realizado: 'Caixa realizado', projetado: 'Vencimentos em aberto' };

/** A cascata usa exclusivamente o resultado canônico compartilhado com o MCP. */
export function DREWaterfall({ dre, isLoading }: Props) {
  if (isLoading) return <Card><CardContent className="py-8">Carregando DRE…</CardContent></Card>;
  if (!dre) return <Card><CardContent className="py-8">Selecione um período para ver o DRE.</CardContent></Card>;
  const d = dre.detalhe;
  const rows: [string, number, boolean?][] = [
    ['Receita operacional bruta', d.receita_bruta],
    ['(−) Deduções sobre receita', -d.deducoes],
    ['Receita líquida', d.receita_liquida, true],
    ['(−) Custos variáveis', -d.custos_variaveis],
    ['Margem de contribuição', d.margem_contribuicao, true],
    ['(−) Despesas fixas', -d.despesas_fixas],
    ['(−) Despesas comerciais', -d.despesas_comerciais],
    ['Resultado antes de depreciação', d.resultado_antes_depreciacao, true],
    ['(−) Depreciação/amortização', -d.depreciacao_amortizacao],
    ['Resultado operacional', d.resultado_operacional, true],
    ['(±) Resultado financeiro', d.resultado_financeiro],
    ['Resultado antes dos tributos', d.resultado_antes_tributos, true],
    ['(−) Tributos sobre lucro', -d.tributos_lucro],
    ['Resultado líquido', d.resultado_liquido, true],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">DRE — {regimeLabel[d.regime]}</CardTitle>
        <p className="text-xs text-muted-foreground">Margem de contribuição antes das despesas fixas e comerciais. Não inclui principal de empréstimos ou investimentos.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div role="status" aria-label="Qualidade dos dados do DRE" className="rounded-md border p-3 text-sm space-y-1">
          <p>Cobertura de datas dos lançamentos candidatos: {d.pendencias.cobertura_percentual === null ? 'sem dados' : d.pendencias.cobertura_percentual + '%'}.</p>
          <p>Sem classificação: {d.nao_classificado.quantidade} lançamento(s), {formatCurrency(d.nao_classificado.valor)} fora do resultado.</p>
          {d.pendencias.avisos.map((aviso, i) => <p key={i} className="text-muted-foreground">{aviso}</p>)}
          <p className="text-xs">Pendências sem data não podem ser atribuídas a um mês: abrangem o histórico da unidade/setor selecionado. Totais incompletos não representam ausência de movimentação.</p>
        </div>
        <table className="w-full text-sm" aria-label={'DRE por ' + regimeLabel[d.regime]}>
          <thead><tr className="border-b"><th scope="col" className="text-left py-2">Linha gerencial</th><th scope="col" className="text-right">Valor</th></tr></thead>
          <tbody>{rows.map(([name, value, total]) => (
            <tr key={name} className={'border-b ' + (total ? 'bg-muted/40 font-semibold' : '')}>
              <th scope="row" className="py-2 text-left font-[inherit]">{name}</th>
              <td className={'text-right tabular-nums ' + (value < 0 ? 'text-destructive' : '')}>{formatCurrency(value)}</td>
            </tr>
          ))}</tbody>
        </table>
        <p className="text-sm">Margem de contribuição: {d.margens.contribuicao === null ? 'não calculável' : d.margens.contribuicao + '%'} da receita líquida. Margem operacional: {d.margens.operacional === null ? 'não calculável' : d.margens.operacional + '%'}. Margem líquida: {d.margens.liquida === null ? 'não calculável' : d.margens.liquida + '%'}.</p>
        <p className="text-xs text-muted-foreground">Movimentações fora do DRE: {d.fora_dre.quantidade} registro(s), {formatCurrency(d.fora_dre.valor)}. Depreciação somente quando houver apropriação explicitamente cadastrada.</p>
      </CardContent>
    </Card>
  );
}
