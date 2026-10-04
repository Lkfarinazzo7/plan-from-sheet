# Revisão financeira — Fase 1: dados, categorias, DRE e DFC corretos

Objetivo desta fase: o DRE de setembro/2026 deixa de mostrar zero e passa a fechar com os cerca de R$ 40.253,49 em receitas e R$ 50.880,42 em despesas lançados. O DFC passa a separar o que foi realizado do que está projetado. As outras partes do pedido ficam para as próximas fases, listadas no final.

## Por que o DRE de setembro mostra zero

Isso foi confirmado no banco:
- Nenhuma das 14 categorias tem grupo do DRE. Por isso todas as despesas ficam fora do resultado.
- As 65 receitas não têm categoria, então a Receita Bruta fica zerada.
- 883 lançamentos não têm data de competência (818 despesas e 65 receitas).
- 756 lançamentos pagos ou recebidos não têm data de pagamento ou recebimento (693 despesas e 63 receitas).
- 74 lançamentos em aberto não têm vencimento (72 despesas e 2 receitas).

## 1. Cópia de segurança e datas dos lançamentos antigos
- Antes de mudar qualquer coisa, salvo uma cópia completa de receitas e despesas em tabelas de backup.
- Quando a competência estiver vazia, ela recebe a data original do lançamento.
- Quando um lançamento pago ou recebido estiver sem data de pagamento ou recebimento, ela recebe a data original.
- Quando um lançamento em aberto estiver sem vencimento, ele recebe a data original.
- Campos que já estão preenchidos não mudam. Valores e identificadores também não mudam.
- Cada lançamento corrigido fica marcado como "data migrada do legado", para dar para rastrear depois.
- A partir daí, todo lançamento novo precisa ter competência. Se estiver pago, também precisa da data de pagamento. Se estiver em aberto, também precisa do vencimento. Os formulários e a geração de recorrentes passam a preencher esses campos sozinhos.

## 2. Classificação das categorias no DRE
- Comissão: custo variável. As despesas pagas são a única fonte das comissões no DRE. As comissões calculadas nos contratos servem só para conferência.
- Marketing: despesa comercial.
- Ferramentas, Escritório, Contabilidade, Administrativo, Salário, RH, Transporte, Insumos, Educação e Seguro: despesas fixas.
- Impostos é dividido em duas subcategorias:
  - "DAS Odisseia", o DAS da própria empresa: dedução da receita.
  - "DAS colaboradores" (DAS Breno, Rhayssa e os demais): custo fixo de pessoal.
- Empréstimo é dividido em duas subcategorias:
  - "Principal": fica fora do DRE e conta só no caixa.
  - "Juros": entra no resultado financeiro.
- Uma categoria nova de receita, "Receita operacional", é aplicada às 65 receitas.
- Também são criadas as subcategorias sugeridas no pedido (por exemplo, Tráfego pago, CRM, Aluguel e Passagem). Os lançamentos antigos são movidos para elas apenas quando a descrição não deixa dúvida. Os demais ficam na categoria principal, marcados para revisão.

## 3. Juros do empréstimo
- O empréstimo foi de R$ 20.000 e as parcelas são de R$ 2.100.
- Os juros de cada parcela são calculados assim: (total pago − R$ 20.000) ÷ número de parcelas. O restante de cada parcela é amortização do principal.
- **Ainda falta o número total de parcelas.** Se forem 12, o total pago é R$ 25.200. Os juros são R$ 433,33 por parcela e o principal R$ 1.666,67 por parcela. Antes de aplicar, vou confirmar esse número com você.
- Cada parcela vira dois lançamentos, Principal e Juros, que somados dão exatamente o valor original. A linha original é preservada no backup.
- Existem duas parcelas lançadas em 16/10. Uma pode estar duplicada, então ela fica marcada para sua revisão.

## 4. DRE pela competência
Receita Bruta − Deduções = Receita Líquida
Receita Líquida − Custos variáveis = Margem de Contribuição
Margem de Contribuição − Despesas comerciais − Despesas fixas = Resultado Operacional
Resultado Operacional ± Resultado financeiro − Tributos sobre o lucro = Resultado Líquido

O DRE também mostra a margem de contribuição %, a margem operacional % e a margem líquida %.

## 5. DFC pelo caixa
Saldo inicial + Entradas realizadas − Saídas realizadas = Geração de caixa, que leva ao Saldo final.
- O realizado usa somente a data de pagamento ou recebimento.
- O projetado é um bloco separado e usa somente o vencimento dos lançamentos em aberto.

## 6. Validação
- Testes automáticos confirmam que:
  - o DRE pela competência fecha corretamente;
  - o DFC realizado usa só a data efetiva;
  - o DFC projetado usa só os vencimentos em aberto;
  - lançamentos cancelados ficam fora dos relatórios;
  - as comissões não são contadas duas vezes;
  - o painel e os relatórios chegam aos mesmos totais com os mesmos filtros.
- Comparo setembro/2026 antes e depois das mudanças e mostro os números para você.

## Próximas fases (fora desta entrega)
- Fase 2: painel executivo com cards de receita, margem, custos, resultado, caixa e break-even; comparação com o período anterior; card de qualidade financeira; relatório mostrando de onde vem cada número.
- Fase 3: indicadores por corretor, equipes e supervisores com mini-DRE por equipe, metas configuráveis e alertas Saudável/Atenção/Crítico.
- Fase 4: auditoria das séries recorrentes que podem estar duplicadas (Passagem, ADM, Orçamento Facebook), com opção de juntar ou desativar uma série sem apagar o histórico.

## Detalhes técnicos
- Backups: `despesas_backup_20261004` e `receitas_backup_20261004`, criadas com CREATE TABLE AS e sem acesso pela API pública.
- Nova coluna `datas_legado boolean`. Os dados antigos são preenchidos por UPDATE com COALESCE, que respeita os gatilhos de versão e de coerência.
- Validação das datas por gatilho, aplicada só a inserções e alterações de lançamentos novos. Os registros antigos não mudam.
- `grupo_dre` é preenchido nas categorias e subcategorias. As receitas recebem `categoria_id`.
- `dre.ts` não muda de regra. Os grupos passam a existir, então os totais aparecem. O DFC ganha saldo inicial, calculado com o realizado anterior ao período.
- Os testes ficam em `src/test/dre.test.ts` e `financialReporting.test.tsx`.
