// ─── SUPABASE ────────────────────────────────────────────────
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')

let client = null

// Supabase corta em 1000 linhas por padrão (PostgREST max-rows), sem erro —
// silenciosamente. Bug real encontrado em 2026-07-09: uma tabela com 1032
// linhas ficou com 32 de fora numa consulta inteira sem nenhum aviso.
async function buscarTudo(query) {
  let tudo = [], de = 0
  const passo = 1000
  while (true) {
    const { data, error } = await query.range(de, de + passo - 1)
    if (error) throw error
    tudo = tudo.concat(data)
    if (data.length < passo) break
    de += passo
  }
  return tudo
}

async function login() {
  for (const v of ['SUPABASE_URL', 'SUPABASE_KEY', 'SUPABASE_EMAIL', 'SUPABASE_SENHA']) {
    if (!process.env[v]) throw new Error(`Variável ${v} ausente no .env`)
  }
  client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
  const { error } = await client.auth.signInWithPassword({
    email: process.env.SUPABASE_EMAIL,
    password: process.env.SUPABASE_SENHA
  })
  if (error) throw new Error(`Login Supabase falhou: ${error.message}`)
}

// AITs ativas (encerrado false OU null — app filtra !a.encerrado) + placas + clientes
async function carregarAtivas() {
  const [aits, placas, clientes] = await Promise.all([
    buscarTudo(client.from('aits').select('*').or('encerrado.is.null,encerrado.eq.false')),
    buscarTudo(client.from('placas').select('*')),
    buscarTudo(client.from('clientes').select('*'))
  ])
  return { aits, placas, clientes }
}

async function updateAIT(id, fields) {
  const { error } = await client.from('aits').update(fields).eq('id', id)
  if (error) throw new Error(`Update AIT ${id} falhou: ${error.message}`)
}

// Base do garimpo comercial: códigos de TODAS as AITs (encerradas inclusive —
// serviço já vendido não é oportunidade) + oportunidades já registradas.
async function carregarComercial() {
  const [aits, ops] = await Promise.all([
    buscarTudo(client.from('aits').select('codigo')),
    buscarTudo(client.from('oportunidades').select('id, codigo_ait, placa_id, status'))
  ])
  return {
    codigosAits: aits.map(a => a.codigo).filter(Boolean),
    oportunidades: ops
  }
}

async function criarOportunidade(obj) {
  const { error } = await client.from('oportunidades').insert(obj)
  if (error) throw new Error(`Insert oportunidade ${obj.codigo_ait} falhou: ${error.message}`)
}

// Suspensões de CNH ativas (encerrado false OU null)
async function carregarSuspensoesAtivas() {
  return buscarTudo(client.from('suspensoes').select('*').or('encerrado.is.null,encerrado.eq.false'))
}

async function updateSuspensao(id, fields) {
  const { error } = await client.from('suspensoes').update(fields).eq('id', id)
  if (error) throw new Error(`Update suspensão ${id} falhou: ${error.message}`)
}

// Migração do legado precisa de TUDO (AITs encerradas inclusive) e do
// client para gerar o JWT dos uploads no worker.
async function carregarTudoMigracao() {
  const [aits, placas, clientes, suspensoes, documentos] = await Promise.all([
    buscarTudo(client.from('aits').select('id, codigo, placa_id')),
    buscarTudo(client.from('placas').select('id, cliente_id')),
    buscarTudo(client.from('clientes').select('id, nome')),
    buscarTudo(client.from('suspensoes').select('id, cliente_id, processo')),
    buscarTudo(client.from('documentos').select('id, ait_id, cliente_id, suspensao_id, nome_arquivo, tamanho_bytes')),
  ])
  return { aits, placas, clientes, suspensoes, documentos }
}

function getClient() { return client }

module.exports = { login, carregarAtivas, updateAIT, carregarComercial, criarOportunidade, carregarSuspensoesAtivas, updateSuspensao, carregarTudoMigracao, getClient }
