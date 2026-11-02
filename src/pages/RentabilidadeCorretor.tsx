import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { MultiSelectFilter } from '@/components/MultiSelectFilter';
import { useBaseRentabilidade, useCustosCorretor, useSalvarCusto, useExcluirCusto } from '@/hooks/useRentabilidadeCorretor';
import { useCategoriasDespesa } from '@/hooks/useFinancialData';
import { calcularRentabilidade, type Modo, type CustoRegra } from '@/lib/rentabilidadeCorretor';
import { formatCurrency, getMonthName } from '@/lib/format';
import { useToast } from '@/hooks/use-toast';
import { Pencil, Trash2, Plus, ArrowUpDown } from 'lucide-react';

const pctFmt = (v: number | null) => (v == null ? '—' : `${v.toFixed(1).replace('.', ',')}%`);
const tom = (v: number) => (v < 0 ? 'text-destructive' : v > 0 ? 'text-success' : '');
const ultimoDia = (y: number, m: number) => new Date(y, m, 0).getDate();

type Col = 'nome' | 'producao' | 'contratos' | 'ticket' | 'receita' | 'comissoes' | 'comissao_pct' | 'margem' | 'custos' | 'resultado' | 'margem_gerencial_pct';
const COLS: [Col, string][] = [
  ['nome', 'Corretor'], ['producao', 'Produção'], ['contratos', 'Contratos'], ['ticket', 'Ticket médio'], ['receita', 'Receita'],
  ['comissoes', 'Comissões'], ['comissao_pct', '% Com./Rec.'], ['margem', 'Margem empresa'], ['custos', 'Custos adicionais'],
  ['resultado', 'Resultado gerencial'], ['margem_gerencial_pct', 'Margem gerencial'],
];

const vazio = { tipo: 'fixo', frequencia: 'mensal', nome: '', valor: '', inicio: '', fim: '', mes_referencia: '', categoria_id: 'none', termo_match: '' };

