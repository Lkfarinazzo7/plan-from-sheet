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
  calcularPainel, periodoAnterior, indicadoresPorCorretor, indicadoresPorEquipe, METAS_PADRAO,
  type LancamentoExec, type Metas, type StatusMeta,
} from '@/lib/painelExecutivo';
import { Settings2, ChartNoAxesCombined } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
  const [fEquipe, setFEquipe] = useState('all');
  const [fSup, setFSup] = useState('all');
  const [fCorretor, setFCorretor] = useState('all');
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
      const [lancs, contratos, receitas, equipes, vendedores, supervisores] = await Promise.all([
        carregarLancamentosRelatorio(supabase) as Promise<LancamentoExec[]>,
        fetchAllRows((f, t) => supabase.from('contratos').select('id,valor_contrato,data_implantacao,unidade_negocio,corretor_id,corretor_valor,corretor_percentual,corretor_pago,supervisor_a_id,supervisor_a_valor,supervisor_a_percentual,supervisor_a_pago,supervisor_b_id,supervisor_b_valor,supervisor_b_percentual,supervisor_b_pago,vendedores(nome)').order('id').range(f, t)),
        fetchAllRows((f, t) => supabase.from('receitas').select('id,contrato_id,valor,status,cancelado').not('contrato_id', 'is', null).order('id').range(f, t)),
        fetchAllRows((f, t) => supabase.from('equipes' as any).select('id,nome,supervisor_id,ativo').order('id').range(f, t)),
        fetchAllRows((f, t) => supabase.from('vendedores').select('id,nome,ativo,equipe_id' as any).order('id').range(f, t)),
        fetchAllRows((f, t) => supabase.from('supervisores').select('id,nome,ativo').order('id').range(f, t)),
      ]);
      return { lancs, contratos, receitas, equipes: equipes as any[], vendedores: vendedores as any[], supervisores: supervisores as any[] };
    },
  });

  if (!base) return <p className="text-sm text-muted-foreground">Carregando painel executivo…</p>;
  const filtros = { unidade, setor };
  const p = calcularPainel(base.lancs, inicio, fim, filtros, metas);
  const ant = periodoAnterior(inicio, fim);
  const a = calcularPainel(base.lancs, ant.inicio, ant.fim, filtros, metas);
  const equipeDe = new Map<string, string | null>(base.vendedores.map(v => [v.id, v.equipe_id]));
  const equipesAtivas = base.equipes.filter(e => e.ativo);
  const contratosPeriodo = (base.contratos as any[])
    .filter(c => c.data_implantacao && c.data_implantacao >= inicio && c.data_implantacao <= fim)
    .filter(c => unidade === 'all' || (unidade === 'none' ? !c.unidade_negocio : c.unidade_negocio === unidade))
    .filter(c => fCorretor === 'all' || c.corretor_id === fCorretor)
    .filter(c => fSup === 'all' || c.supervisor_a_id === fSup || c.supervisor_b_id === fSup)
    .filter(c => fEquipe === 'all' || equipeDe.get(c.corretor_id) === fEquipe)
    .map(c => ({
      id: c.id, corretor_id: c.corretor_id, corretor_nome: c.vendedores?.nome, equipe_id: equipeDe.get(c.corretor_id) ?? null, valor_contrato: c.valor_contrato, data_implantacao: c.data_implantacao,
      slots: [
        { pessoa: c.corretor_id, valor: c.corretor_valor, percentual: c.corretor_percentual, pago: c.corretor_pago },
        { pessoa: c.supervisor_a_id, valor: c.supervisor_a_valor, percentual: c.supervisor_a_percentual, pago: c.supervisor_a_pago },
        { pessoa: c.supervisor_b_id, valor: c.supervisor_b_valor, percentual: c.supervisor_b_percentual, pago: c.supervisor_b_pago },
      ],
    }));
  const corretores = indicadoresPorCorretor(contratosPeriodo, base.receitas as any);
  const porEquipe = indicadoresPorEquipe(corretores, fEquipe === 'all' ? equipesAtivas : equipesAtivas.filter(e => e.id === fEquipe));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold">Painel de gestão</h3>
          <p className="text-xs text-muted-foreground">Filtros de equipe, supervisor e corretor valem para os quadros de corretores e equipes. DRE por competência · caixa por data efetiva · comparado a {ant.inicio.split('-').reverse().join('/')} – {ant.fim.split('-').reverse().join('/')}</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <Select value={fEquipe} onValueChange={setFEquipe}><SelectTrigger className="w-[170px]" aria-label="Equipe"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Todas as equipes</SelectItem>{equipesAtivas.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent></Select>
          <Select value={fSup} onValueChange={setFSup}><SelectTrigger className="w-[170px]" aria-label="Supervisor"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Todos supervisores</SelectItem>{base.supervisores.filter(x => x.ativo).map(x => <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>)}</SelectContent></Select>
          <Select value={fCorretor} onValueChange={setFCorretor}><SelectTrigger className="w-[170px]" aria-label="Corretor"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Todos corretores</SelectItem>{base.vendedores.filter(x => x.ativo).sort((a, b) => a.nome.localeCompare(b.nome)).map(x => <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>)}</SelectContent></Select>
          <MetasEditor metas={metas} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <Card className="overflow-hidden rounded-md shadow-sm transition-shadow hover:shadow-md"><CardContent className="space-y-4 p-5">
          <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase text-muted-foreground">Receita</p><span className="rounded-full bg-secondary px-2 py-1 text-[10px] font-semibold text-secondary-foreground">COMPETÊNCIA</span></div>
          <div><p className="text-3xl font-bold tabular-nums">{formatCurrency(p.receita.bruta)}</p><Delta atual={p.receita.bruta} anterior={a.receita.bruta} /></div>
          <div className="grid grid-cols-2 gap-4 border-t pt-3"><div><p className="text-xs text-muted-foreground">Recebida</p><p className="mt-1 font-semibold tabular-nums text-success">{formatCurrency(p.receita.recebida)}</p></div><div className="text-right"><p className="text-xs text-muted-foreground">A receber</p><p className="mt-1 font-semibold tabular-nums text-warning">{formatCurrency(p.receita.a_receber)}</p></div></div>
        </CardContent></Card>

        <Card className="overflow-hidden rounded-md shadow-sm transition-shadow hover:shadow-md"><CardContent className="space-y-4 p-5">
          <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase text-muted-foreground">Margem</p><Badge s={p.status.margem} /></div>
          <div className="flex items-end justify-between gap-4"><div><p className="text-3xl font-bold tabular-nums">{fp(p.margem.contribuicao_pct)}</p><Delta pp atual={p.margem.contribuicao_pct} anterior={a.margem.contribuicao_pct} /></div><div className="text-right"><p className="text-xs text-muted-foreground">Contribuição</p><p className="font-semibold tabular-nums">{formatCurrency(p.margem.contribuicao)}</p></div></div>
          <div className="mt-2 h-2 rounded bg-muted relative overflow-hidden">
            <div className="h-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, p.margem.contribuicao_pct ?? 0))}%` }} />
            <div className="absolute top-0 h-full w-0.5 bg-foreground" style={{ left: `${metas.margem_contribuicao_min}%` }} title="Meta mínima" />
          </div>
          <p className="text-xs text-muted-foreground">Meta mínima: {metas.margem_contribuicao_min}%</p>
        </CardContent></Card>

        <Card className="overflow-hidden rounded-md shadow-sm transition-shadow hover:shadow-md"><CardContent className="space-y-4 p-5">
          <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase text-muted-foreground">Custos</p><Badge s={p.status.custoFixo} /></div>
          <div><p className="text-3xl font-bold tabular-nums">{formatCurrency(p.custos.variaveis + p.custos.comerciais + p.custos.fixos)}</p><p className="mt-1 text-xs text-destructive">Fixos: {fp(p.custos.fixo_pct)} da receita · meta ≤ {metas.custo_fixo_max}%</p></div>
          <div className="grid grid-cols-3 gap-3 border-t pt-3 text-xs"><div><p className="text-muted-foreground">Fixos</p><p className="mt-1 font-semibold tabular-nums">{formatCurrency(p.custos.fixos)}</p></div><div><p className="text-muted-foreground">Variáveis</p><p className="mt-1 font-semibold tabular-nums">{formatCurrency(p.custos.variaveis)}</p></div><div><p className="text-muted-foreground">Comerciais</p><p className="mt-1 font-semibold tabular-nums">{formatCurrency(p.custos.comerciais)}</p></div></div>
        </CardContent></Card>

        <Card className="overflow-hidden rounded-md border-dashboard-ink/20 bg-dashboard-ink text-primary-foreground shadow-md"><CardContent className="space-y-4 p-5">
          <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase text-primary-foreground/70">Resultado</p><ChartNoAxesCombined className="h-5 w-5 text-dashboard-accent" /></div>
          <div><p className={`text-3xl font-bold tabular-nums ${p.resultado.liquido >= 0 ? 'text-success' : 'text-destructive'}`}>{formatCurrency(p.resultado.liquido)}</p><p className="mt-1 text-xs text-primary-foreground/70">Resultado líquido</p></div>
          <div className="grid grid-cols-2 gap-4 border-t border-primary-foreground/15 pt-3"><div><p className="text-xs text-primary-foreground/70">Margem líquida</p><p className="font-semibold tabular-nums">{fp(p.resultado.liquido_pct)}</p></div><div className="text-right"><p className="text-xs text-primary-foreground/70">Variação</p><Delta pp atual={p.resultado.liquido_pct} anterior={a.resultado.liquido_pct} /></div></div>
        </CardContent></Card>

        <Card className="overflow-hidden rounded-md shadow-sm transition-shadow hover:shadow-md"><CardContent className="space-y-4 p-5">
          <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase text-muted-foreground">Caixa realizado</p><Badge s={p.status.caixa} /></div>
          <div><p className={`text-3xl font-bold tabular-nums ${p.geracaoCaixa.geracao >= 0 ? 'text-success' : 'text-destructive'}`}>{formatCurrency(p.geracaoCaixa.geracao)}</p><p className="mt-1 text-xs text-muted-foreground">Fluxo líquido do período · {fp(p.geracaoCaixa.pct)}</p></div>
          <div className="grid grid-cols-2 gap-4 border-t pt-3"><div><p className="text-xs text-success">Entradas</p><p className="font-semibold tabular-nums">{formatCurrency(p.geracaoCaixa.entradas)}</p></div><div className="text-right"><p className="text-xs text-destructive">Saídas</p><p className="font-semibold tabular-nums">{formatCurrency(p.geracaoCaixa.saidas)}</p></div></div>
        </CardContent></Card>

        <Card className="overflow-hidden rounded-md shadow-sm transition-shadow hover:shadow-md"><CardContent className="space-y-4 p-5">
          <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase text-muted-foreground">Break-even</p><span className="text-xs font-semibold text-warning">{fp(p.breakEven.atingido_pct)} atingido</span></div>
          <div><p className="text-3xl font-bold tabular-nums">{p.breakEven.valor == null ? '—' : formatCurrency(p.breakEven.valor)}</p><p className="mt-1 text-xs text-muted-foreground">Ponto de equilíbrio do período</p></div>
          <div className="h-2 overflow-hidden rounded bg-muted"><div className="h-full bg-warning" style={{ width: `${Math.max(0, Math.min(100, p.breakEven.atingido_pct ?? 0))}%` }} /></div>
          <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">Falta para atingir</span><span className="font-semibold tabular-nums">{p.breakEven.falta == null ? '—' : formatCurrency(p.breakEven.falta)}</span></div>
        </CardContent></Card>
      </div>

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
        <p className="text-xs text-muted-foreground mt-2">Receita = receitas vinculadas ao contrato. Comissão = valores anotados no contrato (corretor + supervisores), só como referência — o resultado usa as despesas de Comissão.</p>
      </CardContent></Card>

      <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Resultado por equipe</CardTitle></CardHeader><CardContent className="grid md:grid-cols-3 gap-4">
        {porEquipe.map(e => (
          <div key={e.id} className="rounded-md border p-3">
            <p className="font-semibold mb-1">{e.nome}</p>
            <Linha rotulo="Receita" valor={formatCurrency(e.receita)} />
            <Linha rotulo="(-) Comissão corretores" valor={formatCurrency(e.comissao_corretor)} />
            <Linha rotulo="(-) Comissão supervisor" valor={formatCurrency(e.comissao_supervisor)} />
            <Linha rotulo="= Contribuição" valor={formatCurrency(e.contribuicao)} extra={<span className="text-xs text-muted-foreground">margem {fp(e.margem_pct)}</span>} />
            <Linha rotulo="Contratos / produção" valor={`${e.contratos} · ${formatCurrency(e.producao)}`} />
            {e.corretores.length > 0 && <div className="mt-2 text-xs text-muted-foreground space-y-0.5">{e.corretores.map((c: any) => <div key={c.corretor_id ?? 'sem'} className="flex justify-between"><span>{c.nome}</span><span>{formatCurrency(c.receita)} · com. {formatCurrency(c.comissao)}</span></div>)}</div>}
          </div>
        ))}
      </CardContent></Card>
    </div>
  );
}
