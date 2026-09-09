# Edição em massa das Despesas igual à das Receitas

Hoje, nas Despesas, selecionar linhas abre um botão "Editar em massa" que exige preencher uma janela com vários campos e clicar em "Aplicar". Nas Receitas, a edição é feita direto numa barra de ações com botões rápidos. A ideia é deixar as Despesas exatamente com esse comportamento.

## Como vai ficar

Ao marcar uma ou mais despesas, aparece a mesma barra usada nas Receitas, com:

- Contador "X selecionada(s)"
- **Status** — aplica na hora: Pago, A pagar, Atrasado
- **Data** — escolhe a data e aplica
- **Categoria** — lista de categorias cadastradas, aplica ao escolher
- **Setor** — lista de setores, com opção "Nenhum"
- **Unidade** — lista de unidades, com opção "Nenhuma"
- **Excluir** — com confirmação antes
- **Limpar** — desmarca tudo

Cada escolha é aplicada imediatamente às linhas marcadas, com aviso de sucesso e a seleção sendo limpa em seguida — igual às Receitas.

A janela antiga "Editar em massa" sai de cena.

## Detalhes técnicos

- Em `src/pages/Despesas.tsx`: remover o diálogo `bulkOpen` e os estados `bulkStatus`/`bulkUnidade`/`bulkSetor`; manter `bulkData` para o popover de data. Criar `applyBulk(updates, label)` no mesmo formato de `Receitas.tsx` (mutação em lote, toast, `clearSelection()`).
- A seleção continua sendo limpa quando os filtros mudam, como já ocorre nas Receitas.
- Em `src/hooks/useFinancialData.ts`: adicionar `useBulkUpdateDespesa` e `useBulkDeleteDespesa` espelhando `useBulkUpdateReceita`/`useBulkDeleteReceita` (update/delete por `in('id', ids)` e invalidação das queries de despesas).
- Nenhuma mudança de banco de dados, de regras de negócio ou de qualquer outra tela.
