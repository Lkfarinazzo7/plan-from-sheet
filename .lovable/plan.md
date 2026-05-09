## 1. Remover Comissões

- Apagar página `src/pages/Comissoes.tsx` e remover rota/menu em `App.tsx` e `AppSidebar.tsx`.
- Remover hooks de comissões em `src/hooks/useFinancialData.ts` (`useComissoes`, `useCreateComissao`, etc.).
- Migration: `DROP TABLE public.comissoes`.
- Remover referências em Dashboard (cards/rankings de comissão se houver).

## 2. Nova entidade Propostas

**Tabela `propostas`** (campos de domínio):
- `nome` (texto, único por usuário) — substitui o papel atual da descrição.
- `operadora_id`, `vendedor_id`, `unidade_negocio` — preenchidos automaticamente da primeira receita.
- `valor_proposta` (numeric) — soma inicial das receitas vinculadas (editável).
- `valor_contrato` (numeric, nullable) — campo manual em branco para o usuário preencher depois.

RLS: padrão "users manage their own" (igual a receitas).

**Auto-criação (na migration)**:
- Para cada `descricao` distinta em `receitas` por usuário, criar 1 proposta usando operadora/vendedor/unidade da primeira ocorrência.
- `valor_proposta` = SUM(valor) das receitas com aquela descrição.

**Vínculo em receitas**:
- Adicionar coluna `proposta_id uuid` (FK lógica) em `receitas`, NOT NULL após backfill.
- Backfill: `UPDATE receitas SET proposta_id = p.id FROM propostas p WHERE p.user_id = receitas.user_id AND p.nome = receitas.descricao`.
- A coluna `descricao` continua existindo (texto livre do lançamento), mas a UI passa a exigir seleção de proposta. Novos lançamentos selecionam proposta de um combobox; criar nova proposta inline também é possível.

## 3. Página Propostas (cadastro)

Nova rota `/propostas` no menu (perto de Cadastros):
- Tabela: Nome | Operadora | Vendedor | Unidade | Valor proposta | Valor contrato | Total recebido | Nº lançamentos | Ticket médio.
- "Total recebido" e "Nº lançamentos" calculados via agregação das receitas.
- Editar inline o `valor_contrato` (campo deixado vazio inicialmente).
- Criar/Editar/Excluir proposta em diálogo. Excluir só permitido se não houver receitas vinculadas.

## 4. Receitas (UI)

- Form de receita: campo "Descrição" vira combobox **Proposta** (busca + criar inline).
- Coluna "Descrição" da tabela passa a exibir o nome da proposta vinculada.
- Importação Excel/colar: se a descrição já existe como proposta, vincula; senão cria a proposta automaticamente com os dados da linha.

## 5. Dashboard

Remover:
- Cards/ranking "Ranking por valor de contrato".
- Card/ranking "Ranking de valor recebido".

Adicionar:
- KPI **Ticket médio de recebimento** = SUM(receitas.valor onde status='Recebido') / COUNT(DISTINCT proposta_id com pelo menos 1 recebimento) — no mesmo escopo do filtro de período atual.
- Mostrar ao lado dos KPIs existentes (Receitas, Despesas, Lucro, Margens).

## Detalhes técnicos

Migration única (em ordem):
```sql
CREATE TABLE public.propostas (...);  -- com RLS user_id
INSERT INTO propostas (user_id, nome, operadora_id, vendedor_id, unidade_negocio, valor_proposta)
  SELECT DISTINCT ON (user_id, descricao) ... FROM receitas;
ALTER TABLE receitas ADD COLUMN proposta_id uuid;
UPDATE receitas SET proposta_id = ... ;
ALTER TABLE receitas ALTER COLUMN proposta_id SET NOT NULL;
DROP TABLE public.comissoes;
```

Hooks novos em `useFinancialData.ts`: `usePropostas`, `useCreateProposta`, `useUpdateProposta`, `useDeleteProposta`, `usePropostaAggregates` (junta receitas).

Memória a atualizar: `mem://funcionalidades/receitas-e-comissoes` → renomear/refatorar para refletir Propostas e remoção de Comissões; atualizar Dashboard memo com novo ticket médio.

## Fora de escopo
- Histórico/log de alterações de proposta.
- Vinculação de propostas a despesas.