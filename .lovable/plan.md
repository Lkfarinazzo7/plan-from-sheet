

# Corrigir Importacao Excel e Adicionar Confirmacao de Mapeamento

## Problemas Identificados

As planilhas reais usam nomes de colunas diferentes do esperado pelo sistema:

**Receitas.xlsx**: `Data | Descrição | Categoria | Operadora | Valor Real | Responsável | Status`
- "Valor Real" em vez de "Valor" (com prefixo "R$")
- "Responsável" em vez de "Vendedor"
- Data no formato M/D/YY (ex: `4/2/26`)

**Despesas.xlsx**: `Data | Descrição | Categoria | Tipo (Fixo/Variável) | Valor Real | Responsável | Recorrente | Status/Pago`
- "Tipo (Fixo/Variável)" em vez de "Tipo"
- "Valor Real" em vez de "Valor" (com "R$")
- "Status/Pago" em vez de "Status"
- Data no formato M/D/YY

## Alteracoes

### 1. `src/components/ExcelImportDialog.tsx`
- Adicionar etapa intermediaria de **confirmacao de mapeamento** entre upload e preview
- Apos parse do arquivo, mostrar uma tela onde cada campo esperado tem um dropdown mostrando qual coluna da planilha foi mapeada
- O usuario confirma que o mapeamento esta correto antes de ver a preview final
- Botao "Confirmar Mapeamento" para prosseguir

### 2. `src/pages/Receitas.tsx` - mapReceitaRow
- Aceitar "Valor Real" alem de "Valor"
- Limpar prefixo "R$" e espacos do valor antes de parsear
- Aceitar "Responsável" como nome do vendedor (alem de "Vendedor")
- Melhorar parse de datas para aceitar formato M/D/YY (ex: `4/2/26` → `2026-04-02`)
- Atualizar `expectedColumns` para refletir os nomes reais

### 3. `src/pages/Despesas.tsx` - mapDespesaRow
- Aceitar "Tipo (Fixo/Variável)" alem de "Tipo"
- Aceitar "Valor Real" alem de "Valor", limpando "R$"
- Aceitar "Status/Pago" alem de "Status"
- Melhorar parse de datas para formato M/D/YY
- Atualizar `expectedColumns` para refletir os nomes reais

### Detalhes tecnicos
- Criar funcao helper `parseValorBR(str)` que remove "R$", espacos e trata virgula/ponto
- Criar funcao helper `parseDateFlexible(value)` que aceita Date objects, DD/MM/YYYY, M/D/YY, YYYY-MM-DD
- A etapa de confirmacao mostra: Campo Esperado → Coluna Detectada, com possibilidade de ver os primeiros valores de cada coluna

