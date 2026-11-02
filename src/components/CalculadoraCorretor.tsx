import { useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useSalvarCusto, useExcluirCusto } from '@/hooks/useRentabilidadeCorretor';
import type { CustoRegra, ItemCusto } from '@/lib/rentabilidadeCorretor';
import { formatCurrency } from '@/lib/format';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Calculator } from 'lucide-react';

const SUGESTOES = ['Passagem', 'Taxas', 'Agendamento', 'Preenchimento', 'Premiação/retorno', 'DAS'];
const tom = (v: number) => (v < 0 ? 'text-destructive' : v > 0 ? 'text-success' : '');
const pctFmt = (v: number | null) => (v == null ? '—' : `${v.toFixed(1).replace('.', ',')}%`);

function LinhaCusto({ r, calculado, mesPadrao }: { r: CustoRegra; calculado: number; mesPadrao: string }) {
  const salvar = useSalvarCusto();
  const excluir = useExcluirCusto();
  const { toast } = useToast();
  const [nome, setNome] = useState(r.nome);
  const [valor, setValor] = useState(String(r.valor).replace('.', ','));
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => { setNome(r.nome); setValor(String(r.valor).replace('.', ',')); }, [r.id]);

  const gravar = (patch: Partial<CustoRegra>) =>
    salvar.mutate({ id: r.id, ...patch }, { onError: (e: any) => toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' }) });
  const adiar = (patch: Partial<CustoRegra>) => { clearTimeout(timer.current); timer.current = setTimeout(() => gravar(patch), 700); };

  const mudarTipo = (tipo: CustoRegra['tipo']) => gravar({
    tipo, frequencia: tipo === 'pontual' ? 'unica' : tipo === 'percentual' ? 'mensal' : r.frequencia === 'unica' ? 'mensal' : r.frequencia,
    mes_referencia: tipo === 'pontual' ? (r.mes_referencia ?? `${mesPadrao}-01`) : null,
  });

  return (
    <div className={`grid grid-cols-12 gap-2 items-center py-1.5 border-b last:border-0 ${r.ativo ? '' : 'opacity-50'}`}>
      <Input className="col-span-3 h-9" value={nome} onChange={e => { setNome(e.target.value); if (e.target.value.trim()) adiar({ nome: e.target.value.trim() }); }} />
      <Select value={r.tipo} onValueChange={v => mudarTipo(v as any)}>
        <SelectTrigger className="col-span-2 h-9"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="fixo">Fixo</SelectItem><SelectItem value="percentual">Percentual</SelectItem><SelectItem value="pontual">Pontual</SelectItem></SelectContent>
      </Select>
      <Input className="col-span-2 h-9 text-right" inputMode="decimal" value={valor}
        onChange={e => { setValor(e.target.value); const n = parseFloat(e.target.value.replace(/\./g, '').replace(',', '.')); if (isFinite(n)) adiar({ valor: n }); }} />
      {r.tipo === 'fixo' ? (
        <Select value={r.frequencia} onValueChange={v => gravar({ frequencia: v as any })}>
          <SelectTrigger className="col-span-2 h-9"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="mensal">por mês</SelectItem><SelectItem value="semanal">por semana</SelectItem></SelectContent>
        </Select>
      ) : r.tipo === 'pontual' ? (
        <Input type="month" className="col-span-2 h-9 px-2" value={r.mes_referencia?.slice(0, 7) ?? ''} onChange={e => e.target.value && gravar({ mes_referencia: `${e.target.value}-01` })} />
      ) : <span className="col-span-2 text-xs text-muted-foreground">% da produção</span>}
      <span className="col-span-2 text-right text-sm font-medium tabular-nums">{formatCurrency(calculado)}</span>
      <div className="col-span-1 flex items-center justify-end gap-1">
        <Switch checked={r.ativo} onCheckedChange={v => gravar({ ativo: v })} />
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => excluir.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

export function CalculadoraCorretor({ vendedores, vendedorId, onVendedor, regras, linha, itens, mesPadrao }: {
  vendedores: { id: string; nome: string }[]; vendedorId: string | null; onVendedor: (id: string) => void;
  regras: CustoRegra[]; linha: any | undefined; itens: ItemCusto[]; mesPadrao: string;
}) {
  const salvar = useSalvarCusto();
  const { toast } = useToast();
  const minhas = regras.filter(r => r.vendedor_id === vendedorId);
  const meusItens = itens.filter(i => i.vendedor_id === vendedorId);
  const porRegra = (id: string) => meusItens.filter(i => i.regra_id === id && !i.substituida).reduce((a, i) => a + i.valor, 0);
  const totRegras = meusItens.filter(i => i.origem === 'regra' && !i.substituida).reduce((a, i) => a + i.valor, 0);
  const totDespesas = meusItens.filter(i => i.origem === 'despesa').reduce((a, i) => a + i.valor, 0);

  const adicionar = (nome = 'Novo custo') => vendedorId && salvar.mutate(
    { vendedor_id: vendedorId, nome, tipo: 'fixo', frequencia: 'mensal', valor: 0, ativo: true } as any,
    { onError: (e: any) => toast({ title: 'Erro ao adicionar', description: e.message, variant: 'destructive' }) },
  );

  const resumo: [string, number, boolean?][] = linha ? [
    ['Produção', linha.producao], ['Receita', linha.receita], ['Comissões', -linha.comissoes], ['Margem da empresa', linha.margem, true],
    ['Custos cadastrados', -totRegras], ['Despesas lançadas', -totDespesas],
  ] : [];

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2"><Calculator className="h-5 w-5 text-primary" /><h2 className="font-semibold">Calculadora do corretor</h2></div>
          <Select value={vendedorId ?? ''} onValueChange={onVendedor}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Escolha o corretor" /></SelectTrigger>
            <SelectContent>{vendedores.map(v => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {!vendedorId ? <p className="text-sm text-muted-foreground">Escolha um corretor para ver e lançar os custos dele.</p> : (
          <div className="grid lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 space-y-3">
              <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground px-0.5">
                <span className="col-span-3">Custo</span><span className="col-span-2">Tipo</span><span className="col-span-2 text-right">Valor (R$ ou %)</span>
                <span className="col-span-2">Frequência</span><span className="col-span-2 text-right">No período</span><span className="col-span-1 text-right">Ativo</span>
              </div>
              {!minhas.length && <p className="text-sm text-muted-foreground py-2">Nenhum custo cadastrado. Adicione abaixo.</p>}
              {minhas.map(r => <LinhaCusto key={r.id} r={r} calculado={porRegra(r.id)} mesPadrao={mesPadrao} />)}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button size="sm" onClick={() => adicionar()} disabled={salvar.isPending}><Plus className="h-4 w-4 mr-1" />Adicionar custo</Button>
                {SUGESTOES.map(s => <Button key={s} size="sm" variant="outline" className="h-8" onClick={() => adicionar(s)}>+ {s}</Button>)}
              </div>
              <p className="text-xs text-muted-foreground">As alterações são salvas sozinhas e valem nos meses seguintes até você desativar. Custos cadastrados entram só na visão Competência.</p>
            </div>

            <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
              {resumo.map(([t, v, destaque]) => (
                <div key={t} className={`flex justify-between ${destaque ? 'font-medium border-t pt-2' : ''}`}>
                  <span className="text-muted-foreground">{t}</span><span className="tabular-nums">{formatCurrency(v)}</span>
                </div>
              ))}
              {linha && <>
                <div className="flex justify-between border-t pt-2 font-semibold"><span>Resultado gerencial</span><span className={`tabular-nums ${tom(linha.resultado)}`}>{formatCurrency(linha.resultado)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Margem gerencial</span><span className={tom(linha.resultado)}>{pctFmt(linha.margem_gerencial_pct)}</span></div>
              </>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
