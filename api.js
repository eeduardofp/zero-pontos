// ─── API ─────────────────────────────────────────────────────
// Toda comunicação com o Supabase passa por aqui
const API = (() => {
  function db() {
    return Auth.getClient()
  }

  // Supabase corta em 1000 linhas por padrão (PostgREST max-rows), sem erro
  // nenhum — silenciosamente. Qualquer select() de lista precisa paginar.
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

  // ── CLIENTES ──────────────────────────────────────────────
  async function getClientes() {
    return buscarTudo(db().from('clientes').select('*').order('nome'))
  }

  async function createCliente(c) {
    const { data, error } = await db()
      .from('clientes')
      .insert(c)
      .select()
      .single()
    if (error) throw error
    return data
  }

  async function updateCliente(id, fields) {
    const { data, error } = await db()
      .from('clientes')
      .update(fields)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  }

  // ── PLACAS ────────────────────────────────────────────────
  async function getPlacas() {
    return buscarTudo(db().from('placas').select('*'))
  }

  async function createPlaca(p) {
    const { data, error } = await db()
      .from('placas')
      .insert(p)
      .select()
      .single()
    if (error) throw error
    return data
  }

  // ── AITs ──────────────────────────────────────────────────
  async function getAITs() {
    return buscarTudo(db().from('aits').select('*').order('created_at', { ascending: false }))
  }

  async function createAIT(a) {
    const { data, error } = await db()
      .from('aits')
      .insert(a)
      .select()
      .single()
    if (error) throw error
    return data
  }

  async function updateAIT(id, fields) {
    const { data, error } = await db()
      .from('aits')
      .update(fields)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  }

  // ── CARGA INICIAL (tudo de uma vez) ───────────────────────
  async function loadAll() {
    const [clientes, placas, aits] = await Promise.all([
      getClientes(),
      getPlacas(),
      getAITs()
    ])
    return { clientes, placas, aits }
  }

  return {
    getClientes, createCliente, updateCliente,
    getPlacas, createPlaca,
    getAITs, createAIT, updateAIT,
    loadAll
  }
})()
