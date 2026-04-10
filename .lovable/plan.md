

# Botao rapido para marcar despesa como Paga

## O que sera feito

Adicionar um botao de acao rapida na tabela de despesas que permite alterar o status de "A pagar" ou "Atrasado" para "Pago" com um unico clique, sem precisar abrir o formulario de edicao.

## Arquivo alterado

### `src/pages/Despesas.tsx`
- Na coluna de acoes de cada linha da tabela (onde ja tem os botoes de editar e excluir), adicionar um botao com icone de check (`Check` do lucide-react) que aparece apenas quando o status e "A pagar" ou "Atrasado"
- Ao clicar, chama `updateDespesa.mutateAsync({ id, status: 'Pago' })` diretamente
- Mostrar toast de confirmacao apos sucesso

O botao tera estilo `variant="ghost"` com cor verde para indicar a acao positiva, consistente com o visual existente.

