## 1. Bug: contrato não aparece após salvar

O contrato **está sendo salvo** no banco (verifiquei). O que acontece é que a listagem usa joins embutidos (`operadoras(nome)`, `supervisores!supervisor_a_id`, `vendedores!corretor_id`) e a tabela `contratos` foi criada **sem foreign keys** — então o PostgREST falha ao tentar montar a relação e a query inteira retorna erro, deixando a tela vazia.

**Correção:** migration adicionando 4 foreign keys em `contratos`:
- `operadora_id` → `operadoras(id)` ON DELETE SET NULL
- `supervisor_a_id` → `supervisores(id)` ON DELETE SET NULL
- `supervisor_b_id` → `supervisores(id)` ON DELETE SET NULL
- `corretor_id` → `vendedores(id)` ON DELETE SET NULL

Após isso os embeds funcionam e o contrato já cadastrado aparece.

## 2. Importação Excel para Contratos

Adicionar botão **"Importar Excel"** ao lado de "Novo Contrato" usando o mesmo `ExcelImportDialog` já usado em Despesas/Receitas.

**Colunas esperadas:**
`Nome`, `Operadora`, `Unidade`, `Data Implantação`, `Valor Contrato`, `Supervisor A`, `% Supervisor A`, `Supervisor B`, `% Supervisor B`, `Corretor`, `% Corretor`, `Observações`

**Regras de mapeamento:**
- Operadora / Supervisor A / Supervisor B / Corretor: busca por nome (case-insensitive) nas tabelas `operadoras`, `supervisores`, `vendedores`. Não encontrado → vira erro na linha.
- Valores de comissão: calculados automaticamente a partir do `% × Valor do contrato` (mesma lógica do form). Sem `pago` (entram todos como `false`).
- Data: aceita `DD/MM/YYYY` ou `YYYY-MM-DD` (helper já existe).
- Também adicionar botão **"Exportar"** (xlsx) baseado nos filtros ativos, igual a Despesas.

**Hook:** novo `useBulkCreateContrato` em `useFinancialData.ts` (insert array com `user_id`).

## 3. Observações em Despesas

O campo **já existe** hoje:
- Coluna `observacoes` na tabela `despesas` ✓
- Campo Textarea no formulário (criar/editar) ✓
- Ícone 📝 ao lado da descrição na tabela com tooltip ✓

O que **falta** completar:
- Incluir `Observações` nas colunas de **exportação** Excel.
- Incluir `Observações` nas colunas reconhecidas na **importação** Excel (e no payload mapeado).

## Arquivos a alterar
- **migration**: `contratos` + 4 FKs
- `src/pages/Contratos.tsx`: botões Importar/Exportar, dialog + map de linha
- `src/pages/Despesas.tsx`: adicionar `Observações` ao export e ao import
- `src/hooks/useFinancialData.ts`: `useBulkCreateContrato`

## Fora do escopo
- Vincular contratos importados a receitas existentes
- Importar status `pago` (todos entram como pendentes; usuário marca depois)