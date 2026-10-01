# Fazer as despesas recorrentes voltarem a ser geradas para o próximo mês

## Por que deu "0 geradas"

A geração de recorrentes agora só copia despesas que estão ligadas a uma "série" (o cadastro que diz "isto se repete todo mês"). As 48 despesas recorrentes de setembro/2026 são antigas e nenhuma está ligada a uma série. Só existe uma série no sistema: a do Seguro RC, que já está encerrada. Por isso nada foi gerado para outubro.

## O que vai mudar

1. **Ligar cada recorrente de setembro à sua própria série.** Cada uma das 48 despesas vira o modelo de uma série nova, com a mesma descrição, categoria, setor e unidade que já tem. Despesas que se repetem várias vezes no mês (Passagens, Orçamento Facebook, ADM) ganham uma série para cada linha, então o mês seguinte fica com as mesmas linhas, sem perder nenhuma e sem juntar nada. Nada é agrupado só por nome parecido.
2. **O Seguro RC encerrado fica de fora** e não volta a ser gerado.
3. **Corrigir a regra que trava ao copiar:** hoje uma série é ignorada se tiver mais de uma linha no mês. A regra passa a usar a linha mais recente da série como modelo.
4. **Depois disso, clicar em gerar outubro de novo** cria as recorrentes como esperado. Se outubro já tiver alguma delas, ela não é duplicada.

Valores, datas, status e pagamentos de setembro não mudam. Só ganham a ligação com a série.

## Detalhes técnicos

- Migração de dados: para cada `despesas` com `recorrente AND NOT cancelado AND serie_id IS NULL`, de 2026-09-01 a 2026-09-30, inserir `series_recorrencia` (tipo `despesa`, nome = descricao, categoria/subcategoria/setor/unidade da linha) e definir `serie_id` e `ocorrencia = data`. Fazer isso respeitando `versao` e os gatilhos de coerência.
- `gerar_ocorrencias_recorrentes`: trocar o bloqueio `sources<>1` pelo uso da origem mais recente (`ORDER BY data DESC LIMIT 1`).
- Na tela, o aviso "legado sem série" continua aparecendo para recorrentes antigas que ainda não estiverem ligadas a uma série.
