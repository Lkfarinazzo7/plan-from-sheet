import { useState, useCallback, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { MonthYearPicker } from '@/components/MonthYearPicker';
import { useReceitas, useCreateReceita, useUpdateReceita, useDeleteReceita, useVendedores, useOperadoras, useBulkCreateReceita, useBulkUpdateReceita, useBulkDeleteReceita } from '@/hooks/useFinancialData';
import { formatCurrency, formatDate, getCurrentMonthYear, getMonthName } from '@/lib/format';
import { Plus, Trash2, Pencil, Upload, Copy, Download, Sparkles, X } from 'lucide-react';
import { exportToExcel } from '@/lib/exportHelpers';
import { useToast } from '@/hooks/use-toast';
import { ExcelImportDialog, type ParsedRow } from '@/components/ExcelImportDialog';
import { ReceitaPasteDialog } from '@/components/receitas/ReceitaPasteDialog';
import { parseValorBR, parseDateFlexible } from '@/lib/importHelpers';
import { UNIDADES_NEGOCIO } from '@/lib/unidadesNegocio';

const emptyForm = {
  data: new Date().toISOString().split('T')[0],
  descricao: '',
  categoria: 'Bancária',
  operadora_id: '',
  valor: '',
  vendedor_id: '',
  status: 'Aguardando',
  unidade_negocio: 'none' as string,
};

export default function Receitas() {
  const { month: curMonth, year: curYear } = getCurrentMonthYear();
  const [month, setMonth] = useState(curMonth);
  const [year, setYear] = useState(curYear);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [filterVendedor, setFilterVendedor] = useState<string>('all');
  const [filterOperadora, setFilterOperadora] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterUnidade, setFilterUnidade] = useState<string>('all');

  const { data: receitas = [], isLoading } = useReceitas(month, year);
  const { data: vendedores = [] } = useVendedores();
  const { data: operadoras = [] } = useOperadoras();
  const createReceita = useCreateReceita();
  const updateReceita = useUpdateReceita();
  const deleteReceita = useDeleteReceita();
  const bulkCreateReceita = useBulkCreateReceita();
  const bulkUpdateReceita = useBulkUpdateReceita();
  const bulkDeleteReceita = useBulkDeleteReceita();
  const { toast } = useToast();
  const [importOpen, setImportOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDate, setBulkDate] = useState(new Date().toISOString().split('T')[0]);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const mapReceitaRow = useCallback((row: Record<string, any>): ParsedRow => {
    const errors: string[] = [];
    const data = row['Data'];
    const descricao = row['Descrição'] || row['Descricao'] || '';
    const categoria = row['Categoria'] || '';
    const operadoraNome = row['Operadora'] || '';
    const vendedorNome = row['Vendedor'] || '';
    const valor = parseValorBR(row['Valor']);
    const status = row['Status'] || 'Aguardando';
    const unidade = row['Unidade'] || row['Unidade de Negócio'] || row['Unidade de Negocio'] || '';

    if (!data) errors.push('Data obrigatória');
    if (!descricao) errors.push('Descrição obrigatória');
    if (isNaN(valor)) errors.push('Valor inválido');

    const operadora = operadoras.find(o => o.nome.toLowerCase() === String(operadoraNome).toLowerCase());
    if (!operadora && operadoraNome) errors.push(`Operadora "${operadoraNome}" não encontrada`);
    if (!operadoraNome) errors.push('Operadora obrigatória');

    const vendedor = vendedores.find(v => v.nome.toLowerCase() === String(vendedorNome).toLowerCase());
    if (!vendedor && vendedorNome) errors.push(`Vendedor "${vendedorNome}" não encontrado`);
    if (!vendedorNome) errors.push('Vendedor obrigatório');

    const dateStr = parseDateFlexible(data);
    const unidadeMatch = UNIDADES_NEGOCIO.find(u => u.toLowerCase() === String(unidade).toLowerCase());

    return {
      mapped: {
        data: dateStr,
        descricao: String(descricao),
        categoria: String(categoria) || 'Bancária',
        operadora_id: operadora?.id || '',
        vendedor_id: vendedor?.id || '',
        valor: isNaN(valor) ? 0 : valor,
        status: ['Recebido', 'Aguardando'].includes(status) ? status : 'Aguardando',
        unidade_negocio: unidadeMatch || null,
      },
      raw: row,
      errors,
    };
  }, [operadoras, vendedores]);

  const [form, setForm] = useState(emptyForm);

  const filtered = receitas.filter(r => {
    if (filterVendedor !== 'all' && r.vendedor_id !== filterVendedor) return false;
    if (filterOperadora !== 'all' && r.operadora_id !== filterOperadora) return false;
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    if (filterUnidade !== 'all') {
      const u = (r as any).unidade_negocio || '';
      if (filterUnidade === 'none' ? u !== '' : u !== filterUnidade) return false;
    }
    return true;
  });

  const total = filtered.reduce((acc, r) => acc + Number(r.valor), 0);

  const filteredIds = useMemo(() => filtered.map(r => r.id), [filtered]);
  useEffect(() => { setSelectedIds(new Set()); }, [month, year, filterVendedor, filterOperadora, filterStatus, filterUnidade]);
  const allSelected = filteredIds.length > 0 && filteredIds.every(id => selectedIds.has(id));
  const someSelected = selectedIds.size > 0 && !allSelected;
  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredIds));
  };
  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const applyBulk = async (updates: Record<string, any>, label: string) => {
    try {
      const n = selectedIds.size;
      await bulkUpdateReceita.mutateAsync({ ids: Array.from(selectedIds), updates });
      toast({ title: `${label} atualizado em ${n} receita(s)` });
      setSelectedIds(new Set());
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };
  const handleBulkDelete = async () => {
    try {
      const n = selectedIds.size;
      await bulkDeleteReceita.mutateAsync(Array.from(selectedIds));
      toast({ title: `${n} receita(s) excluída(s)` });
      setSelectedIds(new Set());
      setConfirmDeleteOpen(false);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  const openNew = () => {
    setEditId(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (r: any) => {
    setEditId(r.id);
    setForm({
      data: r.data,
      descricao: r.descricao,
      categoria: r.categoria,
      operadora_id: r.operadora_id,
      valor: String(r.valor),
      vendedor_id: r.vendedor_id,
      status: r.status,
      unidade_negocio: r.unidade_negocio || 'none',
    });
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        valor: parseFloat(form.valor),
        unidade_negocio: form.unidade_negocio === 'none' ? null : form.unidade_negocio,
      };
      if (editId) {
        await updateReceita.mutateAsync({ id: editId, ...payload });
        toast({ title: 'Receita atualizada com sucesso!' });
      } else {
        await createReceita.mutateAsync(payload);
        toast({ title: 'Receita cadastrada com sucesso!' });
      }
      setOpen(false);
      setEditId(null);
      setForm(emptyForm);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  const isPending = createReceita.isPending || updateReceita.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold">Receitas</h2>
        <div className="flex items-center gap-3">
          <MonthYearPicker month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
          <Button variant="outline" onClick={() => {
            const rows = filtered.map(r => ({
              Data: formatDate(r.data),
              Descrição: r.descricao,
              Categoria: r.categoria,
              Operadora: (r.operadoras as any)?.nome || '',
              Vendedor: (r.vendedores as any)?.nome || '',
              'Unidade de Negócio': (r as any).unidade_negocio || '',
              Valor: Number(r.valor),
              Status: r.status,
            }));
            exportToExcel(rows, `Receitas_${getMonthName(month)}_${year}`);
          }}>
            <Download className="h-4 w-4 mr-1" /> Exportar
          </Button>
          <Button variant="outline" onClick={() => setPasteOpen(true)}>
            <Sparkles className="h-4 w-4 mr-1" /> Colar e identificar
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-1" /> Importar Excel
          </Button>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditId(null); }}>
            <DialogTrigger asChild>
              <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nova Receita</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{editId ? 'Editar Receita' : 'Nova Receita'}</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Data</label>
                    <Input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Categoria</label>
                    <Select value={form.categoria} onValueChange={v => setForm({ ...form, categoria: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Bancária">Bancária</SelectItem>
                        <SelectItem value="Vida">Vida</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Descrição</label>
                  <Input value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} required />
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
                    <label className="text-sm font-medium">Valor (R$)</label>
                    <Input type="number" step="0.01" min="0" value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Status</label>
                    <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Recebido">Recebido</SelectItem>
                        <SelectItem value="Aguardando">Aguardando</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
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
                </div>
                <Button type="submit" className="w-full" disabled={isPending}>
                  {isPending ? 'Salvando...' : editId ? 'Salvar Alterações' : 'Cadastrar Receita'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterVendedor} onValueChange={setFilterVendedor}>
          <SelectTrigger className={`w-[160px] ${filterVendedor !== 'all' ? 'border-primary ring-2 ring-primary/30 bg-primary/5 text-primary font-medium' : ''}`}><SelectValue placeholder="Vendedor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos vendedores</SelectItem>
            {vendedores.map(v => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterOperadora} onValueChange={setFilterOperadora}>
          <SelectTrigger className={`w-[160px] ${filterOperadora !== 'all' ? 'border-primary ring-2 ring-primary/30 bg-primary/5 text-primary font-medium' : ''}`}><SelectValue placeholder="Operadora" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas operadoras</SelectItem>
            {operadoras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className={`w-[140px] ${filterStatus !== 'all' ? 'border-primary ring-2 ring-primary/30 bg-primary/5 text-primary font-medium' : ''}`}><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="Recebido">Recebido</SelectItem>
            <SelectItem value="Aguardando">Aguardando</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterUnidade} onValueChange={setFilterUnidade}>
          <SelectTrigger className={`w-[180px] ${filterUnidade !== 'all' ? 'border-primary ring-2 ring-primary/30 bg-primary/5 text-primary font-medium' : ''}`}><SelectValue placeholder="Unidade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas unidades</SelectItem>
            <SelectItem value="none">Sem unidade</SelectItem>
            {UNIDADES_NEGOCIO.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
          </SelectContent>
        </Select>
        {(filterVendedor !== 'all' || filterOperadora !== 'all' || filterStatus !== 'all' || filterUnidade !== 'all') && (
          <Button variant="ghost" size="sm" onClick={() => {
            setFilterVendedor('all'); setFilterOperadora('all'); setFilterStatus('all'); setFilterUnidade('all');
          }}>Limpar filtros</Button>
        )}
      </div>

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-3 border rounded-lg bg-primary/5 border-primary/30">
          <span className="text-sm font-medium mr-2">{selectedIds.size} selecionada(s)</span>

          <Popover>
            <PopoverTrigger asChild><Button size="sm" variant="outline">Status</Button></PopoverTrigger>
            <PopoverContent className="w-44 p-2 space-y-1">
              <Button size="sm" variant="ghost" className="w-full justify-start" onClick={() => applyBulk({ status: 'Recebido' }, 'Status')}>Recebido</Button>
              <Button size="sm" variant="ghost" className="w-full justify-start" onClick={() => applyBulk({ status: 'Aguardando' }, 'Status')}>Aguardando</Button>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild><Button size="sm" variant="outline">Data</Button></PopoverTrigger>
            <PopoverContent className="w-60 space-y-2">
              <Input type="date" value={bulkDate} onChange={e => setBulkDate(e.target.value)} />
              <Button size="sm" className="w-full" onClick={() => applyBulk({ data: bulkDate }, 'Data')}>Aplicar</Button>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild><Button size="sm" variant="outline">Operadora</Button></PopoverTrigger>
            <PopoverContent className="w-56 space-y-2">
              <Select onValueChange={v => applyBulk({ operadora_id: v }, 'Operadora')}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {operadoras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild><Button size="sm" variant="outline">Vendedor</Button></PopoverTrigger>
            <PopoverContent className="w-56 space-y-2">
              <Select onValueChange={v => applyBulk({ vendedor_id: v }, 'Vendedor')}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {vendedores.map(v => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild><Button size="sm" variant="outline">Categoria</Button></PopoverTrigger>
            <PopoverContent className="w-44 p-2 space-y-1">
              <Button size="sm" variant="ghost" className="w-full justify-start" onClick={() => applyBulk({ categoria: 'Bancária' }, 'Categoria')}>Bancária</Button>
              <Button size="sm" variant="ghost" className="w-full justify-start" onClick={() => applyBulk({ categoria: 'Vida' }, 'Categoria')}>Vida</Button>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild><Button size="sm" variant="outline">Unidade</Button></PopoverTrigger>
            <PopoverContent className="w-56 space-y-2">
              <Select onValueChange={v => applyBulk({ unidade_negocio: v === 'none' ? null : v }, 'Unidade')}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {UNIDADES_NEGOCIO.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </PopoverContent>
          </Popover>

          <Button size="sm" variant="destructive" onClick={() => setConfirmDeleteOpen(true)}>
            <Trash2 className="h-4 w-4 mr-1" /> Excluir
          </Button>

          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelectedIds(new Set())}>
            <X className="h-4 w-4 mr-1" /> Limpar
          </Button>
        </div>
      )}

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selectedIds.size} receita(s)?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                    onCheckedChange={toggleAll}
                    aria-label="Selecionar todos"
                  />
                </TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Operadora</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Nenhuma receita encontrada</TableCell></TableRow>
              ) : (
                filtered.map(r => (
                  <TableRow key={r.id}>
                    <TableCell>{formatDate(r.data)}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{r.descricao}</TableCell>
                    <TableCell>{r.categoria}</TableCell>
                    <TableCell>{(r.operadoras as any)?.nome}</TableCell>
                    <TableCell>{(r.vendedores as any)?.nome}</TableCell>
                    <TableCell className="text-muted-foreground">{(r as any).unidade_negocio || '—'}</TableCell>
                    <TableCell className="text-right font-medium text-success">{formatCurrency(Number(r.valor))}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${r.status === 'Recebido' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                        {r.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Duplicar"
                          onClick={async () => {
                            try {
                              const today = new Date();
                              const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                              await createReceita.mutateAsync({
                                data: todayStr,
                                descricao: r.descricao,
                                categoria: r.categoria,
                                operadora_id: r.operadora_id,
                                vendedor_id: r.vendedor_id,
                                valor: r.valor,
                                status: 'Aguardando',
                                unidade_negocio: (r as any).unidade_negocio || null,
                              });
                              toast({ title: 'Receita duplicada com sucesso!' });
                            } catch (err: any) {
                              toast({ title: 'Erro', description: err.message, variant: 'destructive' });
                            }
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteReceita.mutate(r.id)}>
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
        Total: <span className="font-bold text-foreground">{formatCurrency(total)}</span> ({filtered.length} registros)
      </div>

      <ExcelImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Importar Receitas"
        expectedColumns={['Data', 'Descrição', 'Categoria', 'Operadora', 'Vendedor', 'Valor', 'Status']}
        mapRow={mapReceitaRow}
        onConfirm={async (rows) => { await bulkCreateReceita.mutateAsync(rows as any); }}
        columnAliases={{
          'Valor': ['Valor Real', 'Valor (R$)'],
          'Vendedor': ['Responsável', 'Responsavel'],
        }}
      />
      <ReceitaPasteDialog open={pasteOpen} onOpenChange={setPasteOpen} />
    </div>
  );
}
