# Exportar por período (Receitas e Despesas)

## O que muda
- Ao clicar em **Exportar** (em Receitas ou Despesas), abre uma janelinha para escolher o período:
  - **De** (mês/ano) e **Até** (mês/ano). Ex.: Janeiro/2026 até Outubro/2026.
  - Atalhos: "Mês atual", "Ano até hoje", "Ano inteiro".
  - Opção "Aplicar os filtros da tela" (status, categoria, unidade etc.), ligada por padrão.
- Ao confirmar, baixa uma planilha com todos os lançamentos do período, ordenados por data, com as mesmas colunas de hoje.
- Nome do arquivo: `Receitas_Jan-2026_a_Out-2026.xlsx` (idem Despesas).
- A tela continua mostrando o mês selecionado; nada muda nos lançamentos.

## Detalhes técnicos
- Novo componente `ExportPeriodDialog` reutilizado nas duas páginas.
- Busca no banco direto por intervalo `data >= 'YYYY-MM-01'` e `data <= último dia do mês final`, montando as datas como texto (sem toISOString), com os mesmos joins usados hoje (operadora, vendedor, categoria, setor).
- Filtros da tela reaplicados em memória sobre o resultado quando a opção estiver marcada.
- Mapeamento de colunas extraído para funções reutilizáveis; teste pequeno para o cálculo do intervalo (ex.: Out/2026 → 2026-10-31, Fev/2028 → 2028-02-29).
