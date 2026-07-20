## Vincular receitas órfãs a contratos existentes

Hoje o card "Receitas sem contrato cadastrado" em `/contratos` só oferece o botão **Criar**. Vou adicionar o botão **Vincular** para casos em que o contrato já existe mas com nome ligeiramente diferente da descrição da receita (ex.: `Prop. 97039955 - SAN MICHEL SERVICOS MEDICOS LTDA` vs `SAN MICHEL SERVICOS MEDICOS LTDA`).

### Como funciona o vínculo

O casamento receita ↔ contrato hoje é feito por `normalizeNome(descricao)` = `normalizeNome(nome)`. Portanto, vincular significa **renomear a descrição das receitas daquele grupo para bater exatamente com o nome do contrato escolhido**. Depois disso o contrato passa a mostrar essas receitas automaticamente na linha expansível e o alerta some.

### Mudanças em `src/pages/Contratos.tsx`

1. Ao lado do botão **Criar** em cada linha de receita órfã, adicionar botão **Vincular** que abre um diálogo.
2. Novo diálogo `VincularReceitaDialog`:
   - Mostra a descrição órfã no topo (com quantidade e total).
   - Campo de busca com lista dos contratos existentes (nome, operadora, unidade, valor). Sugere no topo os contratos com maior similaridade textual à descrição órfã (comparação simples por tokens/substring, sem lib nova).
   - Botão **Confirmar vínculo** executa um bulk update em `receitas`: `UPDATE receitas SET descricao = <nome do contrato> WHERE normalize(descricao) = <chave órfã>`.
   - Toast de sucesso e invalidação das queries de receitas / resumo por nome / detalhe por nome.

### Hook novo em `src/hooks/useFinancialData.ts`

- `useVincularReceitasAoContrato()` — mutation que recebe `{ chaveNormalizada, novaDescricao }`, atualiza todas as receitas cujo `normalizeNome(descricao)` bate com a chave, e invalida `receitas`, `receitas-resumo-por-nome`, `receitas-detalhe-por-nome`, `contratos`. Como a normalização é feita no cliente, a mutation vai listar os IDs afetados via query em memória (usando o cache já existente) e disparar um `update ... in (ids)`.

### Fora de escopo

- Não vou alterar o modelo de vínculo (continua por nome normalizado, sem FK). Se você quiser depois um vínculo "duro" via `contrato_id` em receitas, viraria outra tarefa.
- O aviso no formulário de Receitas continua igual.