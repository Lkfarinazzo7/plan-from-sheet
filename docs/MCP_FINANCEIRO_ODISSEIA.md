# Servidor MCP — Financeiro Odisseia

Servidor MCP remoto (Streamable HTTP, stateless) que expõe os dados e ações financeiras do sistema
para ChatGPT, Codex e outros clientes MCP, usando o Supabase Auth do próprio projeto como
Authorization Server OAuth 2.1/OIDC. Todas as consultas passam pelo token do usuário, portanto o
RLS e o `user_id` são sempre respeitados. Nenhum secret, `service_role` ou senha é exposto.

## Endpoint

```
https://<PROJECT_REF>.supabase.co/functions/v1/odisseia-mcp
```

- `POST /` — endpoint MCP (JSON-RPC sobre Streamable HTTP). Requer `Authorization: Bearer <token>`.
- `GET /` — health check (`{"status":"ok","name":"financeiro-odisseia","version":"1.0.2"}`), sem dados sensíveis.
- `GET /.well-known/oauth-protected-resource` — metadata do recurso protegido:
  - `resource`: URL canônica da função
  - `authorization_servers`: `https://<PROJECT_REF>.supabase.co/auth/v1`
  - `scopes_supported`: `openid`, `email`, `profile`
- `OPTIONS` — CORS.

Sem token, o servidor responde **401** com `WWW-Authenticate: Bearer ... resource_metadata="..."`,
o que faz clientes MCP compatíveis iniciarem o fluxo OAuth automaticamente.

## Ferramentas

### Somente leitura (`readOnlyHint: true`)

| Tool | O que faz | Principais argumentos |
| --- | --- | --- |
| `consultar_dashboard` | Totais de receitas/despesas, saldo, recebido/pago/pendente e contagens | `mes`+`ano` ou `data_inicio`+`data_fim`, `unidade` |
| `gerar_dre` | DRE em cascata com despesas por `tipo_dre` e margens | período, `unidade` |
| `consultar_fluxo_caixa` | Entradas/saídas realizadas e previstas | período, `unidade`, `visao` (`realizado`\|`projetado`) |
| `listar_receitas` | Lista receitas | período, `status`, `unidade`, `vendedor`, `operadora`, `busca`, `limit`, `offset` |
| `listar_despesas` | Lista despesas | período, `status`, `unidade`, `categoria`, `setor`, `responsavel`, `tipo`, `busca`, `limit`, `offset` |
| `buscar_contrato` | Contrato por `id` ou `nome`, com comissões | `id` \| `nome`, paginação |
| `consultar_comissoes` | Comissões por supervisor/corretor | período, `pessoa`, `situacao` (`pago`\|`pendente`\|`todos`), `unidade` |
| `listar_cadastros` | Vendedores, operadoras, categorias, setores, supervisores | `tipo` |
| `obter_operacao` | Consulta uma operação MCP pelo `confirmation_id` | `confirmation_id` |

Paginação: `limit` padrão **50**, máximo **200**. Valores retornam como número + string BRL
(`{"valor": 1234.5, "valor_formatado": "R$ 1.234,50"}`) e datas como ISO + `DD/MM/AAAA`.
`user_id`, tokens e secrets nunca são retornados.

### Escrita com confirmação em duas etapas (`readOnlyHint: false`)

Não existe `create`/`update`/`delete` direto. O fluxo é sempre:

1. **`preparar_*`** — valida referências (operadora, vendedor, categoria, setor), lê o estado atual,
   monta o resumo antes/depois, grava uma operação **pendente** em `mcp_operacoes` e devolve
   `confirmation_id` + `expires_at`. **Nada é alterado nesta etapa.**
2. O assistente apresenta o resumo e obtém a **confirmação explícita** do usuário.
3. **`confirmar_operacao`** — executa uma única vez (reserva atômica no banco), registra
   antes/depois e impede replay.

Ferramentas: `preparar_criacao_receita`, `preparar_criacao_despesa`,
`preparar_alteracao_lancamento`, `preparar_marcacao_status`, `confirmar_operacao`,
`cancelar_operacao`.

Regras:
- Operações pendentes expiram em **10 minutos**.
- `confirmar_operacao` exige `confirmation_id` informado pelo usuário, status `pending` e não expirado.
- Uma operação já executada, cancelada, falhada ou expirada nunca é reexecutada.
- **Exclusão não é implementada nesta versão.**
- `user_id` (e qualquer token) é rejeitado se enviado como argumento — a identidade vem do token.

### Exemplos

```jsonc
// Dashboard de agosto/2026
{ "name": "consultar_dashboard", "arguments": { "mes": 8, "ano": 2026 } }

// DRE do ano, unidade Odisseia
{ "name": "gerar_dre", "arguments": { "data_inicio": "2026-01-01", "data_fim": "2026-12-31", "unidade": "Odisseia" } }

// Despesas pagas de um setor
{ "name": "listar_despesas", "arguments": { "mes": 8, "ano": 2026, "status": "Pago", "setor": "Pré-vendas", "limit": 100 } }

// Marcar receita como recebida (etapa 1)
{ "name": "preparar_marcacao_status", "arguments": { "tipo_lancamento": "receita", "id": "…uuid…", "novo_status": "Recebido" } }
// → { "confirmation_id": "…", "expires_at": "…", "resumo": "Alterar status de receita …" }

// Etapa 2, após o "sim" do usuário
{ "name": "confirmar_operacao", "arguments": { "confirmation_id": "…" } }
```

