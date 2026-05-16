## Resumo das alterações

Quatro frentes: **Setor em despesas**, **bug do filtro mensal no dashboard**, **Contratos por Corretor** e **melhorar visualização da aba Contratos**.

---

### 1. Setor em Despesas

O banco já tem a tabela `setores_despesa` e a coluna `despesas.setor_id` — falta apenas a UI.

- **Cadastros**: nova seção "Setores" (criar / editar / desativar), no mesmo padrão de Categorias/Operadoras.
- **Despesas**:
  - Novo campo **Setor** (select) no formulário de criação/edição.
  - Nova coluna **Setor** na tabela de lançamentos.
  - Novo **filtro por Setor** no topo (ao lado dos filtros existentes).
  - Suporte a Setor no **import e export Excel** (coluna "Setor", resolvida por nome case-insensitive).

### 2. Dashboard — Despesas por Setor

- Novo card "**Despesas por Setor**" (gráfico de barras horizontais, mesmo estilo do "Despesas por Categoria"), respeitando os filtros ativos (período + unidade).

### 3. Bug do Comparativo Mensal

O hook `useMonthlyComparison` hoje busca **todas** as receitas/despesas dos últimos 6 meses, sem filtrar por unidade. Por isso o gráfico não muda quando você troca a unidade no Dashboard.

- Adicionar parâmetro `unidade?: string` ao hook (incluído no `queryKey` para refetch).
- Aplicar `.eq('unidade_negocio', unidade)` quando definido.
- Dashboard passa `filterUnidade` para o hook.

### 4. Contratos — Contratos por Corretor

- Novo card "**Contratos por Corretor**" ao lado dos cards de Comissões por Supervisor / Corretor, mostrando para cada corretor:
  - Quantidade de contratos
  - Valor total dos contratos
  - (ordenado por valor desc)

### 5. Melhorar visualização da aba Contratos

A página hoje empilha muitos cards de resumo + 3 cards de breakdown por pessoa + barra de filtros densa + tabela larga. Proposta de reorganização (somente UI, sem mudar lógica):

- **Cards de resumo** (Valor total, Comissões totais/pagas/pendentes): agrupar em uma única faixa enxuta no topo, com tipografia menor e ícones discretos, em grid 4 colunas.
- **Breakdowns por pessoa** (Supervisor / Corretor — comissões + contratos): mover para dentro de um bloco **com abas** ("Supervisores", "Corretores", "Contratos por Corretor"), eliminando a parede de 3 cards lado a lado e ganhando densidade.
- **Filtros**: agrupar em uma "toolbar" com:
  - Linha 1: busca + botões de ação (Novo, Importar, Exportar, Edição em massa).
  - Linha 2: chips/selects de filtro (Operadora, Unidade, Supervisor, Corretor, Mês, Período livre, Status). Botão "Limpar filtros" quando algum estiver ativo.
- **Tabela**:
  - Cabeçalho fixo (sticky) ao rolar.
  - Linhas com hover mais claro e zebra sutil para reduzir confusão visual.
  - Agrupar colunas de comissão de cada pessoa em uma única célula compacta (`Nome · R$ valor · [pago]`), reduzindo a largura horizontal.

---

## Detalhes técnicos

- **DB**: nenhuma migração necessária (estrutura já existe). Apenas uso/UI.
- **Arquivos a editar**:
  - `src/pages/Despesas.tsx` — campo setor, filtro, coluna.
  - `src/pages/Cadastros.tsx` — seção Setores.
  - `src/pages/Dashboard.tsx` — passar unidade ao hook + card de setor.
  - `src/pages/Contratos.tsx` — card Contratos por Corretor + refactor de layout (toolbar + abas).
  - `src/hooks/useFinancialData.ts` — `useMonthlyComparison(unidade?)`, hooks de `setores_despesa` (CRUD), incluir `setor_id` em `DespesaInput` e nos selects.
  - `src/lib/importHelpers.ts` / `src/lib/exportHelpers.ts` — coluna "Setor" em Despesas.
- **Datas**: continuam em `YYYY-MM-DD` local (sem `toISOString`).
- **Realtime / RLS**: tabela `setores_despesa` já tem policy `authenticated manage`, ok.

## Fora do escopo
- Não vou mexer no schema do banco.
- Não vou redesenhar Receitas nem outras páginas — apenas Contratos (visualização) e Despesas (campo setor).