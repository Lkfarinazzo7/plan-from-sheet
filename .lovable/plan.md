# Organizar e redesenhar o Dashboard

## Objetivo
Deixar o Dashboard mais claro, confortável e didático, preservando os cálculos financeiros e priorizando receitas e a visão mensal do ano.

## O que será alterado

1. **Reorganizar a parte superior**
   - Manter Receita como primeiro destaque, com valor principal, recebido, a receber e comparação com o período anterior.
   - Redesenhar Margem, Custos, Resultado, Caixa realizado e Break-even seguindo a direção visual escolhida: grafite suave, títulos Sora, textos Manrope e faixas claras.
   - Remover a sensação de quadros repetidos, consolidando os indicadores que hoje aparecem novamente logo abaixo do painel de gestão.
   - Manter filtros, metas e regras atuais, apenas reorganizando sua apresentação.

2. **Transformar o comparativo mensal em visão anual navegável**
   - Exibir sempre os 12 meses do ano selecionado, inclusive meses sem movimentação.
   - Manter Receitas e Despesas lado a lado para comparação.
   - Adicionar setas para navegar para o ano anterior e o próximo ano.
   - Permitir rolagem horizontal quando a largura da tela não comportar todos os meses, sem comprimir os dados.
   - Respeitar o filtro de unidade já aplicado ao comparativo.

3. **Encurtar DRE e Qualidade financeira**
   - Levar Qualidade financeira para o final do Dashboard.
   - Exibir DRE e Qualidade financeira inicialmente recolhidos, cada um em uma faixa curta com resumo e seta para expandir.
   - Manter todo o conteúdo e todas as ações atuais disponíveis quando a seção for aberta.

4. **Preservar os demais relatórios**
   - Manter indicadores por corretor, resultado por equipe, receitas por vendedor e operadora, custos e despesas por categoria.
   - Ajustar apenas espaçamento e ordem necessários para que a leitura siga do resumo para os detalhes.

5. **Validar o resultado**
   - Conferir o Dashboard autenticado em tela grande e pequena.
   - Validar navegação entre anos, os 12 meses, filtros, expansão do DRE e expansão da Qualidade financeira.
   - Rodar os testes relacionados e confirmar que a tela continua sem erros.

## Detalhes técnicos
- O comparativo atual gera apenas seis meses; ele passará a receber um ano de referência e produzir janeiro a dezembro.
- Serão usados os controles expansíveis já existentes no projeto.
- Nenhuma tabela, lançamento, regra financeira ou dado histórico será alterado.
