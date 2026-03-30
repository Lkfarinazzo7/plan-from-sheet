import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MonthYearPicker } from '@/components/MonthYearPicker';
import { useReceitas, useVendedores } from '@/hooks/useFinancialData';
import { formatCurrency, getCurrentMonthYear } from '@/lib/format';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function Comissoes() {
  const { month: curMonth, year: curYear } = getCurrentMonthYear();
  const [month, setMonth] = useState(curMonth);
  const [year, setYear] = useState(curYear);

  const { data: receitas = [] } = useReceitas(month, year);
  const { data: vendedores = [] } = useVendedores();

  const vendedorStats = vendedores.map(v => {
    const vendorReceitas = receitas.filter(r => r.vendedor_id === v.id);
    return {
      nome: v.nome,
      contratos: vendorReceitas.length,
      faturamento: vendorReceitas.reduce((acc, r) => acc + Number(r.valor), 0),
      comissao: vendorReceitas.reduce((acc, r) => acc + Number(r.comissao), 0),
    };
  }).sort((a, b) => b.comissao - a.comissao);

  const totalComissao = vendedorStats.reduce((acc, v) => acc + v.comissao, 0);
  const totalFaturamento = vendedorStats.reduce((acc, v) => acc + v.faturamento, 0);
  const totalContratos = vendedorStats.reduce((acc, v) => acc + v.contratos, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Comissões</h2>
        <MonthYearPicker month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Comissões</p>
            <p className="text-2xl font-bold text-warning">{formatCurrency(totalComissao)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Faturamento Total</p>
            <p className="text-2xl font-bold text-success">{formatCurrency(totalFaturamento)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Contratos</p>
            <p className="text-2xl font-bold">{totalContratos}</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Comissões por Vendedor</CardTitle>
        </CardHeader>
        <CardContent>
          {vendedorStats.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={vendedorStats}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 25%, 90%)" />
                <XAxis dataKey="nome" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(val: number) => formatCurrency(val)} />
                <Legend />
                <Bar dataKey="comissao" name="Comissão" fill="hsl(38, 92%, 50%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="faturamento" name="Faturamento" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-center py-12">Sem dados para este mês</p>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendedor</TableHead>
                <TableHead className="text-center">Contratos</TableHead>
                <TableHead className="text-right">Faturamento</TableHead>
                <TableHead className="text-right">Comissão</TableHead>
                <TableHead className="text-right">% do Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendedorStats.map(v => (
                <TableRow key={v.nome}>
                  <TableCell className="font-medium">{v.nome}</TableCell>
                  <TableCell className="text-center">{v.contratos}</TableCell>
                  <TableCell className="text-right text-success">{formatCurrency(v.faturamento)}</TableCell>
                  <TableCell className="text-right font-medium text-warning">{formatCurrency(v.comissao)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {totalComissao > 0 ? ((v.comissao / totalComissao) * 100).toFixed(1) : '0'}%
                  </TableCell>
                </TableRow>
              ))}
              {vendedorStats.length > 0 && (
                <TableRow className="font-bold border-t-2">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-center">{totalContratos}</TableCell>
                  <TableCell className="text-right text-success">{formatCurrency(totalFaturamento)}</TableCell>
                  <TableCell className="text-right text-warning">{formatCurrency(totalComissao)}</TableCell>
                  <TableCell className="text-right">100%</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
