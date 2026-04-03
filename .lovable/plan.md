

# Alterar graficos de Receita por Vendedor e por Operadora para mostrar valores

## O que sera feito

Trocar os graficos atuais por **tabelas/listas rankeadas** que mostram claramente o nome e o valor de cada item, similar aos rankings de comissoes que ja existem no dashboard.

### 1. Receita por Vendedor (linhas 217-233)
- Substituir o BarChart horizontal por uma lista rankeada mostrando: posicao, nome do vendedor e valor formatado em R$
- Mesmo estilo visual dos rankings de comissoes ja existentes no dashboard

### 2. Receita por Operadora (linhas 236-252)
- Substituir o PieChart por uma lista rankeada mostrando: posicao, nome da operadora e valor formatado em R$
- Mesmo estilo visual

## Arquivo alterado

### `src/pages/Dashboard.tsx`
- Substituir o bloco do BarChart de vendedores por uma lista com `.map()` mostrando nome + `formatCurrency(total)`
- Substituir o bloco do PieChart de operadoras por uma lista com `.map()` mostrando nome + `formatCurrency(total)`

Sem alteracoes de banco de dados ou hooks.

