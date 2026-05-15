import { useMemo, useState, useCallback, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, Pencil, Trash2, Upload, Download, X } from 'lucide-react';
import {
  useContratos, useCreateContrato, useUpdateContrato, useDeleteContrato,
  useBulkCreateContrato, useBulkUpdateContrato, useBulkDeleteContrato,
  useOperadoras, useSupervisores, useVendedores,
} from '@/hooks/useFinancialData';
import { UNIDADES_NEGOCIO } from '@/lib/unidadesNegocio';
import { formatCurrency } from '@/lib/format';
import { useToast } from '@/hooks/use-toast';
import { ExcelImportDialog, type ParsedRow } from '@/components/ExcelImportDialog';
import { parseValorBR, parseDateFlexible } from '@/lib/importHelpers';
import { exportToExcel } from '@/lib/exportHelpers';

type Slot = 'a' | 'b' | 'c'; // a=Sup A, b=Sup B, c=Corretor

const emptyForm = {
  nome: '',
  operadora_id: 'none',
  unidade_negocio: 'none',
  data_implantacao: '',
  valor_contrato: '',
  supervisor_a_id: 'none', supervisor_a_percentual: '', supervisor_a_valor: '', supervisor_a_pago: false,
  supervisor_b_id: 'none', supervisor_b_percentual: '', supervisor_b_valor: '', supervisor_b_pago: false,
  corretor_id: 'none', corretor_percentual: '', corretor_valor: '', corretor_pago: false,
  observacoes: '',
};

const activeCls = 'border-primary ring-2 ring-primary/30 bg-primary/5 text-primary font-medium';

function formatDateBR(d?: string | null) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function calcValor(valorContrato: number, pct: string): string {
  const p = parseFloat(pct);
  if (isNaN(p) || isNaN(valorContrato)) return '';
  return ((valorContrato * p) / 100).toFixed(2);
}

