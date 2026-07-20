## Objetivo

Melhorar o vínculo Contratos ↔ Receitas para que:
1. Cada contrato mostre **todos os lançamentos de receita** vinculados (não só o total agregado).
2. Ao lançar/editar uma receita cuja descrição não bate com nenhum contrato existente, o sistema **avise** que aquele contrato ainda não foi cadastrado.

O vínculo continua sendo pelo **nome do contrato = descrição da receita** (normalizado, sem acentos/caixa), que já é como funciona hoje via `useReceitasResumoPorNome` / `getResumoContrato`.

## Mudanças

### 1. Detalhamento de receitas por contrato (aba Contratos)

- Novo hook `useReceitasDetalhePorNome()` em `src/hooks/useFinancialData.ts`: retorna um `Map<nomeNormalizado, Receita[]>` com data, valor, status, operadora e vendedor de cada lançamento.
- Na tabela de contratos (`src/pages/Contratos.tsx`), transformar cada linha em **expansível**: um chevron ao lado do nome abre uma sub-linha com a lista dos lançamentos de receita daquele contrato (data, descrição extra, valor, status, vendedor). Igual ao caso "Jorge Luiz Moreira" que o usuário citou.
- A célula "Recebido" continua mostrando o total; a expansão traz o detalhe.

### 2. Alerta de receitas sem contrato cadastrado

- Novo hook `useReceitasSemContrato()`: cruza receitas × contratos por nome normalizado e devolve as descrições que não têm contrato correspondente.
- Em `src/pages/Contratos.tsx`, adicionar um **card de alerta** no topo (quando houver): "N lançamentos de receita sem contrato cadastrado", com lista das descrições e um botão "Criar contrato" que já abre o diálogo de novo contrato com o nome pré-preenchido.
- Em `src/pages/Receitas.tsx`, no formulário de nova/editar receita, quando a descrição digitada não bater com nenhum contrato existente, mostrar um aviso discreto abaixo do campo: "Nenhum contrato com esse nome — será tratado como lançamento avulso". Não bloqueia o salvamento.

## Detalhes técnicos

- Normalização de nomes reutiliza `normalizeNome` já existente em `useFinancialData.ts`.
- Query keys novas: `['receitas-detalhe-por-nome']` e `['receitas-sem-contrato']`, invalidadas junto com `receitas` e `contratos`.
- A expansão de linhas usa estado local `Set<contratoId>` no `Contratos.tsx` (sem lib nova).
- Nenhuma mudança de schema no banco — o vínculo por nome já funciona.

## Fora do escopo

- Não vou trocar a chave de vínculo para FK explícita (`contrato_id` em receitas). Mantemos por nome, como o usuário já vem usando.
- Não altero a lógica de criação automática de propostas (já removida).