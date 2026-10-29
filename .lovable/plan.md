# Nova aba "Calculadora" (ponto de equilíbrio)

## O que você vai ver
Um novo item no menu lateral, **Calculadora**, entre Fluxo de Caixa e Contratos.

**1. Custo fixo**: escolha entre duas opções:
- **Puxar de um mês**: escolha mês/ano (ex.: jan/2026, out/2026). O sistema soma as despesas do tipo **Fixo** daquele mês (pelo mês de referência, sem contar canceladas) e mostra o total e a quantidade de lançamentos.
- **Simular valor**: digite qualquer valor em R$.

**2. Premissas**: todas podem ser alteradas, com estes valores padrão:
- Comissão média recebida da operadora: **2,8x** o valor do contrato
- Corretor: **80%**
- Supervisor: **10%**
- Lead: **20%**
- Botão "Restaurar padrões".

**3. Resultado** (atualiza na hora, sem salvar nada):
- **Produção necessária para empatar** (valor de contratos por mês)
- Margem que sobra por R$ 1 produzido
- Um exemplo detalhado: produção → comissão recebida → pagamentos a corretor, supervisor e lead → margem → custo fixo → resultado zero
- Aviso em vermelho se os percentuais deixarem a margem zerada ou negativa (assim não existe empate)

## Como a conta é feita
Os percentuais de corretor, supervisor e lead são calculados sobre o **valor do contrato**, igual ao que já acontece em Contratos (ex.: Lumini, corretor 80% = R$ 1.028,14).

```text
Margem por R$ 1 produzido = 2,8 - 0,80 - 0,10 - 0,20 = 1,70
Produção para empatar     = Custo fixo / 1,70
```
Exemplo: custo fixo de R$ 34.000, produção necessária de R$ 20.000.

## Detalhes técnicos
- Criar uma função de cálculo pura em `src/lib/breakEven.ts`. A tela só formata o resultado, seguindo a regra do projeto.
- Criar o hook `useCustoFixoMes(year, month)` em `useFinancialData.ts`: despesas com `tipo='Fixo'`, `cancelado=false`, competência dentro do mês (com a data legada como alternativa quando a competência estiver vazia).
- Criar a página `src/pages/Calculadora.tsx` e a rota `/calculadora` no `App.tsx`, mais o item no `AppSidebar` (escondido para o perfil só-pipeline).
- Criar o teste `src/test/breakEven.test.ts` para os padrões (2,8 / 80 / 10 / 20 → divisor 1,7), a margem ≤ 0 sem empate e o valor simulado.
- Nada será alterado no banco.

## Ponto a confirmar
Considerei que os percentuais são sobre o valor do contrato. Se os percentuais forem sobre a comissão recebida, a soma passa de 100% (110%) e não existe empate. Me avise se for diferente.
