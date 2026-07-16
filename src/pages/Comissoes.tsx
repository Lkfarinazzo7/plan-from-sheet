import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useContratos, useUpdateContrato, extractComissoes, ComissaoItem } from '@/hooks/useFinancialData';
import { formatCurrency } from '@/lib/format';
import { useToast } from '@/hooks/use-toast';
import { HandCoins, CheckCircle2, Clock, Undo2, ChevronDown, ChevronRight } from 'lucide-react';

function formatDateBR(d?: string | null) {
  if (!d) return '—';
  const [y, m, day] = String(d).slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
}

export default function Comissoes() {
  const { data: contratos = [], isLoading } = useContratos();
  const update = useUpdateContrato();
  const { toast } = useToast();

  const [filterStatus, setFilterStatus] = useState<'pendente' | 'pago' | 'all'>('pendente');
  const [filterPessoa, setFilterPessoa] = useState('all');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [expandido, setExpandido] = useState<Set<string>>(new Set());

  const todas = useMemo(() => extractComissoes(contratos as any[]), [contratos]);

  const pessoas = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of todas) map.set(`${c.papel}|${c.pessoaId}`, c.pessoaNome);
    return Array.from(map.entries())
      .map(([key, nome]) => ({ key, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [todas]);

  const filtradas = useMemo(() => {
    return todas.filter(c => {
      if (filterStatus === 'pendente' && c.pago) return false;
      if (filterStatus === 'pago' && !c.pago) return false;
      if (filterPessoa !== 'all' && `${c.papel}|${c.pessoaId}` !== filterPessoa) return false;
      if (dataInicio || dataFim) {
        const d = c.dataImplantacao ? String(c.dataImplantacao).slice(0, 10) : '';
        if (!d) return false;
        if (dataInicio && d < dataInicio) return false;
        if (dataFim && d > dataFim) return false;
      }
      return true;
    });
  }, [todas, filterStatus, filterPessoa, dataInicio, dataFim]);

  // Agrupar por pessoa
  const grupos = useMemo(() => {
    const map = new Map<string, { nome: string; itens: ComissaoItem[]; total: number; pendente: number }>();
    for (const c of filtradas) {
      const key = `${c.pessoaNome}`;
      const g = map.get(key) || { nome: c.pessoaNome, itens: [], total: 0, pendente: 0 };
      g.itens.push(c);
      g.total += c.valor;
      if (!c.pago) g.pendente += c.valor;
      map.set(key, g);
    }
    return Array.from(map.values()).sort((a, b) => b.pendente - a.pendente || b.total - a.total);
  }, [filtradas]);

  const totalPendente = filtradas.filter(c => !c.pago).reduce((a, c) => a + c.valor, 0);
  const totalPago = filtradas.filter(c => c.pago).reduce((a, c) => a + c.valor, 0);
  const qtdPendente = filtradas.filter(c => !c.pago).length;

  const toggleGrupo = (nome: string) => {
    setExpandido(prev => {
      const next = new Set(prev);
      if (next.has(nome)) next.delete(nome); else next.add(nome);
      return next;
    });
  };

  const marcar = async (item: ComissaoItem, pago: boolean) => {
    try {
      await update.mutateAsync({ id: item.contratoId, [item.campoPago]: pago } as any);
      toast({
        title: pago ? 'Comissão marcada como paga' : 'Pagamento desfeito',
        description: `${item.pessoaNome} — ${item.contratoNome} (${formatCurrency(item.valor)})`,
      });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <HandCoins className="h-6 w-6" /> Comissões
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filterStatus} onValueChange={(v: any) => setFilterStatus(v)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pendente">A pagar</SelectItem>
              <SelectItem value="pago">Pagas</SelectItem>
              <SelectItem value="all">Todas</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterPessoa} onValueChange={setFilterPessoa}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Pessoa" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as pessoas</SelectItem>
              {pessoas.map(p => <SelectItem key={p.key} value={p.key}>{p.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1">
            <Input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="w-[150px]" />
            <span className="text-muted-foreground text-sm">a</span>
            <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="w-[150px]" />
          </div>
        </div>
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Total a Pagar</p><p className="text-2xl font-bold text-warning">{formatCurrency(totalPendente)}</p><p className="text-xs text-muted-foreground">{qtdPendente} comissão(ões) pendente(s)</p></div><Clock className="h-8 w-8 text-warning opacity-60" /></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Total Pago</p><p className="text-2xl font-bold text-success">{formatCurrency(totalPago)}</p></div><CheckCircle2 className="h-8 w-8 text-success opacity-60" /></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Pessoas com Pendência</p><p className="text-2xl font-bold text-primary">{grupos.filter(g => g.pendente > 0).length}</p></div><HandCoins className="h-8 w-8 text-primary opacity-60" /></div></CardContent></Card>
      </div>

      {/* Grupos por pessoa */}
      {isLoading ? (
        <p className="text-muted-foreground text-center py-12">Carregando...</p>
      ) : grupos.length === 0 ? (
        <Card><CardContent className="py-12"><p className="text-muted-foreground text-center">Nenhuma comissão encontrada com os filtros atuais.</p></CardContent></Card>
      ) : (
        <div className="space-y-4">
          {grupos.map(g => {
            const aberto = expandido.has(g.nome) || filterPessoa !== 'all';
            return (
              <Card key={g.nome}>
                <CardHeader
                  className="cursor-pointer py-4"
                  onClick={() => toggleGrupo(g.nome)}
                >
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      {g.nome}
                      <Badge variant="secondary">{g.itens.length}</Badge>
                    </CardTitle>
                    <div className="flex items-center gap-4 text-sm">
                      {g.pendente > 0 && <span className="font-semibold text-warning">A pagar: {formatCurrency(g.pendente)}</span>}
                      <span className="text-muted-foreground">Total: {formatCurrency(g.total)}</span>
                    </div>
                  </div>
                </CardHeader>
                {aberto && (
                  <CardContent className="pt-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Contrato</TableHead>
                          <TableHead>Operadora</TableHead>
                          <TableHead>Implantação</TableHead>
                          <TableHead>Papel</TableHead>
                          <TableHead className="text-right">%</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {g.itens
                          .slice()
                          .sort((a, b) => Number(a.pago) - Number(b.pago) || (b.dataImplantacao || '').localeCompare(a.dataImplantacao || ''))
                          .map((c, i) => (
                          <TableRow key={`${c.contratoId}-${c.campoPago}-${i}`}>
                            <TableCell className="font-medium">{c.contratoNome}</TableCell>
                            <TableCell>{c.operadoraNome}</TableCell>
                            <TableCell>{formatDateBR(c.dataImplantacao)}</TableCell>
                            <TableCell><Badge variant="outline">{c.papel}</Badge></TableCell>
                            <TableCell className="text-right">{c.percentual != null ? `${c.percentual}%` : '—'}</TableCell>
                            <TableCell className="text-right font-semibold">{formatCurrency(c.valor)}</TableCell>
                            <TableCell>
                              {c.pago
                                ? <Badge className="bg-success/15 text-success hover:bg-success/15">Pago</Badge>
                                : <Badge className="bg-warning/15 text-warning hover:bg-warning/15">Pendente</Badge>}
                            </TableCell>
                            <TableCell className="text-right">
                              {c.pago ? (
                                <Button size="sm" variant="ghost" className="gap-1" disabled={update.isPending} onClick={() => marcar(c, false)}>
                                  <Undo2 className="h-3.5 w-3.5" /> Desfazer
                                </Button>
                              ) : (
                                <Button size="sm" variant="outline" className="gap-1" disabled={update.isPending} onClick={() => marcar(c, true)}>
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Marcar pago
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
