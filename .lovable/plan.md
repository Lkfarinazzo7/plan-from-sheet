## Contratos (atual)

Tabela `contratos` com FKs para `operadoras`, `supervisores` (A e B) e `vendedores` (corretor) — `ON DELETE SET NULL`. Joins via PostgREST funcionam.

Comissão: ao mudar % ou valor do contrato, valor R$ é recalculado automaticamente; usuário pode sobrescrever o R$. Checkbox "pago" inline na tabela.

Filtros: operadora, unidade, supervisor, mês, status pago/pendente. Cards de resumo (valor total, comissões totais/pagas/pendentes).

Importação Excel: colunas `Nome, Operadora, Unidade, Data Implantação, Valor Contrato, Supervisor A, % Supervisor A, Supervisor B, % Supervisor B, Corretor, % Corretor, Observações`. Operadora/supervisor/corretor resolvidos por nome (case-insensitive). Comissões calculadas automaticamente do %, todas entram como pendentes.

Exportação Excel: baseada nos filtros ativos.

Despesas: campo `observacoes` em form, ícone na tabela, e agora também no import/export Excel.

Propostas: removidas da UI. Tabela `propostas` e `receitas.proposta_id` mantidas no banco.
