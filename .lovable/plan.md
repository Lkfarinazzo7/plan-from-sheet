

# Aba de Cadastros

## O que sera feito

Criar uma nova pagina **Cadastros** (`/cadastros`) com abas internas para gerenciar:

1. **Vendedores** - Listar, adicionar, editar nome, ativar/desativar
2. **Operadoras** - Listar, adicionar, editar nome, ativar/desativar
3. **Categorias de Despesa** - Listar, adicionar, editar nome, remover
4. **Supervisores** - Necessita nova tabela no banco de dados. Listar, adicionar, editar, ativar/desativar

## Banco de Dados

- Criar tabela `supervisores` com campos: `id`, `nome`, `ativo`, `created_at`, `updated_at`
- RLS: acesso para usuarios autenticados (mesmo padrao das demais tabelas de referencia)

## Arquivos

### Novo: `src/pages/Cadastros.tsx`
- Pagina com componente `Tabs` (shadcn) contendo 4 abas: Vendedores, Operadoras, Categorias, Supervisores
- Cada aba mostra uma tabela com os registros e botoes para Adicionar, Editar e Ativar/Desativar (ou Remover para categorias)
- Dialogs inline para adicionar/editar

### Editado: `src/hooks/useFinancialData.ts`
- Adicionar hooks CRUD para supervisores (`useSupervisores`, `useCreateSupervisor`, `useUpdateSupervisor`)
- Adicionar hooks de mutacao para vendedores (`useCreateVendedor`, `useUpdateVendedor`)
- Adicionar hooks de mutacao para operadoras (`useCreateOperadora`, `useUpdateOperadora`)
- Adicionar hooks de mutacao para categorias (`useCreateCategoriaDespesa`, `useUpdateCategoriaDespesa`, `useDeleteCategoriaDespesa`)

### Editado: `src/App.tsx`
- Adicionar rota `/cadastros` apontando para a nova pagina

### Editado: `src/components/AppSidebar.tsx`
- Adicionar item "Cadastros" no menu com icone `Settings` ou `ClipboardList`

### Migracao SQL
- `CREATE TABLE public.supervisores (id uuid primary key default gen_random_uuid(), nome text not null, ativo boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());`
- RLS policy para authenticated users
- Trigger de updated_at