## Auditoria

Tabela `public.mcp_operacoes`: `tool_name`, `status` (`pending`/`executed`/`cancelled`/`expired`/`failed`),
`arguments`, `before_data`, `after_data`, `summary`, `error`, `expires_at`, `executed_at`.
RLS: cada usuário só acessa e só cria operações próprias, sem trocar `user_id`.
A confirmação usa a função SQL `public.mcp_claim_operacao` (SECURITY INVOKER, respeita RLS) para
garantir execução única e atômica.

## Consentimento OAuth

Rota `/oauth/consent` (protegida). Recebe `authorization_id` na query, exige sessão (senão vai para
`/login?returnTo=…`, com sanitização contra open redirect), busca os detalhes via
`supabase.auth.oauth.getAuthorizationDetails`, mostra cliente, redirect URI e escopos, e oferece
**Permitir** / **Negar** (`approveAuthorization` / `denyAuthorization`, redirecionando para `redirect_url`).

## Ações manuais necessárias (fora do código)

1. **Habilitar o OAuth 2.1 Server** no backend: Authentication → OAuth Server → habilitar.
2. **Authorization path**: definir como `/oauth/consent`.
3. **Dynamic Client Registration (DCR)**: habilitar, para que ChatGPT/Codex registrem o cliente sozinhos.
4. **JWT signing keys**: migrar de HS256 para **RS256 ou ES256** antes de usar o escopo `openid`
   (o OIDC exige chave assimétrica). Faça isso antes de expor o servidor em produção.
5. **Site URL / Redirect URLs**: incluir a URL publicada do app para o retorno pós-login.

## Conectando os clientes

### ChatGPT
Configurações → Conectores → Adicionar conector → informe a URL
`https://<PROJECT_REF>.supabase.co/functions/v1/odisseia-mcp` → autenticação OAuth → faça login no
Financeiro Odisseia e aprove na tela de consentimento.

### Codex / clientes MCP genéricos
```json
{
  "mcpServers": {
    "financeiro-odisseia": {
      "type": "http",
      "url": "https://<PROJECT_REF>.supabase.co/functions/v1/odisseia-mcp"
    }
  }
}
```
O cliente descobre o Authorization Server pelo 401 + `WWW-Authenticate` e pelo
`/.well-known/oauth-protected-resource`.

## Aprovações no cliente

As ferramentas `preparar_*` e `confirmar_operacao` estão marcadas com `readOnlyHint: false`
(`confirmar_operacao` também com `destructiveHint: true`), então clientes MCP pedem aprovação
do usuário antes de executá-las. Mantenha a aprovação manual ligada — o servidor também exige
o `confirmation_id`, mas a dupla barreira é intencional.

## Versão, nomes de tools e observabilidade

- Versão atual do servidor: **1.0.2** (`supabase/functions/odisseia-mcp/tools.ts`).
- Todos os nomes de tools vivem em `TOOL` / `TOOL_NAMES` nesse mesmo arquivo. Registro, despacho do
  `confirmar_operacao` e testes usam apenas essas constantes — nunca strings soltas.
- O registro das tools está em `server.ts` (`buildServer`), separado do handler HTTP (`index.ts`),
  o que permite testar pelo protocolo MCP real com dependências injetadas.
- **Logs estruturados** (JSON em uma linha) por requisição: `request_id`, `event`
  (`rpc_start`, `rpc_end`, `auth_rejected`, `identity_arg_rejected`, `health`, `oauth_metadata`),
  método JSON-RPC, nome da tool, `ok`, `status`, `duration_ms` e `error_kind`.
  Nunca são registrados token, cabeçalho Authorization, argumentos, e-mail ou resultados.
- **Guarda de identidade no transporte**: argumentos como `user_id`/`token` são rejeitados com
  **400** antes do schema da tool, evitando que sejam descartados silenciosamente.
- `WWW-Authenticate` completo no 401: `realm`, `error`, `error_description`, `scope="openid email profile"`
  e `resource_metadata`.

## Testes de regressão

`src/test/mcpServer.test.ts` sobe o servidor com um adapter Supabase in-memory
(`src/test/fakeSupabase.ts`) e um Client MCP via `InMemoryTransport`, cobrindo:

- `tools/list` expõe exatamente `TOOL_NAMES` (15 tools, sem duplicatas) e a versão 1.0.2;
- cada tool responde pelo nome registrado;
- `preparar_*` não altera dados e devolve `confirmation_id`;
- `confirmar_operacao` executa uma única vez — o replay falha e nada é duplicado;
- `cancelar_operacao` invalida a pendência;
- referências inválidas (ex.: operadora inexistente) não criam operação;
- argumentos de identidade são rejeitados.

Rodar: `npx vitest run`.

## Segurança e produção

- O token do usuário é usado em todas as consultas: **RLS é a fronteira de segurança**.
- `service_role`, senhas e secrets nunca são lidos nem retornados pela função.
- Respostas passam por um sanitizador que remove `user_id`, tokens e credenciais.
- `verify_jwt = false` na função é intencional: a validação é feita em código (`auth.getUser`),
  para permitir 401 com `WWW-Authenticate` e servir o metadata público.
- Limites de paginação (máx. 200) evitam respostas gigantes.
- Nenhuma tela ou regra existente do sistema foi alterada.
