import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Shield, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import {
  useAllVendedores, useCreateVendedor, useUpdateVendedor,
  useAllOperadoras, useCreateOperadora, useUpdateOperadora,
  useCategoriasDespesa, useCreateCategoriaDespesa, useUpdateCategoriaDespesa, useDeleteCategoriaDespesa,
  useSupervisores, useCreateSupervisor, useUpdateSupervisor,
  useAllSetoresDespesa, useCreateSetorDespesa, useUpdateSetorDespesa,
} from '@/hooks/useFinancialData';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useIsAdmPipelineOnly } from '@/hooks/useUserRole';
import type { AppRole } from '@/hooks/useUserRole';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function CrudDialog({ open, onOpenChange, title, value, onChange, onSave }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string;
  value: string; onChange: (v: string) => void; onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <Input value={value} onChange={e => onChange(e.target.value)} placeholder="Nome" />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={onSave}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VendedoresTab() {
  const { data: vendedores = [] } = useAllVendedores();
  const createMut = useCreateVendedor();
  const updateMut = useUpdateVendedor();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [nome, setNome] = useState('');

  const openAdd = () => { setEditId(null); setNome(''); setDialogOpen(true); };
  const openEdit = (v: any) => { setEditId(v.id); setNome(v.nome); setDialogOpen(true); };
  const save = async () => {
    if (!nome.trim()) return;
    try {
      if (editId) await updateMut.mutateAsync({ id: editId, nome: nome.trim() });
      else await createMut.mutateAsync(nome.trim());
      toast.success(editId ? 'Vendedor atualizado!' : 'Vendedor criado!');
      setDialogOpen(false);
    } catch { toast.error('Erro ao salvar vendedor.'); }
  };
  const toggleAtivo = async (v: any) => {
    try {
      await updateMut.mutateAsync({ id: v.id, ativo: !v.ativo });
      toast.success(v.ativo ? 'Vendedor desativado.' : 'Vendedor ativado.');
    } catch { toast.error('Erro ao alterar o vendedor.'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={openAdd}><Plus className="mr-2 h-4 w-4" />Adicionar</Button></div>
      <Table>
        <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
        <TableBody>
          {vendedores.map(v => (
            <TableRow key={v.id}>
              <TableCell>{v.nome}</TableCell>
              <TableCell><Badge variant={v.ativo ? 'default' : 'secondary'}>{v.ativo ? 'Ativo' : 'Inativo'}</Badge></TableCell>
              <TableCell className="text-right space-x-2">
                <Button size="sm" variant="ghost" onClick={() => openEdit(v)}><Pencil className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => toggleAtivo(v)}>{v.ativo ? 'Desativar' : 'Ativar'}</Button>
              </TableCell>
            </TableRow>
          ))}
          {!vendedores.length && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Nenhum vendedor cadastrado.</TableCell></TableRow>}
        </TableBody>
      </Table>
      <CrudDialog open={dialogOpen} onOpenChange={setDialogOpen} title={editId ? 'Editar Vendedor' : 'Novo Vendedor'} value={nome} onChange={setNome} onSave={save} />
    </div>
  );
}

function OperadorasTab() {
  const { data: operadoras = [] } = useAllOperadoras();
  const createMut = useCreateOperadora();
  const updateMut = useUpdateOperadora();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [nome, setNome] = useState('');

  const openAdd = () => { setEditId(null); setNome(''); setDialogOpen(true); };
  const openEdit = (o: any) => { setEditId(o.id); setNome(o.nome); setDialogOpen(true); };
  const save = async () => {
    if (!nome.trim()) return;
    try {
      if (editId) await updateMut.mutateAsync({ id: editId, nome: nome.trim() });
      else await createMut.mutateAsync(nome.trim());
      toast.success(editId ? 'Operadora atualizada!' : 'Operadora criada!');
      setDialogOpen(false);
    } catch { toast.error('Erro ao salvar operadora.'); }
  };
  const toggleAtiva = async (o: any) => {
    try {
      await updateMut.mutateAsync({ id: o.id, ativa: !o.ativa });
      toast.success(o.ativa ? 'Operadora desativada.' : 'Operadora ativada.');
    } catch { toast.error('Erro ao alterar a operadora.'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={openAdd}><Plus className="mr-2 h-4 w-4" />Adicionar</Button></div>
      <Table>
        <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
        <TableBody>
          {operadoras.map(o => (
            <TableRow key={o.id}>
              <TableCell>{o.nome}</TableCell>
              <TableCell><Badge variant={o.ativa ? 'default' : 'secondary'}>{o.ativa ? 'Ativa' : 'Inativa'}</Badge></TableCell>
              <TableCell className="text-right space-x-2">
                <Button size="sm" variant="ghost" onClick={() => openEdit(o)}><Pencil className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => toggleAtiva(o)}>{o.ativa ? 'Desativar' : 'Ativar'}</Button>
              </TableCell>
            </TableRow>
          ))}
          {!operadoras.length && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Nenhuma operadora cadastrada.</TableCell></TableRow>}
        </TableBody>
      </Table>
      <CrudDialog open={dialogOpen} onOpenChange={setDialogOpen} title={editId ? 'Editar Operadora' : 'Nova Operadora'} value={nome} onChange={setNome} onSave={save} />
    </div>
  );
}

function CategoriasTab() {
  const { data: categorias = [] } = useCategoriasDespesa();
  const createMut = useCreateCategoriaDespesa();
  const updateMut = useUpdateCategoriaDespesa();
  const deleteMut = useDeleteCategoriaDespesa();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [nome, setNome] = useState('');

  const openAdd = () => { setEditId(null); setNome(''); setDialogOpen(true); };
  const openEdit = (c: any) => { setEditId(c.id); setNome(c.nome); setDialogOpen(true); };
  const save = async () => {
    if (!nome.trim()) return;
    try {
      if (editId) await updateMut.mutateAsync({ id: editId, nome: nome.trim() });
      else await createMut.mutateAsync(nome.trim());
      toast.success(editId ? 'Categoria atualizada!' : 'Categoria criada!');
      setDialogOpen(false);
    } catch { toast.error('Erro ao salvar categoria.'); }
  };
  const remove = async (id: string) => {
    try {
      await deleteMut.mutateAsync(id);
      toast.success('Categoria removida!');
    } catch { toast.error('Erro ao remover. Pode haver despesas vinculadas.'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={openAdd}><Plus className="mr-2 h-4 w-4" />Adicionar</Button></div>
      <Table>
        <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
        <TableBody>
          {categorias.map(c => (
            <TableRow key={c.id}>
              <TableCell>{c.nome}</TableCell>
              <TableCell className="text-right space-x-2">
                <Button size="sm" variant="ghost" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4" /></Button>
              </TableCell>
            </TableRow>
          ))}
          {!categorias.length && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">Nenhuma categoria cadastrada.</TableCell></TableRow>}
        </TableBody>
      </Table>
      <CrudDialog open={dialogOpen} onOpenChange={setDialogOpen} title={editId ? 'Editar Categoria' : 'Nova Categoria'} value={nome} onChange={setNome} onSave={save} />
    </div>
  );
}

function SupervisoresTab() {
  const { data: supervisores = [] } = useSupervisores();
  const createMut = useCreateSupervisor();
  const updateMut = useUpdateSupervisor();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [nome, setNome] = useState('');

  const openAdd = () => { setEditId(null); setNome(''); setDialogOpen(true); };
  const openEdit = (s: any) => { setEditId(s.id); setNome(s.nome); setDialogOpen(true); };
  const save = async () => {
    if (!nome.trim()) return;
    try {
      if (editId) await updateMut.mutateAsync({ id: editId, nome: nome.trim() });
      else await createMut.mutateAsync(nome.trim());
      toast.success(editId ? 'Supervisor atualizado!' : 'Supervisor criado!');
      setDialogOpen(false);
    } catch { toast.error('Erro ao salvar supervisor.'); }
  };
  const toggleAtivo = async (s: any) => {
    try {
      await updateMut.mutateAsync({ id: s.id, ativo: !s.ativo });
      toast.success(s.ativo ? 'Supervisor desativado.' : 'Supervisor ativado.');
    } catch { toast.error('Erro ao alterar o supervisor.'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={openAdd}><Plus className="mr-2 h-4 w-4" />Adicionar</Button></div>
      <Table>
        <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
        <TableBody>
          {supervisores.map(s => (
            <TableRow key={s.id}>
              <TableCell>{s.nome}</TableCell>
              <TableCell><Badge variant={s.ativo ? 'default' : 'secondary'}>{s.ativo ? 'Ativo' : 'Inativo'}</Badge></TableCell>
              <TableCell className="text-right space-x-2">
                <Button size="sm" variant="ghost" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => toggleAtivo(s)}>{s.ativo ? 'Desativar' : 'Ativar'}</Button>
              </TableCell>
            </TableRow>
          ))}
          {!supervisores.length && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Nenhum supervisor cadastrado.</TableCell></TableRow>}
        </TableBody>
      </Table>
      <CrudDialog open={dialogOpen} onOpenChange={setDialogOpen} title={editId ? 'Editar Supervisor' : 'Novo Supervisor'} value={nome} onChange={setNome} onSave={save} />
    </div>
  );
}

function SetoresTab() {
  const { data: setores = [] } = useAllSetoresDespesa();
  const createMut = useCreateSetorDespesa();
  const updateMut = useUpdateSetorDespesa();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [nome, setNome] = useState('');

  const openAdd = () => { setEditId(null); setNome(''); setDialogOpen(true); };
  const openEdit = (s: any) => { setEditId(s.id); setNome(s.nome); setDialogOpen(true); };
  const save = async () => {
    if (!nome.trim()) return;
    try {
      if (editId) await updateMut.mutateAsync({ id: editId, nome: nome.trim() });
      else await createMut.mutateAsync(nome.trim());
      toast.success(editId ? 'Setor atualizado!' : 'Setor criado!');
      setDialogOpen(false);
    } catch { toast.error('Erro ao salvar setor.'); }
  };
  const toggleAtivo = async (s: any) => {
    try {
      await updateMut.mutateAsync({ id: s.id, ativo: !s.ativo });
      toast.success(s.ativo ? 'Setor desativado.' : 'Setor ativado.');
    } catch { toast.error('Erro ao alterar o setor.'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={openAdd}><Plus className="mr-2 h-4 w-4" />Adicionar</Button></div>
      <Table>
        <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
        <TableBody>
          {setores.map(s => (
            <TableRow key={s.id}>
              <TableCell>{s.nome}</TableCell>
              <TableCell><Badge variant={s.ativo ? 'default' : 'secondary'}>{s.ativo ? 'Ativo' : 'Inativo'}</Badge></TableCell>
              <TableCell className="text-right space-x-2">
                <Button size="sm" variant="ghost" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => toggleAtivo(s)}>{s.ativo ? 'Desativar' : 'Ativar'}</Button>
              </TableCell>
            </TableRow>
          ))}
          {!setores.length && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Nenhum setor cadastrado.</TableCell></TableRow>}
        </TableBody>
      </Table>
      <CrudDialog open={dialogOpen} onOpenChange={setDialogOpen} title={editId ? 'Editar Setor' : 'Novo Setor'} value={nome} onChange={setNome} onSave={save} />
    </div>
  );
}

function CanaisVendaTab() {
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [nome, setNome] = useState('');

  const load = async () => {
    const { data, error } = await supabase.from('canais_venda').select('*').order('nome');
    if (error) { toast.error(error.message); return; }
    setItems(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!nome.trim()) return;
    const { error } = editId
      ? await supabase.from('canais_venda').update({ nome: nome.trim() }).eq('id', editId)
      : await supabase.from('canais_venda').insert({ nome: nome.trim() });
    if (error) { toast.error(error.message); return; }
    toast.success(editId ? 'Canal atualizado!' : 'Canal criado!');
    setOpen(false); setNome(''); setEditId(null); load();
  };
  const toggle = async (c: any) => {
    const { error } = await supabase.from('canais_venda').update({ ativo: !c.ativo }).eq('id', c.id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEditId(null); setNome(''); setOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />Adicionar
        </Button>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
        <TableBody>
          {items.map(c => (
            <TableRow key={c.id}>
              <TableCell>{c.nome}</TableCell>
              <TableCell><Badge variant={c.ativo ? 'default' : 'secondary'}>{c.ativo ? 'Ativo' : 'Inativo'}</Badge></TableCell>
              <TableCell className="text-right space-x-2">
                <Button size="sm" variant="ghost" onClick={() => { setEditId(c.id); setNome(c.nome); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => toggle(c)}>{c.ativo ? 'Desativar' : 'Ativar'}</Button>
              </TableCell>
            </TableRow>
          ))}
          {!items.length && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Nenhum canal cadastrado.</TableCell></TableRow>}
        </TableBody>
      </Table>
      <CrudDialog open={open} onOpenChange={setOpen} title={editId ? 'Editar Canal' : 'Novo Canal'} value={nome} onChange={setNome} onSave={save} />
    </div>
  );
}

function UsuariosTab() {
  const { user } = useAuth();
  const { roles, isAdmin } = useIsAdmPipelineOnly();
  const [users, setUsers] = useState<{ user_id: string; email: string; roles: string[] }[]>([]);
  const [email, setEmail] = useState('');
  const [roleToGrant, setRoleToGrant] = useState<AppRole>('adm_pipeline');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data, error } = await supabase.rpc('list_users_with_roles');
    if (error) { toast.error(error.message); return; }
    setUsers((data as any) ?? []);
  };
  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  const claimAdmin = async () => {
    if (!user) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('bootstrap_first_admin');
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    if (!data) { toast.error('Já existe um admin. Peça para te conceder o papel.'); return; }
    toast.success('Você é admin agora!');
    window.location.reload();
  };

  const revokeRole = async (uemail: string, role: string) => {
    if (!confirm(`Remover papel "${role}" de ${uemail}?`)) return;
    const { data, error } = await supabase.rpc('grant_role_by_email', { _email: uemail, _role: role as any, _grant: false });
    if (error) { toast.error(error.message); return; }
    if (!(data as { ok?: boolean; error?: string } | null)?.ok) {
      toast.error((data as { error?: string } | null)?.error || 'Não foi possível remover o papel.');
      return;
    }
    toast.success('Papel removido.');
    load();
  };

  const grantRole = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('grant_role_by_email', {
      _email: normalizedEmail,
      _role: roleToGrant,
      _grant: true,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    if (!(data as { ok?: boolean; error?: string } | null)?.ok) {
      toast.error((data as { error?: string } | null)?.error || 'Não foi possível conceder o papel.');
      return;
    }
    toast.success(`Papel ${roleToGrant} concedido a ${normalizedEmail}.`);
    setEmail('');
    load();
  };

  if (!isAdmin) {
    return (
      <div className="space-y-3 max-w-md">
        <p className="text-sm text-muted-foreground">
          Você ainda não tem o papel de administrador. Se você é o primeiro usuário deste sistema, clique abaixo para se tornar admin.
        </p>
        <p className="text-xs text-muted-foreground">Seus papéis atuais: {roles.length ? roles.join(', ') : 'nenhum'}</p>
        <Button onClick={claimAdmin} disabled={busy}>
          <Shield className="h-4 w-4 mr-1" /> Tornar-me admin
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 rounded-md border p-3">
        <Input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="usuario@empresa.com"
          className="flex-1"
        />
        <Select value={roleToGrant} onValueChange={v => setRoleToGrant(v as AppRole)}>
          <SelectTrigger className="sm:w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="adm_pipeline">ADM Pipeline</SelectItem>
            <SelectItem value="gestor">Gestor</SelectItem>
            <SelectItem value="admin">Administrador</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={grantRole} disabled={busy || !email.trim()}>
          <Shield className="h-4 w-4 mr-1" /> Conceder papel
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow><TableHead>E-mail</TableHead><TableHead>Papéis</TableHead><TableHead className="text-right">Ações</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {users.map(u => (
            <TableRow key={u.user_id}>
              <TableCell>{u.email}</TableCell>
              <TableCell className="space-x-1">
                {u.roles.map(r => <Badge key={r} variant="secondary">{r}</Badge>)}
              </TableCell>
              <TableCell className="text-right space-x-1">
                {u.roles.map(role => (
                  <Button
                    key={role}
                    size="sm"
                    variant="ghost"
                    disabled={u.user_id === user?.id && role === 'admin'}
                    onClick={() => revokeRole(u.email, role)}
                  >
                    <ShieldOff className="h-4 w-4" /> Remover {role}
                  </Button>
                ))}
              </TableCell>
            </TableRow>
          ))}
          {!users.length && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Nenhum usuário com papel.</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
  );
}

export default function Cadastros() {
  const { roles, isAdmin, canManageCadastros, isLoading, isError } = useIsAdmPipelineOnly();

  if (isLoading) return <p className="text-muted-foreground">Carregando permissões...</p>;
  if (isError) return <p className="text-destructive">Não foi possível verificar suas permissões. Tente novamente.</p>;
  if (!canManageCadastros) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Cadastros</h1>
        {roles.length === 0 ? (
          <UsuariosTab />
        ) : (
          <p className="text-sm text-muted-foreground">Seu usuário não tem permissão para alterar cadastros globais.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Cadastros</h1>
      <Tabs defaultValue="vendedores">
        <TabsList>
          <TabsTrigger value="vendedores">Vendedores</TabsTrigger>
          <TabsTrigger value="operadoras">Operadoras</TabsTrigger>
          <TabsTrigger value="categorias">Categorias de Despesa</TabsTrigger>
          <TabsTrigger value="supervisores">Supervisores</TabsTrigger>
          <TabsTrigger value="setores">Setores</TabsTrigger>
          <TabsTrigger value="canais">Canais de Venda</TabsTrigger>
          {isAdmin && <TabsTrigger value="usuarios">Usuários</TabsTrigger>}
        </TabsList>
        <TabsContent value="vendedores"><VendedoresTab /></TabsContent>
        <TabsContent value="operadoras"><OperadorasTab /></TabsContent>
        <TabsContent value="categorias"><CategoriasTab /></TabsContent>
        <TabsContent value="supervisores"><SupervisoresTab /></TabsContent>
        <TabsContent value="setores"><SetoresTab /></TabsContent>
        <TabsContent value="canais"><CanaisVendaTab /></TabsContent>
        {isAdmin && <TabsContent value="usuarios"><UsuariosTab /></TabsContent>}
      </Tabs>
    </div>
  );
}
