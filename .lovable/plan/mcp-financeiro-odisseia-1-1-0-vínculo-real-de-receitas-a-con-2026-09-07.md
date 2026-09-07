# MCP Financeiro Odisseia 1.1.0 — vínculo real de receitas a contratos

Hoje a ligação entre um contrato e suas receitas é feita comparando textos (o nome do contrato com a descrição do lançamento), e o botão "Vincular" apenas renomeia as receitas. Este trabalho troca isso por um vínculo real por identificador, e amplia o assistente (MCP) com quatro novas consultas de contratos.

## 1. Banco de dados (migration)

- Nova coluna `receitas.contrato_id` (opcional). `proposta_id` permanece.
- `UNIQUE (user_id, id)` em `contratos` e chave estrangeira composta `receitas(user_id, contrato_id) -> contratos(user_id, id)` com `ON DELETE RESTRICT` — impede vincular contrato de outro usuário.
- Índices: `receitas(user_id, contrato_id, data DESC, id)` e, em `contratos`, `(user_id, data_implantacao)`, operadora, corretor, supervisores A/B e unidade.
- Backfill conservador: preenche `contrato_id` só quando existe **exatamente um** contrato do mesmo usuário com nome igual (trim/lower) à descrição e campos compatíveis (operadora igual quando cadastrada; corretor/vendedor e unidade compatíveis quando ambos preenchidos). Sem correspondência aproximada; ambíguos ficam vazios.
- View `contratos_financeiro` com `security_invoker = true`, agregando exclusivamente por `receitas.contrato_id`.
- Tipos regenerados após a migration.

## 2. Métricas canônicas (compartilhadas por view, MCP e tela)

- `producao = valor_contrato` (`producao_fonte = "contratos.valor_contrato"`).
- `receita_prevista` = soma de todas as receitas ligadas; `recebida` = status Recebido; `pendente` = Aguardando.
- `percentual` = null quando prevista = 0, senão recebida/prevista*100.
- Comissão por slot: 0 sem pessoa; senão valor salvo (>0); senão `valor_contrato * percentual / 100`; senão 0. Considerada paga apenas com a marcação de pago.
- Saídas: `comissoes_pagas_corretor`, `pagas_supervisores`, `pagas_total`, `previstas_total`, `pendentes`.
- `margem_bruta_corretora = recebida - pagas_total`; `margem_bruta_prevista = prevista - previstas_total`.
- Status financeiro derivado (não cadastral): `sem_lancamentos | aguardando | parcial | recebido`, exposto também como alias `status`.
- `parcela` sempre `null` (dado inexistente).

## 3. Novas ferramentas do assistente (somente leitura)

Registradas em `tools.ts` (`TOOL`, `TOOL_NAMES`, `READ_ONLY_TOOLS`), total 19, versão do servidor 1.1.0, com `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: false`.

- `listar_contratos` — todos os filtros opcionais (período de implantação, operadora, corretor, supervisor A ou B, unidade, status financeiro), `limit` 1..200 (default 50) e `offset`. Filtros aplicados antes da paginação; ordem data de implantação DESC NULLS LAST, depois id. Retorna `total/limit/offset/has_more`, dados cadastrais, métricas, comissões e margens, com números crus e campos `*_formatado`.
- `obter_contrato` — por `id`, valida acesso e devolve cadastro, resumo, comissões detalhadas e histórico de receitas ligadas por identificador (data DESC, id), com totais.
- `listar_receitas_por_contrato` — por `contrato_id`, apenas via `contrato_id`, com totais globais independentes da página.
- `relatorio_contratos` — mesmos filtros, `faixas_valor` opcional (default 0/1000/3000/5000/10000/20000, crescente), `base_pareto` (`receita_recebida` default, `receita_prevista`, `producao`), `limit/offset` só para os detalhes. Cálculos sobre todo o conjunto filtrado (leitura em lotes, sem teto de 1000): consolidados (quantidade, produção total/média/mediana, receita prevista/recebida/pendente e média, comissões pagas, margem), faixas meia-abertas `[atual, próxima)` com última infinita (qtd, % contratos, produção, receita recebida, % receita, margem), Pareto (ordem DESC pela base, desempate por contrato_id, participação e acumulado, `pareto_80` = menor prefixo que atinge 80% incluindo o cruzamento; total <= 0 → percentuais null e sem Pareto) e `qualidade_dados` (receitas visíveis sem contrato + avisos sobre status derivado, produção = valor do contrato, parcela indisponível e previsão baseada em lançamentos).

As 15 ferramentas atuais, `buscar_contrato` e o fluxo preparar/confirmar continuam intactos. `preparar_criacao_receita` passa a aceitar `contrato_id` opcional, validando o contrato do usuário e persistindo somente na confirmação; chamadas antigas seguem funcionando.

## 4. Aplicativo

- "Vincular receita" grava o `contrato_id` do contrato escolhido em vez de renomear a descrição.
- Resumos, linhas expansíveis e detalhes de Contratos passam a usar `contrato_id`; receitas sem vínculo continuam listadas como pendência.
- Criação/edição de receita aceita `contrato_id` opcional.

## 5. Segurança e escala

- Acesso sempre por RLS (view `security_invoker`) mais filtro explícito pelo usuário do token no MCP; `user_id` nunca é retornado.
- Filtros aplicados antes do `range`; leituras agregadas em lotes.

## 6. Testes

`FakeSupabase` passa a respeitar o início do `range`. Casos via protocolo MCP in-memory: 19 ferramentas exatas com schemas e annotations; listagem sem nome/id, filtros e offset; contratos homônimos com identificadores distintos sem mistura; os 4 estados financeiros; totais globais em `obter_contrato` e `listar_receitas_por_contrato`; comissão com valor salvo, fallback por percentual, pessoa nula e marcação de pago; relatório vazio, medianas par/ímpar, limites de faixas, margem negativa, Pareto com empates e total zero; receita sem contrato não atribuída e bloco de qualidade; regressão das ferramentas existentes; `preparar_criacao_receita` com `contrato_id` válido só efetiva após confirmação e rejeita inválido/de outro usuário.

Build, verificação de tipos/lint e a suíte completa são executados ao final. Nenhum lançamento real é criado ou alterado; `docs/MCP_FINANCEIRO_ODISSEIA.md` é atualizado com schemas, semântica e limitações.

## Detalhes técnicos

- Arquivos: `supabase/functions/odisseia-mcp/{tools,server,logic,index}.ts`, `src/test/{fakeSupabase,mcpServer.test}.ts`, `src/hooks/useFinancialData.ts`, `src/pages/Contratos.tsx`, `src/integrations/supabase/types.ts`, `docs/MCP_FINANCEIRO_ODISSEIA.md`.
- Migration em duas etapas na mesma execução: DDL (coluna, unique, FK composta, índices, view) seguida do backfill idempotente por correspondência exata única.
