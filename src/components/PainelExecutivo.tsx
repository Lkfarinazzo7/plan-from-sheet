import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/lib/format';
import { carregarLancamentosRelatorio, fetchAllRows } from '@/lib/financialReporting';
import {
  calcularPainel, periodoAnterior, qualidadeFinanceira, indicadoresPorCorretor, METAS_PADRAO,
  type LancamentoExec, type Metas, type StatusMeta,
} from '@/lib/painelExecutivo';
import { Settings2 } from 'lucide-react';

type Props = { inicio: string; fim: string; unidade: string; setor: string };

const STATUS_LABEL: Record<StatusMeta, { t: string; c: string }> = {
  saudavel: { t: 'Saudável', c: 'bg-success/15 text-success' },
  atencao: { t: 'Atenção', c: 'bg-warning/15 text-warning' },
  critico: { t: 'Crítico', c: 'bg-destructive/15 text-destructive' },
  sem_dados: { t: 'Sem dados', c: 'bg-muted text-muted-foreground' },
};
const Badge = ({ s }: { s: StatusMeta }) => <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_LABEL[s].c}`}>{STATUS_LABEL[s].t}</span>;
const fp = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(1)}%`);

function Delta({ atual, anterior, pp }: { atual: number | null; anterior: number | null; pp?: boolean }) {
  if (atual == null || anterior == null) return null;
  if (pp) { const d = atual - anterior; return <span className={`text-xs ${d >= 0 ? 'text-success' : 'text-destructive'}`}>{d >= 0 ? '+' : ''}{d.toFixed(1)} p.p. vs anterior</span>; }
  if (anterior === 0) return null;
  const d = ((atual - anterior) / Math.abs(anterior)) * 100;
  return <span className={`text-xs ${d >= 0 ? 'text-success' : 'text-destructive'}`}>{d >= 0 ? '+' : ''}{d.toFixed(1)}% vs anterior</span>;
}

function Linha({ rotulo, valor, extra }: { rotulo: string; valor: string; extra?: React.ReactNode }) {
  return <div className="flex items-baseline justify-between gap-2 py-1 border-b last:border-0"><span className="text-sm text-muted-foreground">{rotulo}</span><span className="text-right"><span className="font-semibold">{valor}</span>{extra && <div>{extra}</div>}</span></div>;
}

function MetasEditor({ metas }: { metas: Metas }) {
  const qc = useQueryClient();
  const [v, setV] = useState(metas);
  const salvar = useMutation({
    mutationFn: async () => {
      const rows = Object.entries(v).map(([chave, valor]) => ({ chave, valor: Number(valor) }));
      const { error } = await supabase.from('metas_financeiras' as any).upsert(rows as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['metas-financeiras'] }),
  });
  const campo = (k: keyof Metas, l: string) => (
    <div><label className="text-xs text-muted-foreground">{l}</label><Input type="number" value={v[k]} onChange={e => setV({ ...v, [k]: Number(e.target.value) })} /></div>
  );
  return (
    <Popover onOpenChange={o => o && setV(metas)}>
      <PopoverTrigger asChild><Button variant="outline" size="sm" className="gap-1"><Settings2 className="h-4 w-4" />Metas</Button></PopoverTrigger>
      <PopoverContent align="end" className="space-y-2 w-64">
        {campo('margem_contribuicao_min', 'Margem de contribuição mínima (%)')}
        {campo('custo_fixo_max', 'Custo fixo máximo (% da receita)')}
        {campo('geracao_caixa_min', 'Geração de caixa mínima (%)')}
        <Button size="sm" className="w-full" onClick={() => salvar.mutate()} disabled={salvar.isPending}>Salvar metas</Button>
        {salvar.error && <p className="text-xs text-destructive">{String((salvar.error as any).message)}</p>}
      </PopoverContent>
    </Popover>
  );
}

