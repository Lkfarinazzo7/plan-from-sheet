# Remoção de Propostas + Nova aba Contratos

## 1. Remover Propostas da UI (dados preservados no banco)

- **Sidebar** (`src/components/AppSidebar.tsx`): remover item "Propostas".
- **Rota** (`src/App.tsx`): remover `/propostas` e import de `Propostas`.
- **Arquivo** `src/pages/Propostas.tsx`: deletar.
- **Dashboard** (`src/pages/Dashboard.tsx`): remover KPIs "Ticket Médio Contrato" e "Ticket Médio Proposta", rankings "Proposta por Operadora" e "Proposta por Vendedor", e o uso de `usePropostas`.
- Tabelas `propostas` e coluna `receitas.proposta_id` permanecem no banco (preservadas).

## 2. Nova aba Contratos

### Banco — migration nova tabela `contratos`

Colunas:
- `nome` text not null
- `operadora_id` uuid (sem FK)
- `unidade_negocio` text
- `data_implantacao` date (dia/mês/ano completo, padrão YYYY-MM-DD local)
- `valor_contrato` numeric not null default 0
- `supervisor_a_id` uuid, `supervisor_a_percentual` numeric, `supervisor_a_valor` numeric, `supervisor_a_pago` boolean default false
- `supervisor_b_id` uuid, `supervisor_b_percentual` numeric, `supervisor_b_valor` numeric, `supervisor_b_pago` boolean default false
- `corretor_id` uuid (vendedor), `corretor_percentual` numeric, `corretor_valor` numeric, `corretor_pago` boolean default false
- `user_id` uuid not null, `created_at`, `updated_at`
- RLS: `auth.uid() = user_id` (igual receitas/despesas)
- Trigger `update_updated_at_column`

Os 3 slots de comissão usam `supervisores` (para A e B) e `vendedores` (para corretor) — totalmente dinâmico, sem nomes fixos.

### Página `src/pages/Contratos.tsx`

Layout no padrão de Despesas/Propostas:
- **Header**: título + busca + botão "Novo Contrato"
- **Filtros**: Operadora, Unidade, Supervisor, Mês de implantação, Status comissão (Todas / Pendentes / Pagas)
- **Tabela**: Nome | Operadora | Unidade | Implantação | Valor | Sup. A (R$ + ✓) | Sup. B (R$ + ✓) | Corretor (R$ + ✓) | Ações
  - Cada célula de comissão mostra valor calculado + checkbox inline para marcar como pago (toggle rápido sem abrir o form)
- **Form (Dialog)**:
  - Nome, Operadora (Select), Unidade (Select), Data de Implantação (date input), Valor do Contrato
  - Para cada uma das 3 comissões (Sup. A, Sup. B, Corretor): Select de pessoa + Input %; valor R$ calculado automaticamente quando % muda, mas editável manualmente (regra: se usuário tocar no R$, sobrescreve; se mexer no % depois, recalcula); checkbox "Já paguei"
- **Cards de resumo no topo** (opcional, mas recomendado): Total contratos, Total a pagar em comissões, Total já pago

### Hooks (`src/hooks/useFinancialData.ts`)

Adicionar: `useContratos`, `useCreateContrato`, `useUpdateContrato`, `useDeleteContrato` no padrão dos existentes (com join em `operadoras`, `supervisores`, `vendedores`).

### Navegação

- Adicionar "Contratos" na sidebar com ícone (ex: `FileSignature` ou `FileText`).
- Rota `/contratos` em `App.tsx`.

## Fora do escopo
- Importação/exportação Excel de contratos (pode ser pedido depois).
- Vínculo entre contratos e receitas (sem FK por enquanto).
- Dashboards/KPIs de contratos (não foram solicitados).
