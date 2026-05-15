import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { MonthYearPicker } from '@/components/MonthYearPicker';
import { useDespesas, useCreateDespesa, useUpdateDespesa, useDeleteDespesa, useCategoriasDespesa, useGenerateRecurringDespesas, useBulkCreateDespesa } from '@/hooks/useFinancialData';
import { formatCurrency, formatDate, getCurrentMonthYear, getMonthName } from '@/lib/format';
import { Plus, Trash2, RotateCcw, Pencil, Upload, Check, Copy, Download, X, StickyNote } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { exportToExcel } from '@/lib/exportHelpers';
import { useToast } from '@/hooks/use-toast';
import { ExcelImportDialog, type ParsedRow } from '@/components/ExcelImportDialog';
import { parseValorBR, parseDateFlexible } from '@/lib/importHelpers';
import { UNIDADES_NEGOCIO } from '@/lib/unidadesNegocio';

const emptyForm = {
  data: new Date().toISOString().split('T')[0],
  descricao: '',
  categoria_id: '',
  tipo: 'Fixo',
  valor: '',
  responsavel: '',
  recorrente: false,
  status: 'A pagar',
  unidade_negocio: 'none' as string,
  observacoes: '',
};

// Calcula segunda e domingo (BR) da semana atual em YYYY-MM-DD local
function getThisWeekRange(): { start: string; end: string } {
  const today = new Date();
  const day = today.getDay(); // 0=dom, 1=seg, ..., 6=sab
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + diffToMonday);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: fmt(monday), end: fmt(sunday) };
}

