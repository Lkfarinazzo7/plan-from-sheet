## Contratos (atual)

Aba criada com tabela `contratos` (RLS por user_id). Campos: nome, operadora, unidade, data_implantacao, valor_contrato, 3 slots de comissão (Sup A, Sup B via `supervisores`; Corretor via `vendedores`) com percentual, valor e checkbox "pago".

Comissão: ao mudar % ou valor do contrato, valor R$ é recalculado automaticamente; usuário pode sobrescrever o R$.

UI: filtros (operadora, unidade, supervisor, mês, status pago/pendente), cards de resumo, checkbox inline na tabela para marcar como pago sem abrir o form.

Propostas: removidas da UI (sidebar, rota, página). Tabela `propostas` e `receitas.proposta_id` mantidas no banco.
