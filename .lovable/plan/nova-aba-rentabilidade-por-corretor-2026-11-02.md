# Nova aba: Rentabilidade por Corretor

Aba nova no menu lateral, abaixo de Comissões. Não altera nenhuma aba existente.

## O que você verá

**Filtros no topo:** mês, ano (ou ano inteiro) e corretor (seleção múltipla). Há também uma chave **Competência / Caixa realizado**:
- **Competência:** produção e receita pelo mês de implantação e de referência. Comissões e custos entram pelo mês a que pertencem.
- **Caixa realizado:** só o que foi recebido ou pago de fato, pela data do pagamento.
Os dois modos nunca se misturam.

**Cartões de resumo (total do filtro):** produção, receita recebida, comissões pagas, custos adicionais, resultado gerencial e margem gerencial (%).

**Tabela comparativa (uma linha por corretor), com ordenação por coluna:**
produção, nº de contratos, ticket médio, receita recebida, comissões pagas, % comissão/receita, margem da empresa (receita − comissões), custos adicionais, resultado gerencial (margem − custos) e margem gerencial (%). Resultado negativo aparece em vermelho e positivo em verde.

**Clique num corretor** para abrir um painel lateral com:
- o detalhamento dos custos do mês: regras automáticas e despesas já lançadas, cada item com a sua origem;
- a **calculadora de custos** do corretor.

## Calculadora de custos (regras salvas por corretor)

Cada regra tem nome, tipo, valor, frequência e uma chave para ativar ou desativar. Também dá para editar e excluir.
- **Fixo:** valor por mês ou por semana. Exemplos: DAS de R$ 86,05/mês; passagem de R$ 50/semana, que conta as semanas do mês (4 ou 5).
- **Percentual:** % sobre a produção do corretor no mês. Exemplo: bônus de 20%.
- **Pontual:** valor único lançado num mês específico.
- Opcionalmente, mês de início e de fim. A regra vale automaticamente para todos os meses seguintes até ser desativada ou encerrada. Nada é gravado em Despesas: o custo é calculado na hora.

## Integração com o financeiro, sem contar duas vezes

- **Comissões:** vêm das despesas de comissão já ligadas a cada contrato (a automação que criamos) e são atribuídas ao corretor dono do contrato. Contratos antigos sem essa despesa usam a comissão registrada no próprio contrato.
- **Outras despesas do corretor** (passagens, DAS etc.): é possível ligar uma despesa a um corretor. Essas despesas entram como custo adicional.
- **Regra contra duplicidade:** se, num mês, houver despesa lançada ligada ao corretor que ocupe o lugar de uma regra, a regra não é somada naquele mês. Para isso, cada regra pode ser ligada a uma categoria ou descrição, como "DAS". Assim, a despesa real sempre substitui a estimada.

## Pontos a confirmar (premissas usadas no plano)
1. Hoje as despesas **não têm ligação direta com um corretor**, só um texto de "responsável". Proponho acrescentar um campo opcional "Corretor" em Despesas, com sugestão automática quando esse texto bater exatamente com o nome de um corretor. Nada antigo é alterado sem a sua confirmação.
2. A comissão do supervisor de um contrato entra no custo **do corretor que vendeu**, e não na linha do supervisor.

## Detalhes técnicos
- Migração aditiva:
  - tabela `custos_corretor`, com os campos id, vendedor_id → vendedores, nome, tipo (fixo|percentual|pontual), valor, frequencia (mensal|semanal|unica), mes_referencia, inicio, fim, ativo, categoria_id/termo_match opcionais, timestamps. Terá GRANT para authenticated/service_role, RLS com `has_role` admin/gestor e o trigger `updated_at`;
  - `despesas.vendedor_id uuid null` com FK e índice.
- Cálculo puro e testado em `src/lib/rentabilidadeCorretor.ts`, seguindo a regra de manter os cálculos fora da interface. Reaproveita `indicadoresPorCorretor`, `cancelado`, `liquidado` e as datas competência/data_efetiva de `dre.ts`.
- Hook `useRentabilidadeCorretor` (React Query) e página `src/pages/RentabilidadeCorretor.tsx`, com rota e item no menu (oculto para adm_pipeline).
- Testes vitest:
  - semanal com 4 e 5 semanas;
  - percentual sobre a produção;
  - pontual só no mês dele;
  - regra inativa;
  - despesa real substituindo a regra;
  - competência vs. caixa;
  - comissão não duplicada entre a despesa e o contrato.
- Campo "Corretor" opcional no formulário de Despesas, sem mudar o restante da tela.
