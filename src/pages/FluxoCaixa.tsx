import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MonthYearPicker } from '@/components/MonthYearPicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UNIDADES_NEGOCIO } from '@/lib/unidadesNegocio';
import { useDFCRealizado, useDFCProjetado, useSetoresDespesa } from '@/hooks/useFinancialData';
import { formatCurrency, getCurrentMonthYear } from '@/lib/format';
import { CalendarRange, X, ArrowUpCircle, ArrowDownCircle, Wallet, TrendingUp, Clock } from 'lucide-react';
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

export default function FluxoCaixa() {
  const { month: curMonth, year: curYear } = getCurrentMonthYear();
  const [month, setMonth] = useState(curMonth);
  const [year, setYear] = useState(curYear);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [activeRange, setActiveRange] = useState<{ start: string; end: string } | null>(null);
  const [filterUnidade, setFilterUnidade] = useState<string>('all');
  const [filterSetor, setFilterSetor] = useState('all');
  const { data: setores = [] } = useSetoresDespesa();
  const [horizonte, setHorizonte] = useState<'30' | '60' | '90'>('90');

  const isCustom = !!activeRange;
  const periodArgs = useMemo(() => ({
    month: isCustom ? undefined : month,
    year: isCustom ? undefined : year,
    startDate: activeRange?.start,
    endDate: activeRange?.end,
    unidade: filterUnidade,
    setor: filterSetor,
  }), [isCustom, month, year, activeRange, filterUnidade, filterSetor]);

  const { data: dfc, error: dfcError } = useDFCRealizado(periodArgs);
  const { data: projecao, error: projError } = useDFCProjetado(filterUnidade, Number(horizonte), filterSetor);
  const projetado = projecao?.pontos ?? [];

  const totalEntradasProj = projetado.reduce((a, p) => a + p.entradas, 0);
  const totalSaidasProj = projetado.reduce((a, p) => a + p.saidas, 0);
  const saldoProj = totalEntradasProj - totalSaidasProj;

  const applyRange = () => { if (customStart && customEnd) setActiveRange({ start: customStart, end: customEnd }); };
  const clearRange = () => { setActiveRange(null); setCustomStart(''); setCustomEnd(''); };
  const formatDateBR = (d: string) => { const [y, m, day] = d.split('-'); return `${day}/${m}/${y}`; };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold">Fluxo de Caixa</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filterUnidade} onValueChange={setFilterUnidade}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Unidade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as unidades</SelectItem>
              <SelectItem value="none">Sem unidade</SelectItem>
              {UNIDADES_NEGOCIO.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterSetor} onValueChange={setFilterSetor}>
            <SelectTrigger className="w-[180px]" aria-label="Setor"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Todos os setores</SelectItem><SelectItem value="none">Sem setor</SelectItem>{setores.map(s => <SelectItem key={s.id} value={s.nome}>{s.nome}</SelectItem>)}</SelectContent>
          </Select>
          {!isCustom && <MonthYearPicker month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />}
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
              <p className="text-sm font-medium">Período do DFC realizado</p>
              <div className="space-y-2">
                <div><label className="text-xs text-muted-foreground">Início</label><Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} /></div>
                <div><label className="text-xs text-muted-foreground">Fim</label><Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} /></div>
              </div>
              <Button size="sm" className="w-full" onClick={applyRange} disabled={!customStart || !customEnd}>Aplicar</Button>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Cards topo — DFC Realizado */}
      {(dfcError || projError) && <p role="alert" className="text-destructive">Não foi possível carregar o caixa: {dfcError?.message ?? projError?.message}</p>}
      <div role="status" aria-label="Qualidade dos dados do caixa" className="rounded-md border p-3 text-sm space-y-1">
        {dfc?.detalhe.pendencias.avisos.map((aviso, i) => <p key={i}>{aviso}</p>)}
        <p>Pendências sem data abrangem o histórico da unidade/setor: não é possível atribuí-las a um mês sem revisão.</p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground mb-2">DFC do período selecionado</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Entradas realizadas</p><p className="text-2xl font-bold text-success">{formatCurrency(dfc?.entradasRealizadas ?? 0)}</p><p className="text-xs text-muted-foreground">Prev.: {formatCurrency(dfc?.entradasPrevistas ?? 0)}</p></div><ArrowUpCircle className="h-8 w-8 text-success opacity-60" /></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Saídas realizadas</p><p className="text-2xl font-bold text-destructive">{formatCurrency(dfc?.saidasRealizadas ?? 0)}</p><p className="text-xs text-muted-foreground">Prev.: {formatCurrency(dfc?.saidasPrevistas ?? 0)}</p></div><ArrowDownCircle className="h-8 w-8 text-destructive opacity-60" /></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Caixa líquido realizado</p><p className={`text-2xl font-bold ${(dfc?.saldoRealizado ?? 0) >= 0 ? 'text-success' : 'text-destructive'}`}>{formatCurrency(dfc?.saldoRealizado ?? 0)}</p></div><Wallet className="h-8 w-8 text-primary opacity-60" /></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Caixa projetado (real + prev.)</p><p className={`text-2xl font-bold ${(dfc?.saldoTotal ?? 0) >= 0 ? 'text-success' : 'text-destructive'}`}>{formatCurrency(dfc?.saldoTotal ?? 0)}</p></div><TrendingUp className="h-8 w-8 text-primary opacity-60" /></div></CardContent></Card>
        </div>
      </div>

      {/* Projeção */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Fluxo Projetado — próximos {horizonte} dias</CardTitle>
            <p className="text-xs text-muted-foreground">Somente status em aberto com vencimento explícito, contando hoje. Vencidos aparecem separadamente e não recebem nova data presumida.</p>
          </div>
          <Select value={horizonte} onValueChange={(v: any) => setHorizonte(v)}>
            <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="30">30 dias</SelectItem>
              <SelectItem value="60">60 dias</SelectItem>
              <SelectItem value="90">90 dias</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <div className="mb-4 rounded-md border p-3 text-sm" aria-label="Vencidos e pendências da projeção">
            <p>Vencidos antes de hoje — a receber: {formatCurrency(projecao?.resumo.vencidos_antes_periodo.entradas.valor ?? 0)}; a pagar: {formatCurrency(projecao?.resumo.vencidos_antes_periodo.saidas.valor ?? 0)}.</p>
            {projecao?.resumo.pendencias.avisos.map((aviso, i) => <p key={i} className="text-muted-foreground">{aviso}</p>)}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4 text-sm">
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Entradas previstas</p><p className="text-lg font-semibold text-success">{formatCurrency(totalEntradasProj)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Saídas previstas</p><p className="text-lg font-semibold text-destructive">{formatCurrency(totalSaidasProj)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Saldo previsto — {horizonte} dias</p><p className={`text-sm font-semibold ${saldoProj >= 0 ? 'text-success' : 'text-destructive'}`}>{formatCurrency(saldoProj)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Saldo final acumulado</p><p className={`text-lg font-semibold ${saldoProj >= 0 ? 'text-success' : 'text-destructive'}`}>{formatCurrency(saldoProj)}</p></CardContent></Card>
          </div>
          {projetado.length > 0 ? (
            <ResponsiveContainer width="100%" height={340}>
              <ComposedChart data={projetado}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="semana" />
                <YAxis tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(val: number) => formatCurrency(val)} />
                <Legend />
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />
                <Bar dataKey="entradas" name="Entradas" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="saidas" name="Saídas" fill="hsl(0, 72%, 51%)" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="saldoAcumulado" name="Saldo acumulado" stroke="hsl(215, 80%, 48%)" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-center py-12">Sem lançamentos futuros para projetar.</p>
          )}
        </CardContent>
      </Card>

      {/* Tabela DFC estruturado */}
      <Card>
        <CardHeader><CardTitle className="text-base">DFC do período (estrutura)</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b">
                <td className="py-2 font-semibold">(+) Entradas efetivamente recebidas</td>
                <td className="py-2 text-right text-success font-medium">{formatCurrency(dfc?.entradasRealizadas ?? 0)}</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 font-semibold">(–) Saídas efetivamente pagas</td>
                <td className="py-2 text-right text-destructive font-medium">{formatCurrency(dfc?.saidasRealizadas ?? 0)}</td>
              </tr>
              <tr className="border-b bg-muted/40">
                <td className="py-2 font-bold">(=) Caixa líquido (inclui investimentos e financiamento)</td>
                <td className={`py-2 text-right font-bold ${(dfc?.saldoRealizado ?? 0) >= 0 ? 'text-success' : 'text-destructive'}`}>{formatCurrency(dfc?.saldoRealizado ?? 0)}</td>
              </tr>
              <tr className="border-b text-muted-foreground">
                <td className="py-2 italic">Entradas previstas (a receber)</td>
                <td className="py-2 text-right italic">{formatCurrency(dfc?.entradasPrevistas ?? 0)}</td>
              </tr>
              <tr className="border-b text-muted-foreground">
                <td className="py-2 italic">Saídas previstas (a pagar)</td>
                <td className="py-2 text-right italic">{formatCurrency(dfc?.saidasPrevistas ?? 0)}</td>
              </tr>
              <tr>
                <td className="py-2 font-bold">(=) Caixa total esperado</td>
                <td className={`py-2 text-right font-bold ${(dfc?.saldoTotal ?? 0) >= 0 ? 'text-success' : 'text-destructive'}`}>{formatCurrency(dfc?.saldoTotal ?? 0)}</td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
