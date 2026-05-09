import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { usePropostas, useCreateProposta, useUpdateProposta, useDeleteProposta, useOperadoras, useVendedores, useReceitas } from '@/hooks/useFinancialData';
import { UNIDADES_NEGOCIO } from '@/lib/unidadesNegocio';
import { formatCurrency } from '@/lib/format';
import { useToast } from '@/hooks/use-toast';

const emptyForm = {
  nome: '', operadora_id: '', vendedor_id: '', unidade_negocio: 'none',
  valor_proposta: '', valor_contrato: '',
};

export default function Propostas() {
  const { data: propostas = [], isLoading } = usePropostas();
  const { data: operadoras = [] } = useOperadoras();
  const { data: vendedores = [] } = useVendedores();
  // Pega TODAS receitas (sem filtro de mês) para agregações por proposta
  const { data: receitasAll = [] } = useReceitas(undefined, undefined, '1900-01-01', '2999-12-31');

  const create = useCreateProposta();
  const update = useUpdateProposta();
  const remove = useDeleteProposta();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const aggByProposta = useMemo(() => {
    const acc: Record<string, { recebido: number; aguardando: number; total: number; lancamentos: number }> = {};
    for (const r of receitasAll as any[]) {
      const pid = r.proposta_id;
      if (!pid) continue;
      if (!acc[pid]) acc[pid] = { recebido: 0, aguardando: 0, total: 0, lancamentos: 0 };
      const v = Number(r.valor);
      acc[pid].total += v;
      acc[pid].lancamentos += 1;
      if (r.status === 'Recebido') acc[pid].recebido += v;
      else acc[pid].aguardando += v;
    }
    return acc;
  }, [receitasAll]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    if (!s) return propostas;
    return (propostas as any[]).filter(p => p.nome.toLowerCase().includes(s));
  }, [propostas, search]);

  const openNew = () => { setEditId(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (p: any) => {
    setEditId(p.id);
    setForm({
      nome: p.nome,
      operadora_id: p.operadora_id || '',
      vendedor_id: p.vendedor_id || '',
      unidade_negocio: p.unidade_negocio || 'none',
      valor_proposta: String(p.valor_proposta ?? ''),
      valor_contrato: p.valor_contrato == null ? '' : String(p.valor_contrato),
    });
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        nome: form.nome.trim(),
        operadora_id: form.operadora_id || null,
        vendedor_id: form.vendedor_id || null,
        unidade_negocio: form.unidade_negocio === 'none' ? null : form.unidade_negocio,
        valor_proposta: parseFloat(form.valor_proposta) || 0,
        valor_contrato: form.valor_contrato === '' ? null : parseFloat(form.valor_contrato),
      };
      if (editId) await update.mutateAsync({ id: editId, ...payload });
      else await create.mutateAsync(payload);
      toast({ title: editId ? 'Proposta atualizada' : 'Proposta criada' });
      setOpen(false);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await remove.mutateAsync(confirmDelete);
      toast({ title: 'Proposta excluída' });
      setConfirmDelete(null);
    } catch (err: any) {
      toast({ title: 'Erro ao excluir', description: 'Verifique se há receitas vinculadas.', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold">Propostas</h2>
        <div className="flex items-center gap-2">
          <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="w-60" />
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nova Proposta</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Operadora</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead className="text-right">Valor Proposta</TableHead>
                <TableHead className="text-right">Valor Contrato</TableHead>
                <TableHead className="text-right">Recebido</TableHead>
                <TableHead className="text-right">Lançamentos</TableHead>
                <TableHead className="text-right">Ticket Médio</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Nenhuma proposta cadastrada</TableCell></TableRow>
              ) : (filtered as any[]).map(p => {
                const agg = aggByProposta[p.id] || { recebido: 0, total: 0, lancamentos: 0 };
                const ticket = agg.lancamentos > 0 ? agg.recebido / agg.lancamentos : 0;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.nome}</TableCell>
                    <TableCell>{(p.operadoras as any)?.nome || '—'}</TableCell>
                    <TableCell>{(p.vendedores as any)?.nome || '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{p.unidade_negocio || '—'}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(p.valor_proposta))}</TableCell>
                    <TableCell className="text-right">{p.valor_contrato == null ? <span className="text-muted-foreground">—</span> : formatCurrency(Number(p.valor_contrato))}</TableCell>
                    <TableCell className="text-right text-success">{formatCurrency(agg.recebido)}</TableCell>
                    <TableCell className="text-right">{agg.lancamentos}</TableCell>
                    <TableCell className="text-right">{formatCurrency(ticket)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setConfirmDelete(p.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editId ? 'Editar Proposta' : 'Nova Proposta'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Nome *</label>
              <Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Operadora</label>
                <Select value={form.operadora_id} onValueChange={v => setForm({ ...form, operadora_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {operadoras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
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
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Unidade</label>
                <Select value={form.unidade_negocio} onValueChange={v => setForm({ ...form, unidade_negocio: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {UNIDADES_NEGOCIO.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Valor Proposta</label>
                <Input type="number" step="0.01" min="0" value={form.valor_proposta} onChange={e => setForm({ ...form, valor_proposta: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Valor Contrato</label>
                <Input type="number" step="0.01" min="0" placeholder="A preencher" value={form.valor_contrato} onChange={e => setForm({ ...form, valor_contrato: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={create.isPending || update.isPending}>
                {editId ? 'Salvar' : 'Criar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={v => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir proposta?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Propostas com receitas vinculadas não podem ser excluídas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
