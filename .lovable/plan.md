
# Sistema Financeiro - Corretora de Seguros

## Visão Geral
Sistema web para substituir a planilha financeira da corretora, com dashboard visual, controle de receitas/despesas, gestão de comissões por vendedor e despesas recorrentes automáticas. Acesso apenas para o gestor/admin com autenticação.

## Funcionalidades

### 1. Autenticação
- Login com email e senha para o gestor

### 2. Dashboard Principal
- Cards resumo: Faturamento, Despesas, Saldo do mês atual
- Gráfico de barras comparando Faturamento vs Despesas por mês
- Gráfico de pizza com despesas por categoria (Marketing, Salário, Escritório, etc.)
- Ranking de desempenho por vendedor (contratos fechados e retorno financeiro)
- Filtro por período (mês/ano)

### 3. Gestão de Receitas (Propostas/Contratos)
- Cadastro de propostas com: data, descrição, categoria (Bancária/Vida), operadora (Amil, Sulamérica, Porto Seguro, MedSênior, Assim Saúde), valor, vendedor responsável, status (Recebido/Aguardando)
- Lista com filtros por mês, vendedor, operadora e status
- Totais automáticos por vendedor e por mês

### 4. Gestão de Despesas
- Cadastro com: data, descrição, categoria, tipo (Fixo/Variável), valor, responsável, recorrente (sim/não), status (Pago/A pagar/Atrasado)
- Categorias pré-definidas: Salário, Comissão, Marketing, Escritório, Transporte, Insumos, Impostos, Seguro, Ferramentas, Administrativo, Contabilidade, RH
- Lista com filtros por mês, categoria e status

### 5. Despesas Recorrentes Automáticas
- Marcar despesas como recorrentes no cadastro
- Botão para gerar automaticamente as despesas recorrentes do próximo mês
- Possibilidade de editar valores antes de confirmar

### 6. Controle de Comissões
- Visualização de comissões por vendedor por mês
- Separação entre contratos fechados (valor de comissão na venda) e retorno financeiro (valor total da proposta)
- Totais automáticos com comparativo mensal

### 7. Banco de Dados (Lovable Cloud)
- Tabelas: receitas, despesas, vendedores, categorias_despesa, operadoras
- RLS para segurança dos dados

## Design
- Interface em português (PT-BR)
- Valores em formato brasileiro (R$)
- Layout limpo e profissional com sidebar de navegação
- Cores: tons de azul/cinza para o tema principal, verde para receitas, vermelho para despesas
