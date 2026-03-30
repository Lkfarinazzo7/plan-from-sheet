import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MonthYearPicker } from '@/components/MonthYearPicker';
import { useReceitas, useDespesas, useVendedores } from '@/hooks/useFinancialData';
import { formatCurrency, getCurrentMonthYear } from '@/lib/format';
import { ArrowUpCircle, ArrowDownCircle, Wallet, TrendingUp } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
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

  const { data: receitas = [] } = useReceitas(month, year);
  const { data: despesas = [] } = useDespesas(month, year);
  const { data: vendedores = [] } = useVendedores();

  const totalReceitas = receitas.reduce((acc, r) => acc + Number(r.valor), 0);
  const totalDespesas = despesas.reduce((acc, d) => acc + Number(d.valor), 0);
  const saldo = totalReceitas - totalDespesas;
  const totalComissoes = receitas.reduce((acc, r) => acc + Number(r.comissao), 0);

  // Despesas por categoria
  const despesasPorCategoria = despesas.reduce((acc, d) => {
    const cat = (d.categorias_despesa as any)?.nome || 'Outros';
    acc[cat] = (acc[cat] || 0) + Number(d.valor);
    return acc;
  }, {} as Record<string, number>);

  const pieData = Object.entries(despesasPorCategoria).map(([name, value]) => ({ name, value }));

  // Ranking vendedores
  const vendedorStats = vendedores.map(v => {
    const vendorReceitas = receitas.filter(r => r.vendedor_id === v.id);
    return {
      nome: v.nome,
      contratos: vendorReceitas.length,
      faturamento: vendorReceitas.reduce((acc, r) => acc + Number(r.valor), 0),
      comissao: vendorReceitas.reduce((acc, r) => acc + Number(r.comissao), 0),
    };
  }).sort((a, b) => b.faturamento - a.faturamento);

  // Bar chart: últimos 6 meses
  const barData = Array.from({ length: 6 }, (_, i) => {
    const m = new Date(year, month - 5 + i, 1);
    const mName = m.toLocaleDateString('pt-BR', { month: 'short' });
    return { name: mName, mes: m.getMonth(), ano: m.getFullYear() };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <MonthYearPicker month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Faturamento</p>
                <p className="text-2xl font-bold text-success">{formatCurrency(totalReceitas)}</p>
              </div>
              <ArrowUpCircle className="h-8 w-8 text-success opacity-60" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Despesas</p>
                <p className="text-2xl font-bold text-destructive">{formatCurrency(totalDespesas)}</p>
              </div>
              <ArrowDownCircle className="h-8 w-8 text-destructive opacity-60" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Saldo</p>
                <p className={`text-2xl font-bold ${saldo >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {formatCurrency(saldo)}
                </p>
              </div>
              <Wallet className="h-8 w-8 text-primary opacity-60" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Comissões</p>
                <p className="text-2xl font-bold text-warning">{formatCurrency(totalComissoes)}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-warning opacity-60" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Despesas por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val: number) => formatCurrency(val)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground text-center py-12">Sem despesas neste mês</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ranking de Vendedores</CardTitle>
          </CardHeader>
          <CardContent>
            {vendedorStats.length > 0 ? (
              <div className="space-y-4">
                {vendedorStats.map((v, i) => (
                  <div key={v.nome} className="flex items-center gap-4">
                    <span className="text-lg font-bold text-muted-foreground w-6">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{v.nome}</p>
                      <p className="text-sm text-muted-foreground">
                        {v.contratos} contratos · Comissão: {formatCurrency(v.comissao)}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-success">{formatCurrency(v.faturamento)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-12">Sem dados de vendedores</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
