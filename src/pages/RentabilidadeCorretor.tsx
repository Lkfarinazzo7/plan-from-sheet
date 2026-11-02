import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalculadoraCorretor } from '@/components/CalculadoraCorretor';
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


export default function RentabilidadeCorretor() {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState<number | 'all'>(hoje.getMonth() + 1);
  const [modo, setModo] = useState<Modo>('competencia');
  const [sel, setSel] = useState<string[]>([]);
  const [ord, setOrd] = useState<{ col: Col; asc: boolean }>({ col: 'resultado', asc: false });
  const [aberto, setAberto] = useState<string | null>(null);

  const { data: base, isLoading } = useBaseRentabilidade();
  const { data: regras = [] } = useCustosCorretor();
  const { data: categorias = [] } = useCategoriasDespesa();
  
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
        <div className="space-y-1"><label className="text-xs font-medium text-muted-foreground block">&nbsp;</label>
          <MultiSelectFilter label="Corretores" options={vendedores.map((v: any) => ({ value: v.id, label: v.nome }))} value={sel} onChange={setSel} searchable /></div>
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

      <CalculadoraCorretor vendedores={vendedores.filter((v: any) => v.ativo !== false)} vendedorId={aberto} onVendedor={setAberto}
        regras={regras} linha={calc.linhas.find((l: any) => l.vendedor_id === aberto)} itens={calc.itens}
        mesPadrao={inicio.slice(0, 7)} />

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
              <TableRow key={l.vendedor_id} className="cursor-pointer" onClick={() => { setAberto(l.vendedor_id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
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
      <p className="text-xs text-muted-foreground">Clique num corretor para abri-lo na calculadora.</p>

    </div>
  );
}
