## 1. Página Propostas — filtros + mês de implantação

**Migration**: adicionar coluna `mes_implantacao date` (nullable) na tabela `propostas`. Guardamos como data sempre dia 01 (ex: 2026-05-01) para representar "mês/ano de implantação".

**UI Propostas**:
- Form (criar/editar): novo campo "Mês de Implantação" usando `<input type="month">` (formato YYYY-MM); converte para YYYY-MM-01 no save, e no load mostra YYYY-MM.
- Nova coluna "Implantação" na tabela exibindo "MM/YYYY" (ou "—" se vazio).
- Barra de filtros (semelhante a Despesas):
  - Busca por nome (já existe).
  - Operadora (select).
  - Vendedor (select).
  - Unidade (select com UNIDADES_NEGOCIO + "Sem unidade").
  - Mês de Implantação: select com opções `Todos`, `Sem mês`, e lista dinâmica de meses presentes (formato "Maio 2026", ordenado desc).
- Filtros ativos ganham o mesmo destaque visual usado em Despesas (border-primary, ring, bg).

## 2. Dashboard — novos KPIs de ticket médio

Após o card "Ticket Médio Recebido", adicionar dois cards:
- **Ticket Médio Contrato** = SUM(`valor_contrato`) / COUNT(propostas com `valor_contrato` not null), considerando propostas vinculadas a receitas no período/unidade ativos.
- **Ticket Médio Proposta** = SUM(`valor_proposta`) / COUNT(propostas), mesmo escopo.

Escopo: usa `proposta_id` distinto vindo das `receitas` filtradas (período + unidade). Necessita carregar todas as propostas via `usePropostas()` e cruzar pelos IDs presentes em `receitas`.

## 3. Dashboard — gráfico de despesas por categoria

Substituir o `PieChart` "Despesas por Categoria" por um `BarChart` horizontal (`layout="vertical"`):
- `YAxis dataKey="name" type="category"` (categorias),
- `XAxis type="number"` (valor com tickFormatter R$ k),
- Ordenado desc por valor,
- Barras coloridas por categoria usando `PIE_COLORS` (uma `<Cell>` por barra) ou cor única `hsl(var(--primary))`.

## 4. Dashboard — Proposta por Operadora e Proposta por Vendedor

Adicionar duas seções de ranking abaixo de "Receita por Operadora", no mesmo padrão visual:
- **Proposta por Operadora**: SUM(`valor_proposta`) agrupado pela operadora da proposta.
- **Proposta por Vendedor**: SUM(`valor_proposta`) agrupado pelo vendedor da proposta.

Escopo: propostas que têm pelo menos 1 receita no período/unidade ativos (consistente com o filtro do dashboard). Ordenadas desc.

## Detalhes técnicos

- `useFinancialData.ts`:
  - `usePropostas` já retorna joins com `operadoras`/`vendedores` (usado em Propostas.tsx) — reaproveitado no Dashboard.
  - `useCreateProposta`/`useUpdateProposta`: aceitar campo `mes_implantacao` opcional.
- `Propostas.tsx`: adicionar estados de filtros (`filterOperadora`, `filterVendedor`, `filterUnidade`, `filterMes`) e aplicar no `filtered` memo. Adicionar opção de mês via `<input type="month">` no dialog.
- `Dashboard.tsx`: importar `usePropostas`, calcular agregados a partir do conjunto `propostaIdsNoEscopo = new Set(receitas.map(r => r.proposta_id))`. Trocar pie → bar horizontal.
- Tipos do Supabase (`types.ts`) são regenerados automaticamente após a migration.

## Fora de escopo
- Filtro de "mês de implantação" no Dashboard.
- Backfill automático de `mes_implantacao` para propostas existentes (fica vazio até edição manual).
