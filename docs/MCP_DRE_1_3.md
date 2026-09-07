# MCP Financeiro — categorias, lançamentos e DRE 1.3

## Estado desta entrega

O código identifica o servidor como `financeiro-odisseia`, versão `1.3.0`, com **30 ferramentas** em `supabase/functions/odisseia-mcp/tools.ts`.

Este documento descreve o código e os testes locais. **Não constitui comprovação de deploy, atualização do schema no ChatGPT ou execução de mudanças em dados reais.** A verificação do endpoint e a descoberta autenticada após o deploy estão pendentes nesta revisão do documento. Nenhum cancelamento de seguro ou reclassificação histórica é declarado como executado aqui.

Os exemplos usam nomes e UUIDs fictícios. Substitua-os pelos identificadores obtidos nas consultas do ambiente autorizado.

## Fluxo de alteração

1. Consultar os registros e cadastros atuais.
2. Chamar a ferramenta `preparar_*` adequada.
3. Apresentar a prévia e o impacto ao usuário. A preparação grava somente uma operação pendente; não altera o cadastro ou lançamento alvo.
4. Após confirmação explícita, chamar `confirmar_operacao` com o `confirmation_id` retornado.
5. Consultar `obter_operacao` e o registro para verificar o resultado.

Operações expiram em dez minutos. Se qualquer registro tiver mudado depois da preparação, a confirmação exige nova prévia. Um lote utiliza uma única confirmação, com até 200 itens; falha de um item reverte o lote inteiro. Uma operação executada não pode ser executada novamente nem reaberta.

`cancelar_operacao` descarta uma preparação pendente. Não cancela um lançamento financeiro. Para isso existe `preparar_cancelamento_lancamento`.

## Grupos e campos independentes

| Valor de `grupo_dre` | Uso gerencial |
| --- | --- |
| `receita_operacional` | Receita operacional |
| `deducoes_receita` | Deduções da receita |
| `custos_variaveis` | Custos variáveis, antes da margem de contribuição |
| `despesas_fixas` | Despesas fixas |
| `despesas_comerciais` | Despesas comerciais |
| `resultado_financeiro` | Receitas financeiras, juros e encargos |
| `depreciacao_amortizacao` | Apropriação de depreciação/amortização |
| `tributos_lucro` | Tributos sobre o lucro |
| `fora_dre` | Principal de empréstimos, investimentos e demais movimentos sem efeito no DRE |

Categoria, subcategoria, setor, unidade de negócio, `tipo` (`Fixo`/`Variável`) e `recorrente` são campos independentes. O cálculo usa o grupo do DRE, não converte automaticamente `tipo` em classificação. Subcategoria com grupo próprio prevalece sobre o grupo da categoria; `grupo_dre: null` na subcategoria restaura a herança.

Categorias e subcategorias são cadastros compartilhados. Criar ou editar exige papel `admin` ou `gestor`. A prévia de mudança mostra o impacto global agregado: quantidade, valor, liquidações, usuários afetados e intervalo de datas. Não retorna registros ou identificadores de outros usuários. Inativar preserva referências históricas e impede novos vínculos. Uma subcategoria referenciada não pode ser movida de modo a deixar categoria e subcategoria incompatíveis.

## Parâmetros comuns

- **Período:** `mes?` (1–12) com `ano?` (2000–2100), ou `data_inicio?` com `data_fim?`, em datas reais `YYYY-MM-DD`. Relatórios exigem um período válido.
- **Unidade:** `unidade?`; `none` representa ausência de unidade. As ferramentas de contratos usam `unidade_negocio?`.
- **Página:** `limit?` (1–200, padrão 50), `offset?` (a partir de zero).
- **Filtros de lançamentos:** período, unidade, página, `status?`, `categoria?`, `subcategoria?`, `setor?`, `responsavel?`, `busca?`, `incluir_cancelados?` (padrão `false`). Categoria/subcategoria/setor aceitam busca por nome; `setor: "none"` consulta ausência de setor. O período dessas listagens usa a data legada `data`; os relatórios de regime usam as datas específicas descritas abaixo.
- **Filtros de contratos:** `data_implantacao_inicio?`, `data_implantacao_fim?`, `operadora?`, `corretor?`, `supervisor?`, `unidade_negocio?`, `status?` (`sem_lancamentos`, `aguardando`, `parcial`, `recebido`). O status é financeiro e derivado das receitas vinculadas.

