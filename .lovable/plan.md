

# Filtro por periodo + Botao duplicar em Despesas e Receitas

## O que sera feito

### 1. Filtro por periodo nas Despesas
Adicionar um Select com opcoes rapidas de periodo na area de filtros existente:
- **Todos** (padrao, mostra tudo do mes)
- **Hoje** — filtra apenas despesas com data de hoje
- **Esta semana** — filtra despesas dos ultimos 7 dias
- **Ultimos 15 dias**

A filtragem sera client-side, comparando `d.data` (string YYYY-MM-DD) com as datas calculadas localmente.

### 2. Botao Duplicar nas Despesas
Na coluna de acoes (onde ja tem check, editar e excluir), adicionar um botao com icone `Copy` do lucide-react. Ao clicar, cria uma nova despesa identica (mesma descricao, categoria, tipo, valor, responsavel, recorrente) mas com data de hoje e status "A pagar". Usa `createDespesa.mutateAsync` e exibe toast de confirmacao.

### 3. Botao Duplicar nas Receitas
Mesmo comportamento na tabela de receitas: botao `Copy` que cria uma nova receita identica com data de hoje e status "Aguardando". Usa `createReceita.mutateAsync`.

## Arquivos alterados

| Arquivo | Alteracao |
|---|---|
| `src/pages/Despesas.tsx` | Adicionar state `filterPeriodo`, Select de periodo nos filtros, logica de filtragem por data, botao duplicar na coluna de acoes |
| `src/pages/Receitas.tsx` | Adicionar botao duplicar na coluna de acoes |

Sem alteracoes de banco de dados.

