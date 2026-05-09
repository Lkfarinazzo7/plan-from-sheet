## Plano

### 1. Comissões — novos campos

**Banco** (migration):
- `comissoes`: adicionar `operadora_id uuid NOT NULL` (com default temporário para registros existentes — usar primeira operadora cadastrada), `supervisor_id uuid NULL`, `pct_vendedor numeric(5,2) NULL`, `pct_supervisor numeric(5,2) NULL`.
- Manter `comissao_vendedor` e `comissao_supervisor` (valores em R$) — agora podem ser calculados ou digitados.

**Form (`src/pages/Comissoes.tsx`)**:
- Novo Select **Operadora** (obrigatório) ao lado de Vendedor.
- Novo Select **Supervisor** (opcional) com lista de supervisores cadastrados (Welington / Bruno).
- Para Comissão Vendedor: dois inputs lado a lado — **% Vendedor** e **R$ Vendedor**. Digitar % calcula R$ automaticamente baseado em **Valor da Proposta**. Digitar R$ direto sobrescreve e zera %.
- Mesma mecânica para Comissão Supervisor (% e R$ baseados em Valor da Proposta).
- Coluna Operadora adicionada na tabela.

**Filtro**: novo filtro por Operadora (similar ao existente de Vendedor).

### 2. Comissões — colar print/texto (IA)

- Nova edge function `extract-comissoes` (espelho de `extract-receitas`) extraindo: `descricao`, `valor_proposta`, `valor_recebido`, `operadora_nome`, `vendedor_nome`, `supervisor_nome`, `data`. Configurada em `supabase/config.toml` com `verify_jwt = false`.
- Novo componente `src/components/comissoes/ComissaoPasteDialog.tsx` baseado em `ReceitaPasteDialog`: cola imagem ou texto, IA extrai linhas, lista editável com checkbox/seleção, botão "Importar selecionados".
- Botão "Colar print/texto" no header de Comissões (ao lado de Nova Comissão).
- Hook `useBulkCreateComissao` em `src/hooks/useFinancialData.ts`.

### 3. Despesas — campo Setor

**Banco** (migration):
- Tabela nova `setores_despesa (id, nome, ativo, created_at)` com RLS igual a `categorias_despesa`.
- Seed inicial: Pré-vendas, Vendas, Supervisão, Escritório, Administrativo, RH.
- Coluna `setor_id uuid NULL` em `despesas`.

**Cadastros (`src/pages/Cadastros.tsx`)**:
- Nova aba **Setores** (CRUD simples como Categorias/Operadoras).

**Despesas (`src/pages/Despesas.tsx`)**:
- Form: novo Select **Setor** (opcional, ordenado por nome).
- Tabela: nova coluna Setor.
- Filtro: novo filtro por Setor.
- Importação Excel: aceitar coluna "Setor" (match por nome, opcional).
- Edição em massa: incluir Setor entre os campos editáveis.
- Hook `useSetoresDespesa` em `useFinancialData.ts`.

### Fora de escopo
- Não recalcular comissões antigas com base em %.
- Não alterar Receitas/Dashboard/Pipeline.