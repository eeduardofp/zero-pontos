// ─── API ─────────────────────────────────────────────────────
// Toda comunicação com o Supabase passa por aqui
const API = (() => {
  function db() {
    return Auth.getClient()
  }

  // ── CLIENTES ──────────────────────────────────────────────
  async function getClientes() {
    const { data, error } = await db()
      .from('clientes')
      .select('*')
      .order('nome')
    if (error) throw error
    return data
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
    const { data, error } = await db()
      .from('placas')
      .select('*')
    if (error) throw error
    return data
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
    const { data, error } = await db()
      .from('aits')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
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
