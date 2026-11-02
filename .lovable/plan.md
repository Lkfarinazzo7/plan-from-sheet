# Calculadora de custos visível na página de Rentabilidade

## O que muda
Uma nova seção **"Calculadora do corretor"** fica direto na página, abaixo dos filtros e acima da tabela. Você não precisa mais clicar no nome do corretor para chegar a ela.

- **Seletor de corretor** no topo da calculadora.
- **Lista de custos do corretor** em formato de planilha, uma linha por custo: nome, tipo (Fixo, Percentual ou Pontual), valor, frequência (mês ou semana), valor calculado no mês e a chave para ativar ou desativar.
- **Botão "+ Adicionar custo"**, que cria uma linha nova. O nome pode ser digitado livremente. Também aparecem sugestões rápidas: Passagem, Taxas, Agendamento, Preenchimento, Premiação/retorno, DAS. Você pode incluir quantos custos quiser.
- Cada linha **salva automaticamente** e **entra no resultado real** do corretor, com a mesma regra de hoje: vale nos meses seguintes até você desativar.
- **Resumo ao lado, atualizado na hora:**
  - produção;
  - receita;
  - comissões;
  - margem da empresa;
  - total de custos adicionais, separado em custos cadastrados e despesas lançadas;
  - **resultado gerencial** e **margem gerencial %**, em verde ou vermelho.
- Clicar num corretor na tabela abre ele na calculadora.

O painel lateral que existe hoje sai. Tudo passa para a calculadora. Os custos já cadastrados continuam valendo.

## Ponto em aberto
"Agendou" e "preenchendo" ficaram como sugestões de nome, com valor fixo por mês ou por semana. Se algum deles for pago **por unidade**, por exemplo R$ X por agendamento ou por proposta preenchida, me diga. Aí acrescento um tipo "por quantidade", em que você informa o valor unitário e a quantidade do mês.

## Detalhes técnicos
- O banco de dados não muda. A calculadora usa as regras de custo do corretor e a lógica de cálculo que já existem.
- Novo componente `CalculadoraCorretor`, que edita as linhas direto na tela e salva cada mudança após uma breve pausa.
- O resumo vem das funções de cálculo atuais. Nenhum cálculo novo fica dentro da tela.
- Os testes atuais continuam valendo.
