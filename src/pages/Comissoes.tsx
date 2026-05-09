import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { MonthYearPicker } from '@/components/MonthYearPicker';
import {
  useComissoes, useCreateComissao, useUpdateComissao, useDeleteComissao,
  useVendedores, useOperadoras, useSupervisores,
} from '@/hooks/useFinancialData';
import { formatCurrency, formatDate, getCurrentMonthYear } from '@/lib/format';
import { Plus, Trash2, Pencil, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ComissaoPasteDialog } from '@/components/comissoes/ComissaoPasteDialog';

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const emptyForm = {
  data: todayStr(),
  descricao: '',
  vendedor_id: '',
  operadora_id: '',
  supervisor_id: 'none',
  valor_proposta: '',
  valor_recebido: '',
  pct_vendedor: '',
  comissao_vendedor: '',
  pct_supervisor: '',
  comissao_supervisor: '',
  status: 'Pendente',
};

const num = (s: string) => parseFloat((s || '0').replace(',', '.')) || 0;

export default function Comissoes() {
  const { month: curMonth, year: curYear } = getCurrentMonthYear();
  const [month, setMonth] = useState(curMonth);
  const [year, setYear] = useState(curYear);
  const [open, setOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [filterVendedor, setFilterVendedor] = useState<string>('all');
  const [filterOperadora, setFilterOperadora] = useState<string>('all');

  const { data: comissoes = [], isLoading } = useComissoes(month, year);
  const { data: vendedores = [] } = useVendedores();
  const { data: operadoras = [] } = useOperadoras();
  const { data: supervisores = [] } = useSupervisores();
  const createComissao = useCreateComissao();
  const updateComissao = useUpdateComissao();
  const deleteComissao = useDeleteComissao();
  const { toast } = useToast();

  const [form, setForm] = useState(emptyForm);

  const filtered = comissoes.filter((c: any) => {
    if (filterVendedor !== 'all' && c.vendedor_id !== filterVendedor) return false;
    if (filterOperadora !== 'all' && c.operadora_id !== filterOperadora) return false;
    return true;
  });

  const totals = filtered.reduce((acc, c: any) => ({
    proposta: acc.proposta + Number(c.valor_proposta),
    recebido: acc.recebido + Number(c.valor_recebido),
    comVendedor: acc.comVendedor + Number(c.comissao_vendedor),
    comSupervisor: acc.comSupervisor + Number(c.comissao_supervisor),
  }), { proposta: 0, recebido: 0, comVendedor: 0, comSupervisor: 0 });

  const openNew = () => { setEditId(null); setForm(emptyForm); setOpen(true); };

  const openEdit = (c: any) => {
    setEditId(c.id);
    setForm({
      data: c.data,
      descricao: c.descricao,
      vendedor_id: c.vendedor_id,
      operadora_id: c.operadora_id || '',
      supervisor_id: c.supervisor_id || 'none',
      valor_proposta: String(c.valor_proposta),
      valor_recebido: String(c.valor_recebido),
      pct_vendedor: c.pct_vendedor != null ? String(c.pct_vendedor) : '',
      comissao_vendedor: String(c.comissao_vendedor),
      pct_supervisor: c.pct_supervisor != null ? String(c.pct_supervisor) : '',
      comissao_supervisor: String(c.comissao_supervisor),
      status: c.status,
    });
    setOpen(true);
  };

  // Recalcula valor R$ a partir de % e Valor da Proposta
  const onChangeProposta = (v: string) => {
    const proposta = num(v);
    const next = { ...form, valor_proposta: v };
    if (form.pct_vendedor) next.comissao_vendedor = (proposta * num(form.pct_vendedor) / 100).toFixed(2);
    if (form.pct_supervisor) next.comissao_supervisor = (proposta * num(form.pct_supervisor) / 100).toFixed(2);
    setForm(next);
  };
  const onChangePctVend = (v: string) => {
    const valor = (num(form.valor_proposta) * num(v) / 100).toFixed(2);
    setForm({ ...form, pct_vendedor: v, comissao_vendedor: v ? valor : form.comissao_vendedor });
  };
  const onChangeRSVend = (v: string) => {
    setForm({ ...form, comissao_vendedor: v, pct_vendedor: '' });
  };
  const onChangePctSup = (v: string) => {
    const valor = (num(form.valor_proposta) * num(v) / 100).toFixed(2);
    setForm({ ...form, pct_supervisor: v, comissao_supervisor: v ? valor : form.comissao_supervisor });
  };
  const onChangeRSSup = (v: string) => {
    setForm({ ...form, comissao_supervisor: v, pct_supervisor: '' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.operadora_id) {
      toast({ title: 'Selecione a operadora', variant: 'destructive' });
      return;
    }
    try {
      const payload = {
        data: form.data,
        descricao: form.descricao,
        vendedor_id: form.vendedor_id,
        operadora_id: form.operadora_id,
        supervisor_id: form.supervisor_id === 'none' ? null : form.supervisor_id,
        status: form.status,
        valor_proposta: num(form.valor_proposta),
        valor_recebido: num(form.valor_recebido),
        comissao_vendedor: num(form.comissao_vendedor),
        comissao_supervisor: num(form.comissao_supervisor),
        pct_vendedor: form.pct_vendedor ? num(form.pct_vendedor) : null,
        pct_supervisor: form.pct_supervisor ? num(form.pct_supervisor) : null,
      };
      if (editId) {
        await updateComissao.mutateAsync({ id: editId, ...payload });
        toast({ title: 'Comissão atualizada com sucesso!' });
      } else {
        await createComissao.mutateAsync(payload);
        toast({ title: 'Comissão cadastrada com sucesso!' });
      }
      setOpen(false); setEditId(null); setForm(emptyForm);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  const isPending = createComissao.isPending || updateComissao.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold">Comissões</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <MonthYearPicker month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
          <Button variant="outline" onClick={() => setPasteOpen(true)} className="gap-1">
            <Sparkles className="h-4 w-4" /> Colar print/texto
          </Button>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditId(null); }}>
            <DialogTrigger asChild>
              <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nova Comissão</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>{editId ? 'Editar Comissão' : 'Nova Comissão'}</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Data</label>
                    <Input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Status</label>
                    <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Pendente">Pendente</SelectItem>
                        <SelectItem value="Pago">Pago</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Vendedor</label>
                    <Select value={form.vendedor_id} onValueChange={v => setForm({ ...form, vendedor_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {vendedores.map((v: any) => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Operadora *</label>
                    <Select value={form.operadora_id} onValueChange={v => setForm({ ...form, operadora_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {operadoras.map((o: any) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Descrição da proposta</label>
                  <Input value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Valor da Proposta (R$)</label>
                    <Input type="number" step="0.01" min="0" value={form.valor_proposta} onChange={e => onChangeProposta(e.target.value)} required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Valor Recebido (R$)</label>
                    <Input type="number" step="0.01" min="0" value={form.valor_recebido} onChange={e => setForm({ ...form, valor_recebido: e.target.value })} />
                  </div>
                </div>

                <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
                  <p className="text-sm font-semibold">Comissão Vendedor</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">% sobre proposta</label>
                      <Input type="number" step="0.01" min="0" placeholder="ex: 10" value={form.pct_vendedor} onChange={e => onChangePctVend(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Valor (R$)</label>
                      <Input type="number" step="0.01" min="0" value={form.comissao_vendedor} onChange={e => onChangeRSVend(e.target.value)} />
                    </div>
                  </div>
                </div>

                <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">Comissão Supervisor</p>
                    <Select value={form.supervisor_id} onValueChange={v => setForm({ ...form, supervisor_id: v })}>
                      <SelectTrigger className="w-[200px] h-8"><SelectValue placeholder="Supervisor" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {supervisores.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">% sobre proposta</label>
                      <Input type="number" step="0.01" min="0" placeholder="ex: 2" value={form.pct_supervisor} onChange={e => onChangePctSup(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Valor (R$)</label>
                      <Input type="number" step="0.01" min="0" value={form.comissao_supervisor} onChange={e => onChangeRSSup(e.target.value)} />
                    </div>
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={isPending}>
                  {isPending ? 'Salvando...' : editId ? 'Salvar Alterações' : 'Cadastrar Comissão'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Total Propostas</p><p className="text-2xl font-bold text-primary">{formatCurrency(totals.proposta)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Total Recebido</p><p className="text-2xl font-bold text-success">{formatCurrency(totals.recebido)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Comissões Vendedores</p><p className="text-2xl font-bold text-warning">{formatCurrency(totals.comVendedor)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Comissões Supervisor</p><p className="text-2xl font-bold text-warning">{formatCurrency(totals.comSupervisor)}</p></CardContent></Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterVendedor} onValueChange={setFilterVendedor}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Vendedor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos vendedores</SelectItem>
            {vendedores.map((v: any) => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterOperadora} onValueChange={setFilterOperadora}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Operadora" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas operadoras</SelectItem>
            {operadoras.map((o: any) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Operadora</TableHead>
                <TableHead>Supervisor</TableHead>
                <TableHead className="text-right">Valor Proposta</TableHead>
                <TableHead className="text-right">Valor Recebido</TableHead>
                <TableHead className="text-right">Com. Vendedor</TableHead>
                <TableHead className="text-right">Com. Supervisor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Nenhuma comissão encontrada</TableCell></TableRow>
              ) : (
                filtered.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell>{formatDate(c.data)}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{c.descricao}</TableCell>
                    <TableCell>{c.vendedores?.nome}</TableCell>
                    <TableCell>{c.operadoras?.nome}</TableCell>
                    <TableCell>{c.supervisores?.nome || '—'}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(c.valor_proposta))}</TableCell>
                    <TableCell className="text-right text-success">{formatCurrency(Number(c.valor_recebido))}</TableCell>
                    <TableCell className="text-right text-warning">
                      {formatCurrency(Number(c.comissao_vendedor))}
                      {c.pct_vendedor != null && <span className="text-xs text-muted-foreground ml-1">({c.pct_vendedor}%)</span>}
                    </TableCell>
                    <TableCell className="text-right text-warning">
                      {formatCurrency(Number(c.comissao_supervisor))}
                      {c.pct_supervisor != null && <span className="text-xs text-muted-foreground ml-1">({c.pct_supervisor}%)</span>}
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${c.status === 'Pago' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                        {c.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteComissao.mutate(c.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="text-right text-sm text-muted-foreground">
        {filtered.length} registros
      </div>

      <ComissaoPasteDialog open={pasteOpen} onOpenChange={setPasteOpen} />
    </div>
  );
}
