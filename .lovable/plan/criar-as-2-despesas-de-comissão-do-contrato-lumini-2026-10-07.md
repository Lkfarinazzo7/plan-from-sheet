# Criar as 2 despesas de comissão do contrato LUMINI

Contrato: LUMINI CENTRO INTEGRADO LTDA, implantado em 07/10/2026. Ele ainda não tem nenhuma despesa de comissão, então não vai sair nada repetido.

## O que vou fazer
1. "Tocar" o contrato sem mudar nenhum dado dele. Isso dispara a automação, que cria:
   - Comissão Corretor – Evelyn – LUMINI CENTRO INTEGRADO LTDA: R$ 1.028,14, A pagar, 07/10/2026
   - Comissão Supervisor A – Julia – LUMINI CENTRO INTEGRADO LTDA: R$ 128,52, A pagar, 07/10/2026
2. Conferir que as 2 despesas existem, na categoria Comissão e ligadas ao contrato. Não vou mexer no status de pago.

## Detalhes técnicos
- `UPDATE contratos SET updated_at = now() WHERE id = 'ec63ffe7-8118-47d8-81c8-081f7eec7446'` dispara `contratos_sync_comissoes`.
- Conferência com SELECT em `despesas` filtrando por `contrato_id`.
