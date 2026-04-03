import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MonthYearPicker } from '@/components/MonthYearPicker';
import { useReceitas, useDespesas, useComissoes, useVendedores, useMonthlyComparison } from '@/hooks/useFinancialData';
import { formatCurrency, getCurrentMonthYear } from '@/lib/format';
import { ArrowUpCircle, ArrowDownCircle, Wallet, Clock, AlertTriangle, CreditCard, CalendarRange, X, TrendingUp, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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

  const isCustom = !!activeRange;

  const { data: receitas = [] } = useReceitas(
    isCustom ? undefined : month, isCustom ? undefined : year,
    activeRange?.start, activeRange?.end
  );
  const { data: despesas = [] } = useDespesas(
    isCustom ? undefined : month, isCustom ? undefined : year,
    activeRange?.start, activeRange?.end
  );
  const { data: comissoes = [] } = useComissoes(
    isCustom ? undefined : month, isCustom ? undefined : year,
    activeRange?.start, activeRange?.end
  );
  const { data: vendedores = [] } = useVendedores();
  const { data: monthlyData = [] } = useMonthlyComparison();

  const totalReceitas = receitas.reduce((acc, r) => acc + Number(r.valor), 0);
  const totalDespesas = despesas.reduce((acc, d) => acc + Number(d.valor), 0);
  const saldo = totalReceitas - totalDespesas;

  const receitasAReceber = receitas.filter(r => r.status === 'Aguardando').reduce((acc, r) => acc + Number(r.valor), 0);
  const despesasAPagar = despesas.filter(d => d.status === 'A pagar').reduce((acc, d) => acc + Number(d.valor), 0);
  const despesasAtrasadas = despesas.filter(d => d.status === 'Atrasado').reduce((acc, d) => acc + Number(d.valor), 0);

  // Margens
  const margemBruta = totalReceitas - custosVariaveis;
  const margemBrutaPct = totalReceitas > 0 ? (margemBruta / totalReceitas) * 100 : 0;
  const margemLiquida = totalReceitas - totalDespesas;
  const margemLiquidaPct = totalReceitas > 0 ? (margemLiquida / totalReceitas) * 100 : 0;

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

  // Despesas por categoria
  const despesasPorCategoria = despesas.reduce((acc, d) => {
    const cat = (d.categorias_despesa as any)?.nome || 'Outros';
    acc[cat] = (acc[cat] || 0) + Number(d.valor);
    return acc;
  }, {} as Record<string, number>);
  const pieData = Object.entries(despesasPorCategoria).map(([name, value]) => ({ name, value }));

  // Custos fixos vs variáveis
  const custosFixos = despesas.filter(d => d.tipo === 'Fixo').reduce((acc, d) => acc + Number(d.valor), 0);
  const custosVariaveis = despesas.filter(d => d.tipo === 'Variável').reduce((acc, d) => acc + Number(d.valor), 0);
  const custosPieData = [
    { name: 'Fixo', value: custosFixos },
    { name: 'Variável', value: custosVariaveis },
  ].filter(d => d.value > 0);

  // Rankings from comissoes
  const vendedorMap = new Map(vendedores.map(v => [v.id, v.nome]));

  const vendedorContrato = Object.values(
    comissoes.reduce((acc, c) => {
      const nome = (c.vendedores as any)?.nome || vendedorMap.get(c.vendedor_id) || 'Desconhecido';
      if (!acc[nome]) acc[nome] = { nome, contratos: 0, total: 0 };
      acc[nome].contratos += 1;
      acc[nome].total += Number(c.valor_proposta);
      return acc;
    }, {} as Record<string, { nome: string; contratos: number; total: number }>)
  ).sort((a, b) => b.total - a.total);

  const vendedorRecebimento = Object.values(
    comissoes.reduce((acc, c) => {
      const nome = (c.vendedores as any)?.nome || vendedorMap.get(c.vendedor_id) || 'Desconhecido';
      if (!acc[nome]) acc[nome] = { nome, contratos: 0, total: 0 };
      acc[nome].contratos += 1;
      acc[nome].total += Number(c.valor_recebido);
      return acc;
    }, {} as Record<string, { nome: string; contratos: number; total: number }>)
  ).sort((a, b) => b.total - a.total);

  const applyRange = () => {
    if (customStart && customEnd) setActiveRange({ start: customStart, end: customEnd });
  };
  const clearRange = () => { setActiveRange(null); setCustomStart(''); setCustomEnd(''); };

  const formatDateBR = (d: string) => { const [y, m, day] = d.split('-'); return `${day}/${m}/${y}`; };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <div className="flex items-center gap-2">
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Faturamento</p><p className="text-2xl font-bold text-success">{formatCurrency(totalReceitas)}</p></div><ArrowUpCircle className="h-8 w-8 text-success opacity-60" /></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Despesas</p><p className="text-2xl font-bold text-destructive">{formatCurrency(totalDespesas)}</p></div><ArrowDownCircle className="h-8 w-8 text-destructive opacity-60" /></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Saldo</p><p className={`text-2xl font-bold ${saldo >= 0 ? 'text-success' : 'text-destructive'}`}>{formatCurrency(saldo)}</p></div><Wallet className="h-8 w-8 text-primary opacity-60" /></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Receitas a Receber</p><p className="text-2xl font-bold text-warning">{formatCurrency(receitasAReceber)}</p></div><Clock className="h-8 w-8 text-warning opacity-60" /></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Despesas a Pagar</p><p className="text-2xl font-bold text-warning">{formatCurrency(despesasAPagar)}</p></div><CreditCard className="h-8 w-8 text-warning opacity-60" /></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Despesas Atrasadas</p><p className="text-2xl font-bold text-destructive">{formatCurrency(despesasAtrasadas)}</p></div><AlertTriangle className="h-8 w-8 text-destructive opacity-60" /></div></CardContent></Card>
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

      {/* Charts & Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Despesas por Categoria</CardTitle></CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                    {pieData.map((_, i) => (<Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />))}
                  </Pie>
                  <Tooltip formatter={(val: number) => formatCurrency(val)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground text-center py-12">Sem despesas neste período</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Ranking por Valor de Contrato</CardTitle></CardHeader>
          <CardContent>
            {vendedorContrato.length > 0 ? (
              <div className="space-y-4">
                {vendedorContrato.map((v, i) => (
                  <div key={v.nome} className="flex items-center gap-4">
                    <span className="text-lg font-bold text-muted-foreground w-6">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{v.nome}</p>
                      <p className="text-sm text-muted-foreground">{v.contratos} contratos · Ticket médio: {formatCurrency(v.contratos > 0 ? v.total / v.contratos : 0)}</p>
                    </div>
                    <span className="text-sm font-semibold text-success">{formatCurrency(v.total)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-12">Sem comissões neste período</p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Ranking por Valor Recebido</CardTitle></CardHeader>
          <CardContent>
            {vendedorRecebimento.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {vendedorRecebimento.map((v, i) => (
                  <div key={v.nome} className="flex items-center gap-4">
                    <span className="text-lg font-bold text-muted-foreground w-6">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{v.nome}</p>
                      <p className="text-sm text-muted-foreground">{v.contratos} contratos · Ticket médio: {formatCurrency(v.contratos > 0 ? v.total / v.contratos : 0)}</p>
                    </div>
                    <span className="text-sm font-semibold text-success">{formatCurrency(v.total)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-12">Sem comissões neste período</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
