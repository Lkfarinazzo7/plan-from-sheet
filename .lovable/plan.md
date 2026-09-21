# Liberar a exclusão de lançamentos pagos

Hoje o sistema recusa apagar qualquer lançamento marcado como Pago ou Recebido. É por isso que a despesa de 18/09/2026, "DAS", Impostos, Fixo, Odisseia, R$ 172,10, Pago (id `684a8ff9-698e-47af-9b36-3752ed28cbb5`) não pode ser excluída.

## O que muda

- A trava que impede excluir lançamentos pagos/recebidos é removida, tanto em despesas quanto em receitas.
- A partir daí, o botão de excluir funciona normalmente para qualquer lançamento, inclusive os já pagos.
- Lançamentos cancelados continuam protegidos contra exclusão, para preservar o histórico de cancelamentos.
- Nenhum dado é apagado por esta mudança. A exclusão do DAS fica por sua conta, pelo botão de excluir na tela de Despesas (ou eu apago na sequência, se preferir).

## Detalhes técnicos

- Migração ajustando `public.tg_protege_delete_liquidado`: remove as condições de status `Pago`/`Recebido` e de `data_pagamento`/`data_recebimento`, mantendo apenas o bloqueio de `cancelado`.
- Os gatilhos `despesas_protege_delete` e `receitas_protege_delete` permanecem, apenas com a regra mais branda.
- Nenhuma mudança em tabelas, colunas, RLS ou nas telas.

## Observação

Excluir um lançamento pago remove o valor de totais, DRE e fluxo de caixa de forma definitiva — não há desfazer.
