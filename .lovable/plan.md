

# Ajustes em Despesas + Unidade de Negocio

## 1. Ajuste no filtro de Periodo (Despesas)

Reduzir as opcoes do Select de periodo para apenas 3:

- **Todo o mes** (padrao)
- **Esta semana** — sempre de **segunda a domingo** da semana atual (nao "ultimos 7 dias")
- **Personalizado** — abre dois date pickers (De / Ate) lado a lado, e filtra o intervalo selecionado

A logica de "esta semana" calcula a segunda-feira anterior (ou o proprio dia, se hoje for segunda) e o domingo seguinte, comparando com `d.data` em string `YYYY-MM-DD` local (sem UTC).

Remover as opcoes "Hoje", "Ultimos 7 dias" e "Ultimos 15 dias".

## 2. Unidade de Negocio (Odisseia / Socios)

### Banco
Adicionar coluna `unidade_negocio` (text, nullable) nas tabelas **`despesas`** e **`receitas`**. Lan\u00e7amentos antigos ficam com valor nulo ate serem editados.

### Lista fixa no codigo
Criar `src/lib/unidadesNegocio.ts` exportando:
```ts
export const UNIDADES_NEGOCIO = ['Odisseia', 'Socios'] as const;
```

### Despesas
- Novo campo **Unidade de Negocio** no formulario de criar/editar (Select com as duas opcoes + "Nenhuma")
- Novo filtro **Unidade** ao lado dos demais filtros
- Nova coluna na tabela exibindo a unidade
- Incluir no export Excel
- Botao Duplicar copia a unidade

### Receitas
- Mesmas mudancas: campo no form, filtro, coluna na tabela, export, duplicar

### Dashboard
- Adicionar Select global no topo: **Unidade de Negocio** (Todas / Odisseia / Socios)
- Filtra todos os indicadores, graficos e rankings ja existentes pela unidade selecionada
- Filtragem client-side sobre os dados ja carregados (ou ajustar queries para passar o filtro)

## 3. Edicao em massa em Despesas

### UI
- Adicionar coluna de **checkbox** no inicio da tabela (com checkbox no header para "selecionar todos os filtrados")
- Quando ha 1+ linhas selecionadas, aparece uma **barra de acoes flutuante** no topo da tabela com:
  - Texto "X selecionadas"
  - Botao **Editar em massa** (abre dialog)
  - Botao **Limpar selecao**

### Dialog de edicao em massa
Tres campos opcionais (so atualiza o que for preenchido):
- **Nova data** (date picker)
- **Novo status** (Pago / A pagar / Atrasado / Nao alterar)
- **Nova unidade** (Odisseia / Socios / Nao alterar)

Botao "Aplicar a X despesas" executa um `UPDATE` por linha selecionada via `updateDespesa.mutateAsync` (sequencial com Promise.all), invalida o cache e mostra toast de sucesso.

## Arquivos alterados

| Arquivo | Mudanca |
|---|---|
| `supabase/migrations/...` (nova) | `ALTER TABLE despesas ADD COLUMN unidade_negocio text` + mesmo em `receitas` |
| `src/lib/unidadesNegocio.ts` (novo) | Constante com as duas unidades |
| `src/pages/Despesas.tsx` | Filtro de periodo simplificado, picker personalizado, filtro de unidade, coluna unidade, campo no form, checkboxes de selecao, barra de acoes, dialog de edicao em massa, export incluindo unidade |
| `src/pages/Receitas.tsx` | Filtro de unidade, coluna, campo no form, export incluindo unidade |
| `src/pages/Dashboard.tsx` | Select global de unidade no topo + filtragem dos dados |
| `src/hooks/useFinancialData.ts` | Aceitar `unidade_negocio` em create/update de despesas e receitas |

## Observacoes tecnicas

- "Esta semana" usa a regra brasileira (segunda a domingo), calculada com `Date` local — sem `toISOString()`
- Filtro personalizado limita as opcoes do MonthYearPicker? Nao — quando "Personalizado" esta ativo, o intervalo escolhido prevalece sobre o mes/ano
- Edicao em massa usa o id de cada despesa selecionada e dispara updates paralelos com `Promise.all`
- Sem alteracoes nas RLS policies — coluna nova herda a policy existente da tabela

