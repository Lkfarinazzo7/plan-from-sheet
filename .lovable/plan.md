## O que será feito

### 1. Receitas — botão rápido "Marcar como recebido"
- Nova coluna de ação na tabela de Receitas com um botão (ícone de check verde), no mesmo padrão do botão de "Marcar como pago" que já existe em Despesas.
- Aparece apenas quando o status atual é **"Aguardando"** (ou qualquer status ≠ "Recebido").
- Um clique altera o status para **"Recebido"** direto no banco, sem abrir o modal de edição.

### 2. Despesas — edição em massa: alterar Setor
- Na barra de ações em massa que já existe em Despesas (aparece ao selecionar linhas via checkbox), adicionar um novo controle **"Setor"**.
- Funciona igual aos campos já existentes de data / status / unidade: seleciona um setor e aplica a todas as despesas marcadas de uma vez.
- Também permite "limpar setor" (definir como vazio).

## Arquivos alterados

| Arquivo | Alteração |
|---|---|
| `src/pages/Receitas.tsx` | Botão de check verde na coluna de ações + handler chamando `updateReceita` com `status: "Recebido"`. |
| `src/pages/Despesas.tsx` | Adiciona seletor de Setor à barra de edição em massa. |
| `src/hooks/useFinancialData.ts` | Se necessário, estender o hook de bulk-update de Despesas para aceitar `setor_id` no payload (mantém compatibilidade com os outros campos). |

Sem alterações de banco — as colunas `receitas.status` e `despesas.setor_id` já existem.