Nos quadros, `?` indica campo opcional. Campos de alteração omitidos são preservados. `null` limpa somente campos explicitamente anuláveis, respeitando as restrições do banco e de preservação de pagamentos.

## As 30 ferramentas

### Leitura — 16 ferramentas

| Ferramenta | Parâmetros |
| --- | --- |
| `consultar_dashboard` | Período, unidade |
| `gerar_dre` | Período, unidade, `setor?`, `regime?`, `usar_data_legada?`, `usar_classificacao_legada?` |
| `gerar_dre_competencia` | Mesmos parâmetros e motor de `gerar_dre` |
| `consultar_fluxo_caixa` | Período, unidade, `setor?`, `visao?`: `realizado` ou `projetado` |
| `listar_receitas` | Filtros de lançamentos, `vendedor?`, `operadora?` |
| `listar_despesas` | Filtros de lançamentos, `tipo?` |
| `buscar_contrato` | `id?`, `nome?`, página; exige `id` ou `nome` |
| `listar_contratos` | Filtros de contratos, página; não exige nome nem ID |
| `obter_contrato` | `id` UUID |
| `listar_receitas_por_contrato` | `contrato_id` UUID, página |
| `relatorio_contratos` | Filtros de contratos, página, `faixas_valor?` (cortes crescentes), `base_pareto?`: `receita_recebida`, `receita_prevista` ou `producao` |
| `consultar_comissoes` | Período, unidade, `pessoa?`, `situacao?`: `pago`, `pendente` ou `todos`, página |
| `listar_cadastros` | `tipo`: `vendedores`, `operadoras`, `categorias`, `setores` ou `supervisores`, página |
| `listar_categorias` | `incluir_inativas?` (padrão `false`), `incluir_subcategorias?` (padrão `true`), `grupo_dre?`, `sem_grupo?` |
| `listar_series` | `apenas_ativas?` (padrão `false`), `tipo?`: `receita` ou `despesa` |
| `obter_operacao` | `confirmation_id` UUID |

`listar_despesas` continua retornando `tipo`, além de categoria/subcategoria, grupo efetivo, setor/unidade, datas explícitas, cancelamento, recorrência, série e versão. As receitas por contrato usam `contrato_id`, sem associação por semelhança do nome. Cancelados ficam fora dos agregados financeiros e podem ser consultados explicitamente para revisão histórica.

### Preparação — 12 ferramentas

| Ferramenta | Parâmetros |
| --- | --- |
| `preparar_criacao_receita` | `data`, `descricao`, `categoria` (categoria legada textual da receita), `operadora`, `vendedor`, `valor`; `status?`, `unidade_negocio?`, `observacoes?`, `contrato_id?` |
| `preparar_criacao_despesa` | `data`, `descricao`, `categoria` (nome cadastrado), `tipo`: `Fixo` ou `Variável`, `valor`; `status?`, `setor?`, `responsavel?`, `unidade_negocio?`, `recorrente?`, `observacoes?` |
| `preparar_alteracao_lancamento` | `tipo_lancamento`, `id` e ao menos um campo da seção seguinte |
| `preparar_alteracao_lote` | `itens` (1–200 objetos com o mesmo schema de alteração individual), `motivo?` |
| `preparar_marcacao_status` | `tipo_lancamento`, `id`, `novo_status` |
| `preparar_cancelamento_lancamento` | `tipo_lancamento`, `id`, `motivo` (3–500 caracteres) |
| `preparar_criacao_categoria` | `nome` (1–120 caracteres), `grupo_dre`, `ativo?` (padrão `true`) |
| `preparar_alteracao_categoria` | `id`; `nome?`, `grupo_dre?`, `ativo?` |
| `preparar_criacao_subcategoria` | `categoria_id`, `nome`; `grupo_dre?` anulável, `ativo?` |
| `preparar_alteracao_subcategoria` | `id`; `nome?`, `categoria_id?`, `grupo_dre?` anulável, `ativo?` |
| `preparar_criacao_serie` | `nome`, `tipo`: `receita` ou `despesa`, `lancamento_ids` (1–200 UUIDs); `unidade_negocio?`, `categoria_id?`, `subcategoria_id?`, `setor_id?` anuláveis |
| `preparar_encerramento_serie` | `serie_id`, `encerrada_em`, `motivo` (3–500 caracteres) |

