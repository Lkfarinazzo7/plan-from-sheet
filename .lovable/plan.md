

# Importação de Planilha Excel nas abas de Receitas e Despesas

## O que sera feito

Adicionar um botao "Importar Excel" em ambas as paginas (Receitas e Despesas) que permite ao usuario fazer upload de um arquivo `.xlsx` e importar os registros em lote para o banco de dados.

## Dependencia

- Instalar a biblioteca `xlsx` (SheetJS) para parsing de arquivos Excel no browser

## Componente compartilhado: `src/components/ExcelImportDialog.tsx`

Dialog reutilizavel que:
1. Aceita um arquivo `.xlsx` via input file
2. Faz o parse das linhas usando `xlsx`
3. Mostra uma previa dos dados em tabela antes de confirmar
4. Permite ao usuario confirmar a importacao
5. Recebe como prop uma funcao de mapeamento e uma funcao de insercao

## Logica por aba

### Despesas
Colunas esperadas na planilha: **Data, Descrição, Categoria, Tipo, Valor, Responsável, Recorrente, Status**
- **Categoria**: busca pelo nome na tabela `categorias_despesa` para obter o `categoria_id`. Se nao encontrar, ignora ou cria automaticamente.
- **Recorrente**: aceita "Sim"/"Não", true/false
- **Tipo**: "Fixo" ou "Variável"
- **Status**: "Pago", "A pagar", "Atrasado"

### Receitas
Colunas esperadas na planilha: **Data, Descrição, Categoria, Operadora, Vendedor, Valor, Status**
- **Operadora**: busca pelo nome na tabela `operadoras` para obter o `operadora_id`
- **Vendedor**: busca pelo nome na tabela `vendedores` para obter o `vendedor_id`
- **Categoria**: texto livre ("Bancária" ou "Vida")
- **Status**: "Recebido" ou "Aguardando"

## Fluxo do usuario

1. Clica em "Importar Excel" (botao ao lado de "Nova Despesa"/"Nova Receita")
2. Seleciona o arquivo `.xlsx`
3. Sistema faz parse e mostra previa com quantidade de linhas e erros encontrados (ex: vendedor nao encontrado)
4. Usuario confirma a importacao
5. Registros sao inseridos em lote via Supabase

## Arquivos alterados

- **Novo**: `src/components/ExcelImportDialog.tsx` - componente reutilizavel de importacao
- **Editado**: `src/pages/Despesas.tsx` - adicionar botao e dialog de importacao com mapeamento de campos de despesas
- **Editado**: `src/pages/Receitas.tsx` - adicionar botao e dialog de importacao com mapeamento de campos de receitas
- **Editado**: `src/hooks/useFinancialData.ts` - adicionar hooks de insercao em lote (`useBulkCreateDespesa`, `useBulkCreateReceita`)
- **Editado**: `package.json` - adicionar dependencia `xlsx`

## Detalhes tecnicos

- Usa `FileReader` + `xlsx.read()` para parse client-side (sem necessidade de backend)
- Insercao em lote via `supabase.from('despesas').insert([...array])` 
- Busca de categorias/operadoras/vendedores para resolver nomes para IDs antes da insercao
- Linhas com erros de mapeamento (ex: categoria inexistente) sao destacadas na previa para o usuario decidir se prossegue

