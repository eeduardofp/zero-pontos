// ─── SUPABASE ────────────────────────────────────────────────
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')

let client = null

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
    client.from('aits').select('*').or('encerrado.is.null,encerrado.eq.false'),
    client.from('placas').select('*'),
    client.from('clientes').select('*')
  ])
  for (const r of [aits, placas, clientes]) if (r.error) throw r.error
  return { aits: aits.data, placas: placas.data, clientes: clientes.data }
}

async function updateAIT(id, fields) {
  const { error } = await client.from('aits').update(fields).eq('id', id)
  if (error) throw new Error(`Update AIT ${id} falhou: ${error.message}`)
}

// Base do garimpo comercial: códigos de TODAS as AITs (encerradas inclusive —
// serviço já vendido não é oportunidade) + oportunidades já registradas.
async function carregarComercial() {
  const [aits, ops] = await Promise.all([
    client.from('aits').select('codigo'),
    client.from('oportunidades').select('id, codigo_ait, placa_id, status')
  ])
  for (const r of [aits, ops]) if (r.error) throw r.error
  return {
    codigosAits: aits.data.map(a => a.codigo).filter(Boolean),
    oportunidades: ops.data
  }
}

async function criarOportunidade(obj) {
  const { error } = await client.from('oportunidades').insert(obj)
  if (error) throw new Error(`Insert oportunidade ${obj.codigo_ait} falhou: ${error.message}`)
}

module.exports = { login, carregarAtivas, updateAIT, carregarComercial, criarOportunidade }
