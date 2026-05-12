## Adicionar campo "Observações" em Receitas e Despesas

### Banco de dados
- Migration: adicionar coluna `observacoes text` (nullable) nas tabelas `receitas` e `despesas`.

### Receitas (`src/pages/Receitas.tsx`)
- Adicionar campo `<Textarea>` "Observações" no formulário de criação/edição.
- Exibir indicador (ícone/tooltip) na linha da tabela quando houver observação, mostrando o conteúdo ao passar o mouse.
- Incluir `observacoes` no payload de create/update.

### Despesas (`src/pages/Despesas.tsx`)
- Mesmo tratamento: campo `<Textarea>` no formulário e indicador na tabela.

### Hooks (`src/hooks/useFinancialData.ts`)
- Atualizar tipos de `useCreateReceita`, `useUpdateReceita`, `useBulkCreateReceita`, `useCreateDespesa`, `useUpdateDespesa`, `useBulkCreateDespesa` para aceitar `observacoes?: string | null`.

### Fora do escopo
- Filtros por observação, exportação/importação Excel do campo (pode ser feito depois se desejar).
