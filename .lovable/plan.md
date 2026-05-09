## Plano

### 1. Remover Pipeline
- Em `src/App.tsx`: remover import `Pipeline`, a rota `/pipeline`, o componente `useIsAdmPipelineOnly` e os redirects relacionados (`isAdmPipelineOnly`, prop `pipelineOnly` em `ProtectedRoute`).
- Em `src/components/AppSidebar.tsx`: remover item Pipeline do menu, remover `pipelineOnlyMenu` e a lógica `isAdmPipelineOnly`. Sidebar fica só com o menu completo.
- Excluir arquivos: `src/pages/Pipeline.tsx`, pasta `src/components/pipeline/`, `src/lib/pipelinePendencias.ts`.
- Manter `useUserRole.ts` e a tabela de roles (ainda usados por admin/gestor) — apenas remover referências a `adm_pipeline` no app (a role no DB pode permanecer sem efeito).

### 2. Atalho "Este ano" no filtro do Dashboard
No `src/pages/Dashboard.tsx`, dentro do popover de período personalizado (CalendarRange), adicionar botões de presets acima dos campos início/fim:
- **Este ano** → define `customStart = YYYY-01-01`, `customEnd = YYYY-12-31` do ano atual e aplica direto (`setActiveRange`).
- **Este mês** (bônus, mesmo padrão, opcional) — incluo só se simples.

Comportamento: clicar no preset preenche os inputs e ativa o range imediatamente, fechando o popover. O badge de período ativo e o botão "X" para limpar continuam funcionando como hoje.

### Fora de escopo
- Não mexer em Receitas/Despesas/Comissões/Cadastros.
- Não remover a role `adm_pipeline` do banco (sem migration).