export default function Despesas() {
  const { month: curMonth, year: curYear } = getCurrentMonthYear();
  const [month, setMonth] = useState(curMonth);
  const [year, setYear] = useState(curYear);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [filterCategoria, setFilterCategoria] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPeriodo, setFilterPeriodo] = useState<string>('all'); // all | semana | custom
  const [filterTipo, setFilterTipo] = useState<string>('all');
  const [filterResponsavel, setFilterResponsavel] = useState<string>('all');
  const [filterUnidade, setFilterUnidade] = useState<string>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Selecao em massa
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkData, setBulkData] = useState('');
  const [bulkStatus, setBulkStatus] = useState<string>('none');
  const [bulkUnidade, setBulkUnidade] = useState<string>('none');

  const { data: despesas = [], isLoading } = useDespesas(month, year);
  const { data: categorias = [] } = useCategoriasDespesa();
  const createDespesa = useCreateDespesa();
  const updateDespesa = useUpdateDespesa();
  const deleteDespesa = useDeleteDespesa();
  const generateRecurring = useGenerateRecurringDespesas();
  const bulkCreateDespesa = useBulkCreateDespesa();
  const { toast } = useToast();
  const [importOpen, setImportOpen] = useState(false);

  // Auto-marca como Atrasado: status "A pagar" com data < hoje
  const autoOverdueRan = useRef<Set<string>>(new Set());
  useEffect(() => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const overdue = despesas.filter(d => d.status === 'A pagar' && d.data < todayStr && !autoOverdueRan.current.has(d.id));
    if (overdue.length === 0) return;
    overdue.forEach(d => autoOverdueRan.current.add(d.id));
    Promise.all(overdue.map(d => updateDespesa.mutateAsync({ id: d.id, status: 'Atrasado' }))).catch(() => {});
  }, [despesas]);

  const mapDespesaRow = useCallback((row: Record<string, any>): ParsedRow => {
    const errors: string[] = [];
    const data = row['Data'];
    const descricao = row['Descrição'] || row['Descricao'] || '';
    const categoriaNome = row['Categoria'] || '';
    const tipo = row['Tipo'] || '';
    const valor = parseValorBR(row['Valor']);
    const responsavel = row['Responsável'] || row['Responsavel'] || '';
    const recorrenteRaw = row['Recorrente'] || '';
    const status = row['Status'] || 'A pagar';
    const unidade = row['Unidade'] || row['Unidade de Negócio'] || row['Unidade de Negocio'] || '';
    const observacoes = row['Observações'] || row['Observacoes'] || '';

    if (!data) errors.push('Data obrigatória');
    if (!descricao) errors.push('Descrição obrigatória');
    if (isNaN(valor)) errors.push('Valor inválido');

    const categoria = categorias.find(c => c.nome.toLowerCase() === String(categoriaNome).toLowerCase());
    if (!categoria && categoriaNome) errors.push(`Categoria "${categoriaNome}" não encontrada`);
    if (!categoriaNome) errors.push('Categoria obrigatória');

    if (!['Fixo', 'Variável'].includes(tipo)) errors.push('Tipo deve ser "Fixo" ou "Variável"');

    const recorrente = ['sim', 'true', '1', 'yes'].includes(String(recorrenteRaw).toLowerCase());
    const dateStr = parseDateFlexible(data);
    const unidadeMatch = UNIDADES_NEGOCIO.find(u => u.toLowerCase() === String(unidade).toLowerCase());

    return {
      mapped: {
        data: dateStr,
        descricao: String(descricao),
        categoria_id: categoria?.id || '',
        tipo: ['Fixo', 'Variável'].includes(tipo) ? tipo : 'Fixo',
        valor: isNaN(valor) ? 0 : valor,
        responsavel: responsavel || undefined,
        recorrente,
        status: ['Pago', 'A pagar', 'Atrasado'].includes(status) ? status : 'A pagar',
        unidade_negocio: unidadeMatch || null,
        observacoes: String(observacoes).trim() || null,
      },
      raw: row,
      errors,
    };
  }, [categorias]);

  const [form, setForm] = useState(emptyForm);

  const filtered = useMemo(() => despesas.filter(d => {
    if (filterCategoria !== 'all' && d.categoria_id !== filterCategoria) return false;
    if (filterStatus !== 'all' && d.status !== filterStatus) return false;
    if (filterTipo !== 'all' && d.tipo !== filterTipo) return false;
    if (filterResponsavel !== 'all' && (d.responsavel || '') !== filterResponsavel) return false;
    if (filterUnidade !== 'all') {
      const u = (d as any).unidade_negocio || '';
      if (filterUnidade === 'none' ? u !== '' : u !== filterUnidade) return false;
    }
    if (filterPeriodo === 'semana') {
      const { start, end } = getThisWeekRange();
      if (d.data < start || d.data > end) return false;
    } else if (filterPeriodo === 'custom') {
      if (customStart && d.data < customStart) return false;
      if (customEnd && d.data > customEnd) return false;
    }
    return true;
  }).sort((a, b) => {
    if (a.data !== b.data) return a.data < b.data ? -1 : 1;
    const catA = ((a.categorias_despesa as any)?.nome || '').toLowerCase();
    const catB = ((b.categorias_despesa as any)?.nome || '').toLowerCase();
    if (catA !== catB) return catA.localeCompare(catB, 'pt-BR');
    return (a.descricao || '').localeCompare(b.descricao || '', 'pt-BR');
  }), [despesas, filterCategoria, filterStatus, filterTipo, filterResponsavel, filterUnidade, filterPeriodo, customStart, customEnd]);

  const total = filtered.reduce((acc, d) => acc + Number(d.valor), 0);

  const allFilteredSelected = filtered.length > 0 && filtered.every(d => selectedIds.has(d.id));
  const toggleAll = () => {
    if (allFilteredSelected) {
      const next = new Set(selectedIds);
      filtered.forEach(d => next.delete(d.id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      filtered.forEach(d => next.add(d.id));
      setSelectedIds(next);
    }
  };
  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };
  const clearSelection = () => setSelectedIds(new Set());

  const openNew = () => {
    setEditId(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (d: any) => {
    setEditId(d.id);
    setForm({
      data: d.data,
      descricao: d.descricao,
      categoria_id: d.categoria_id,
      tipo: d.tipo,
      valor: String(d.valor),
      responsavel: d.responsavel || '',
      recorrente: d.recorrente,
      status: d.status,
      unidade_negocio: d.unidade_negocio || 'none',
      observacoes: (d as any).observacoes || '',
    });
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        valor: parseFloat(form.valor),
        responsavel: form.responsavel || undefined,
        unidade_negocio: form.unidade_negocio === 'none' ? null : form.unidade_negocio,
        observacoes: form.observacoes?.trim() || null,
      };
      if (editId) {
        await updateDespesa.mutateAsync({ id: editId, ...payload });
        toast({ title: 'Despesa atualizada com sucesso!' });
      } else {
        await createDespesa.mutateAsync(payload);
        toast({ title: 'Despesa cadastrada com sucesso!' });
      }
      setOpen(false);
      setEditId(null);
      setForm(emptyForm);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  const handleGenerateRecurring = async () => {
    const targetMonth = month === 11 ? 0 : month + 1;
    const targetYear = month === 11 ? year + 1 : year;
    try {
      const count = await generateRecurring.mutateAsync({
        sourceMonth: month, sourceYear: year,
        targetMonth, targetYear,
      });
      toast({ title: `${count} despesas recorrentes geradas para ${getMonthName(targetMonth)} ${targetYear}` });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  const applyBulkEdit = async () => {
    const updates: Record<string, any> = {};
    if (bulkData) updates.data = bulkData;
    if (bulkStatus !== 'none') updates.status = bulkStatus;
    if (bulkUnidade !== 'none') updates.unidade_negocio = bulkUnidade === 'clear' ? null : bulkUnidade;

    if (Object.keys(updates).length === 0) {
      toast({ title: 'Nada para atualizar', description: 'Preencha ao menos um campo.', variant: 'destructive' });
      return;
    }
    const ids = Array.from(selectedIds);
    try {
      await Promise.all(ids.map(id => updateDespesa.mutateAsync({ id, ...updates })));
      toast({ title: `${ids.length} despesas atualizadas com sucesso!` });
      setBulkOpen(false);
      setBulkData(''); setBulkStatus('none'); setBulkUnidade('none');
      clearSelection();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  const isPending = createDespesa.isPending || updateDespesa.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold">Despesas</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <MonthYearPicker month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
          <Button variant="outline" onClick={() => {
            const rows = filtered.map(d => ({
              Data: formatDate(d.data),
              Descrição: d.descricao,
              Categoria: (d.categorias_despesa as any)?.nome || '',
              Tipo: d.tipo,
              Responsável: d.responsavel || '',
              'Unidade de Negócio': (d as any).unidade_negocio || '',
              Valor: Number(d.valor),
              Status: d.status,
              Recorrente: d.recorrente ? 'Sim' : 'Não',
            }));
            exportToExcel(rows, `Despesas_${getMonthName(month)}_${year}`);
          }}>
            <Download className="h-4 w-4 mr-1" /> Exportar
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-1" /> Importar Excel
          </Button>
          <Button variant="outline" onClick={handleGenerateRecurring} disabled={generateRecurring.isPending}>
            <RotateCcw className="h-4 w-4 mr-1" /> Gerar Recorrentes
          </Button>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditId(null); }}>
            <DialogTrigger asChild>
              <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nova Despesa</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{editId ? 'Editar Despesa' : 'Nova Despesa'}</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Data</label>
                    <Input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Tipo</label>
                    <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Fixo">Fixo</SelectItem>
                        <SelectItem value="Variável">Variável</SelectItem>
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
                    <label className="text-sm font-medium">Categoria</label>
                    <Select value={form.categoria_id} onValueChange={v => setForm({ ...form, categoria_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Responsável</label>
                    <Input value={form.responsavel} onChange={e => setForm({ ...form, responsavel: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Unidade de Negócio</label>
                    <Select value={form.unidade_negocio} onValueChange={v => setForm({ ...form, unidade_negocio: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhuma</SelectItem>
                        {UNIDADES_NEGOCIO.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Status</label>
                    <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Pago">Pago</SelectItem>
                        <SelectItem value="A pagar">A pagar</SelectItem>
                        <SelectItem value="Atrasado">Atrasado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Valor (R$)</label>
                    <Input type="number" step="0.01" min="0" value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} required />
                  </div>
                  <div className="flex items-end gap-2 pb-1">
                    <Switch checked={form.recorrente} onCheckedChange={v => setForm({ ...form, recorrente: v })} />
                    <label className="text-sm">Recorrente</label>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Observações</label>
                  <Textarea value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} placeholder="Observações livres (opcional)" rows={3} />
                </div>
                <Button type="submit" className="w-full" disabled={isPending}>
                  {isPending ? 'Salvando...' : editId ? 'Salvar Alterações' : 'Cadastrar Despesa'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterCategoria} onValueChange={setFilterCategoria}>
          <SelectTrigger className={`w-[180px] ${filterCategoria !== 'all' ? 'border-primary ring-2 ring-primary/30 bg-primary/5 text-primary font-medium' : ''}`}><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas categorias</SelectItem>
            {categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className={`w-[140px] ${filterStatus !== 'all' ? 'border-primary ring-2 ring-primary/30 bg-primary/5 text-primary font-medium' : ''}`}><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="Pago">Pago</SelectItem>
            <SelectItem value="A pagar">A pagar</SelectItem>
            <SelectItem value="Atrasado">Atrasado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterPeriodo} onValueChange={setFilterPeriodo}>
          <SelectTrigger className={`w-[160px] ${filterPeriodo !== 'all' ? 'border-primary ring-2 ring-primary/30 bg-primary/5 text-primary font-medium' : ''}`}><SelectValue placeholder="Período" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todo o mês</SelectItem>
            <SelectItem value="semana">Esta semana (Seg–Dom)</SelectItem>
            <SelectItem value="custom">Personalizado</SelectItem>
          </SelectContent>
        </Select>
        {filterPeriodo === 'custom' && (
          <div className="flex items-center gap-2">
            <Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className={`w-[150px] ${customStart ? 'border-primary ring-2 ring-primary/30 bg-primary/5 text-primary font-medium' : ''}`} />
            <span className="text-muted-foreground text-sm">até</span>
            <Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className={`w-[150px] ${customEnd ? 'border-primary ring-2 ring-primary/30 bg-primary/5 text-primary font-medium' : ''}`} />
          </div>
        )}
        <Select value={filterTipo} onValueChange={setFilterTipo}>
          <SelectTrigger className={`w-[140px] ${filterTipo !== 'all' ? 'border-primary ring-2 ring-primary/30 bg-primary/5 text-primary font-medium' : ''}`}><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos tipos</SelectItem>
            <SelectItem value="Fixo">Fixo</SelectItem>
            <SelectItem value="Variável">Variável</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterResponsavel} onValueChange={setFilterResponsavel}>
          <SelectTrigger className={`w-[160px] ${filterResponsavel !== 'all' ? 'border-primary ring-2 ring-primary/30 bg-primary/5 text-primary font-medium' : ''}`}><SelectValue placeholder="Responsável" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos responsáveis</SelectItem>
            {[...new Set(despesas.map(d => d.responsavel).filter(Boolean))].sort().map(r => (
              <SelectItem key={r} value={r!}>{r}</SelectItem>
            ))}
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
        {(filterCategoria !== 'all' || filterStatus !== 'all' || filterPeriodo !== 'all' || filterTipo !== 'all' || filterResponsavel !== 'all' || filterUnidade !== 'all') && (
          <Button variant="ghost" size="sm" onClick={() => {
            setFilterCategoria('all'); setFilterStatus('all'); setFilterPeriodo('all');
            setFilterTipo('all'); setFilterResponsavel('all'); setFilterUnidade('all');
            setCustomStart(''); setCustomEnd('');
          }}>
            <X className="h-4 w-4 mr-1" /> Limpar filtros
          </Button>
        )}
      </div>


      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-md border bg-accent/40">
          <span className="text-sm font-medium">{selectedIds.size} selecionada(s)</span>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setBulkOpen(true)}>
              <Pencil className="h-4 w-4 mr-1" /> Editar em massa
            </Button>
            <Button size="sm" variant="ghost" onClick={clearSelection}>
              <X className="h-4 w-4 mr-1" /> Limpar
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox checked={allFilteredSelected} onCheckedChange={toggleAll} aria-label="Selecionar todos" />
                </TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Rec.</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Nenhuma despesa encontrada</TableCell></TableRow>
              ) : (
                filtered.map(d => (
                  <TableRow key={d.id} data-state={selectedIds.has(d.id) ? 'selected' : undefined}>
                    <TableCell>
                      <Checkbox checked={selectedIds.has(d.id)} onCheckedChange={() => toggleOne(d.id)} aria-label="Selecionar linha" />
                    </TableCell>
                    <TableCell>{formatDate(d.data)}</TableCell>
                    <TableCell className="max-w-[240px]">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate">{d.descricao}</span>
                        {(d as any).observacoes && (
                          <span title={(d as any).observacoes} className="shrink-0 text-muted-foreground cursor-help">
                            <StickyNote className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{(d.categorias_despesa as any)?.nome}</TableCell>
                    <TableCell>{d.tipo}</TableCell>
                    <TableCell>{d.responsavel || '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{(d as any).unidade_negocio || '—'}</TableCell>
                    <TableCell className="text-right font-medium text-destructive">{formatCurrency(Number(d.valor))}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        d.status === 'Pago' ? 'bg-success/10 text-success' :
                        d.status === 'Atrasado' ? 'bg-destructive/10 text-destructive' :
                        'bg-warning/10 text-warning'
                      }`}>
                        {d.status}
                      </span>
                    </TableCell>
                    <TableCell>{d.recorrente ? '✓' : ''}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {(d.status === 'A pagar' || d.status === 'Atrasado') && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-success hover:text-success"
                            title="Marcar como Pago"
                            onClick={async () => {
                              try {
                                await updateDespesa.mutateAsync({ id: d.id, status: 'Pago' });
                                toast({ title: 'Despesa marcada como Paga!' });
                              } catch (err: any) {
                                toast({ title: 'Erro', description: err.message, variant: 'destructive' });
                              }
                            }}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Duplicar"
                          onClick={async () => {
                            try {
                              const today = new Date();
                              const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                              await createDespesa.mutateAsync({
                                data: todayStr,
                                descricao: d.descricao,
                                categoria_id: d.categoria_id,
                                tipo: d.tipo,
                                valor: d.valor,
                                responsavel: d.responsavel || undefined,
                                recorrente: d.recorrente,
                                status: 'A pagar',
                                unidade_negocio: (d as any).unidade_negocio || null,
                              });
                              toast({ title: 'Despesa duplicada com sucesso!' });
                            } catch (err: any) {
                              toast({ title: 'Erro', description: err.message, variant: 'destructive' });
                            }
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(d)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteDespesa.mutate(d.id)}>
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

      {/* Bulk edit dialog */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Editar {selectedIds.size} despesa(s) em massa</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Preencha apenas os campos que deseja alterar. Os demais permanecerão como estão.</p>
            <div className="space-y-1">
              <label className="text-sm font-medium">Nova data</label>
              <Input type="date" value={bulkData} onChange={e => setBulkData(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Novo status</label>
              <Select value={bulkStatus} onValueChange={setBulkStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não alterar</SelectItem>
                  <SelectItem value="Pago">Pago</SelectItem>
                  <SelectItem value="A pagar">A pagar</SelectItem>
                  <SelectItem value="Atrasado">Atrasado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Nova unidade de negócio</label>
              <Select value={bulkUnidade} onValueChange={setBulkUnidade}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não alterar</SelectItem>
                  <SelectItem value="clear">Remover unidade</SelectItem>
                  {UNIDADES_NEGOCIO.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={applyBulkEdit} disabled={updateDespesa.isPending}>
              {updateDespesa.isPending ? 'Aplicando...' : `Aplicar a ${selectedIds.size} despesa(s)`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ExcelImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Importar Despesas"
        expectedColumns={['Data', 'Descrição', 'Categoria', 'Tipo', 'Valor', 'Responsável', 'Recorrente', 'Status']}
        mapRow={mapDespesaRow}
        onConfirm={async (rows) => { await bulkCreateDespesa.mutateAsync(rows as any); }}
        columnAliases={{
          'Valor': ['Valor Real', 'Valor (R$)'],
          'Tipo': ['Tipo (Fixo/Variável)', 'Tipo (Fixo/Variavel)'],
          'Status': ['Status/Pago'],
        }}
      />
    </div>
  );
}
