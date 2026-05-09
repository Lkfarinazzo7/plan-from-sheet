import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { MonthYearPicker } from '@/components/MonthYearPicker';
import { useComissoes, useCreateComissao, useUpdateComissao, useDeleteComissao, useVendedores } from '@/hooks/useFinancialData';
import { formatCurrency, formatDate, getCurrentMonthYear } from '@/lib/format';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const emptyForm = {
  data: new Date().toISOString().split('T')[0],
  descricao: '',
  vendedor_id: '',
  valor_proposta: '',
  valor_recebido: '',
  comissao_vendedor: '',
  comissao_supervisor: '',
  status: 'Pendente',
};

export default function Comissoes() {
  const { month: curMonth, year: curYear } = getCurrentMonthYear();
  const [month, setMonth] = useState(curMonth);
  const [year, setYear] = useState(curYear);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [filterVendedor, setFilterVendedor] = useState<string>('all');

  const { data: comissoes = [], isLoading } = useComissoes(month, year);
  const { data: vendedores = [] } = useVendedores();
  const createComissao = useCreateComissao();
  const updateComissao = useUpdateComissao();
  const deleteComissao = useDeleteComissao();
  const { toast } = useToast();

  const [form, setForm] = useState(emptyForm);

  const filtered = comissoes.filter(c => {
    if (filterVendedor !== 'all' && c.vendedor_id !== filterVendedor) return false;
    return true;
  });

  const totals = filtered.reduce((acc, c) => ({
    proposta: acc.proposta + Number(c.valor_proposta),
    recebido: acc.recebido + Number(c.valor_recebido),
    comVendedor: acc.comVendedor + Number(c.comissao_vendedor),
    comSupervisor: acc.comSupervisor + Number(c.comissao_supervisor),
  }), { proposta: 0, recebido: 0, comVendedor: 0, comSupervisor: 0 });

  const openNew = () => {
    setEditId(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (c: any) => {
    setEditId(c.id);
    setForm({
      data: c.data,
      descricao: c.descricao,
      vendedor_id: c.vendedor_id,
      valor_proposta: String(c.valor_proposta),
      valor_recebido: String(c.valor_recebido),
      comissao_vendedor: String(c.comissao_vendedor),
      comissao_supervisor: String(c.comissao_supervisor),
      status: c.status,
    });
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        valor_proposta: parseFloat(form.valor_proposta || '0'),
        valor_recebido: parseFloat(form.valor_recebido || '0'),
        comissao_vendedor: parseFloat(form.comissao_vendedor || '0'),
        comissao_supervisor: parseFloat(form.comissao_supervisor || '0'),
      };
      if (editId) {
        await updateComissao.mutateAsync({ id: editId, ...payload });
        toast({ title: 'Comissão atualizada com sucesso!' });
      } else {
        await createComissao.mutateAsync(payload);
        toast({ title: 'Comissão cadastrada com sucesso!' });
      }
      setOpen(false);
      setEditId(null);
      setForm(emptyForm);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  const isPending = createComissao.isPending || updateComissao.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold">Comissões</h2>
        <div className="flex items-center gap-3">
          <MonthYearPicker month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditId(null); }}>
            <DialogTrigger asChild>
              <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nova Comissão</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{editId ? 'Editar Comissão' : 'Nova Comissão'}</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Data</label>
                    <Input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Vendedor</label>
                    <Select value={form.vendedor_id} onValueChange={v => setForm({ ...form, vendedor_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {vendedores.map(v => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}
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
                    <Input type="number" step="0.01" min="0" value={form.valor_proposta} onChange={e => setForm({ ...form, valor_proposta: e.target.value })} required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Valor Recebido (R$)</label>
                    <Input type="number" step="0.01" min="0" value={form.valor_recebido} onChange={e => setForm({ ...form, valor_recebido: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Comissão Vendedor (R$)</label>
                    <Input type="number" step="0.01" min="0" value={form.comissao_vendedor} onChange={e => setForm({ ...form, comissao_vendedor: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Comissão Supervisor (R$)</label>
                    <Input type="number" step="0.01" min="0" value={form.comissao_supervisor} onChange={e => setForm({ ...form, comissao_supervisor: e.target.value })} />
                  </div>
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
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Propostas</p>
            <p className="text-2xl font-bold text-primary">{formatCurrency(totals.proposta)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Recebido</p>
            <p className="text-2xl font-bold text-success">{formatCurrency(totals.recebido)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Comissões Vendedores</p>
            <p className="text-2xl font-bold text-warning">{formatCurrency(totals.comVendedor)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Comissões Supervisor</p>
            <p className="text-2xl font-bold text-warning">{formatCurrency(totals.comSupervisor)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterVendedor} onValueChange={setFilterVendedor}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Vendedor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos vendedores</SelectItem>
            {vendedores.map(v => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}
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
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Nenhuma comissão encontrada</TableCell></TableRow>
              ) : (
                filtered.map(c => (
                  <TableRow key={c.id}>
                    <TableCell>{formatDate(c.data)}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{c.descricao}</TableCell>
                    <TableCell>{(c.vendedores as any)?.nome}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(c.valor_proposta))}</TableCell>
                    <TableCell className="text-right text-success">{formatCurrency(Number(c.valor_recebido))}</TableCell>
                    <TableCell className="text-right text-warning">{formatCurrency(Number(c.comissao_vendedor))}</TableCell>
                    <TableCell className="text-right text-warning">{formatCurrency(Number(c.comissao_supervisor))}</TableCell>
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
    </div>
  );
}
