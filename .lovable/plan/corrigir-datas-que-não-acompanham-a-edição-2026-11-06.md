# Corrigir datas que não acompanham a edição

## Por que aconteceu
Cada receita/despesa guarda três datas: **Data**, **Mês de referência (competência)** e **Vencimento**. A tela de edição só mostra e altera a **Data**. As outras duas ficam com o valor antigo.

O Dashboard (DRE por competência) usa o **mês de referência**. Na Accioly Bodhi você mudou a Data para 06/11/2026, mas o mês de referência e o vencimento continuaram em 04/11/2024. Por isso ela não entrou em novembro. Foi o mesmo problema da Hipercadena e da Joao Victor.

Procurei outros lançamentos editados com esse mesmo desencontro e achei só mais um:
- Despesa **3C Plus - cartão de crédito** (R$ 774,00): Data 30/11/2026, mas mês de referência e vencimento em 29/10/2026.

## O que vou fazer
1. **Corrigir a causa:** quando você mudar a Data de um lançamento, o mês de referência e o vencimento passam a acompanhar automaticamente, desde que estivessem iguais à data antiga (ou seja, nunca foram ajustados à parte). Se você mudar o vencimento ou o mês de referência de propósito, eles são respeitados. Vale para receitas e despesas, na edição normal e na edição em massa.
2. **Corrigir a Accioly Bodhi:** mês de referência e vencimento passam para 06/11/2026. Ela passa a aparecer em novembro (R$ 6.010,03 recebidos).
3. **3C Plus:** corrigir para 30/11/2026 também, se você confirmar que ela é mesmo de novembro.
4. **Aviso de data estranha:** ao salvar uma receita ou despesa com data mais de 1 ano antes ou depois de hoje, aparece um pedido de confirmação ("A data 04/11/2024 está longe de hoje. Confirmar?"). Isso evita o erro de ano que causou os casos anteriores.

## Detalhes técnicos
- Ajustar a função de banco `tg_lancamento_datas` (BEFORE UPDATE em `receitas` e `despesas`): se `NEW.data <> OLD.data` e `NEW.competencia = OLD.competencia` e `OLD.competencia = OLD.data`, então `NEW.competencia := NEW.data`; mesma regra para `vencimento` (só se não liquidado). Atualizações explícitas (MCP, ajustes manuais) não são tocadas.
- Correção pontual de dados nas duas linhas (Accioly `29b813a2…`; 3C Plus após confirmação).
- Aviso de ano no formulário de Receitas e Despesas (validação de cliente, sem mudar regra financeira).
- Teste pequeno para a regra "data fora de ±1 ano pede confirmação".
