# Equipes, supervisores e ajustes no quadro de qualidade

## O que muda para você

### 1. Equipes cadastradas
- Supervisores ativos: Bruno, Júlia e Rhayssa. Welington fica desativado, com o histórico preservado.
- Corretores ativos: Caíque, Matheus, Breno, Evelyn, Gabriella, Renan e Brendon, além de Júlia, Rhayssa e Bruno, que também vendem. Kaick fica desativado. Leonardo também fica desativado, porque não apareceu na sua lista. Se ele ainda estiver na empresa, me avise.
- Montagem das equipes:
  - Equipe Bruno: Bruno, Caíque, Matheus e Breno
  - Equipe Júlia: Júlia, Evelyn e Gabriella
  - Equipe Rhayssa: Rhayssa, Renan e Brendon
- A venda de um supervisor conta para a própria equipe.
- Em Cadastros, uma nova aba "Equipes" permite trocar o corretor de equipe quando alguém entrar ou sair.

### 2. Resultado por equipe no Dashboard
Cada equipe ganha um mini-resultado:

```text
Receita da equipe
- Comissão dos corretores
- Comissão do supervisor
= Contribuição da equipe  (e margem %)
```

O mesmo quadro mostra a produção, a receita e a comissão por corretor de cada equipe.

### 3. Novos filtros no Dashboard
Entram os filtros "Equipe", "Supervisor" e "Corretor". Eles valem para os quadros de corretores e de equipes, que dependem dos contratos. Os quadros de DRE e caixa continuam filtrando só por unidade e setor, porque as despesas não pertencem a um corretor.

### 4. Comissões
Como você explicou, as despesas lançadas na categoria Comissão são as comissões, e são elas que entram no resultado. Por isso:
- Removo do quadro de qualidade o item "comissões sem vínculo", que estava confundindo.
- Os valores de comissão anotados nos contratos aparecem só nos quadros de corretor e de equipe, como referência, e nunca são somados ao resultado.

### 5. Lista de séries possivelmente duplicadas
O sistema procura despesas recorrentes que têm o mesmo nome e estão duplicadas, como duas séries "Passagem" ativas ao mesmo tempo. Isso pode gerar a mesma despesa duas vezes no mês. Hoje isso aparece só como um texto corrido no quadro. Vai mudar para:
- uma tabela com nome, valor e o último mês de cada série;
- um botão "Encerrar esta série" em cada linha. Ele só para de gerar meses futuros e não apaga nada do que já foi lançado.

## Detalhes técnicos
- Nova tabela `equipes` (nome, supervisor_id e ativo) e coluna `equipe_id` em `vendedores`. Cada uma terá GRANT, RLS para admin/gestor e gatilho de updated_at.
- Dados via SQL: inserir Júlia e Rhayssa em `supervisores`, desativar Welington, Kaick e Leonardo, inserir os corretores que faltam e vincular cada um à sua equipe. "Caíque" é cadastrado como uma pessoa diferente de "Kaick".
- `indicadoresPorCorretor` recebe `equipe_id`. A nova função `indicadoresPorEquipe` agrupa por equipe usando os valores de comissão já salvos nos contratos.
- Em `qualidadeFinanceira`, sai `comissoes_sem_vinculo` e o resultado de `seriesDuplicadas` passa a incluir valor e último mês. O encerramento usa o fluxo já existente de encerrar série (`ativa=false`, `encerrada_em`).
- Os filtros de equipe, supervisor e corretor ficam em `PainelExecutivo`.
- Testes novos para o agrupamento por equipe e para os filtros.
