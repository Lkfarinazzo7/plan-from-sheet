## Edição em massa de Receitas

Adicionar seleção múltipla na tabela de Receitas com ações em lote para alterar campos comuns ou excluir vários lançamentos de uma vez.

### Mudanças na UI (`src/pages/Receitas.tsx`)

1. **Coluna de checkbox**
   - Nova primeira coluna na tabela com `Checkbox` por linha.
   - Header com checkbox "selecionar todos" (marca/desmarca todas as linhas filtradas visíveis).
   - Estado `selectedIds: Set<string>`. Limpa ao trocar mês/filtros.

2. **Barra de ações em lote** (aparece quando `selectedIds.size > 0`)
   - Acima da tabela, fixa visualmente, mostrando "N selecionadas".
   - Botões:
     - **Alterar Status** → popover com Recebido / Aguardando.
     - **Alterar Data** → popover com input `type="date"`.
     - **Alterar Operadora** → popover com Select.
     - **Alterar Vendedor** → popover com Select.
     - **Alterar Categoria** → popover com Select (Bancária / Vida).
     - **Alterar Unidade** → popover com Select (Nenhuma / unidades).
     - **Excluir** → `AlertDialog` de confirmação com a contagem.
     - **Limpar seleção**.

3. **Comportamento**
   - Após cada ação em lote: toast de sucesso, limpa seleção, refetch automático via invalidação.
   - Excluir pede confirmação antes de executar.

### Mudanças nos hooks (`src/hooks/useFinancialData.ts`)

Adicionar dois hooks novos (mantém os existentes):

- `useBulkUpdateReceita()` — recebe `{ ids: string[], updates: Partial<...> }`, executa `supabase.from('receitas').update(updates).in('id', ids)`, invalida `['receitas']`.
- `useBulkDeleteReceita()` — recebe `ids: string[]`, executa `.delete().in('id', ids)`, invalida `['receitas']`.

### Detalhes técnicos

- Usar `Checkbox` de `@/components/ui/checkbox` e `Popover` de `@/components/ui/popover` (já presentes).
- Datas seguem regra do projeto: string `YYYY-MM-DD` direto do input, sem `toISOString()`.
- "Selecionar todos" age sobre `filtered` (somente o que está visível com filtros aplicados).
- RLS atual já permite update/delete por `auth.uid() = user_id`; nada a alterar no banco.

### Fora do escopo

- Editar valor/descrição em massa (campos individuais por lançamento).
- Edição inline célula a célula.
- Edição em massa em Despesas/Comissões (pode ser replicado depois se desejar).