

# Ajustes no Dashboard: Filtro por Período e Rankings de Comissões

## O que muda

### 1. Botão de período personalizado no Dashboard
- Adicionar um botão "Período" ao lado do seletor de mês/ano existente
- Ao clicar, abre um popover com dois campos de data (início e fim) para selecionar um intervalo personalizado
- Quando um período personalizado estiver ativo, o seletor de mês fica desabilitado e aparece o intervalo selecionado
- Botão para limpar o filtro e voltar ao modo mensal

### 2. Rankings puxando da tabela de comissões (não receitas)
- Substituir a query de receitas por comissões no cálculo dos rankings
- Criar hook `useComissoes` com suporte a date range (startDate/endDate) além de month/year

### 3. Dois rankings separados
- **Ranking por Valor de Contrato (Proposta)**: nome do vendedor, quantidade de contratos, valor total de propostas, ticket medio
- **Ranking por Valor Recebido**: nome do vendedor, quantidade de contratos com recebimento, valor total recebido, ticket medio

## Arquivos alterados

### `src/hooks/useFinancialData.ts`
- Adicionar versão de `useComissoes`, `useReceitas` e `useDespesas` que aceite date range (startDate, endDate strings) como alternativa a month/year
- Isso permite que o Dashboard passe datas exatas quando o usuario selecionar periodo personalizado

### `src/pages/Dashboard.tsx`
- Adicionar estado para modo de filtro: "mensal" ou "periodo"
- Adicionar botão "Periodo" com popover contendo dois date inputs
- Quando em modo periodo, passar startDate/endDate para os hooks ao inves de month/year
- Remover o ranking atual baseado em receitas
- Adicionar dois cards de ranking:
  1. "Ranking por Valor de Contrato" - usa `comissoes.valor_proposta`, mostra qtd contratos, total, ticket medio
  2. "Ranking por Valor Recebido" - usa `comissoes.valor_recebido`, mostra qtd contratos, total, ticket medio

### `src/components/MonthYearPicker.tsx`
- Sem alteracoes, o botao de periodo sera adicionado diretamente no Dashboard

## Detalhes tecnicos
- O hook `useComissoes` sera adaptado para aceitar `startDate`/`endDate` opcionais como alternativa a month/year
- Os hooks `useReceitas` e `useDespesas` tambem serao adaptados da mesma forma
- O popover de periodo usa dois `<Input type="date" />` para simplicidade
- Os rankings calculam ticket medio como `total / quantidade`