export default function RentabilidadeCorretor() {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState<number | 'all'>(hoje.getMonth() + 1);
  const [modo, setModo] = useState<Modo>('competencia');
  const [sel, setSel] = useState<string[]>([]);
  const [ord, setOrd] = useState<{ col: Col; asc: boolean }>({ col: 'resultado', asc: false });
  const [aberto, setAberto] = useState<string | null>(null);
  const [form, setForm] = useState<any>(vazio);
  const [editId, setEditId] = useState<string | null>(null);

  const { data: base, isLoading } = useBaseRentabilidade();
  const { data: regras = [] } = useCustosCorretor();
  const { data: categorias = [] } = useCategoriasDespesa();
  const salvar = useSalvarCusto();
  const excluir = useExcluirCusto();
  const { toast } = useToast();

  const inicio = mes === 'all' ? `${ano}-01-01` : `${ano}-${String(mes).padStart(2, '0')}-01`;
  const fim = mes === 'all' ? `${ano}-12-31` : `${ano}-${String(mes).padStart(2, '0')}-${ultimoDia(ano, mes)}`;

  const calc = useMemo(() => base ? calcularRentabilidade({ ...base, regras, inicio, fim, modo }) : { linhas: [], itens: [] }, [base, regras, inicio, fim, modo]);
  const linhas = useMemo(() => {
    const l = calc.linhas.filter(x => !sel.length || sel.includes(x.vendedor_id));
    return [...l].sort((a: any, b: any) => {
      const va = a[ord.col] ?? -Infinity, vb = b[ord.col] ?? -Infinity;
      const r = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
      return ord.asc ? r : -r;
    });
  }, [calc, sel, ord]);
  const tot = linhas.reduce((a, l) => ({ producao: a.producao + l.producao, receita: a.receita + l.receita, comissoes: a.comissoes + l.comissoes, custos: a.custos + l.custos, resultado: a.resultado + l.resultado }), { producao: 0, receita: 0, comissoes: 0, custos: 0, resultado: 0 });

  const vendedores = base?.vendedores ?? [];
  const nomeAberto = vendedores.find((v: any) => v.id === aberto)?.nome;
  const regrasAberto = regras.filter(r => r.vendedor_id === aberto);
  const itensAberto = calc.itens.filter(i => i.vendedor_id === aberto);

  const editar = (r: CustoRegra) => {
    setEditId(r.id);
    setForm({ ...r, valor: String(r.valor), inicio: r.inicio ?? '', fim: r.fim ?? '', mes_referencia: r.mes_referencia ?? '', categoria_id: r.categoria_id ?? 'none', termo_match: r.termo_match ?? '' });
  };
  const enviar = async () => {
    const valor = parseFloat(String(form.valor).replace(',', '.'));
    if (!form.nome.trim() || !isFinite(valor)) return toast({ title: 'Informe nome e valor', variant: 'destructive' });
    if (form.tipo === 'pontual' && !form.mes_referencia) return toast({ title: 'Informe o mês do custo pontual', variant: 'destructive' });
    try {
      await salvar.mutateAsync({
        ...(editId ? { id: editId } : { vendedor_id: aberto!, ativo: true }),
        nome: form.nome.trim(), tipo: form.tipo, valor,
        frequencia: form.tipo === 'pontual' ? 'unica' : form.tipo === 'percentual' ? 'mensal' : form.frequencia,
        mes_referencia: form.tipo === 'pontual' ? `${form.mes_referencia}-01` : null,
        inicio: form.inicio ? `${form.inicio}-01` : null, fim: form.fim ? `${form.fim}-01` : null,
        categoria_id: form.categoria_id === 'none' ? null : form.categoria_id, termo_match: form.termo_match.trim() || null,
      } as any);
      setForm(vazio); setEditId(null);
      toast({ title: 'Custo salvo' });
    } catch (e: any) { toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' }); }
  };

  const descricaoRegra = (r: CustoRegra) =>
    r.tipo === 'percentual' ? `${r.valor}% da produção` : r.tipo === 'pontual' ? `${formatCurrency(r.valor)} em ${r.mes_referencia?.slice(5, 7)}/${r.mes_referencia?.slice(0, 4)}` : `${formatCurrency(r.valor)}/${r.frequencia === 'semanal' ? 'semana' : 'mês'}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Rentabilidade por Corretor</h1>
        <p className="text-sm text-muted-foreground">Quanto cada corretor gera de resultado, descontando comissões e custos individuais.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1"><label className="text-xs font-medium text-muted-foreground">Mês</label>
          <Select value={String(mes)} onValueChange={v => setMes(v === 'all' ? 'all' : Number(v))}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Ano inteiro</SelectItem>{Array.from({ length: 12 }, (_, i) => <SelectItem key={i} value={String(i + 1)}>{getMonthName(i)}</SelectItem>)}</SelectContent>
          </Select></div>
        <div className="space-y-1"><label className="text-xs font-medium text-muted-foreground">Ano</label>
          <Select value={String(ano)} onValueChange={v => setAno(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{[hoje.getFullYear() - 2, hoje.getFullYear() - 1, hoje.getFullYear(), hoje.getFullYear() + 1].map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}</SelectContent>
          </Select></div>
        <div className="space-y-1"><label className="text-xs font-medium text-muted-foreground">Corretor</label>
          <MultiSelectFilter label="Corretores" options={vendedores.map((v: any) => ({ value: v.id, label: v.nome }))} selected={sel} onChange={setSel} /></div>
        <div className="space-y-1"><label className="text-xs font-medium text-muted-foreground">Visão</label>
          <ToggleGroup type="single" variant="outline" value={modo} onValueChange={v => v && setModo(v as Modo)}>
            <ToggleGroupItem value="competencia">Competência</ToggleGroupItem>
            <ToggleGroupItem value="caixa">Caixa realizado</ToggleGroupItem>
          </ToggleGroup></div>
      </div>
      <p className="text-xs text-muted-foreground -mt-3">
        {modo === 'competencia'
          ? 'Receita, comissões e custos pelo mês de referência. Inclui os custos calculados pelas regras de cada corretor.'
          : 'Apenas o que foi recebido e pago de fato, pela data do pagamento. Regras estimadas não entram.'} A produção sempre usa a data de implantação.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {[['Produção', tot.producao], ['Receita', tot.receita], ['Comissões', tot.comissoes], ['Custos adicionais', tot.custos], ['Resultado gerencial', tot.resultado]].map(([t, v]) => (
          <Card key={t as string}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t}</p>
            <p className={`text-lg font-semibold ${t === 'Resultado gerencial' ? tom(v as number) : ''}`}>{formatCurrency(v as number)}</p></CardContent></Card>
        ))}
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Margem gerencial</p>
          <p className={`text-lg font-semibold ${tom(tot.resultado)}`}>{pctFmt(tot.receita > 0 ? (tot.resultado / tot.receita) * 100 : null)}</p></CardContent></Card>
      </div>

      <Card><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow>{COLS.map(([c, t]) => (
            <TableHead key={c} className={c === 'nome' ? '' : 'text-right whitespace-nowrap'}>
              <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setOrd(o => ({ col: c, asc: o.col === c ? !o.asc : false }))}>{t}<ArrowUpDown className="h-3 w-3 opacity-50" /></button>
            </TableHead>))}</TableRow></TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>}
            {!isLoading && !linhas.length && <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">Nenhum dado no período.</TableCell></TableRow>}
            {linhas.map(l => (
              <TableRow key={l.vendedor_id} className="cursor-pointer" onClick={() => { setAberto(l.vendedor_id); setForm(vazio); setEditId(null); }}>
                <TableCell className="font-medium">{l.nome}</TableCell>
                <TableCell className="text-right">{formatCurrency(l.producao)}</TableCell>
                <TableCell className="text-right">{l.contratos}</TableCell>
                <TableCell className="text-right">{formatCurrency(l.ticket)}</TableCell>
                <TableCell className="text-right">{formatCurrency(l.receita)}</TableCell>
                <TableCell className="text-right">{formatCurrency(l.comissoes)}</TableCell>
                <TableCell className="text-right">{pctFmt(l.comissao_pct)}</TableCell>
                <TableCell className={`text-right ${tom(l.margem)}`}>{formatCurrency(l.margem)}</TableCell>
                <TableCell className="text-right">{formatCurrency(l.custos)}</TableCell>
                <TableCell className={`text-right font-semibold ${tom(l.resultado)}`}>{formatCurrency(l.resultado)}</TableCell>
                <TableCell className={`text-right ${tom(l.resultado)}`}>{pctFmt(l.margem_gerencial_pct)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
      <p className="text-xs text-muted-foreground">Clique num corretor para ver os custos e cadastrar regras.</p>

      <Sheet open={!!aberto} onOpenChange={o => !o && setAberto(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle>{nomeAberto}</SheetTitle></SheetHeader>

          <section className="mt-6 space-y-2">
            <h3 className="text-sm font-semibold">Custos no período</h3>
            {!itensAberto.length && <p className="text-sm text-muted-foreground">Nenhum custo adicional.</p>}
            {itensAberto.map((i, k) => (
              <div key={k} className={`flex items-center justify-between text-sm py-1 border-b ${i.substituida ? 'opacity-50 line-through' : ''}`}>
                <span>{i.nome} <span className="text-xs text-muted-foreground">· {i.mes.slice(5)}/{i.mes.slice(0, 4)}</span></span>
                <span className="flex items-center gap-2"><Badge variant="outline">{i.origem === 'regra' ? 'Regra' : 'Despesa lançada'}</Badge>{formatCurrency(i.valor)}</span>
              </div>
            ))}
            {itensAberto.some(i => i.substituida) && <p className="text-xs text-muted-foreground">Itens riscados foram substituídos por despesa real do mesmo mês.</p>}
          </section>

          <section className="mt-8 space-y-3">
            <h3 className="text-sm font-semibold">Regras de custo</h3>
            {regrasAberto.map(r => (
              <div key={r.id} className="flex items-center justify-between gap-2 text-sm py-1 border-b">
                <div className={r.ativo ? '' : 'opacity-50'}><p className="font-medium">{r.nome}</p><p className="text-xs text-muted-foreground">{descricaoRegra(r)}</p></div>
                <div className="flex items-center gap-1">
                  <Switch checked={r.ativo} onCheckedChange={v => salvar.mutate({ id: r.id, ativo: v })} />
                  <Button size="icon" variant="ghost" onClick={() => editar(r)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => excluir.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}

            <div className="rounded-md border p-3 space-y-3 bg-muted/30">
              <p className="text-sm font-medium">{editId ? 'Editar custo' : 'Novo custo'}</p>
              <Input placeholder="Nome (ex.: DAS, Passagem, Bônus)" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="fixo">Fixo</SelectItem><SelectItem value="percentual">Percentual</SelectItem><SelectItem value="pontual">Pontual</SelectItem></SelectContent>
                </Select>
                <Input placeholder={form.tipo === 'percentual' ? '% da produção' : 'Valor R$'} value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} />
              </div>
              {form.tipo === 'fixo' && (
                <Select value={form.frequencia} onValueChange={v => setForm({ ...form, frequencia: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="mensal">Por mês</SelectItem><SelectItem value="semanal">Por semana</SelectItem></SelectContent>
                </Select>
              )}
              {form.tipo === 'pontual'
                ? <div className="space-y-1"><label className="text-xs text-muted-foreground">Mês</label><Input type="month" value={form.mes_referencia?.slice(0, 7)} onChange={e => setForm({ ...form, mes_referencia: e.target.value })} /></div>
                : <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1"><label className="text-xs text-muted-foreground">Início (opcional)</label><Input type="month" value={form.inicio?.slice(0, 7)} onChange={e => setForm({ ...form, inicio: e.target.value })} /></div>
                    <div className="space-y-1"><label className="text-xs text-muted-foreground">Fim (opcional)</label><Input type="month" value={form.fim?.slice(0, 7)} onChange={e => setForm({ ...form, fim: e.target.value })} /></div>
                  </div>}
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Evitar duplicidade: se houver despesa lançada do corretor nesta categoria ou com este termo no mês, a regra não é somada</label>
                <div className="grid grid-cols-2 gap-2">
                  <Select value={form.categoria_id} onValueChange={v => setForm({ ...form, categoria_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
                    <SelectContent><SelectItem value="none">Sem categoria</SelectItem>{categorias.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input placeholder="Termo (ex.: DAS)" value={form.termo_match} onChange={e => setForm({ ...form, termo_match: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={enviar} disabled={salvar.isPending}><Plus className="h-4 w-4 mr-1" />{editId ? 'Salvar' : 'Adicionar'}</Button>
                {editId && <Button variant="ghost" onClick={() => { setEditId(null); setForm(vazio); }}>Cancelar</Button>}
              </div>
            </div>
          </section>
        </SheetContent>
      </Sheet>
    </div>
  );
}
