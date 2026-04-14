import { useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { MonthYearPicker } from '@/components/MonthYearPicker';
import { useDespesas, useCreateDespesa, useUpdateDespesa, useDeleteDespesa, useCategoriasDespesa, useGenerateRecurringDespesas, useBulkCreateDespesa } from '@/hooks/useFinancialData';
import { formatCurrency, formatDate, getCurrentMonthYear, getMonthName } from '@/lib/format';
import { Plus, Trash2, RotateCcw, Pencil, Upload, Check, Copy, Download } from 'lucide-react';
import { exportToExcel } from '@/lib/exportHelpers';
import { useToast } from '@/hooks/use-toast';
import { ExcelImportDialog, type ParsedRow } from '@/components/ExcelImportDialog';
import { parseValorBR, parseDateFlexible } from '@/lib/importHelpers';

const emptyForm = {
  data: new Date().toISOString().split('T')[0],
  descricao: '',
  categoria_id: '',
  tipo: 'Fixo',
  valor: '',
  responsavel: '',
  recorrente: false,
  status: 'A pagar',
};

export default function Despesas() {
  const { month: curMonth, year: curYear } = getCurrentMonthYear();
  const [month, setMonth] = useState(curMonth);
  const [year, setYear] = useState(curYear);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [filterCategoria, setFilterCategoria] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPeriodo, setFilterPeriodo] = useState<string>('all');

  const { data: despesas = [], isLoading } = useDespesas(month, year);
  const { data: categorias = [] } = useCategoriasDespesa();
  const createDespesa = useCreateDespesa();
  const updateDespesa = useUpdateDespesa();
  const deleteDespesa = useDeleteDespesa();
  const generateRecurring = useGenerateRecurringDespesas();
  const bulkCreateDespesa = useBulkCreateDespesa();
  const { toast } = useToast();
  const [importOpen, setImportOpen] = useState(false);

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

    if (!data) errors.push('Data obrigatória');
    if (!descricao) errors.push('Descrição obrigatória');
    if (isNaN(valor)) errors.push('Valor inválido');

    const categoria = categorias.find(c => c.nome.toLowerCase() === String(categoriaNome).toLowerCase());
    if (!categoria && categoriaNome) errors.push(`Categoria "${categoriaNome}" não encontrada`);
    if (!categoriaNome) errors.push('Categoria obrigatória');

    if (!['Fixo', 'Variável'].includes(tipo)) errors.push('Tipo deve ser "Fixo" ou "Variável"');

    const recorrente = ['sim', 'true', '1', 'yes'].includes(String(recorrenteRaw).toLowerCase());
    const dateStr = parseDateFlexible(data);

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
      },
      raw: row,
      errors,
    };
  }, [categorias]);

  const [form, setForm] = useState(emptyForm);

  const filtered = despesas.filter(d => {
    if (filterCategoria !== 'all' && d.categoria_id !== filterCategoria) return false;
    if (filterStatus !== 'all' && d.status !== filterStatus) return false;
    if (filterPeriodo !== 'all') {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      if (filterPeriodo === 'hoje') {
        if (d.data !== todayStr) return false;
      } else {
        const dias = filterPeriodo === 'semana' ? 7 : 15;
        const limite = new Date(today.getFullYear(), today.getMonth(), today.getDate() - dias);
        const limiteStr = `${limite.getFullYear()}-${String(limite.getMonth() + 1).padStart(2, '0')}-${String(limite.getDate()).padStart(2, '0')}`;
        if (d.data < limiteStr) return false;
      }
    }
    return true;
  });

  const total = filtered.reduce((acc, d) => acc + Number(d.valor), 0);

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
    });
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { ...form, valor: parseFloat(form.valor), responsavel: form.responsavel || undefined };
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
                        <SelectItem value="Pago">Pago</SelectItem>
                        <SelectItem value="A pagar">A pagar</SelectItem>
                        <SelectItem value="Atrasado">Atrasado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end gap-2 pb-1">
                    <Switch checked={form.recorrente} onCheckedChange={v => setForm({ ...form, recorrente: v })} />
                    <label className="text-sm">Recorrente</label>
                  </div>
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
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas categorias</SelectItem>
            {categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="Pago">Pago</SelectItem>
            <SelectItem value="A pagar">A pagar</SelectItem>
            <SelectItem value="Atrasado">Atrasado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterPeriodo} onValueChange={setFilterPeriodo}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Período" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todo o mês</SelectItem>
            <SelectItem value="hoje">Hoje</SelectItem>
            <SelectItem value="semana">Últimos 7 dias</SelectItem>
            <SelectItem value="15dias">Últimos 15 dias</SelectItem>
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
                <TableHead>Categoria</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Rec.</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Nenhuma despesa encontrada</TableCell></TableRow>
              ) : (
                filtered.map(d => (
                  <TableRow key={d.id}>
                    <TableCell>{formatDate(d.data)}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{d.descricao}</TableCell>
                    <TableCell>{(d.categorias_despesa as any)?.nome}</TableCell>
                    <TableCell>{d.tipo}</TableCell>
                    <TableCell>{d.responsavel || '—'}</TableCell>
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
