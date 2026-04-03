

# Adicionar Margens e Receita por Vendedor/Operadora ao Dashboard

## O que sera feito

### 1. Margem Bruta e Margem Liquida (cards)
- **Margem Bruta** = Faturamento - Despesas Variaveis. Percentual = (Margem Bruta / Faturamento) * 100
- **Margem Liquida** = Faturamento - Total Despesas (fixas + variaveis). Percentual = (Margem Liquida / Faturamento) * 100
- Adicionar 2 novos cards na grade de resumo mostrando valor absoluto e percentual

### 2. Receita por Vendedor (grafico de barras ou tabela)
- Agrupar receitas do periodo pelo `vendedor_id`, resolver nome via join ja existente (receitas faz select com vendedores)
- Mostrar um BarChart horizontal ou tabela rankeada com nome do vendedor e total de receita

### 3. Receita por Operadora (grafico de pizza ou barras)
- Agrupar receitas do periodo pelo `operadora_id`, resolver nome via join ja existente
- Mostrar PieChart ou BarChart com distribuicao por operadora

## Arquivo alterado

### `src/pages/Dashboard.tsx`
- Calcular `margemBruta` e `margemLiquida` a partir dos dados ja carregados (receitas, despesas, custosFixos, custosVariaveis)
- Adicionar 2 cards de margem na grade de resumo (expandir grid para acomodar)
- Adicionar secao "Receita por Vendedor" com BarChart agrupando receitas por vendedor
- Adicionar secao "Receita por Operadora" com PieChart agrupando receitas por operadora
- Importar `useOperadoras` do hook (ja existe) para resolver nomes de operadoras

Nenhuma alteracao de banco de dados necessaria — todos os dados ja estao disponiveis nos hooks existentes.

## Detalhes tecnicos
- Receitas ja trazem `vendedores` e `operadoras` via select join nos hooks
- Margens calculadas client-side a partir dos totais existentes
- Graficos usam `recharts` (ja instalado)

