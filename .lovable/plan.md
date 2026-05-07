
# Pipeline de Propostas + ADM + Promoção a Receita

Replicar o pipeline do projeto "Lucas Contratos" (7 etapas, drag-and-drop, formulário completo com titulares/dependentes, anexos, declinadas) e integrá-lo a este sistema. Criar um papel `adm_pipeline` que só enxerga o Pipeline. Quando uma proposta for movida para "Implantado", abrir o formulário de Receitas pré-preenchido.

## 1. Backend (migration)

### Tabelas novas
- **`canais_venda`**: `id`, `nome`, `ativo`, timestamps. RLS: leitura/escrita para autenticados.
- **`pipeline_contratos`**:
  - `id`, `user_id`, `cliente`, `numero_proposta`, `tipo` ('PF'|'PJ'|'Adesao'), `operadora_id`, `canal_id`, `vendedor_id` (opcional), `valor_mensal`, `data_vigencia`, `data_revisao`, `etapa` (enum), `posicao` (bigint), `observacoes`, `dados_proposta` (jsonb com cnpj_cpf, vidas, titulares, dependentes etc.), `declinada` (bool), `motivo_declinio`, `declinada_em`, timestamps.
  - RLS: usuários autenticados leem/escrevem (sem isolamento por user_id, igual ao restante do sistema — ADM e gestor compartilham os mesmos dados).
- **`user_roles`** + enum `app_role` ('admin', 'gestor', 'adm_pipeline'): segue o padrão recomendado (tabela separada + função `has_role` security definer). Sem armazenar role em profiles.

### Enum
- `pipeline_etapa`: 'Montagem de contrato', 'Assinatura / Declaração de saúde', 'Entrevista médica', 'Em análise', 'Pendências', 'Aguardando vigência', 'Implantado'.

### Storage
- Bucket privado `pipeline-anexos`. Policies: usuários autenticados leem/escrevem dentro de `{user_id}/{pipeline_id}/...`.

## 2. Papéis e proteção de rotas

- `useUserRole()` hook: carrega papéis do usuário logado.
- Rotas protegidas:
  - ADM Pipeline (`adm_pipeline`): só `/pipeline`. Qualquer outra rota redireciona para `/pipeline`.
  - Admin/gestor: acesso total (incluindo `/pipeline`).
- `AppSidebar`: esconder Dashboard/Receitas/Despesas/Comissões/Cadastros se for `adm_pipeline`.
- Tela em **Cadastros → Usuários**: lista usuários (via `auth.users` mirror em `profiles` ou função RPC) e permite marcar/desmarcar papel `adm_pipeline`. Acessível só para admin.

## 3. Frontend — Pipeline

### Arquivos novos
- `src/pages/Pipeline.tsx` — página principal, com DndKit, contadores (total em pipeline, propostas ativas, revisar hoje), botões: Nova proposta, Importar, Declinadas, filtro "só revisar".
- `src/components/pipeline/PipelineColumn.tsx` — coluna droppable com totalizador.
- `src/components/pipeline/PipelineCard.tsx` — card draggable: cliente, nº proposta, tipo, operadora/canal, vidas, vigência, valor, badge de revisão, lista de pendências.
- `src/components/pipeline/PipelineForm.tsx` — formulário completo com:
  - Dados do contrato (cliente, proposta, tipo, CPF/CNPJ, operadora, canal, valor, vigência, revisão, etapa, observações).
  - Dados da proposta (categoria, acomodação, coparticipação, vidas, qtd titulares/dependentes, reajuste, endereço).
  - Titulares dinâmicos (nome, CPF, nascimento, telefone, email, endereço, plano anterior) e dependentes aninhados.
  - Anexos.
- `src/components/pipeline/PipelineAnexos.tsx` — upload/listagem/remoção via Storage.
- `src/components/pipeline/DeclinadasDialog.tsx` — listar/restaurar/excluir declinadas.
- `src/lib/pipelinePendencias.ts` — calcula pendências (sem operadora, sem valor, sem vigência etc.).
- `src/lib/tagColor.ts` — paleta determinística para tags (operadora/canal/tipo).
- Cadastro de **Canais de venda** em `src/pages/Cadastros.tsx` (CRUD simples, espelhando Operadoras).

### Drag-and-drop
- `@dnd-kit/core` (instalar). Mover entre colunas atualiza `etapa` no banco.
- Ao soltar em "Implantado", **NÃO** muda o status: abre `ReceitaForm` pré-preenchido (cliente vira descrição, valor_mensal vira valor, vendedor/operadora copiados, data = vigência ou hoje). Ao salvar a receita, marca o card como "Implantado" e remove do board (mantém no banco para histórico). Cancelar = card volta à etapa anterior.

## 4. Reuso do ReceitaForm

Hoje a criação de receita é inline na página `Receitas.tsx`. Vou extrair o formulário para `src/components/receitas/ReceitaForm.tsx` (Dialog reutilizável) com prop `initial` para pré-preenchimento. Receitas.tsx continua funcionando igual.

## 5. Sidebar e rotas

- Adicionar item "Pipeline" no `AppSidebar` (ícone Kanban) entre Despesas e Comissões.
- `App.tsx`: nova rota `/pipeline`. `ProtectedRoute` passa a ler papel e redirecionar `adm_pipeline` para `/pipeline`.

## 6. O que NÃO entra agora

- Preenchimento via IA (botão "Sparkles") do Lucas Contratos — depende de edge function própria, posso adicionar depois se quiser.
- Importação de planilha do pipeline — posso adicionar num passo seguinte.
- Email de elaboração — fora de escopo.

## Resumo das mudanças

| Área | Mudança |
|------|---------|
| Banco | tabelas `pipeline_contratos`, `canais_venda`, `user_roles` + enum, função `has_role`, bucket `pipeline-anexos` |
| Auth | hook `useUserRole`, redirecionamentos por papel, tela de gestão de usuários ADM |
| UI | nova rota `/pipeline`, sidebar adaptativa, cadastro de canais |
| Receitas | extrair `ReceitaForm` para dialog reutilizável; abrir pré-preenchido ao "implantar" |
| Deps | adicionar `@dnd-kit/core` |