export default function Contratos() {
  const { data: contratos = [], isLoading } = useContratos();
  const { data: operadoras = [] } = useOperadoras();
  const { data: supervisores = [] } = useSupervisores();
  const { data: vendedores = [] } = useVendedores();

  const create = useCreateContrato();
  const update = useUpdateContrato();
  const remove = useDeleteContrato();
  const bulkCreate = useBulkCreateContrato();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [filterOperadora, setFilterOperadora] = useState('all');
  const [filterUnidade, setFilterUnidade] = useState('all');
  const [filterSupervisor, setFilterSupervisor] = useState('all');
  const [filterMes, setFilterMes] = useState('all');
  const [filterPago, setFilterPago] = useState('all'); // all | pendente | pago

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const mapContratoRow = useCallback((row: Record<string, any>): ParsedRow => {
    const errors: string[] = [];
    const nome = String(row['Nome'] ?? '').trim();
    const operadoraNome = String(row['Operadora'] ?? '').trim();
    const unidade = String(row['Unidade'] ?? '').trim();
    const dataImpl = row['Data Implantação'] || row['Data Implantacao'] || '';
    const valorContrato = parseValorBR(row['Valor Contrato']);
    const supANome = String(row['Supervisor A'] ?? '').trim();
    const supBNome = String(row['Supervisor B'] ?? '').trim();
    const corretorNome = String(row['Corretor'] ?? '').trim();
    const pctA = parseFloat(String(row['% Supervisor A'] ?? '').replace(',', '.'));
    const pctB = parseFloat(String(row['% Supervisor B'] ?? '').replace(',', '.'));
    const pctC = parseFloat(String(row['% Corretor'] ?? '').replace(',', '.'));
    const obs = String(row['Observações'] ?? row['Observacoes'] ?? '').trim();

    if (!nome) errors.push('Nome obrigatório');
    if (isNaN(valorContrato)) errors.push('Valor Contrato inválido');

    const findByName = (list: any[], n: string) =>
      n ? list.find(x => String(x.nome).toLowerCase() === n.toLowerCase()) : null;

    const operadora = operadoraNome ? findByName(operadoras as any[], operadoraNome) : null;
    if (operadoraNome && !operadora) errors.push(`Operadora "${operadoraNome}" não encontrada`);

    const supA = supANome ? findByName(supervisores as any[], supANome) : null;
    if (supANome && !supA) errors.push(`Supervisor A "${supANome}" não encontrado`);

    const supB = supBNome ? findByName(supervisores as any[], supBNome) : null;
    if (supBNome && !supB) errors.push(`Supervisor B "${supBNome}" não encontrado`);

    const corretor = corretorNome ? findByName(vendedores as any[], corretorNome) : null;
    if (corretorNome && !corretor) errors.push(`Corretor "${corretorNome}" não encontrado`);

    const unidadeMatch = unidade
      ? UNIDADES_NEGOCIO.find(u => u.toLowerCase() === unidade.toLowerCase())
      : null;
    if (unidade && !unidadeMatch) errors.push(`Unidade "${unidade}" inválida`);

    const dateStr = dataImpl ? parseDateFlexible(dataImpl) : '';
    const valor = isNaN(valorContrato) ? 0 : valorContrato;
    const calc = (pct: number) => isNaN(pct) ? null : Number(((valor * pct) / 100).toFixed(2));

    return {
      mapped: {
        nome,
        operadora_id: operadora?.id || null,
        unidade_negocio: unidadeMatch || null,
        data_implantacao: dateStr || null,
        valor_contrato: valor,
        supervisor_a_id: supA?.id || null,
        supervisor_a_percentual: isNaN(pctA) ? null : pctA,
        supervisor_a_valor: supA ? calc(pctA) : null,
        supervisor_a_pago: false,
        supervisor_b_id: supB?.id || null,
        supervisor_b_percentual: isNaN(pctB) ? null : pctB,
        supervisor_b_valor: supB ? calc(pctB) : null,
        supervisor_b_pago: false,
        corretor_id: corretor?.id || null,
        corretor_percentual: isNaN(pctC) ? null : pctC,
        corretor_valor: corretor ? calc(pctC) : null,
        corretor_pago: false,
        observacoes: obs || null,
      },
      raw: row,
      errors,
    };
  }, [operadoras, supervisores, vendedores]);

  const mesesDisponiveis = useMemo(() => {
    const set = new Set<string>();
    (contratos as any[]).forEach(c => {
      if (c.data_implantacao) set.add(String(c.data_implantacao).slice(0, 7));
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [contratos]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    return (contratos as any[]).filter(c => {
      if (s && !c.nome.toLowerCase().includes(s)) return false;
      if (filterOperadora !== 'all' && (c.operadora_id || '') !== filterOperadora) return false;
      if (filterUnidade !== 'all') {
        const u = c.unidade_negocio || '';
        if (filterUnidade === 'none' ? u !== '' : u !== filterUnidade) return false;
      }
      if (filterSupervisor !== 'all') {
        if (c.supervisor_a_id !== filterSupervisor && c.supervisor_b_id !== filterSupervisor) return false;
      }
      if (filterMes !== 'all') {
        const m = c.data_implantacao ? String(c.data_implantacao).slice(0, 7) : '';
        if (filterMes === 'none' ? m !== '' : m !== filterMes) return false;
      }
      if (filterPago !== 'all') {
        const allPagos = c.supervisor_a_pago && c.supervisor_b_pago && c.corretor_pago;
        const hasAny = c.supervisor_a_id || c.supervisor_b_id || c.corretor_id;
        if (filterPago === 'pago' && !(hasAny && allPagos)) return false;
        if (filterPago === 'pendente' && allPagos) return false;
      }
      return true;
    });
  }, [contratos, search, filterOperadora, filterUnidade, filterSupervisor, filterMes, filterPago]);

  // Resumo
  const resumo = useMemo(() => {
    let totalContrato = 0, totalComissoes = 0, totalPagas = 0, totalPendentes = 0;
    for (const c of filtered as any[]) {
      totalContrato += Number(c.valor_contrato || 0);
      const a = Number(c.supervisor_a_valor || 0);
      const b = Number(c.supervisor_b_valor || 0);
      const cv = Number(c.corretor_valor || 0);
      totalComissoes += a + b + cv;
      if (c.supervisor_a_pago) totalPagas += a; else totalPendentes += a;
      if (c.supervisor_b_pago) totalPagas += b; else totalPendentes += b;
      if (c.corretor_pago) totalPagas += cv; else totalPendentes += cv;
    }
    return { totalContrato, totalComissoes, totalPagas, totalPendentes };
  }, [filtered]);

  const openNew = () => { setEditId(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (c: any) => {
    setEditId(c.id);
    setForm({
      nome: c.nome,
      operadora_id: c.operadora_id || 'none',
      unidade_negocio: c.unidade_negocio || 'none',
      data_implantacao: c.data_implantacao || '',
      valor_contrato: String(c.valor_contrato ?? ''),
      supervisor_a_id: c.supervisor_a_id || 'none',
      supervisor_a_percentual: c.supervisor_a_percentual == null ? '' : String(c.supervisor_a_percentual),
      supervisor_a_valor: c.supervisor_a_valor == null ? '' : String(c.supervisor_a_valor),
      supervisor_a_pago: !!c.supervisor_a_pago,
      supervisor_b_id: c.supervisor_b_id || 'none',
      supervisor_b_percentual: c.supervisor_b_percentual == null ? '' : String(c.supervisor_b_percentual),
      supervisor_b_valor: c.supervisor_b_valor == null ? '' : String(c.supervisor_b_valor),
      supervisor_b_pago: !!c.supervisor_b_pago,
      corretor_id: c.corretor_id || 'none',
      corretor_percentual: c.corretor_percentual == null ? '' : String(c.corretor_percentual),
      corretor_valor: c.corretor_valor == null ? '' : String(c.corretor_valor),
      corretor_pago: !!c.corretor_pago,
      observacoes: c.observacoes || '',
    });
    setOpen(true);
  };

  // Quando muda % ou valor do contrato, recalcula valor automaticamente
  const handlePctChange = (slot: Slot, pct: string) => {
    const valor = parseFloat(form.valor_contrato) || 0;
    const novoValor = calcValor(valor, pct);
    if (slot === 'a') setForm({ ...form, supervisor_a_percentual: pct, supervisor_a_valor: novoValor });
    if (slot === 'b') setForm({ ...form, supervisor_b_percentual: pct, supervisor_b_valor: novoValor });
    if (slot === 'c') setForm({ ...form, corretor_percentual: pct, corretor_valor: novoValor });
  };

  const handleValorContratoChange = (v: string) => {
    const valor = parseFloat(v) || 0;
    setForm({
      ...form,
      valor_contrato: v,
      supervisor_a_valor: form.supervisor_a_percentual ? calcValor(valor, form.supervisor_a_percentual) : form.supervisor_a_valor,
      supervisor_b_valor: form.supervisor_b_percentual ? calcValor(valor, form.supervisor_b_percentual) : form.supervisor_b_valor,
      corretor_valor: form.corretor_percentual ? calcValor(valor, form.corretor_percentual) : form.corretor_valor,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        nome: form.nome.trim(),
        operadora_id: form.operadora_id === 'none' ? null : form.operadora_id,
        unidade_negocio: form.unidade_negocio === 'none' ? null : form.unidade_negocio,
        data_implantacao: form.data_implantacao || null,
        valor_contrato: parseFloat(form.valor_contrato) || 0,
        supervisor_a_id: form.supervisor_a_id === 'none' ? null : form.supervisor_a_id,
        supervisor_a_percentual: form.supervisor_a_percentual === '' ? null : parseFloat(form.supervisor_a_percentual),
        supervisor_a_valor: form.supervisor_a_valor === '' ? null : parseFloat(form.supervisor_a_valor),
        supervisor_a_pago: form.supervisor_a_pago,
        supervisor_b_id: form.supervisor_b_id === 'none' ? null : form.supervisor_b_id,
        supervisor_b_percentual: form.supervisor_b_percentual === '' ? null : parseFloat(form.supervisor_b_percentual),
        supervisor_b_valor: form.supervisor_b_valor === '' ? null : parseFloat(form.supervisor_b_valor),
        supervisor_b_pago: form.supervisor_b_pago,
        corretor_id: form.corretor_id === 'none' ? null : form.corretor_id,
        corretor_percentual: form.corretor_percentual === '' ? null : parseFloat(form.corretor_percentual),
        corretor_valor: form.corretor_valor === '' ? null : parseFloat(form.corretor_valor),
        corretor_pago: form.corretor_pago,
        observacoes: form.observacoes.trim() || null,
      };
      if (editId) await update.mutateAsync({ id: editId, ...payload });
      else await create.mutateAsync(payload);
      toast({ title: editId ? 'Contrato atualizado' : 'Contrato criado' });
      setOpen(false);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await remove.mutateAsync(confirmDelete);
      toast({ title: 'Contrato excluído' });
      setConfirmDelete(null);
    } catch (err: any) {
      toast({ title: 'Erro ao excluir', description: err.message, variant: 'destructive' });
    }
  };

  const togglePago = async (c: any, field: 'supervisor_a_pago' | 'supervisor_b_pago' | 'corretor_pago') => {
    try {
      await update.mutateAsync({ id: c.id, [field]: !c[field] } as any);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold">Contratos</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="w-60" />
          <Button variant="outline" onClick={() => {
            const rows = (filtered as any[]).map(c => ({
              Nome: c.nome,
              Operadora: c.operadoras?.nome || '',
              Unidade: c.unidade_negocio || '',
              'Data Implantação': c.data_implantacao ? formatDateBR(c.data_implantacao) : '',
              'Valor Contrato': Number(c.valor_contrato || 0),
              'Supervisor A': c.supervisor_a?.nome || '',
              '% Supervisor A': c.supervisor_a_percentual ?? '',
              'Valor Supervisor A': Number(c.supervisor_a_valor || 0),
              'Pago Supervisor A': c.supervisor_a_pago ? 'Sim' : 'Não',
              'Supervisor B': c.supervisor_b?.nome || '',
              '% Supervisor B': c.supervisor_b_percentual ?? '',
              'Valor Supervisor B': Number(c.supervisor_b_valor || 0),
              'Pago Supervisor B': c.supervisor_b_pago ? 'Sim' : 'Não',
              Corretor: c.corretor?.nome || '',
              '% Corretor': c.corretor_percentual ?? '',
              'Valor Corretor': Number(c.corretor_valor || 0),
              'Pago Corretor': c.corretor_pago ? 'Sim' : 'Não',
              Observações: c.observacoes || '',
            }));
            exportToExcel(rows, 'Contratos');
          }}>
            <Download className="h-4 w-4 mr-1" /> Exportar
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-1" /> Importar Excel
          </Button>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo Contrato</Button>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Valor Total Contratos</p><p className="text-2xl font-bold text-primary">{formatCurrency(resumo.totalContrato)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Total Comissões</p><p className="text-2xl font-bold">{formatCurrency(resumo.totalComissoes)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Comissões Pagas</p><p className="text-2xl font-bold text-success">{formatCurrency(resumo.totalPagas)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Comissões Pendentes</p><p className="text-2xl font-bold text-warning">{formatCurrency(resumo.totalPendentes)}</p></CardContent></Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterOperadora} onValueChange={setFilterOperadora}>
          <SelectTrigger className={`w-[180px] ${filterOperadora !== 'all' ? activeCls : ''}`}><SelectValue placeholder="Operadora" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas operadoras</SelectItem>
            {operadoras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterUnidade} onValueChange={setFilterUnidade}>
          <SelectTrigger className={`w-[180px] ${filterUnidade !== 'all' ? activeCls : ''}`}><SelectValue placeholder="Unidade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas unidades</SelectItem>
            <SelectItem value="none">Sem unidade</SelectItem>
            {UNIDADES_NEGOCIO.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterSupervisor} onValueChange={setFilterSupervisor}>
          <SelectTrigger className={`w-[180px] ${filterSupervisor !== 'all' ? activeCls : ''}`}><SelectValue placeholder="Supervisor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos supervisores</SelectItem>
            {(supervisores as any[]).filter(s => s.ativo).map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterMes} onValueChange={setFilterMes}>
          <SelectTrigger className={`w-[200px] ${filterMes !== 'all' ? activeCls : ''}`}><SelectValue placeholder="Mês de implantação" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos meses</SelectItem>
            <SelectItem value="none">Sem data</SelectItem>
            {mesesDisponiveis.map(m => {
              const [y, mm] = m.split('-');
              return <SelectItem key={m} value={m}>{`${mm}/${y}`}</SelectItem>;
            })}
          </SelectContent>
        </Select>
        <Select value={filterPago} onValueChange={setFilterPago}>
          <SelectTrigger className={`w-[180px] ${filterPago !== 'all' ? activeCls : ''}`}><SelectValue placeholder="Status comissão" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas comissões</SelectItem>
            <SelectItem value="pendente">Com pendentes</SelectItem>
            <SelectItem value="pago">Todas pagas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Operadora</TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead>Implantação</TableHead>
                <TableHead className="text-right">Valor Contrato</TableHead>
                <TableHead>Supervisor A</TableHead>
                <TableHead>Supervisor B</TableHead>
                <TableHead>Corretor</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Nenhum contrato encontrado</TableCell></TableRow>
              ) : (filtered as any[]).map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell>{c.operadoras?.nome || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{c.unidade_negocio || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDateBR(c.data_implantacao)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(c.valor_contrato))}</TableCell>
                  <ComissaoCell
                    nome={c.supervisor_a?.nome}
                    pct={c.supervisor_a_percentual}
                    valor={c.supervisor_a_valor}
                    pago={c.supervisor_a_pago}
                    onTogglePago={() => togglePago(c, 'supervisor_a_pago')}
                  />
                  <ComissaoCell
                    nome={c.supervisor_b?.nome}
                    pct={c.supervisor_b_percentual}
                    valor={c.supervisor_b_valor}
                    pago={c.supervisor_b_pago}
                    onTogglePago={() => togglePago(c, 'supervisor_b_pago')}
                  />
                  <ComissaoCell
                    nome={c.corretor?.nome}
                    pct={c.corretor_percentual}
                    valor={c.corretor_valor}
                    pago={c.corretor_pago}
                    onTogglePago={() => togglePago(c, 'corretor_pago')}
                  />
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setConfirmDelete(c.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? 'Editar Contrato' : 'Novo Contrato'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Nome *</label>
              <Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Operadora</label>
                <Select value={form.operadora_id} onValueChange={v => setForm({ ...form, operadora_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {operadoras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Data de Implantação</label>
                <Input type="date" value={form.data_implantacao} onChange={e => setForm({ ...form, data_implantacao: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Valor do Contrato *</label>
                <Input type="number" step="0.01" min="0" value={form.valor_contrato} onChange={e => handleValorContratoChange(e.target.value)} required />
              </div>
            </div>

            <ComissaoForm
              titulo="Supervisor A"
              opcoes={(supervisores as any[]).filter(s => s.ativo)}
              idValue={form.supervisor_a_id}
              pct={form.supervisor_a_percentual}
              valor={form.supervisor_a_valor}
              pago={form.supervisor_a_pago}
              onIdChange={v => setForm({ ...form, supervisor_a_id: v })}
              onPctChange={v => handlePctChange('a', v)}
              onValorChange={v => setForm({ ...form, supervisor_a_valor: v })}
              onPagoChange={v => setForm({ ...form, supervisor_a_pago: v })}
            />
            <ComissaoForm
              titulo="Supervisor B"
              opcoes={(supervisores as any[]).filter(s => s.ativo)}
              idValue={form.supervisor_b_id}
              pct={form.supervisor_b_percentual}
              valor={form.supervisor_b_valor}
              pago={form.supervisor_b_pago}
              onIdChange={v => setForm({ ...form, supervisor_b_id: v })}
              onPctChange={v => handlePctChange('b', v)}
              onValorChange={v => setForm({ ...form, supervisor_b_valor: v })}
              onPagoChange={v => setForm({ ...form, supervisor_b_pago: v })}
            />
            <ComissaoForm
              titulo="Corretor"
              opcoes={vendedores}
              idValue={form.corretor_id}
              pct={form.corretor_percentual}
              valor={form.corretor_valor}
              pago={form.corretor_pago}
              onIdChange={v => setForm({ ...form, corretor_id: v })}
              onPctChange={v => handlePctChange('c', v)}
              onValorChange={v => setForm({ ...form, corretor_valor: v })}
              onPagoChange={v => setForm({ ...form, corretor_pago: v })}
            />

            <div className="space-y-1">
              <label className="text-sm font-medium">Observações</label>
              <Input value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} placeholder="Opcional" />
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
            <AlertDialogTitle>Excluir contrato?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ExcelImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Importar Contratos"
        expectedColumns={['Nome', 'Operadora', 'Unidade', 'Data Implantação', 'Valor Contrato', 'Supervisor A', '% Supervisor A', 'Supervisor B', '% Supervisor B', 'Corretor', '% Corretor', 'Observações']}
        mapRow={mapContratoRow}
        onConfirm={async (rows) => { await bulkCreate.mutateAsync(rows as any); }}
        columnAliases={{
          'Data Implantação': ['Data de Implantação', 'Data Implantacao', 'Implantação', 'Implantacao'],
          'Valor Contrato': ['Valor do Contrato', 'Valor (R$)'],
          'Observações': ['Observacoes', 'Obs'],
        }}
      />
    </div>
  );
}

function ComissaoCell({ nome, pct, valor, pago, onTogglePago }: {
  nome?: string | null; pct?: number | null; valor?: number | null; pago: boolean; onTogglePago: () => void;
}) {
  if (!nome) return <TableCell className="text-muted-foreground">—</TableCell>;
  return (
    <TableCell>
      <div className="flex items-center gap-2">
        <Checkbox checked={pago} onCheckedChange={onTogglePago} />
        <div className="text-xs leading-tight">
          <div className="font-medium">{nome}</div>
          <div className={pago ? 'text-success' : 'text-warning'}>
            {formatCurrency(Number(valor || 0))}
            {pct != null && <span className="text-muted-foreground"> ({Number(pct)}%)</span>}
          </div>
        </div>
      </div>
    </TableCell>
  );
}

function ComissaoForm({
  titulo, opcoes, idValue, pct, valor, pago,
  onIdChange, onPctChange, onValorChange, onPagoChange,
}: {
  titulo: string;
  opcoes: { id: string; nome: string }[];
  idValue: string; pct: string; valor: string; pago: boolean;
  onIdChange: (v: string) => void;
  onPctChange: (v: string) => void;
  onValorChange: (v: string) => void;
  onPagoChange: (v: boolean) => void;
}) {
  return (
    <div className="border rounded-md p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{titulo}</p>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox checked={pago} onCheckedChange={(v) => onPagoChange(!!v)} />
          Já paguei
        </label>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Pessoa</label>
          <Select value={idValue} onValueChange={onIdChange}>
            <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhuma</SelectItem>
              {opcoes.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">%</label>
          <Input type="number" step="0.01" min="0" value={pct} onChange={e => onPctChange(e.target.value)} placeholder="0" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Valor R$</label>
          <Input type="number" step="0.01" min="0" value={valor} onChange={e => onValorChange(e.target.value)} placeholder="0,00" />
        </div>
      </div>
    </div>
  );
}
