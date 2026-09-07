import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildServer } from '../../supabase/functions/odisseia-mcp/server';
import { resumirReceitas, statusFinanceiro, percentualRecebido, montarContrato, type ReceitaRow } from '../../supabase/functions/odisseia-mcp/metrics';
import { FakeDb } from './fakeSupabase';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const USER = uuid(90000);
const clients: Client[] = [];
afterEach(async () => { await Promise.all(clients.splice(0).map(c => c.close())); });
async function connect(receitas: any[] = [], despesas: any[] = []) {
  const db = new FakeDb({ categorias_despesa: [], subcategorias_despesa: [], setores_despesa: [], contratos: [], receitas, despesas }, USER);
  const server = buildServer({ supabase: db.client(), userId: USER, email: null });
  const client = new Client({ name: 'coerencia-dados-test', version: '1' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(st), client.connect(ct)]);
  clients.push(client);
  return client;
}
const entry = (id: number, valor: number, status: string, extra: Record<string, any> = {}) => ({
  id: uuid(id), user_id: USER, data: '2026-08-10', descricao: 'Sintético', valor, status,
  cancelado: false, contrato_id: null, unidade_negocio: 'Odisseia', ...extra,
});
async function call(client: Client, name: string, args: any) {
  const result: any = await client.callTool({ name, arguments: args });
  expect(result.isError).not.toBe(true);
  return JSON.parse(result.content[0].text);
}

describe('coerência dashboard e contratos no protocolo MCP', () => {
  it('dashboard distingue cadastro agosto e caixa setembro, inclusive quando a data original está fora do período', async () => {
    const client = await connect([entry(1, 200, 'Recebido', { data_recebimento: '2026-09-05' })], [entry(2, 100, 'Pago', { data_pagamento: '2026-09-02' })]);
    const ago = await call(client, 'consultar_dashboard', { mes: 8, ano: 2026 });
    expect(ago.receitas.total.valor).toBe(200);
    expect(ago.despesas.total.valor).toBe(100);
    expect(ago.saldo_realizado.valor).toBe(0);
    expect(ago.receitas.recebido.valor).toBe(0);
    expect(ago.despesas.pago.valor).toBe(0);
    const set = await call(client, 'consultar_dashboard', { mes: 9, ano: 2026 });
    expect(set.receitas.total.valor).toBe(0);
    expect(set.receitas.recebido.valor).toBe(200);
    expect(set.despesas.pago.valor).toBe(100);
    expect(set.saldo_realizado.valor).toBe(100);
    expect(set.base_temporal.recebido_pago_e_saldo_realizado).toContain('data_recebimento');
  });

  it('dashboard ignora cancelamento por status e nunca transforma status desconhecido em pendente', async () => {
    const client = await connect([entry(1, 500, 'Cancelado'), entry(2, 70, 'Desconhecido'), entry(3, 40, 'Aguardando')]);
    const r = await call(client, 'consultar_dashboard', { mes: 8, ano: 2026 });
    expect(r.receitas.total.valor).toBe(110);
    expect(r.receitas.pendente.valor).toBe(40);
    expect(r.qualidade_dados.status_indefinido_nos_cadastros.receitas).toEqual({ quantidade: 1, valor: 70 });
    expect(r.qualidade_dados.sem_vencimento.quantidade).toBe(1);
  });

  it('qualidade de contratos não apresenta cancelados como pendentes de vínculo', async () => {
    const client = await connect([entry(1, 500, 'Cancelado'), entry(2, 70, 'Aguardando', { cancelado: true }), entry(3, 40, 'Aguardando')]);
    const r = await call(client, 'relatorio_contratos', {});
    expect(r.qualidade_dados.receitas_sem_contrato).toBe(1);
  });

  it('status desconhecido fica fora de totais de contrato e impede inferência de status/percentual', () => {
    const rows = [entry(1, 100, 'Recebido'), entry(2, 50, 'Aguardando'), entry(3, 999, 'Desconhecido'), entry(4, 500, 'Cancelado')] as ReceitaRow[];
    const resumo = resumirReceitas(rows);
    expect(resumo.prevista).toBe(150);
    expect(resumo.recebida).toBe(100);
    expect(resumo.pendente).toBe(50);
    expect(resumo.status_indefinido).toEqual({ quantidade: 1, valor: 999 });
    expect(statusFinanceiro(resumo)).toBeNull();
    expect(percentualRecebido(resumo)).toBeNull();
    const m = montarContrato({ id: uuid(40), nome: 'Contrato sintético', valor_contrato: 1000 }, rows);
    const financeiro = m.saida.financeiro as any;
    expect(financeiro.status_financeiro).toBeNull();
    expect(financeiro.requer_revisao).toBe(true);
    expect(financeiro.status_indefinido.valor).toBe(999);
  });
});
