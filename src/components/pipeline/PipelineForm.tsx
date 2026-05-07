import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Plus, Trash2, Ban } from 'lucide-react';
import { PipelineAnexos } from './PipelineAnexos';

type Lookup = { id: string; nome: string };

export type Dependente = {
  parentesco: string;
  nome: string;
  cpf: string;
  data_nascimento?: string | null;
  plano_anterior: string;
};

export type Titular = {
  nome: string;
  cpf: string;
  data_nascimento?: string | null;
  telefone: string;
  email: string;
  endereco: string;
  plano_anterior: string;
  dependentes: Dependente[];
};

export type DadosProposta = {
  cnpj_cpf?: string;
  categoria?: string;
  acomodacao?: 'Enfermaria' | 'Apartamento' | '';
  coparticipacao?: 'Total' | 'Parcial' | 'Não possui' | '';
  vidas?: number;
  qtd_titulares?: number;
  qtd_dependentes?: number;
  data_reajuste?: string | null;
  endereco_empresa?: string;
  titulares?: Titular[];
};

export type PipelineFormValues = {
  id?: string;
  cliente: string;
  numero_proposta?: string | null;
  tipo: 'PJ' | 'PF' | 'Adesao';
  operadora_id?: string | null;
  canal_id?: string | null;
  vendedor_id?: string | null;
  valor_mensal: number;
  data_vigencia?: string | null;
  data_revisao?: string | null;
  etapa: string;
  observacoes?: string | null;
  dados_proposta?: DadosProposta | null;
};

const ETAPAS = [
  'Montagem de contrato',
  'Assinatura / Declaração de saúde',
  'Entrevista médica',
  'Em análise',
  'Pendências',
  'Aguardando vigência',
  'Implantado',
] as const;

const empty: PipelineFormValues = {
  cliente: '',
  tipo: 'PF',
  valor_mensal: 0,
  etapa: 'Montagem de contrato',
  dados_proposta: { acomodacao: '', coparticipacao: '', titulares: [] },
};

const emptyTitular = (): Titular => ({
  nome: '', cpf: '', data_nascimento: null, telefone: '', email: '', endereco: '', plano_anterior: '', dependentes: [],
});

const emptyDependente = (): Dependente => ({
  parentesco: '', nome: '', cpf: '', data_nascimento: null, plano_anterior: '',
});