export function PainelExecutivo({ inicio, fim, unidade, setor }: Props) {
  const { data: metas = METAS_PADRAO } = useQuery({
    queryKey: ['metas-financeiras'],
    queryFn: async (): Promise<Metas> => {
      const { data, error } = await supabase.from('metas_financeiras' as any).select('chave,valor');
      if (error) throw error;
      const m = { ...METAS_PADRAO };
      for (const r of (data ?? []) as any[]) if (r.chave in m) (m as any)[r.chave] = Number(r.valor);
      return m;
    },
  });
  const { data: base } = useQuery({
    queryKey: ['painel-base'],
    queryFn: async () => {
      const [lancs, series, contratos, receitas] = await Promise.all([
        carregarLancamentosRelatorio(supabase) as Promise<LancamentoExec[]>,
        fetchAllRows((f, t) => supabase.from('series_recorrencia').select('id,nome,tipo,ativa').order('id').range(f, t)),
        fetchAllRows((f, t) => supabase.from('contratos').select('id,valor_contrato,data_implantacao,unidade_negocio,corretor_id,corretor_valor,corretor_percentual,corretor_pago,supervisor_a_id,supervisor_a_valor,supervisor_a_percentual,supervisor_a_pago,supervisor_b_id,supervisor_b_valor,supervisor_b_percentual,supervisor_b_pago,vendedores(nome)').order('id').range(f, t)),
        fetchAllRows((f, t) => supabase.from('receitas').select('id,contrato_id,valor,status,cancelado').not('contrato_id', 'is', null).order('id').range(f, t)),
      ]);
      return { lancs, series, contratos, receitas };
    },
  });

  if (!base) return <p className="text-sm text-muted-foreground">Carregando painel executivo…</p>;
  const filtros = { unidade, setor };
  const p = calcularPainel(base.lancs, inicio, fim, filtros, metas);
  const ant = periodoAnterior(inicio, fim);
  const a = calcularPainel(base.lancs, ant.inicio, ant.fim, filtros, metas);
  const q = qualidadeFinanceira(base.lancs, base.series as any);

  const contratosPeriodo = (base.contratos as any[])
    .filter(c => c.data_implantacao && c.data_implantacao >= inicio && c.data_implantacao <= fim)
    .filter(c => unidade === 'all' || (unidade === 'none' ? !c.unidade_negocio : c.unidade_negocio === unidade))
    .map(c => ({
      id: c.id, corretor_id: c.corretor_id, corretor_nome: c.vendedores?.nome, valor_contrato: c.valor_contrato, data_implantacao: c.data_implantacao,
      slots: [
        { pessoa: c.corretor_id, valor: c.corretor_valor, percentual: c.corretor_percentual, pago: c.corretor_pago },
        { pessoa: c.supervisor_a_id, valor: c.supervisor_a_valor, percentual: c.supervisor_a_percentual, pago: c.supervisor_a_pago },
        { pessoa: c.supervisor_b_id, valor: c.supervisor_b_valor, percentual: c.supervisor_b_percentual, pago: c.supervisor_b_pago },
      ],
    }));
  const corretores = indicadoresPorCorretor(contratosPeriodo, base.receitas as any);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold">Painel de gestão</h3>
          <p className="text-xs text-muted-foreground">DRE por competência · caixa por data efetiva · comparado a {ant.inicio.split('-').reverse().join('/')} – {ant.fim.split('-').reverse().join('/')}</p>
        </div>
        <MetasEditor metas={metas} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Receita</CardTitle></CardHeader><CardContent>
          <Linha rotulo="Receita bruta" valor={formatCurrency(p.receita.bruta)} extra={<Delta atual={p.receita.bruta} anterior={a.receita.bruta} />} />
          <Linha rotulo="Recebida (da competência)" valor={formatCurrency(p.receita.recebida)} />
          <Linha rotulo="A receber (da competência)" valor={formatCurrency(p.receita.a_receber)} />
        </CardContent></Card>

        <Card><CardHeader className="pb-2 flex-row items-center justify-between"><CardTitle className="text-sm">Margem</CardTitle><Badge s={p.status.margem} /></CardHeader><CardContent>
          <Linha rotulo="Margem de contribuição" valor={formatCurrency(p.margem.contribuicao)} extra={<Delta atual={p.margem.contribuicao} anterior={a.margem.contribuicao} />} />
          <Linha rotulo="Margem de contribuição %" valor={fp(p.margem.contribuicao_pct)} extra={<Delta pp atual={p.margem.contribuicao_pct} anterior={a.margem.contribuicao_pct} />} />
          <div className="mt-2 h-2 rounded bg-muted relative overflow-hidden">
            <div className="h-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, p.margem.contribuicao_pct ?? 0))}%` }} />
            <div className="absolute top-0 h-full w-0.5 bg-foreground" style={{ left: `${metas.margem_contribuicao_min}%` }} title="Meta mínima" />
          </div>
          <p className="text-xs text-muted-foreground mt-1">Meta mínima: {metas.margem_contribuicao_min}%</p>
        </CardContent></Card>

        <Card><CardHeader className="pb-2 flex-row items-center justify-between"><CardTitle className="text-sm">Custos</CardTitle><Badge s={p.status.custoFixo} /></CardHeader><CardContent>
          <Linha rotulo="Custos variáveis" valor={formatCurrency(p.custos.variaveis)} />
          <Linha rotulo="… dos quais comissões" valor={formatCurrency(p.custos.comissoes)} />
          <Linha rotulo="Despesas comerciais" valor={formatCurrency(p.custos.comerciais)} />
          <Linha rotulo="Custos fixos" valor={formatCurrency(p.custos.fixos)} extra={<span className="text-xs text-muted-foreground">{fp(p.custos.fixo_pct)} da receita (meta ≤ {metas.custo_fixo_max}%)</span>} />
        </CardContent></Card>

        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Resultado</CardTitle></CardHeader><CardContent>
          <Linha rotulo="Resultado operacional" valor={formatCurrency(p.resultado.operacional)} extra={<Delta atual={p.resultado.operacional} anterior={a.resultado.operacional} />} />
          <Linha rotulo="Margem operacional" valor={fp(p.resultado.operacional_pct)} />
          <Linha rotulo="Resultado líquido" valor={formatCurrency(p.resultado.liquido)} />
          <Linha rotulo="Margem líquida" valor={fp(p.resultado.liquido_pct)} extra={<Delta pp atual={p.resultado.liquido_pct} anterior={a.resultado.liquido_pct} />} />
        </CardContent></Card>

        <Card><CardHeader className="pb-2 flex-row items-center justify-between"><CardTitle className="text-sm">Caixa realizado</CardTitle><Badge s={p.status.caixa} /></CardHeader><CardContent>
          <Linha rotulo="Entradas" valor={formatCurrency(p.geracaoCaixa.entradas)} />
          <Linha rotulo="Saídas" valor={formatCurrency(p.geracaoCaixa.saidas)} />
          <Linha rotulo="Geração de caixa" valor={formatCurrency(p.geracaoCaixa.geracao)} />
          <Linha rotulo="Geração de caixa %" valor={fp(p.geracaoCaixa.pct)} extra={<span className="text-xs text-muted-foreground">meta ≥ {metas.geracao_caixa_min}%</span>} />
        </CardContent></Card>

        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Break-even</CardTitle></CardHeader><CardContent>
          <Linha rotulo="Break-even do período" valor={p.breakEven.valor == null ? '—' : formatCurrency(p.breakEven.valor)} />
          <Linha rotulo="Falta para atingir" valor={p.breakEven.falta == null ? '—' : formatCurrency(p.breakEven.falta)} />
          <Linha rotulo="Atingido" valor={fp(p.breakEven.atingido_pct)} />
          <p className="text-xs text-muted-foreground mt-1">(Fixas + comerciais) ÷ margem de contribuição %</p>
        </CardContent></Card>
      </div>

      <Card><CardHeader className="pb-2 flex-row items-center justify-between"><CardTitle className="text-sm">Qualidade financeira</CardTitle><span className="text-sm font-semibold">Cobertura {fp(q.cobertura_pct)}</span></CardHeader><CardContent className="grid md:grid-cols-2 gap-x-8">
        <Linha rotulo="Sem competência" valor={String(q.itens.sem_competencia.quantidade)} />
        <Linha rotulo="Pagos/recebidos sem data efetiva" valor={String(q.itens.liquidados_sem_data_efetiva.quantidade)} />
        <Linha rotulo="Abertos sem vencimento" valor={String(q.itens.abertos_sem_vencimento.quantidade)} />
        <Linha rotulo="Sem grupo DRE" valor={String(q.itens.sem_grupo_dre.quantidade)} />
        <Linha rotulo="Datas preenchidas por regra de legado" valor={String(q.itens.datas_de_legado.quantidade)} />
        <Linha rotulo="Despesas de comissão sem vínculo a contrato" valor={`${q.itens.comissoes_sem_vinculo.quantidade} (${formatCurrency(q.itens.comissoes_sem_vinculo.valor)})`} />
        <Linha rotulo="Séries recorrentes possivelmente duplicadas" valor={String(q.seriesDuplicadas.length)} />
        <Linha rotulo="Séries com 2+ lançamentos no mesmo mês" valor={String(q.ocorrenciasRepetidas.length)} />
        {q.seriesDuplicadas.length > 0 && <p className="md:col-span-2 text-xs text-muted-foreground pt-2">Possíveis duplicadas: {q.seriesDuplicadas.map(s => `${s.nome} (${s.ids.length})`).join(', ')}. Nada é apagado automaticamente.</p>}
      </CardContent></Card>

      <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Indicadores por corretor (contratos implantados no período)</CardTitle></CardHeader><CardContent className="overflow-x-auto">
        {corretores.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum contrato implantado no período.</p> : (
          <Table><TableHeader><TableRow>
            <TableHead>Corretor</TableHead><TableHead className="text-right">Contratos</TableHead><TableHead className="text-right">Produção</TableHead><TableHead className="text-right">Ticket médio</TableHead>
            <TableHead className="text-right">Receita</TableHead><TableHead className="text-right">Recebida</TableHead><TableHead className="text-right">Comissão</TableHead><TableHead className="text-right">Paga</TableHead>
            <TableHead className="text-right">Comissão %</TableHead><TableHead className="text-right">Margem empresa</TableHead><TableHead className="text-right">Margem %</TableHead>
          </TableRow></TableHeader><TableBody>
            {corretores.map(c => <TableRow key={c.corretor_id ?? 'sem'}>
              <TableCell className="font-medium">{c.nome}</TableCell><TableCell className="text-right">{c.contratos}</TableCell>
              <TableCell className="text-right">{formatCurrency(c.producao)}</TableCell><TableCell className="text-right">{formatCurrency(c.ticket_medio)}</TableCell>
              <TableCell className="text-right">{formatCurrency(c.receita)}</TableCell><TableCell className="text-right">{formatCurrency(c.recebida)}</TableCell>
              <TableCell className="text-right">{formatCurrency(c.comissao)}</TableCell><TableCell className="text-right">{formatCurrency(c.comissao_paga)}</TableCell>
              <TableCell className="text-right">{fp(c.comissao_pct)}</TableCell>
              <TableCell className={`text-right font-semibold ${c.margem >= 0 ? 'text-success' : 'text-destructive'}`}>{formatCurrency(c.margem)}</TableCell>
              <TableCell className="text-right">{fp(c.margem_pct)}</TableCell>
            </TableRow>)}
          </TableBody></Table>
        )}
        <p className="text-xs text-muted-foreground mt-2">Receita = receitas vinculadas ao contrato. Comissão inclui corretor e supervisores do contrato.</p>
      </CardContent></Card>
    </div>
  );
}