As ferramentas existentes de criação conservam seus parâmetros. Os novos campos completos podem ser definidos pela alteração individual ou em lote; a criação não inventa competência ou data efetiva ausente.

### Execução e descarte — 2 ferramentas

| Ferramenta | Parâmetros e efeito |
| --- | --- |
| `confirmar_operacao` | `confirmation_id`: executa o plano persistido em uma transação após confirmação explícita |
| `cancelar_operacao` | `confirmation_id`: descarta uma operação ainda pendente |

## Alteração individual e em lote

Obrigatórios: `tipo_lancamento: "receita" | "despesa"`, `id: UUID`.

Campos opcionais:

| Campo | Regra |
| --- | --- |
| `data` | Data legada; não substitui competência ou data efetiva |
| `descricao` | Texto não vazio, até 300 caracteres |
| `valor` | Número não negativo, sujeito à preservação de liquidações históricas |
| `status` | Despesa: `Pago`, `A pagar`, `Atrasado`; receita: `Recebido`, `Aguardando` |
| `categoria_id`, `categoria` | UUID ou nome resolvido de categoria; não enviar alternativas conflitantes |
| `subcategoria_id`, `subcategoria` | UUID ou nome; deve pertencer à categoria resultante |
| `setor_id`, `setor` | UUID ou nome do setor; anulável |
| `unidade_negocio`, `responsavel` | Textos anuláveis |
| `observacoes` | Texto anulável de até 2.000 caracteres |
| `competencia` | Data de reconhecimento no DRE; anulável |
| `vencimento` | Data usada no projetado; anulável |
| `data_efetiva` | Pagamento de despesa ou recebimento de receita; anulável quando não apaga liquidação histórica |
| `recorrente` | Booleano; encerrar uma série utiliza a ferramenta específica |
| `tipo` | Somente despesa: `Fixo` ou `Variável` |
| `operadora`, `vendedor` | Somente receita; nomes resolvidos nos cadastros |

O banco preserva o UUID. Categoria/subcategoria/setor não são reconstruídos a partir da descrição. Alterações de classificação, tipo ou observações de pagamentos existentes continuam possíveis; cancelar, excluir, zerar ou reabrir uma liquidação para apagar seu histórico é recusado. A data efetiva pode receber uma correção explícita válida, mas não é automaticamente preenchida nem apagada de um pagamento conhecido.

### Exemplo: alteração apenas de tipo

Primeiro, preparar:

```json
{
  "name": "preparar_alteracao_lancamento",
  "arguments": {
    "tipo_lancamento": "despesa",
    "id": "00000000-0000-4000-8000-000000000001",
    "tipo": "Fixo"
  }
}
```

A resposta contém `confirmation_id`, `status: "pending"` e a mudança `tipo: "Variável" → "Fixo"` quando esse for o estado atual. Depois de mostrar a prévia e obter confirmação explícita, usar o ID realmente retornado:

```json
{
  "name": "confirmar_operacao",
  "arguments": {
    "confirmation_id": "00000000-0000-4000-8000-000000000010"
  }
}
```

### Exemplo: reclassificação em lote

```json
{
  "name": "preparar_alteracao_lote",
  "arguments": {
    "motivo": "Mapeamento gerencial revisado pelo responsável",
    "itens": [
      {
        "tipo_lancamento": "despesa",
        "id": "00000000-0000-4000-8000-000000000001",
        "categoria_id": "00000000-0000-4000-8000-000000000101",
        "subcategoria_id": null
      },
      {
        "tipo_lancamento": "despesa",
        "id": "00000000-0000-4000-8000-000000000002",
        "categoria_id": "00000000-0000-4000-8000-000000000102",
        "tipo": "Variável"
      }
    ]
  }
}
```

Revisar a prévia item a item e confirmar uma única vez com o ID da operação. Se uma categoria, versão ou permissão for inválida, nenhuma alteração do lote é aplicada.