function addOneYear(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y + 1}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function PipelineForm({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: PipelineFormValues | null;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [operadoras, setOperadoras] = useState<Lookup[]>([]);
  const [canais, setCanais] = useState<Lookup[]>([]);
  const [vendedores, setVendedores] = useState<Lookup[]>([]);
  const [form, setForm] = useState<PipelineFormValues>(initial ?? empty);
  const [declineMode, setDeclineMode] = useState(false);
  const [motivoDeclinio, setMotivoDeclinio] = useState('');

  useEffect(() => {
    setForm(
      initial
        ? { ...initial, dados_proposta: { acomodacao: '', coparticipacao: '', titulares: [], ...(initial.dados_proposta ?? {}) } }
        : empty,
    );
    setDeclineMode(false);
    setMotivoDeclinio('');
  }, [initial, open]);

  useEffect(() => {
    (async () => {
      const [o, c, v] = await Promise.all([
        supabase.from('operadoras').select('id,nome').eq('ativa', true).order('nome'),
        supabase.from('canais_venda').select('id,nome').eq('ativo', true).order('nome'),
        supabase.from('vendedores').select('id,nome').eq('ativo', true).order('nome'),
      ]);
      setOperadoras((o.data as any) ?? []);
      setCanais((c.data as any) ?? []);
      setVendedores((v.data as any) ?? []);
    })();
  }, []);

  const set = <K extends keyof PipelineFormValues>(k: K, v: PipelineFormValues[K]) =>
    setForm((p) => ({ ...p, [k]: v }));
  const setDP = (patch: Partial<DadosProposta>) =>
    setForm((p) => ({ ...p, dados_proposta: { ...(p.dados_proposta ?? {}), ...patch } }));

  const dp = form.dados_proposta ?? {};
  const titulares = dp.titulares ?? [];

  useEffect(() => {
    const target = Number(dp.qtd_titulares) || 0;
    if (target === titulares.length) return;
    if (target > titulares.length) {
      const add = Array.from({ length: target - titulares.length }, emptyTitular);
      setDP({ titulares: [...titulares, ...add] });
    } else {
      setDP({ titulares: titulares.slice(0, target) });
    }
    // eslint-disable-next-line
  }, [dp.qtd_titulares]);

  useEffect(() => {
    if (form.data_vigencia && !dp.data_reajuste) setDP({ data_reajuste: addOneYear(form.data_vigencia) });
    // eslint-disable-next-line
  }, [form.data_vigencia]);

  const updateTitular = (idx: number, patch: Partial<Titular>) => {
    setDP({ titulares: titulares.map((t, i) => (i === idx ? { ...t, ...patch } : t)) });
  };

  const setDependentesCount = (titIdx: number, count: number) => {
    const t = titulares[titIdx];
    const cur = t.dependentes ?? [];
    const next = count > cur.length
      ? [...cur, ...Array.from({ length: count - cur.length }, emptyDependente)]
      : cur.slice(0, count);
    updateTitular(titIdx, { dependentes: next });
  };

  const updateDependente = (titIdx: number, depIdx: number, patch: Partial<Dependente>) => {
    const t = titulares[titIdx];
    updateTitular(titIdx, { dependentes: t.dependentes.map((d, i) => (i === depIdx ? { ...d, ...patch } : d)) });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.cliente?.trim()) {
      toast({ title: 'Informe o cliente', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const payload: any = {
        cliente: form.cliente.trim(),
        tipo: form.tipo,
        etapa: (form.etapa || 'Montagem de contrato') as any,
        user_id: user.id,
        valor_mensal: Number(form.valor_mensal) || 0,
        operadora_id: form.operadora_id || null,
        canal_id: form.canal_id || null,
        vendedor_id: form.vendedor_id || null,
        data_vigencia: form.data_vigencia || null,
        data_revisao: form.data_revisao || null,
        numero_proposta: form.numero_proposta?.trim() || null,
        observacoes: form.observacoes?.trim() || null,
        posicao: Date.now(),
        dados_proposta: form.dados_proposta as any,
      };

      const { error } = form.id
        ? await supabase.from('pipeline_contratos').update(payload).eq('id', form.id)
        : await supabase.from('pipeline_contratos').insert(payload);
      if (error) throw error;

      toast({ title: form.id ? 'Proposta atualizada' : 'Proposta criada' });
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const declinar = async () => {
    if (!form.id) return;
    if (!motivoDeclinio.trim()) {
      toast({ title: 'Informe o motivo', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.from('pipeline_contratos').update({
        declinada: true,
        declinada_em: new Date().toISOString(),
        motivo_declinio: motivoDeclinio.trim(),
      }).eq('id', form.id);
      if (error) throw error;
      toast({ title: 'Proposta declinada' });
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.id ? 'Editar proposta' : 'Nova proposta'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {/* DADOS DO CONTRATO */}
          <div>
            <h3 className="font-semibold text-sm mb-2">Dados do contrato</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="space-y-1.5 col-span-2 md:col-span-1">
                <Label>Cliente *</Label>
                <Input required value={form.cliente} onChange={(e) => set('cliente', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Nº Proposta</Label>
                <Input value={form.numero_proposta ?? ''} onChange={(e) => set('numero_proposta', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={(v) => set('tipo', v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PF">PF</SelectItem>
                    <SelectItem value="PJ">PJ</SelectItem>
                    <SelectItem value="Adesao">Adesão</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{form.tipo === 'PJ' ? 'CNPJ' : 'CPF'}</Label>
                <Input value={dp.cnpj_cpf ?? ''} onChange={(e) => setDP({ cnpj_cpf: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Operadora</Label>
                <Select value={form.operadora_id ?? ''} onValueChange={(v) => set('operadora_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {operadoras.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Canal de venda</Label>
                <Select value={form.canal_id ?? ''} onValueChange={(v) => set('canal_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {canais.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Vendedor</Label>
                <Select value={form.vendedor_id ?? ''} onValueChange={(v) => set('vendedor_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {vendedores.map((v) => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Valor mensal (R$)</Label>
                <Input type="number" step="0.01" min="0" value={form.valor_mensal || ''} onChange={(e) => set('valor_mensal', Number(e.target.value) || 0)} />
              </div>
              <div className="space-y-1.5">
                <Label>Data de vigência</Label>
                <Input type="date" value={form.data_vigencia ?? ''} onChange={(e) => set('data_vigencia', e.target.value || null)} />
              </div>
              <div className="space-y-1.5">
                <Label>Próxima revisão</Label>
                <Input type="date" value={form.data_revisao ?? ''} onChange={(e) => set('data_revisao', e.target.value || null)} />
              </div>
              <div className="space-y-1.5">
                <Label>Etapa</Label>
                <Select value={form.etapa} onValueChange={(v) => set('etapa', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ETAPAS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2 md:col-span-3">
                <Label>Observações</Label>
                <Textarea rows={2} value={form.observacoes ?? ''} onChange={(e) => set('observacoes', e.target.value)} />
              </div>
            </div>
          </div>

          <Separator />

          {/* DADOS DA PROPOSTA */}
          <div>
            <h3 className="font-semibold text-sm mb-2">Dados da proposta</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Input value={dp.categoria ?? ''} onChange={(e) => setDP({ categoria: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Acomodação</Label>
                <Select value={dp.acomodacao || ''} onValueChange={(v) => setDP({ acomodacao: v as any })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Enfermaria">Enfermaria</SelectItem>
                    <SelectItem value="Apartamento">Apartamento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Coparticipação</Label>
                <Select value={dp.coparticipacao || ''} onValueChange={(v) => setDP({ coparticipacao: v as any })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Total">Total</SelectItem>
                    <SelectItem value="Parcial">Parcial</SelectItem>
                    <SelectItem value="Não possui">Não possui</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Vidas</Label>
                <Input type="number" min="0" value={dp.vidas ?? ''} onChange={(e) => setDP({ vidas: Number(e.target.value) || 0 })} />
              </div>
              <div className="space-y-1.5">
                <Label>Qtd titulares</Label>
                <Input type="number" min="0" value={dp.qtd_titulares ?? ''} onChange={(e) => setDP({ qtd_titulares: Number(e.target.value) || 0 })} />
              </div>
              <div className="space-y-1.5">
                <Label>Qtd dependentes</Label>
                <Input type="number" min="0" value={dp.qtd_dependentes ?? ''} onChange={(e) => setDP({ qtd_dependentes: Number(e.target.value) || 0 })} />
              </div>
              <div className="space-y-1.5">
                <Label>Reajuste</Label>
                <Input type="date" value={dp.data_reajuste ?? ''} onChange={(e) => setDP({ data_reajuste: e.target.value || null })} />
              </div>
              <div className="space-y-1.5 col-span-2 md:col-span-4">
                <Label>Endereço empresa</Label>
                <Input value={dp.endereco_empresa ?? ''} onChange={(e) => setDP({ endereco_empresa: e.target.value })} />
              </div>
            </div>
          </div>

          {/* TITULARES */}
          {titulares.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="font-semibold text-sm mb-2">Titulares ({titulares.length})</h3>
                <div className="space-y-3">
                  {titulares.map((t, idx) => (
                    <div key={idx} className="border rounded-lg p-3 bg-muted/30 space-y-2">
                      <div className="text-xs font-semibold text-muted-foreground">Titular {idx + 1}</div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        <Input placeholder="Nome" value={t.nome} onChange={(e) => updateTitular(idx, { nome: e.target.value })} />
                        <Input placeholder="CPF" value={t.cpf} onChange={(e) => updateTitular(idx, { cpf: e.target.value })} />
                        <Input type="date" value={t.data_nascimento ?? ''} onChange={(e) => updateTitular(idx, { data_nascimento: e.target.value || null })} />
                        <Input placeholder="Telefone" value={t.telefone} onChange={(e) => updateTitular(idx, { telefone: e.target.value })} />
                        <Input placeholder="Email" value={t.email} onChange={(e) => updateTitular(idx, { email: e.target.value })} />
                        <Input placeholder="Plano anterior" value={t.plano_anterior} onChange={(e) => updateTitular(idx, { plano_anterior: e.target.value })} />
                        <Input className="col-span-2 md:col-span-3" placeholder="Endereço" value={t.endereco} onChange={(e) => updateTitular(idx, { endereco: e.target.value })} />
                      </div>
                      <div className="flex items-center gap-2 pt-2 border-t">
                        <Label className="text-xs">Dependentes:</Label>
                        <Input type="number" min="0" className="w-20 h-7" value={t.dependentes.length} onChange={(e) => setDependentesCount(idx, Number(e.target.value) || 0)} />
                      </div>
                      {t.dependentes.map((d, di) => (
                        <div key={di} className="grid grid-cols-2 md:grid-cols-5 gap-2 pl-2 border-l-2 border-primary/30">
                          <Input placeholder="Parentesco" value={d.parentesco} onChange={(e) => updateDependente(idx, di, { parentesco: e.target.value })} />
                          <Input placeholder="Nome" value={d.nome} onChange={(e) => updateDependente(idx, di, { nome: e.target.value })} />
                          <Input placeholder="CPF" value={d.cpf} onChange={(e) => updateDependente(idx, di, { cpf: e.target.value })} />
                          <Input type="date" value={d.data_nascimento ?? ''} onChange={(e) => updateDependente(idx, di, { data_nascimento: e.target.value || null })} />
                          <Input placeholder="Plano anterior" value={d.plano_anterior} onChange={(e) => updateDependente(idx, di, { plano_anterior: e.target.value })} />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ANEXOS */}
          {form.id && (
            <>
              <Separator />
              <div>
                <h3 className="font-semibold text-sm mb-2">Anexos</h3>
                <PipelineAnexos pipelineId={form.id} />
              </div>
            </>
          )}

          {/* DECLINAR */}
          {form.id && declineMode && (
            <div className="border border-destructive/40 bg-destructive/5 rounded-lg p-3 space-y-2">
              <Label className="text-destructive">Motivo do declínio</Label>
              <Textarea rows={2} value={motivoDeclinio} onChange={(e) => setMotivoDeclinio(e.target.value)} />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setDeclineMode(false)}>Cancelar</Button>
                <Button type="button" variant="destructive" size="sm" onClick={declinar} disabled={busy}>Confirmar declínio</Button>
              </div>
            </div>
          )}

          <DialogFooter className="flex-row justify-between">
            {form.id && !declineMode ? (
              <Button type="button" variant="outline" onClick={() => setDeclineMode(true)}>
                <Ban className="h-4 w-4" /> Declinar
              </Button>
            ) : <div />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
