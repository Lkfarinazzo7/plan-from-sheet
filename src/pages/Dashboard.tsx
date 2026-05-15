import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MonthYearPicker } from '@/components/MonthYearPicker';
import { useReceitas, useDespesas, useMonthlyComparison } from '@/hooks/useFinancialData';
import { formatCurrency, getCurrentMonthYear } from '@/lib/format';
import { ArrowUpCircle, ArrowDownCircle, Wallet, Clock, AlertTriangle, CreditCard, CalendarRange, X, TrendingUp, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UNIDADES_NEGOCIO } from '@/lib/unidadesNegocio';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts';

const PIE_COLORS = [
  'hsl(215, 80%, 48%)', 'hsl(142, 71%, 45%)', 'hsl(38, 92%, 50%)',
  'hsl(0, 72%, 51%)', 'hsl(262, 52%, 47%)', 'hsl(190, 90%, 40%)',
  'hsl(330, 70%, 50%)', 'hsl(50, 80%, 50%)', 'hsl(170, 60%, 40%)',
  'hsl(280, 60%, 55%)', 'hsl(20, 80%, 50%)', 'hsl(100, 50%, 40%)',
];

export default function Dashboard() {
  const { month: curMonth, year: curYear } = getCurrentMonthYear();
  const [month, setMonth] = useState(curMonth);
  const [year, setYear] = useState(curYear);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [activeRange, setActiveRange] = useState<{ start: string; end: string } | null>(null);
  const [filterUnidade, setFilterUnidade] = useState<string>('all');

  const isCustom = !!activeRange;

  const { data: receitasRaw = [] } = useReceitas(
    isCustom ? undefined : month, isCustom ? undefined : year,
    activeRange?.start, activeRange?.end
  );
  const { data: despesasRaw = [] } = useDespesas(
    isCustom ? undefined : month, isCustom ? undefined : year,
    activeRange?.start, activeRange?.end
  );
  
  const { data: monthlyData = [] } = useMonthlyComparison();

  // Filtro client-side por unidade de negócio
  const receitas = useMemo(
    () => filterUnidade === 'all' ? receitasRaw : receitasRaw.filter(r => ((r as any).unidade_negocio || '') === filterUnidade),
    [receitasRaw, filterUnidade]
  );
  const despesas = useMemo(
    () => filterUnidade === 'all' ? despesasRaw : despesasRaw.filter(d => ((d as any).unidade_negocio || '') === filterUnidade),
    [despesasRaw, filterUnidade]
  );

  const totalReceitas = receitas.reduce((acc, r) => acc + Number(r.valor), 0);
  const totalDespesas = despesas.reduce((acc, d) => acc + Number(d.valor), 0);
  const saldo = totalReceitas - totalDespesas;

  const receitasAReceber = receitas.filter(r => r.status === 'Aguardando').reduce((acc, r) => acc + Number(r.valor), 0);
  const despesasAPagar = despesas.filter(d => d.status === 'A pagar').reduce((acc, d) => acc + Number(d.valor), 0);
  const despesasAtrasadas = despesas.filter(d => d.status === 'Atrasado').reduce((acc, d) => acc + Number(d.valor), 0);

  // Custos fixos vs variáveis
  const custosFixos = despesas.filter(d => d.tipo === 'Fixo').reduce((acc, d) => acc + Number(d.valor), 0);
  const custosVariaveis = despesas.filter(d => d.tipo === 'Variável').reduce((acc, d) => acc + Number(d.valor), 0);
  const custosPieData = [
    { name: 'Fixo', value: custosFixos },
    { name: 'Variável', value: custosVariaveis },
  ].filter(d => d.value > 0);

  // Margens
  const margemBruta = totalReceitas - custosVariaveis;
  const margemBrutaPct = totalReceitas > 0 ? (margemBruta / totalReceitas) * 100 : 0;
  const margemLiquida = totalReceitas - totalDespesas;
  const margemLiquidaPct = totalReceitas > 0 ? (margemLiquida / totalReceitas) * 100 : 0;

  // Despesas por categoria
  const despesasPorCategoria = despesas.reduce((acc, d) => {
    const cat = (d.categorias_despesa as any)?.nome || 'Outros';
    acc[cat] = (acc[cat] || 0) + Number(d.valor);
    return acc;
  }, {} as Record<string, number>);
  const pieData = Object.entries(despesasPorCategoria).map(([name, value]) => ({ name, value }));

  // Receita por Vendedor
  const receitaPorVendedor = Object.values(
    receitas.reduce((acc, r) => {
      const nome = (r.vendedores as any)?.nome || 'Desconhecido';
      if (!acc[nome]) acc[nome] = { nome, total: 0 };
      acc[nome].total += Number(r.valor);
      return acc;
    }, {} as Record<string, { nome: string; total: number }>)
  ).sort((a, b) => b.total - a.total);

  // Receita por Operadora
  const receitaPorOperadora = Object.values(
    receitas.reduce((acc, r) => {
      const nome = (r.operadoras as any)?.nome || 'Desconhecida';
      if (!acc[nome]) acc[nome] = { nome, total: 0 };
      acc[nome].total += Number(r.valor);
      return acc;
    }, {} as Record<string, { nome: string; total: number }>)
  ).sort((a, b) => b.total - a.total);

  // Ticket médio recebido (por descrição única)
  const recebidas = receitas.filter(r => r.status === 'Recebido');
  const totalRecebido = recebidas.reduce((acc, r) => acc + Number(r.valor), 0);
  const propostasComRecebimento = new Set(
    recebidas.map(r => (r as any).proposta_id).filter(Boolean)
  ).size;
  const ticketMedio = propostasComRecebimento > 0 ? totalRecebido / propostasComRecebimento : 0;

  // Despesas por categoria (ordenado para barras horizontais)
  const barCategoriaData = pieData.slice().sort((a, b) => b.value - a.value);


  const applyRange = () => {
    if (customStart && customEnd) setActiveRange({ start: customStart, end: customEnd });
  };
  const clearRange = () => { setActiveRange(null); setCustomStart(''); setCustomEnd(''); };

  const formatDateBR = (d: string) => { const [y, m, day] = d.split('-'); return `${day}/${m}/${y}`; };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filterUnidade} onValueChange={setFilterUnidade}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Unidade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as unidades</SelectItem>
              {UNIDADES_NEGOCIO.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
          {!isCustom && (
            <MonthYearPicker month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
          )}
          {isCustom && (
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">{formatDateBR(activeRange.start)} — {formatDateBR(activeRange.end)}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={clearRange}><X className="h-4 w-4" /></Button>
            </div>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1"><CalendarRange className="h-4 w-4" />Período</Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto space-y-3" align="end">
              <p className="text-sm font-medium">Selecionar período</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => {
                  const y = new Date().getFullYear();
                  const s = `${y}-01-01`; const e = `${y}-12-31`;
                  setCustomStart(s); setCustomEnd(e); setActiveRange({ start: s, end: e });
                }}>Este ano</Button>
                <Button variant="secondary" size="sm" onClick={() => {
                  const now = new Date();
                  const y = now.getFullYear();
                  const m = String(now.getMonth() + 1).padStart(2, '0');
                  const last = new Date(y, now.getMonth() + 1, 0).getDate();
                  const s = `${y}-${m}-01`; const e = `${y}-${m}-${String(last).padStart(2, '0')}`;
                  setCustomStart(s); setCustomEnd(e); setActiveRange({ start: s, end: e });
                }}>Este mês</Button>
              </div>
              <div className="space-y-2">
                <div><label className="text-xs text-muted-foreground">Início</label><Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} /></div>
                <div><label className="text-xs text-muted-foreground">Fim</label><Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} /></div>
              </div>
              <Button size="sm" className="w-full" onClick={applyRange} disabled={!customStart || !customEnd}>Aplicar</Button>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Faturamento</p><p className="text-2xl font-bold text-success">{formatCurrency(totalReceitas)}</p></div><ArrowUpCircle className="h-8 w-8 text-success opacity-60" /></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Despesas</p><p className="text-2xl font-bold text-destructive">{formatCurrency(totalDespesas)}</p></div><ArrowDownCircle className="h-8 w-8 text-destructive opacity-60" /></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Saldo</p><p className={`text-2xl font-bold ${saldo >= 0 ? 'text-success' : 'text-destructive'}`}>{formatCurrency(saldo)}</p></div><Wallet className="h-8 w-8 text-primary opacity-60" /></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Margem Bruta</p><p className={`text-2xl font-bold ${margemBruta >= 0 ? 'text-success' : 'text-destructive'}`}>{formatCurrency(margemBruta)}</p><p className="text-xs text-muted-foreground">{margemBrutaPct.toFixed(1)}%</p></div><TrendingUp className="h-8 w-8 text-success opacity-60" /></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Margem Líquida</p><p className={`text-2xl font-bold ${margemLiquida >= 0 ? 'text-success' : 'text-destructive'}`}>{formatCurrency(margemLiquida)}</p><p className="text-xs text-muted-foreground">{margemLiquidaPct.toFixed(1)}%</p></div><TrendingDown className="h-8 w-8 text-primary opacity-60" /></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Receitas a Receber</p><p className="text-2xl font-bold text-warning">{formatCurrency(receitasAReceber)}</p></div><Clock className="h-8 w-8 text-warning opacity-60" /></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Despesas a Pagar</p><p className="text-2xl font-bold text-warning">{formatCurrency(despesasAPagar)}</p></div><CreditCard className="h-8 w-8 text-warning opacity-60" /></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Despesas Atrasadas</p><p className="text-2xl font-bold text-destructive">{formatCurrency(despesasAtrasadas)}</p></div><AlertTriangle className="h-8 w-8 text-destructive opacity-60" /></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Ticket Médio Recebido</p><p className="text-2xl font-bold text-success">{formatCurrency(ticketMedio)}</p><p className="text-xs text-muted-foreground">{propostasComRecebimento} proposta(s) com recebimento</p></div><TrendingUp className="h-8 w-8 text-success opacity-60" /></div></CardContent></Card>
      </div>

      {/* Comparativo Mensal */}
      <Card>
        <CardHeader><CardTitle className="text-base">Comparativo Mensal — Receitas vs Despesas</CardTitle></CardHeader>
        <CardContent>
          {monthlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" />
                <YAxis tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(val: number) => formatCurrency(val)} />
                <Legend />
                <Bar dataKey="receitas" name="Receitas" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="despesas" name="Despesas" fill="hsl(0, 72%, 51%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-center py-12">Sem dados para exibir</p>
          )}
        </CardContent>
      </Card>

      {/* Custos Fixos vs Variáveis */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div><p className="text-sm text-muted-foreground">Custos Fixos</p><p className="text-2xl font-bold text-primary">{formatCurrency(custosFixos)}</p></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div><p className="text-sm text-muted-foreground">Custos Variáveis</p><p className="text-2xl font-bold text-accent-foreground">{formatCurrency(custosVariaveis)}</p></div></CardContent></Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Fixo vs Variável</CardTitle></CardHeader>
          <CardContent>
            {custosPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={custosPieData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                    <Cell fill="hsl(215, 80%, 48%)" />
                    <Cell fill="hsl(38, 92%, 50%)" />
                  </Pie>
                  <Tooltip formatter={(val: number) => formatCurrency(val)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground text-center py-8">Sem despesas</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Receita por Vendedor e por Operadora */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Receita por Vendedor</CardTitle></CardHeader>
          <CardContent>
            {receitaPorVendedor.length > 0 ? (
              <div className="space-y-4">
                {receitaPorVendedor.map((v, i) => (
                  <div key={v.nome} className="flex items-center gap-4">
                    <span className="text-lg font-bold text-muted-foreground w-6">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{v.nome}</p>
                    </div>
                    <span className="text-sm font-semibold text-success">{formatCurrency(v.total)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-12">Sem receitas neste período</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Receita por Operadora</CardTitle></CardHeader>
          <CardContent>
            {receitaPorOperadora.length > 0 ? (
              <div className="space-y-4">
                {receitaPorOperadora.map((v, i) => (
                  <div key={v.nome} className="flex items-center gap-4">
                    <span className="text-lg font-bold text-muted-foreground w-6">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{v.nome}</p>
                    </div>
                    <span className="text-sm font-semibold text-success">{formatCurrency(v.total)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-12">Sem receitas neste período</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Proposta por Operadora e por Vendedor */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Proposta por Operadora</CardTitle></CardHeader>
          <CardContent>
            {propostaPorOperadora.length > 0 ? (
              <div className="space-y-4">
                {propostaPorOperadora.map((v, i) => (
                  <div key={v.nome} className="flex items-center gap-4">
                    <span className="text-lg font-bold text-muted-foreground w-6">{i + 1}.</span>
                    <div className="flex-1 min-w-0"><p className="font-medium truncate">{v.nome}</p></div>
                    <span className="text-sm font-semibold text-primary">{formatCurrency(v.total)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-12">Sem propostas neste período</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Proposta por Vendedor</CardTitle></CardHeader>
          <CardContent>
            {propostaPorVendedor.length > 0 ? (
              <div className="space-y-4">
                {propostaPorVendedor.map((v, i) => (
                  <div key={v.nome} className="flex items-center gap-4">
                    <span className="text-lg font-bold text-muted-foreground w-6">{i + 1}.</span>
                    <div className="flex-1 min-w-0"><p className="font-medium truncate">{v.nome}</p></div>
                    <span className="text-sm font-semibold text-primary">{formatCurrency(v.total)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-12">Sem propostas neste período</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Despesas por Categoria — barras horizontais */}
      <Card>
        <CardHeader><CardTitle className="text-base">Despesas por Categoria</CardTitle></CardHeader>
        <CardContent>
          {barCategoriaData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(240, barCategoriaData.length * 40)}>
              <BarChart data={barCategoriaData} layout="vertical" margin={{ left: 20, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" width={140} />
                <Tooltip formatter={(val: number) => formatCurrency(val)} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {barCategoriaData.map((_, i) => (<Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-center py-12">Sem despesas neste período</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
