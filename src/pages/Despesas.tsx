import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { MonthYearPicker } from '@/components/MonthYearPicker';
import { useDespesas, useCreateDespesa, useUpdateDespesa, useDeleteDespesa, useCategoriasDespesa, useGenerateRecurringDespesas, useBulkCreateDespesa, useBulkUpdateDespesa, useBulkDeleteDespesa, useSetoresDespesa } from '@/hooks/useFinancialData';
import { formatCurrency, formatDate, getCurrentMonthYear, getMonthName, todayStr } from '@/lib/format';
import { Plus, Trash2, RotateCcw, Pencil, Upload, Check, Copy, Download, X, StickyNote, Repeat } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { exportToExcel } from '@/lib/exportHelpers';
import { useToast } from '@/hooks/use-toast';
import { ExcelImportDialog, type ParsedRow } from '@/components/ExcelImportDialog';
import { parseValorBR, parseDateFlexible } from '@/lib/importHelpers';
import { UNIDADES_NEGOCIO } from '@/lib/unidadesNegocio';
import { MultiSelectFilter } from '@/components/MultiSelectFilter';
import { getTagColor, tagStyle } from '@/lib/tagColor';

const emptyForm = {
  data: todayStr(),
  descricao: '',
  categoria_id: '',
  tipo: 'Fixo',
  valor: '',
  responsavel: '',
  recorrente: false,
  status: 'A pagar',
  unidade_negocio: 'none' as string,
  setor_id: 'none' as string,
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
  const [filterCategoria, setFilterCategoria] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterPeriodo, setFilterPeriodo] = useState<string>('all'); // all | hoje | semana | custom
  const [filterTipo, setFilterTipo] = useState<string[]>([]);
  const [filterResponsavel, setFilterResponsavel] = useState<string[]>([]);
  const [filterUnidade, setFilterUnidade] = useState<string[]>([]);
  const [filterSetor, setFilterSetor] = useState<string[]>([]);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Selecao em massa
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkData, setBulkData] = useState(todayStr());
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const { data: despesas = [], isLoading } = useDespesas(month, year);
  const { data: categorias = [] } = useCategoriasDespesa();
  const { data: setores = [] } = useSetoresDespesa();
  const createDespesa = useCreateDespesa();
  const updateDespesa = useUpdateDespesa();
  const deleteDespesa = useDeleteDespesa();
  const generateRecurring = useGenerateRecurringDespesas();
  const bulkCreateDespesa = useBulkCreateDespesa();
  const bulkUpdateDespesa = useBulkUpdateDespesa();
  const bulkDeleteDespesa = useBulkDeleteDespesa();
  const { toast } = useToast();
  const [importOpen, setImportOpen] = useState(false);

  // Auto-marca como Atrasado: status "A pagar" com data < hoje.
  // Set é reiniciado ao trocar de mês/ano para reprocessar corretamente após mudança de contexto.
  const autoOverdueRan = useRef<Set<string>>(new Set());
  useEffect(() => { autoOverdueRan.current = new Set(); }, [month, year]);
  useEffect(() => {
    if (updateDespesa.isPending) return;
    const today = todayStr();
    const overdue = despesas.filter(d => d.status === 'A pagar' && d.data < today && !autoOverdueRan.current.has(d.id));
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
    const setorNome = row['Setor'] || '';
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
    if (data && !dateStr) errors.push(`Data inválida: "${data}"`);
    const unidadeMatch = UNIDADES_NEGOCIO.find(u => u.toLowerCase() === String(unidade).toLowerCase());
    const setor = setorNome ? setores.find(s => s.nome.toLowerCase() === String(setorNome).toLowerCase()) : null;
    if (setorNome && !setor) errors.push(`Setor "${setorNome}" não encontrado`);

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
        setor_id: setor?.id || null,
        observacoes: String(observacoes).trim() || null,
      },
      raw: row,
      errors,
    };
  }, [categorias, setores]);

  const [form, setForm] = useState(emptyForm);

  const filtered = useMemo(() => despesas.filter(d => {
    if (filterCategoria.length && !filterCategoria.includes(d.categoria_id)) return false;
    if (filterStatus.length && !filterStatus.includes(d.status)) return false;
    if (filterTipo.length && !filterTipo.includes(d.tipo)) return false;
    if (filterResponsavel.length) {
      const r = d.responsavel || '__none__';
      if (!filterResponsavel.includes(r)) return false;
    }
    if (filterUnidade.length) {
      const u = (d as any).unidade_negocio || '__none__';
      if (!filterUnidade.includes(u)) return false;
    }
    if (filterSetor.length) {
      const s = (d as any).setor_id || '__none__';
      if (!filterSetor.includes(s)) return false;
    }
    if (filterPeriodo === 'hoje') {
      if (d.data !== todayStr()) return false;
    } else if (filterPeriodo === 'semana') {
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
  }), [despesas, filterCategoria, filterStatus, filterTipo, filterResponsavel, filterUnidade, filterSetor, filterPeriodo, customStart, customEnd]);

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
      setor_id: d.setor_id || 'none',
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
        setor_id: form.setor_id === 'none' ? null : form.setor_id,
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
      const r = await generateRecurring.mutateAsync({
        sourceMonth: month, sourceYear: year,
        targetMonth, targetYear,
      });
      const avisos: string[] = [];
      if (r.ignoradas_serie_encerrada) avisos.push(`${r.ignoradas_serie_encerrada} não geradas (recorrência encerrada)`);
      if (r.ignoradas_canceladas) avisos.push(`${r.ignoradas_canceladas} canceladas ignoradas`);
      if (r.sem_serie) avisos.push(`${r.sem_serie} NÃO geradas: legado sem série identificada, precisa revisão`);
      if (r.ignoradas_existentes) avisos.push(`${r.ignoradas_existentes} já existentes, sem duplicação`);
      for (const p of r.pendencias) avisos.push(`${p.serie_id ?? 'Série'}: ${p.motivo}`);
      toast({
        title: `${r.geradas} despesas recorrentes geradas para ${getMonthName(targetMonth)} ${targetYear}`,
        description: avisos.join(' · ') || undefined,
      });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  const applyBulk = async (updates: Record<string, any>, label: string) => {
    try {
      const n = selectedIds.size;
      await bulkUpdateDespesa.mutateAsync({ ids: Array.from(selectedIds), updates });
      toast({ title: `${label} atualizado em ${n} despesa(s)` });
      clearSelection();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  const handleBulkDelete = async () => {
    try {
      const n = selectedIds.size;
      await bulkDeleteDespesa.mutateAsync(Array.from(selectedIds));
      toast({ title: `${n} despesa(s) excluída(s)` });
      clearSelection();
      setConfirmDeleteOpen(false);
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
              Setor: (d as any).setores_despesa?.nome || '',
              Valor: Number(d.valor),
              Status: d.status,
              Recorrente: d.recorrente ? 'Sim' : 'Não',
              Observações: (d as any).observacoes || '',
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
                <div className="space-y-1">
                  <label className="text-sm font-medium">Setor</label>
                  <Select value={form.setor_id} onValueChange={v => setForm({ ...form, setor_id: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {setores.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
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
      <div className="flex flex-wrap gap-2 items-center">
        <MultiSelectFilter
          label="Categoria"
          value={filterCategoria}
          onChange={setFilterCategoria}
          options={categorias.map(c => ({ value: c.id, label: c.nome }))}
          placeholderAll="Todas"
          widthClass="w-[200px]"
          searchable
        />
        <MultiSelectFilter
          label="Status"
          value={filterStatus}
          onChange={setFilterStatus}
          options={[
            { value: 'Pago', label: 'Pago' },
            { value: 'A pagar', label: 'A pagar' },
            { value: 'Atrasado', label: 'Atrasado' },
          ]}
          placeholderAll="Todos"
          widthClass="w-[170px]"
        />
        <Select value={filterPeriodo} onValueChange={setFilterPeriodo}>
          <SelectTrigger className={`w-[200px] ${filterPeriodo !== 'all' ? 'border-primary ring-2 ring-primary/30 bg-primary/5 text-primary font-medium' : ''}`}>
            <span className="truncate text-left">
              <span className="text-muted-foreground mr-1">Período:</span>
              <span className={filterPeriodo !== 'all' ? 'font-medium' : ''}>
                {filterPeriodo === 'all' ? 'Todo o mês' :
                 filterPeriodo === 'hoje' ? 'Hoje' :
                 filterPeriodo === 'semana' ? 'Esta semana' : 'Personalizado'}
              </span>
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todo o mês</SelectItem>
            <SelectItem value="hoje">Hoje</SelectItem>
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
        <MultiSelectFilter
          label="Tipo"
          value={filterTipo}
          onChange={setFilterTipo}
          options={[
            { value: 'Fixo', label: 'Fixo' },
            { value: 'Variável', label: 'Variável' },
          ]}
          placeholderAll="Todos"
          widthClass="w-[160px]"
        />
        <MultiSelectFilter
          label="Responsável"
          value={filterResponsavel}
          onChange={setFilterResponsavel}
          options={[
            ...[...new Set(despesas.map(d => d.responsavel).filter(Boolean) as string[])].sort()
              .map(r => ({ value: r, label: r })),
            { value: '__none__', label: 'Sem responsável' },
          ]}
          placeholderAll="Todos"
          widthClass="w-[190px]"
          searchable
        />
        <MultiSelectFilter
          label="Unidade"
          value={filterUnidade}
          onChange={setFilterUnidade}
          options={[
            ...UNIDADES_NEGOCIO.map(u => ({ value: u, label: u })),
            { value: '__none__', label: 'Sem unidade' },
          ]}
          placeholderAll="Todas"
          widthClass="w-[200px]"
        />
        <MultiSelectFilter
          label="Setor"
          value={filterSetor}
          onChange={setFilterSetor}
          options={[
            ...setores.map(s => ({ value: s.id, label: s.nome })),
            { value: '__none__', label: 'Sem setor' },
          ]}
          placeholderAll="Todos"
          widthClass="w-[190px]"
          searchable
        />
        {(filterCategoria.length || filterStatus.length || filterPeriodo !== 'all' || filterTipo.length || filterResponsavel.length || filterUnidade.length || filterSetor.length) ? (
          <Button variant="ghost" size="sm" onClick={() => {
            setFilterCategoria([]); setFilterStatus([]); setFilterPeriodo('all');
            setFilterTipo([]); setFilterResponsavel([]); setFilterUnidade([]); setFilterSetor([]);
            setCustomStart(''); setCustomEnd('');
          }}>
            <X className="h-4 w-4 mr-1" /> Limpar filtros
          </Button>
        ) : null}
      </div>


      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-3 border rounded-lg bg-primary/5 border-primary/30">
          <span className="text-sm font-medium mr-2">{selectedIds.size} selecionada(s)</span>

          <Popover>
            <PopoverTrigger asChild><Button size="sm" variant="outline">Status</Button></PopoverTrigger>
            <PopoverContent className="w-44 p-2 space-y-1">
              <Button size="sm" variant="ghost" className="w-full justify-start" onClick={() => applyBulk({ status: 'Pago' }, 'Status')}>Pago</Button>
              <Button size="sm" variant="ghost" className="w-full justify-start" onClick={() => applyBulk({ status: 'A pagar' }, 'Status')}>A pagar</Button>
              <Button size="sm" variant="ghost" className="w-full justify-start" onClick={() => applyBulk({ status: 'Atrasado' }, 'Status')}>Atrasado</Button>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild><Button size="sm" variant="outline">Data</Button></PopoverTrigger>
            <PopoverContent className="w-60 space-y-2">
              <Input type="date" value={bulkData} onChange={e => setBulkData(e.target.value)} />
              <Button size="sm" className="w-full" onClick={() => applyBulk({ data: bulkData }, 'Data')}>Aplicar</Button>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild><Button size="sm" variant="outline">Categoria</Button></PopoverTrigger>
            <PopoverContent className="w-56 space-y-2">
              <Select onValueChange={v => applyBulk({ categoria_id: v }, 'Categoria')}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild><Button size="sm" variant="outline">Setor</Button></PopoverTrigger>
            <PopoverContent className="w-56 space-y-2">
              <Select onValueChange={v => applyBulk({ setor_id: v === 'none' ? null : v }, 'Setor')}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {setores.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                </SelectContent>
              </Select>
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

          <Button size="sm" variant="ghost" className="ml-auto" onClick={clearSelection}>
            <X className="h-4 w-4 mr-1" /> Limpar
          </Button>
        </div>
      )}

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selectedIds.size} despesa(s)?</AlertDialogTitle>
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
          <div className="overflow-auto">
            <Table>
              <TableHeader className="bg-muted/40 sticky top-0 z-10">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[40px]">
                    <Checkbox checked={allFilteredSelected} onCheckedChange={toggleAll} aria-label="Selecionar todos" />
                  </TableHead>
                  <TableHead className="w-[100px]">Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Categoria / Setor</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="w-[110px]">Status</TableHead>
                  <TableHead className="text-right w-[170px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-10 text-muted-foreground">Carregando...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-10 text-muted-foreground">Nenhuma despesa encontrada</TableCell></TableRow>
                ) : (
                  filtered.map(d => {
                    const catNome = (d.categorias_despesa as any)?.nome as string | undefined;
                    const setorNome = (d as any).setores_despesa?.nome as string | undefined;
                    const catStyle = catNome ? tagStyle(getTagColor(catNome)) : undefined;
                    const setorSty = setorNome ? tagStyle(getTagColor(setorNome)) : undefined;
                    const selected = selectedIds.has(d.id);
                    return (
                      <TableRow
                        key={d.id}
                        data-state={selected ? 'selected' : undefined}
                        className="odd:bg-muted/20 hover:bg-muted/50 transition-colors"
                      >
                        <TableCell className="py-3">
                          <Checkbox checked={selected} onCheckedChange={() => toggleOne(d.id)} aria-label="Selecionar linha" />
                        </TableCell>
                        <TableCell className="py-3 whitespace-nowrap text-sm text-muted-foreground tabular-nums">
                          {formatDate(d.data)}
                        </TableCell>
                        <TableCell className="py-3 max-w-[280px]">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-medium text-foreground">{d.descricao}</span>
                            {d.recorrente && (
                              <span title="Recorrente" className="shrink-0 text-muted-foreground">
                                <Repeat className="h-3.5 w-3.5" />
                              </span>
                            )}
                            {(d as any).observacoes && (
                              <span title={(d as any).observacoes} className="shrink-0 text-muted-foreground cursor-help">
                                <StickyNote className="h-3.5 w-3.5" />
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex flex-wrap items-center gap-1">
                            {catNome && (
                              <span
                                style={catStyle}
                                className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border"
                              >
                                {catNome}
                              </span>
                            )}
                            {setorNome && (
                              <span
                                style={setorSty}
                                className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border"
                              >
                                {setorNome}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${
                            d.tipo === 'Fixo'
                              ? 'bg-primary/5 text-primary border-primary/20'
                              : 'bg-muted text-muted-foreground border-border'
                          }`}>
                            {d.tipo}
                          </span>
                        </TableCell>
                        <TableCell className="py-3 text-sm text-muted-foreground">{d.responsavel || '—'}</TableCell>
                        <TableCell className="py-3 text-sm text-muted-foreground">{(d as any).unidade_negocio || '—'}</TableCell>
                        <TableCell className="py-3 text-right font-semibold text-destructive tabular-nums whitespace-nowrap">
                          {formatCurrency(Number(d.valor))}
                        </TableCell>
                        <TableCell className="py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            d.status === 'Pago' ? 'bg-success/15 text-success' :
                            d.status === 'Atrasado' ? 'bg-destructive/15 text-destructive' :
                            'bg-warning/15 text-warning'
                          }`}>
                            {d.status}
                          </span>
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex justify-end gap-0.5">
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
                                  await createDespesa.mutateAsync({
                                    data: todayStr(),
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
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar" onClick={() => openEdit(d)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Excluir" onClick={() => deleteDespesa.mutate(d.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="text-right text-sm text-muted-foreground">
        Total: <span className="font-bold text-foreground">{formatCurrency(total)}</span> ({filtered.length} registros)
      </div>


      <ExcelImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Importar Despesas"
        expectedColumns={['Data', 'Descrição', 'Categoria', 'Tipo', 'Valor', 'Responsável', 'Recorrente', 'Status', 'Setor', 'Observações']}
        mapRow={mapDespesaRow}
        onConfirm={async (rows) => { await bulkCreateDespesa.mutateAsync(rows as any); }}
        columnAliases={{
          'Valor': ['Valor Real', 'Valor (R$)'],
          'Tipo': ['Tipo (Fixo/Variável)', 'Tipo (Fixo/Variavel)'],
          'Status': ['Status/Pago'],
          'Observações': ['Observacoes', 'Obs'],
        }}
      />
    </div>
  );
}