### Exemplos: categoria, cancelamento e encerramento

```json
{"name":"preparar_criacao_categoria","arguments":{"nome":"Serviços demonstrativos","grupo_dre":"despesas_fixas"}}
```

```json
{"name":"preparar_alteracao_categoria","arguments":{"id":"00000000-0000-4000-8000-000000000101","ativo":false}}
```

```json
{"name":"preparar_cancelamento_lancamento","arguments":{"tipo_lancamento":"despesa","id":"00000000-0000-4000-8000-000000000002","motivo":"Registro de exemplo confirmado como indevido"}}
```

```json
{"name":"preparar_encerramento_serie","arguments":{"serie_id":"00000000-0000-4000-8000-000000000201","encerrada_em":"2026-09-01","motivo":"Encerramento explícito sem renovação automática"}}
```

Cada exemplo gera sua própria operação pendente e exige confirmação posterior. Encerrar uma série bloqueia novas ocorrências; não cancela automaticamente parcelas existentes e não altera pagamentos anteriores.

## DRE e caixa

`gerar_dre` e `gerar_dre_competencia` usam o mesmo motor, também compartilhado com a interface. `regime` aceita `competencia` (padrão), `realizado` ou `projetado`.

| Visão | Registros e data usados |
| --- | --- |
| DRE por competência | Lançamentos classificados com `competencia` no período, independentemente da liquidação |
| Realizado | Lançamentos liquidados, na data efetiva de pagamento/recebimento |
| Projetado | Lançamentos explicitamente abertos, pelo `vencimento` |

O fluxo de caixa inclui investimentos e principal de empréstimos, mesmo classificados em `fora_dre`. Seu relatório separa vencidos anteriores e mantém pendências de qualidade. Cancelados e status desconhecidos não entram silenciosamente como valores previstos.

O cálculo gerencial segue:

```text
Receita operacional − deduções = receita líquida
Receita líquida − custos variáveis = margem de contribuição
Margem de contribuição − despesas fixas − despesas comerciais
    − depreciação/amortização = resultado operacional
Resultado operacional + resultado financeiro = resultado antes dos tributos sobre lucro
Resultado antes dos tributos − tributos sobre lucro = resultado líquido
```

Receitas financeiras aumentam o resultado financeiro; juros/encargos de despesas o reduzem. Movimentos `fora_dre` não afetam o resultado. A classificação determina a posição: `tipo` e recorrência não alteram automaticamente o grupo.

Ausência de data ou grupo produz pendências com contagem e valor. Percentuais sem base positiva são `null`. `usar_data_legada` e `usar_classificacao_legada` são opções explícitas de compatibilidade, desligadas por padrão; não gravam dados nem comprovam a competência correta. Consultas normais devem manter ambas desligadas.

```json
{"name":"gerar_dre_competencia","arguments":{"mes":8,"ano":2026,"regime":"competencia","unidade":"Unidade demonstrativa","setor":"Comercial"}}
```

```json
{"name":"consultar_fluxo_caixa","arguments":{"mes":9,"ano":2026,"visao":"projetado","unidade":"Unidade demonstrativa"}}
```

Compras de ativos podem ser classificadas como `fora_dre`; a apropriação de depreciação utiliza lançamentos explícitos no grupo correspondente. Esta versão não presume vida útil, valor residual, cronograma de depreciação, juros ou quantidade de parcelas de empréstimo.

## Recorrências e segurança no banco

A migração aditiva `20260907183000_mcp_atomic_confirmation.sql`:

- executa confirmação, alterações e auditoria na mesma transação;
- mantém plano/prévia imutáveis e armazena o resultado separadamente em `mcp_operacoes.resultado`;
- valida proprietário, papéis, ferramenta, tabelas, campos, referências e versão de cada registro;
- aplica os defaults reais do banco nas criações;
- incrementa versão em alterações do MCP e da interface;
- impede replay, reabertura de operação executada e adulteração direta do status;
- protege liquidações e referências históricas;
- não executa reclassificação ou preenchimento retroativo de datas.

As RPCs internas não ampliam o schema para além das 30 ferramentas:

| RPC | Finalidade |
| --- | --- |
| `mcp_executar_operacao(_op_id uuid)` | Confirma o plano persistido; retorna `{ok,itens,antes,depois}` |
| `mcp_impacto_categoria(_categoria_id uuid,_subcategoria_id uuid DEFAULT NULL)` | Impacto global agregado, restrito a admin/gestor |
| `gerar_ocorrencias_recorrentes(_source_inicio date,_source_fim date,_target_inicio date)` | Geração explicitamente solicitada pela interface |

A geração usa séries reais por UUID. Série encerrada não renova; registros antigos sem série e séries com mais de uma origem no período são sinalizados para revisão. Uma origem mensal inequívoca gera o mês de destino com os campos atuais da série, preservando o original. O dia é limitado ao último dia do mês; competência e pagamento ficam ausentes até informação explícita. A ocorrência tem unicidade no banco. Nenhuma identidade de série é deduzida pelo texto.

## Validação executada e pendente

Foram aprovados **46 testes SQL independentes** em PostgreSQL embutido PGlite, com dados sintéticos e autenticação normal sem bypass de RLS. A suíte aplicou as migrações anteriores e a correção aditiva. Cobriu criação nas cinco tabelas, rollback individual/lote, versões obsoletas, auditoria, resultado separado, imutabilidade, replay, permissões, categorias/subcategorias, vínculos por usuário/tipo, cancelamento, preservação de pagamentos, encerramento/ocorrência de séries, geração ambígua e impacto agregado global.

Um teste adicional reaplicou integralmente a migração e confirmou que nenhum lançamento, cadastro, operação ou registro de auditoria mudou: **47 testes aprovados no total**. A migração pode ser reaplicada pelo fluxo de implantação sem repetir alterações de dados. SHA-256 do arquivo verificado: `D716ED0A0E2C8914C4641CDF8B898311A4A7A92FBCD30C54938B4F120C82C7F1`.

| Verificação local | Resultado |
| --- | --- |
| Suíte completa de código/protocolo | 173/173 testes aprovados em 10 arquivos |
| Build da aplicação | Aprovado |
| TypeScript da aplicação | Aprovado |
| PostgreSQL isolado | 46 cenários funcionais + 1 reaplicação da migração: 47/47 aprovados |
| Endpoint e schema efetivamente publicados | Pendente de verificação após deploy |

Esse resultado não comprova concorrência entre sessões independentes, o transporte publicado ou o ambiente completo do Supabase. Os testes de código/schema do repositório podem ser executados com `npm test`; a auditoria SQL independente é evidência separada. Não executar testes destrutivos em produção.

Pendente após o deploy:

1. Confirmar a versão `1.3.0` no endpoint MCP utilizado pelo conector.
2. Executar descoberta autenticada `tools/list` e contar 30 ferramentas.
3. Verificar explicitamente `tipo`, datas, categoria/subcategoria e demais campos novos no schema de alteração, além das ferramentas de categorias/lote/séries.
4. Fazer consultas de leitura e testes de confirmação em ambiente isolado ou registros sintéticos autorizados; comprovar prévia sem alteração, mesma UUID após execução e replay sem duplicação.
5. Atualizar a lista de ferramentas no cliente. Só se a descoberta continuar antiga após o servidor estar correto, atualizar/reconectar o conector conforme a interface do cliente. Reconexão não substitui deploy nem corrige schema antigo no servidor.

## Publicação pelo fluxo conectado

No fluxo GitHub já conectado, mudanças da branch padrão podem sincronizar de volta ao Lovable. Conferir o commit sincronizado no editor antes de pedir ao Lovable para aplicar a migração revisada e publicar a Edge Function `odisseia-mcp`. A documentação oficial descreve a sincronização bidirecional e a capacidade do agente de escrever/publicar Edge Functions: [integração GitHub](https://docs.lovable.dev/integrations/github), [integração Supabase](https://docs.lovable.dev/integrations/supabase).

Este é um caminho de publicação disponível, não uma afirmação de que sincronizar o repositório já publicou o backend. Registrar o resultado do deploy e validar o endpoint separadamente. Se houver mudanças de interface, publicar também a versão atual do site pelo fluxo do projeto. Não adicionar tokens, credenciais ou URLs privadas a este documento ou ao repositório.
