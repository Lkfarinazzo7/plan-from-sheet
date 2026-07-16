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
  useOperadoras, useSupervisores, useVendedores, usePropostas,
  useReceitasResumoPorProposta, getResumoContrato,
} from '@/hooks/useFinancialData';
import { UNIDADES_NEGOCIO } from '@/lib/unidadesNegocio';
import { formatCurrency } from '@/lib/format';
import { useToast } from '@/hooks/use-toast';
import { ExcelImportDialog, type ParsedRow } from '@/components/ExcelImportDialog';
import { parseValorBR, parseDateFlexible } from '@/lib/importHelpers';
import { exportToExcel } from '@/lib/exportHelpers';
import { calculateCommissionValue } from '@/lib/commissionHelpers';

type Slot = 'a' | 'b' | 'c'; // a=Sup A, b=Sup B, c=Corretor

const emptyForm = {
  nome: '',
  proposta_id: 'none',
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

function commissionAmount(c: any, slot: 'supervisor_a' | 'supervisor_b' | 'corretor'): number {
  return calculateCommissionValue(
    c.valor_contrato,
    c[`${slot}_id`],
    c[`${slot}_percentual`],
    c[`${slot}_valor`],
  );
}

function assignedCommissionSlots(c: any) {
  return [
    { assigned: !!c.supervisor_a_id, paid: !!c.supervisor_a_pago },
    { assigned: !!c.supervisor_b_id, paid: !!c.supervisor_b_pago },
    { assigned: !!c.corretor_id, paid: !!c.corretor_pago },
  ].filter(slot => slot.assigned);
}

function parsePaid(value: unknown): boolean {
  return ['sim', 'true', '1', 'yes', 'pago'].includes(String(value ?? '').trim().toLowerCase());
}

export default function Contratos() {
  const { data: contratos = [], isLoading } = useContratos();
  const { data: operadoras = [] } = useOperadoras();
  const { data: supervisores = [] } = useSupervisores();
  const { data: vendedores = [] } = useVendedores();
  const { data: propostas = [] } = usePropostas();
  const { data: resumoReceitas } = useReceitasResumoPorProposta();

  const create = useCreateContrato();
  const update = useUpdateContrato();
  const remove = useDeleteContrato();
  const bulkCreate = useBulkCreateContrato();
  const bulkUpdate = useBulkUpdateContrato();
  const bulkDelete = useBulkDeleteContrato();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [filterOperadora, setFilterOperadora] = useState('all');
  const [filterUnidade, setFilterUnidade] = useState('all');
  const [filterSupervisor, setFilterSupervisor] = useState('all');
  const [filterCorretor, setFilterCorretor] = useState('all');
  const [filterMes, setFilterMes] = useState('all');
  const [filterDataInicio, setFilterDataInicio] = useState('');
  const [filterDataFim, setFilterDataFim] = useState('');
  const [filterPago, setFilterPago] = useState('all'); // all | pendente | pago

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const mapContratoRow = useCallback((row: Record<string, any>): ParsedRow => {
    const errors: string[] = [];
    const nome = String(row['Nome'] ?? '').trim();
    const propostaNome = String(row['Proposta'] ?? '').trim();
    const operadoraNome = String(row['Operadora'] ?? '').trim();
    const unidade = String(row['Unidade'] ?? '').trim();
    const dataImpl = row['Data Implantação'] || row['Data Implantacao'] || '';
    const valorContrato = parseValorBR(row['Valor Contrato']);
    const supANome = String(row['Supervisor A'] ?? '').trim();
    const supBNome = String(row['Supervisor B'] ?? '').trim();
    const corretorNome = String(row['Corretor'] ?? '').trim();
    const pctAInput = String(row['% Supervisor A'] ?? '').trim();
    const pctBInput = String(row['% Supervisor B'] ?? '').trim();
    const pctCInput = String(row['% Corretor'] ?? '').trim();
    const pctA = parseFloat(pctAInput.replace(',', '.'));
    const pctB = parseFloat(pctBInput.replace(',', '.'));
    const pctC = parseFloat(pctCInput.replace(',', '.'));
    const valorAInput = row['Valor Supervisor A'];
    const valorBInput = row['Valor Supervisor B'];
    const valorCInput = row['Valor Corretor'];
    const valorA = valorAInput === '' || valorAInput == null ? null : parseValorBR(valorAInput);
    const valorB = valorBInput === '' || valorBInput == null ? null : parseValorBR(valorBInput);
    const valorC = valorCInput === '' || valorCInput == null ? null : parseValorBR(valorCInput);
    const obs = String(row['Observações'] ?? row['Observacoes'] ?? '').trim();

    if (!nome) errors.push('Nome obrigatório');
    if (isNaN(valorContrato)) errors.push('Valor Contrato inválido');
    else if (valorContrato < 0) errors.push('Valor Contrato não pode ser negativo');
    if (pctAInput && (isNaN(pctA) || pctA < 0)) errors.push('% Supervisor A inválido');
    if (pctBInput && (isNaN(pctB) || pctB < 0)) errors.push('% Supervisor B inválido');
    if (pctCInput && (isNaN(pctC) || pctC < 0)) errors.push('% Corretor inválido');
    if (valorA != null && isNaN(valorA)) errors.push('Valor Supervisor A inválido');
    else if (valorA != null && valorA < 0) errors.push('Valor Supervisor A não pode ser negativo');
    if (valorB != null && isNaN(valorB)) errors.push('Valor Supervisor B inválido');
    else if (valorB != null && valorB < 0) errors.push('Valor Supervisor B não pode ser negativo');
    if (valorC != null && isNaN(valorC)) errors.push('Valor Corretor inválido');
    else if (valorC != null && valorC < 0) errors.push('Valor Corretor não pode ser negativo');

    const findByName = (list: any[], n: string) =>
      n ? list.find(x => String(x.nome).toLowerCase() === n.toLowerCase()) : null;

    const operadora = operadoraNome ? findByName(operadoras as any[], operadoraNome) : null;
    if (operadoraNome && !operadora) errors.push(`Operadora "${operadoraNome}" não encontrada`);

    const supA = supANome ? findByName(supervisores as any[], supANome) : null;
    if (supANome && !supA) errors.push(`Supervisor A "${supANome}" não encontrado`);
    if (!supANome && (pctAInput || valorAInput !== '' && valorAInput != null || parsePaid(row['Pago Supervisor A']))) {
      errors.push('Supervisor A obrigatório quando há comissão preenchida');
    }

    const supB = supBNome ? findByName(supervisores as any[], supBNome) : null;
    if (supBNome && !supB) errors.push(`Supervisor B "${supBNome}" não encontrado`);
    if (!supBNome && (pctBInput || valorBInput !== '' && valorBInput != null || parsePaid(row['Pago Supervisor B']))) {
      errors.push('Supervisor B obrigatório quando há comissão preenchida');
    }

    const corretor = corretorNome ? findByName(vendedores as any[], corretorNome) : null;
    if (corretorNome && !corretor) errors.push(`Corretor "${corretorNome}" não encontrado`);
    if (!corretorNome && (pctCInput || valorCInput !== '' && valorCInput != null || parsePaid(row['Pago Corretor']))) {
      errors.push('Corretor obrigatório quando há comissão preenchida');
    }

    const unidadeMatch = unidade
      ? UNIDADES_NEGOCIO.find(u => u.toLowerCase() === unidade.toLowerCase())
      : null;
    if (unidade && !unidadeMatch) errors.push(`Unidade "${unidade}" inválida`);

    const dateStr = dataImpl ? parseDateFlexible(dataImpl) : '';
    if (dataImpl && !dateStr) errors.push(`Data de implantação inválida: "${dataImpl}"`);
    const valor = isNaN(valorContrato) ? 0 : valorContrato;
    const calc = (pct: number) => isNaN(pct) ? null : Number(((valor * pct) / 100).toFixed(2));
    const propostaBusca = propostaNome || nome;
    const proposta = propostaBusca ? findByName(propostas as any[], propostaBusca) : null;
    if (propostaNome && !proposta) errors.push(`Proposta "${propostaNome}" não encontrada`);

    return {
      mapped: {
        nome,
        proposta_id: proposta?.id || null,
        operadora_id: operadora?.id || null,
        unidade_negocio: unidadeMatch || null,
        data_implantacao: dateStr || null,
        valor_contrato: valor,
        supervisor_a_id: supA?.id || null,
        supervisor_a_percentual: supA && !isNaN(pctA) ? pctA : null,
        supervisor_a_valor: supA ? (valorA ?? calc(pctA)) : null,
        supervisor_a_pago: !!supA && parsePaid(row['Pago Supervisor A']),
        supervisor_b_id: supB?.id || null,
        supervisor_b_percentual: supB && !isNaN(pctB) ? pctB : null,
        supervisor_b_valor: supB ? (valorB ?? calc(pctB)) : null,
        supervisor_b_pago: !!supB && parsePaid(row['Pago Supervisor B']),
        corretor_id: corretor?.id || null,
        corretor_percentual: corretor && !isNaN(pctC) ? pctC : null,
        corretor_valor: corretor ? (valorC ?? calc(pctC)) : null,
        corretor_pago: !!corretor && parsePaid(row['Pago Corretor']),
        observacoes: obs || null,
      },
      raw: row,
      errors,
    };
  }, [operadoras, supervisores, vendedores, propostas]);

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
      if (filterCorretor !== 'all') {
        if ((c.corretor_id || '') !== (filterCorretor === 'none' ? '' : filterCorretor)) return false;
      }
      if (filterMes !== 'all') {
        const m = c.data_implantacao ? String(c.data_implantacao).slice(0, 7) : '';
        if (filterMes === 'none' ? m !== '' : m !== filterMes) return false;
      }
      if (filterDataInicio || filterDataFim) {
        const d = c.data_implantacao ? String(c.data_implantacao).slice(0, 10) : '';
        if (!d) return false;
        if (filterDataInicio && d < filterDataInicio) return false;
        if (filterDataFim && d > filterDataFim) return false;
      }
      if (filterPago !== 'all') {
        const slots = assignedCommissionSlots(c);
        const allPagos = slots.length > 0 && slots.every(slot => slot.paid);
        const hasPendente = slots.some(slot => !slot.paid);
        if (filterPago === 'pago' && !allPagos) return false;
        if (filterPago === 'pendente' && !hasPendente) return false;
      }
      return true;
    });
  }, [contratos, search, filterOperadora, filterUnidade, filterSupervisor, filterCorretor, filterMes, filterDataInicio, filterDataFim, filterPago]);

  // Resumo
  const resumo = useMemo(() => {
    let totalContrato = 0, totalComissoes = 0, totalPagas = 0, totalPendentes = 0;
    for (const c of filtered as any[]) {
      totalContrato += Number(c.valor_contrato || 0);
      const a = commissionAmount(c, 'supervisor_a');
      const b = commissionAmount(c, 'supervisor_b');
      const cv = commissionAmount(c, 'corretor');
      totalComissoes += a + b + cv;
      if (c.supervisor_a_pago) totalPagas += a; else totalPendentes += a;
      if (c.supervisor_b_pago) totalPagas += b; else totalPendentes += b;
      if (c.corretor_pago) totalPagas += cv; else totalPendentes += cv;
    }
    return { totalContrato, totalComissoes, totalPagas, totalPendentes };
  }, [filtered]);

  // Resumo por pessoa (supervisores e corretores)
  const resumoPorPessoa = useMemo(() => {
    const supMap = new Map<string, { nome: string; pago: number; pendente: number }>();
    const corMap = new Map<string, { nome: string; pago: number; pendente: number }>();
    const contratosCorMap = new Map<string, { nome: string; qtd: number; total: number }>();
    const add = (map: typeof supMap, id: string | null, nome: string | undefined, valor: number, pago: boolean) => {
      if (!id || !valor) return;
      const cur = map.get(id) || { nome: nome || '—', pago: 0, pendente: 0 };
      if (pago) cur.pago += valor; else cur.pendente += valor;
      map.set(id, cur);
    };
    for (const c of filtered as any[]) {
      add(supMap, c.supervisor_a_id, c.supervisor_a?.nome, commissionAmount(c, 'supervisor_a'), !!c.supervisor_a_pago);
      add(supMap, c.supervisor_b_id, c.supervisor_b?.nome, commissionAmount(c, 'supervisor_b'), !!c.supervisor_b_pago);
      add(corMap, c.corretor_id, c.corretor?.nome, commissionAmount(c, 'corretor'), !!c.corretor_pago);
      if (c.corretor_id) {
        const cur = contratosCorMap.get(c.corretor_id) || { nome: c.corretor?.nome || '—', qtd: 0, total: 0 };
        cur.qtd += 1;
        cur.total += Number(c.valor_contrato || 0);
        contratosCorMap.set(c.corretor_id, cur);
      }
    }
    const sortFn = (a: any, b: any) => a.nome.localeCompare(b.nome);
    return {
      supervisores: Array.from(supMap.values()).sort(sortFn),
      corretores: Array.from(corMap.values()).sort(sortFn),
      contratosPorCorretor: Array.from(contratosCorMap.values()).sort((a, b) => b.total - a.total),
    };
  }, [filtered]);

  const filteredIds = useMemo(() => (filtered as any[]).map(c => c.id), [filtered]);
  useEffect(() => { setSelectedIds(new Set()); }, [search, filterOperadora, filterUnidade, filterSupervisor, filterCorretor, filterMes, filterDataInicio, filterDataFim, filterPago]);
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
      await bulkUpdate.mutateAsync({ ids: Array.from(selectedIds), updates });
      toast({ title: `${label} atualizado em ${n} contrato(s)` });
      setSelectedIds(new Set());
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };
  const handleBulkDelete = async () => {
    try {
      const n = selectedIds.size;
      await bulkDelete.mutateAsync(Array.from(selectedIds));
      toast({ title: `${n} contrato(s) excluído(s)` });
      setSelectedIds(new Set());
      setConfirmBulkDelete(false);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  const openNew = () => { setEditId(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (c: any) => {
    setEditId(c.id);
    setForm({
      nome: c.nome,
      proposta_id: c.proposta_id || 'none',
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

  const handlePersonChange = (slot: Slot, id: string) => {
    if (slot === 'a') setForm({
      ...form,
      supervisor_a_id: id,
      ...(id === 'none' ? { supervisor_a_percentual: '', supervisor_a_valor: '', supervisor_a_pago: false } : {}),
    });
    if (slot === 'b') setForm({
      ...form,
      supervisor_b_id: id,
      ...(id === 'none' ? { supervisor_b_percentual: '', supervisor_b_valor: '', supervisor_b_pago: false } : {}),
    });
    if (slot === 'c') setForm({
      ...form,
      corretor_id: id,
      ...(id === 'none' ? { corretor_percentual: '', corretor_valor: '', corretor_pago: false } : {}),
    });
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
        proposta_id: form.proposta_id === 'none' ? null : form.proposta_id,
        operadora_id: form.operadora_id === 'none' ? null : form.operadora_id,
        unidade_negocio: form.unidade_negocio === 'none' ? null : form.unidade_negocio,
        data_implantacao: form.data_implantacao || null,
        valor_contrato: parseFloat(form.valor_contrato) || 0,
        supervisor_a_id: form.supervisor_a_id === 'none' ? null : form.supervisor_a_id,
        supervisor_a_percentual: form.supervisor_a_id === 'none' || form.supervisor_a_percentual === '' ? null : parseFloat(form.supervisor_a_percentual),
        supervisor_a_valor: form.supervisor_a_id === 'none' || form.supervisor_a_valor === '' ? null : parseFloat(form.supervisor_a_valor),
        supervisor_a_pago: form.supervisor_a_id !== 'none' && form.supervisor_a_pago,
        supervisor_b_id: form.supervisor_b_id === 'none' ? null : form.supervisor_b_id,
        supervisor_b_percentual: form.supervisor_b_id === 'none' || form.supervisor_b_percentual === '' ? null : parseFloat(form.supervisor_b_percentual),
        supervisor_b_valor: form.supervisor_b_id === 'none' || form.supervisor_b_valor === '' ? null : parseFloat(form.supervisor_b_valor),
        supervisor_b_pago: form.supervisor_b_id !== 'none' && form.supervisor_b_pago,
        corretor_id: form.corretor_id === 'none' ? null : form.corretor_id,
        corretor_percentual: form.corretor_id === 'none' || form.corretor_percentual === '' ? null : parseFloat(form.corretor_percentual),
        corretor_valor: form.corretor_id === 'none' || form.corretor_valor === '' ? null : parseFloat(form.corretor_valor),
        corretor_pago: form.corretor_id !== 'none' && form.corretor_pago,
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


  // Multiplicador médio por operadora (só contratos com valor e algum recebimento)
  const multiplicadores = useMemo(() => {
    const porOperadora = new Map<string, { soma: number; qtd: number }>();
    let somaGeral = 0, qtdGeral = 0;
    for (const c of (filtered as any[])) {
      const base = Number(c.valor_contrato) || 0;
      if (base <= 0) continue;
      const rz = getResumoContrato(resumoReceitas, c.proposta_id);
      if (!rz || rz.recebido <= 0) continue;
      const mult = rz.recebido / base;
      somaGeral += mult; qtdGeral += 1;
      const op = c.operadoras?.nome || 'Sem operadora';
      const cur = porOperadora.get(op) || { soma: 0, qtd: 0 };
      cur.soma += mult; cur.qtd += 1;
      porOperadora.set(op, cur);
    }
    return {
      geral: qtdGeral > 0 ? somaGeral / qtdGeral : null,
      qtdGeral,
      porOperadora: Array.from(porOperadora.entries())
        .map(([nome, v]) => ({ nome, media: v.soma / v.qtd, qtd: v.qtd }))
        .sort((a, b) => b.qtd - a.qtd),
    };
  }, [filtered, resumoReceitas]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold">Contratos</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="w-60" />
          <Button variant="outline" onClick={() => {
            const rows = (filtered as any[]).map(c => ({
              Nome: c.nome,
              Proposta: (propostas as any[]).find(p => p.id === c.proposta_id)?.nome || '',
              Operadora: c.operadoras?.nome || '',
              Unidade: c.unidade_negocio || '',
              'Data Implantação': c.data_implantacao ? formatDateBR(c.data_implantacao) : '',
              'Valor Contrato': Number(c.valor_contrato || 0),
              'Supervisor A': c.supervisor_a?.nome || '',
              '% Supervisor A': c.supervisor_a_percentual ?? '',
              'Valor Supervisor A': c.supervisor_a_valor ?? '',
              'Pago Supervisor A': c.supervisor_a_pago ? 'Sim' : 'Não',
              'Supervisor B': c.supervisor_b?.nome || '',
              '% Supervisor B': c.supervisor_b_percentual ?? '',
              'Valor Supervisor B': c.supervisor_b_valor ?? '',
              'Pago Supervisor B': c.supervisor_b_pago ? 'Sim' : 'Não',
              Corretor: c.corretor?.nome || '',
              '% Corretor': c.corretor_percentual ?? '',
              'Valor Corretor': c.corretor_valor ?? '',
              'Pago Corretor': c.corretor_pago ? 'Sim' : 'Não',
              Observações: c.observacoes || '',
            }));
            void exportToExcel(rows, 'Contratos').catch((error) => {
              toast({ title: 'Erro ao exportar', description: error.message, variant: 'destructive' });
            });
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

      {/* Resumo por pessoa */}
      {(resumoPorPessoa.supervisores.length > 0 || resumoPorPessoa.corretores.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm font-semibold mb-3">Comissões por Supervisor</p>
              {resumoPorPessoa.supervisores.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum supervisor com comissões.</p>
              ) : (
                <div className="space-y-2">
                  {resumoPorPessoa.supervisores.map((p, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 py-1.5 border-b last:border-0">
                      <span className="font-medium truncate">{p.nome}</span>
                      <div className="flex items-center gap-4 text-sm whitespace-nowrap">
                        <span className="text-success">Pago: <strong>{formatCurrency(p.pago)}</strong></span>
                        <span className="text-warning">Pendente: <strong>{formatCurrency(p.pendente)}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm font-semibold mb-3">Comissões por Corretor</p>
              {resumoPorPessoa.corretores.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum corretor com comissões.</p>
              ) : (
                <div className="space-y-2">
                  {resumoPorPessoa.corretores.map((p, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 py-1.5 border-b last:border-0">
                      <span className="font-medium truncate">{p.nome}</span>
                      <div className="flex items-center gap-4 text-sm whitespace-nowrap">
                        <span className="text-success">Pago: <strong>{formatCurrency(p.pago)}</strong></span>
                        <span className="text-warning">Pendente: <strong>{formatCurrency(p.pendente)}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          {resumoPorPessoa.contratosPorCorretor.length > 0 && (
            <Card className="lg:col-span-2">
              <CardContent className="pt-6">
                <p className="text-sm font-semibold mb-3">Contratos por Corretor</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {resumoPorPessoa.contratosPorCorretor.map((p, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 py-1.5 px-3 rounded-md border bg-accent/30">
                      <span className="font-medium truncate">{p.nome}</span>
                      <div className="flex items-center gap-3 text-sm whitespace-nowrap">
                        <span className="text-muted-foreground">{p.qtd} contrato{p.qtd !== 1 ? 's' : ''}</span>
                        <span className="font-semibold text-primary">{formatCurrency(p.total)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

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
        <Select value={filterCorretor} onValueChange={setFilterCorretor}>
          <SelectTrigger className={`w-[180px] ${filterCorretor !== 'all' ? activeCls : ''}`}><SelectValue placeholder="Corretor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos corretores</SelectItem>
            <SelectItem value="none">Sem corretor</SelectItem>
            {(vendedores as any[]).filter(v => v.ativo).map(v => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}
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
        <div className={`flex items-center gap-1 rounded-md border px-2 h-10 ${(filterDataInicio || filterDataFim) ? activeCls : ''}`}>
          <span className="text-xs text-muted-foreground">De</span>
          <Input
            type="date"
            value={filterDataInicio}
            onChange={(e) => setFilterDataInicio(e.target.value)}
            className="h-8 w-[140px] border-0 px-1 focus-visible:ring-0"
          />
          <span className="text-xs text-muted-foreground">até</span>
          <Input
            type="date"
            value={filterDataFim}
            onChange={(e) => setFilterDataFim(e.target.value)}
            className="h-8 w-[140px] border-0 px-1 focus-visible:ring-0"
          />
          {(filterDataInicio || filterDataFim) && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => { setFilterDataInicio(''); setFilterDataFim(''); }}
              title="Limpar período"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
        <Select value={filterPago} onValueChange={setFilterPago}>
          <SelectTrigger className={`w-[180px] ${filterPago !== 'all' ? activeCls : ''}`}><SelectValue placeholder="Status comissão" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas comissões</SelectItem>
            <SelectItem value="pendente">Com pendentes</SelectItem>
            <SelectItem value="pago">Todas pagas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-3 border rounded-lg bg-primary/5 border-primary/30">
          <span className="text-sm font-medium mr-2">{selectedIds.size} selecionado(s)</span>

          <Popover>
            <PopoverTrigger asChild><Button size="sm" variant="outline">Operadora</Button></PopoverTrigger>
            <PopoverContent className="w-56 space-y-2">
              <Select onValueChange={v => applyBulk({ operadora_id: v === 'none' ? null : v }, 'Operadora')}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {operadoras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
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

          <Popover>
            <PopoverTrigger asChild><Button size="sm" variant="outline">Supervisor A</Button></PopoverTrigger>
            <PopoverContent className="w-56 space-y-2">
              <Select onValueChange={v => applyBulk(v === 'none'
                ? { supervisor_a_id: null, supervisor_a_percentual: null, supervisor_a_valor: null, supervisor_a_pago: false }
                : { supervisor_a_id: v }, 'Supervisor A')}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {(supervisores as any[]).filter(s => s.ativo).map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild><Button size="sm" variant="outline">Supervisor B</Button></PopoverTrigger>
            <PopoverContent className="w-56 space-y-2">
              <Select onValueChange={v => applyBulk(v === 'none'
                ? { supervisor_b_id: null, supervisor_b_percentual: null, supervisor_b_valor: null, supervisor_b_pago: false }
                : { supervisor_b_id: v }, 'Supervisor B')}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {(supervisores as any[]).filter(s => s.ativo).map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild><Button size="sm" variant="outline">Corretor</Button></PopoverTrigger>
            <PopoverContent className="w-56 space-y-2">
              <Select onValueChange={v => applyBulk(v === 'none'
                ? { corretor_id: null, corretor_percentual: null, corretor_valor: null, corretor_pago: false }
                : { corretor_id: v }, 'Corretor')}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {vendedores.map(v => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild><Button size="sm" variant="outline">Status comissão</Button></PopoverTrigger>
            <PopoverContent className="w-56 p-2 space-y-1">
              <Button size="sm" variant="ghost" className="w-full justify-start" onClick={() => applyBulk({ supervisor_a_pago: true, supervisor_b_pago: true, corretor_pago: true }, 'Comissões')}>Marcar todas como pagas</Button>
              <Button size="sm" variant="ghost" className="w-full justify-start" onClick={() => applyBulk({ supervisor_a_pago: false, supervisor_b_pago: false, corretor_pago: false }, 'Comissões')}>Marcar todas como pendentes</Button>
              <div className="border-t my-1" />
              <Button size="sm" variant="ghost" className="w-full justify-start" onClick={() => applyBulk({ supervisor_a_pago: true }, 'Supervisor A')}>Sup. A: paga</Button>
              <Button size="sm" variant="ghost" className="w-full justify-start" onClick={() => applyBulk({ supervisor_a_pago: false }, 'Supervisor A')}>Sup. A: pendente</Button>
              <Button size="sm" variant="ghost" className="w-full justify-start" onClick={() => applyBulk({ supervisor_b_pago: true }, 'Supervisor B')}>Sup. B: paga</Button>
              <Button size="sm" variant="ghost" className="w-full justify-start" onClick={() => applyBulk({ supervisor_b_pago: false }, 'Supervisor B')}>Sup. B: pendente</Button>
              <Button size="sm" variant="ghost" className="w-full justify-start" onClick={() => applyBulk({ corretor_pago: true }, 'Corretor')}>Corretor: paga</Button>
              <Button size="sm" variant="ghost" className="w-full justify-start" onClick={() => applyBulk({ corretor_pago: false }, 'Corretor')}>Corretor: pendente</Button>
            </PopoverContent>
          </Popover>

          <Button size="sm" variant="destructive" onClick={() => setConfirmBulkDelete(true)}>
            <Trash2 className="h-4 w-4 mr-1" /> Excluir
          </Button>

          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelectedIds(new Set())}>
            <X className="h-4 w-4 mr-1" /> Limpar
          </Button>
        </div>
      )}

      <AlertDialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selectedIds.size} contrato(s)?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {multiplicadores.geral != null && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-6 flex-wrap">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Multiplicador médio</p>
                <p className="text-2xl font-bold text-primary">{multiplicadores.geral.toFixed(2)}x</p>
                <p className="text-xs text-muted-foreground">{multiplicadores.qtdGeral} contrato(s) com recebimento</p>
              </div>
              <div className="flex gap-4 flex-wrap">
                {multiplicadores.porOperadora.slice(0, 6).map(op => (
                  <div key={op.nome} className="border rounded-md px-3 py-2">
                    <p className="text-xs text-muted-foreground">{op.nome}</p>
                    <p className="font-semibold">{op.media.toFixed(2)}x <span className="text-xs font-normal text-muted-foreground">({op.qtd})</span></p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={allSelected || (someSelected ? 'indeterminate' : false)}
                    onCheckedChange={toggleAll}
                    aria-label="Selecionar todos"
                  />
                </TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Operadora</TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead>Implantação</TableHead>
                <TableHead className="text-right">Valor Contrato</TableHead>
                <TableHead className="text-right">Recebido</TableHead>
                <TableHead className="text-right">Mult.</TableHead>
                <TableHead>Supervisor A</TableHead>
                <TableHead>Supervisor B</TableHead>
                <TableHead>Corretor</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={12} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={12} className="text-center py-8 text-muted-foreground">Nenhum contrato encontrado</TableCell></TableRow>
              ) : (filtered as any[]).map(c => (
                <TableRow key={c.id} data-state={selectedIds.has(c.id) ? 'selected' : undefined}>
                  <TableCell>
                    <Checkbox checked={selectedIds.has(c.id)} onCheckedChange={() => toggleOne(c.id)} aria-label="Selecionar" />
                  </TableCell>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell>{c.operadoras?.nome || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{c.unidade_negocio || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDateBR(c.data_implantacao)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(c.valor_contrato))}</TableCell>
                  {(() => {
                    const rz = getResumoContrato(resumoReceitas, c.proposta_id);
                    const base = Number(c.valor_contrato) || 0;
                    const mult = rz && base > 0 ? rz.recebido / base : null;
                    return (<>
                      <TableCell className="text-right">
                        {rz ? (
                          <div>
                            <span className="text-success font-medium">{formatCurrency(rz.recebido)}</span>
                            {rz.aguardando > 0 && <p className="text-xs text-muted-foreground">+{formatCurrency(rz.aguardando)} aguard.</p>}
                          </div>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        {mult != null && mult > 0
                          ? <span className={mult >= 2 ? 'text-success font-semibold' : 'font-medium'}>{mult.toFixed(2)}x</span>
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    </>);
                  })()}
                  <ComissaoCell
                    nome={c.supervisor_a?.nome}
                    pct={c.supervisor_a_percentual}
                    valor={commissionAmount(c, 'supervisor_a')}
                    pago={c.supervisor_a_pago}
                    onTogglePago={() => togglePago(c, 'supervisor_a_pago')}
                  />
                  <ComissaoCell
                    nome={c.supervisor_b?.nome}
                    pct={c.supervisor_b_percentual}
                    valor={commissionAmount(c, 'supervisor_b')}
                    pago={c.supervisor_b_pago}
                    onTogglePago={() => togglePago(c, 'supervisor_b_pago')}
                  />
                  <ComissaoCell
                    nome={c.corretor?.nome}
                    pct={c.corretor_percentual}
                    valor={commissionAmount(c, 'corretor')}
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
            <div className="space-y-1">
              <label className="text-sm font-medium">Proposta vinculada</label>
              <Select value={form.proposta_id} onValueChange={v => setForm({ ...form, proposta_id: v })}>
                <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {(propostas as any[]).map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">O total recebido é calculado somente pelas receitas desta proposta.</p>
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
              onIdChange={v => handlePersonChange('a', v)}
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
              onIdChange={v => handlePersonChange('b', v)}
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
              onIdChange={v => handlePersonChange('c', v)}
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
        expectedColumns={[
          'Nome', 'Proposta', 'Operadora', 'Unidade', 'Data Implantação', 'Valor Contrato',
          'Supervisor A', '% Supervisor A', 'Valor Supervisor A', 'Pago Supervisor A',
          'Supervisor B', '% Supervisor B', 'Valor Supervisor B', 'Pago Supervisor B',
          'Corretor', '% Corretor', 'Valor Corretor', 'Pago Corretor', 'Observações',
        ]}
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
