# Comissões viram despesas automaticamente (e o "pago" sincroniza)

## Como vai funcionar
- Ao salvar um contrato com comissão preenchida (Supervisor A, Supervisor B ou Corretor), o sistema cria sozinho uma despesa na categoria **Comissão**, uma para cada pessoa.
  - Descrição: `Comissão <papel> – <pessoa> – <contrato>` (ex.: "Comissão Corretor – Evelyn – LUMINI CENTRO INTEGRADO LTDA").
  - Valor: o valor da comissão (ou o percentual aplicado ao valor do contrato).
  - Data/vencimento: data de implantação do contrato; se estiver vazia, a data de hoje.
  - Status inicial: "A pagar" (ou "Pago" se a comissão já estiver marcada como paga).
  - Unidade do contrato é copiada para a despesa.
- Ao marcar a despesa como **Pago** em Despesas, a comissão fica marcada como paga em Comissões e Contratos — e vice-versa (marcar pago em Comissões deixa a despesa como Pago; desfazer volta para "A pagar").
- Se o valor, a pessoa ou a data da comissão mudar no contrato, a despesa ligada é atualizada (enquanto não estiver paga). Se a pessoa for removida, a despesa em aberto é excluída.
- Contratos antigos **não** geram despesas retroativas, para não duplicar as 68 despesas de comissão já lançadas manualmente.

## Detalhes técnicos
- Migração aditiva: `despesas.contrato_id` (uuid, nulo) e `despesas.comissao_papel` (`supervisor_a|supervisor_b|corretor`, nulo), índice único parcial em `(contrato_id, comissao_papel)` para nunca duplicar.
- Trigger `AFTER INSERT/UPDATE` em `contratos` cria/atualiza/remove a despesa vinculada (categoria Comissão `e16c7642…`, mesmo `user_id`).
- Trigger `AFTER UPDATE OF status` em `despesas` atualiza o `*_pago` do contrato; guarda contra loop via `pg_trigger_depth()`.
- Despesas paga/excluída manualmente: excluir a despesa limpa o vínculo, sem apagar a comissão.
- Frontend: invalidar queries de despesas após salvar contrato e de contratos após mudar status de despesa; badge "Comissão automática" na linha da despesa.
- Teste cobrindo: criação ao salvar, sem duplicar, sincronização pago nos dois sentidos.
