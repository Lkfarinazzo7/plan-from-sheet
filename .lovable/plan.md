

# Ordenacao, Grafico Comparativo e Dashboard de Custos

## 1. Ordenar lancamentos por data nas abas Receitas e Despesas

Os hooks `useReceitas` e `useDespesas` ja ordenam por data decrescente (`ascending: false`). Vou alterar para **ascendente** (data mais antiga primeiro) para que os lancamentos fiquem em ordem cronologica. Se preferir decrescente (mais recente primeiro), basta manter — mas o padrao mais intuitivo de "planilha" e crescente.

**Arquivos**: `src/hooks/useFinancialData.ts` — alterar `ascending: false` para `ascending: true` nos hooks `useReceitas` e `useDespesas`.

## 2. Grafico comparativo mensal de Receitas vs Despesas no Dashboard

Adicionar um grafico de barras (BarChart do Recharts, ja instalado) abaixo dos cards de resumo, mostrando os ultimos 6 meses com barras de Receitas (verde) e Despesas (vermelho) lado a lado.

**Dados**: Criar um hook `useMonthlyComparison` que busca receitas e despesas dos ultimos 6 meses (sem filtro de mes — busca pelo range de 6 meses), agrupa por mes/ano e retorna totais mensais.

**Arquivo**: `src/hooks/useFinancialData.ts` — novo hook `useMonthlyComparison`
**Arquivo**: `src/pages/Dashboard.tsx` — adicionar BarChart com os dados comparativos

## 3. Dashboard de Custos Fixos vs Variaveis

Adicionar um card/secao no Dashboard (ou abaixo do grafico comparativo) que mostra:
- Total de custos fixos do periodo
- Total de custos variaveis do periodo
- Grafico de pizza ou barras com a divisao Fixo/Variavel
- Detalhamento por categoria dentro de cada tipo

**Dados**: Ja disponivel nos dados de despesas (campo `tipo` = "Fixo" ou "Variável"). Basta agrupar os dados existentes.

**Arquivo**: `src/pages/Dashboard.tsx` — adicionar secao com cards de custos fixos/variaveis e grafico de pizza por tipo.

## Arquivos alterados

| Arquivo | Alteracao |
|---|---|
| `src/hooks/useFinancialData.ts` | Inverter ordenacao para ascendente; novo hook `useMonthlyComparison` |
| `src/pages/Dashboard.tsx` | Adicionar BarChart comparativo mensal e secao de custos fixos/variaveis |

## Detalhes tecnicos

- `useMonthlyComparison`: faz 2 queries (receitas e despesas) dos ultimos 6 meses, agrupa por `YYYY-MM` client-side
- BarChart usa `recharts` (ja instalado): barras agrupadas verde/vermelho por mes
- Custos fixos/variaveis: filtra `despesas` pelo campo `tipo`, mostra 2 cards + PieChart com divisao

