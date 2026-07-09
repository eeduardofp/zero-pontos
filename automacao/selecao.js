// ─── SELEÇÃO ─────────────────────────────────────────────────
// Busca de cliente/placa para o modo de consulta específica.
// Lógica pura — o prompt interativo fica no index.js.
const M = require('./mapeamento.js')

// minúsculas + sem acento, para busca tolerante
function chave(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function buscarClientes(clientes, termo) {
  const t = chave(termo).trim()
  if (!t) return []
  return clientes.filter(c => chave(c.nome).includes(t))
}

function buscarPlacas(placas, termo) {
  const t = M.limparPlaca(termo)
  if (!t) return []
  return placas.filter(p => M.limparPlaca(p.placa).includes(t))
}

function placasDoCliente(placas, clienteId) {
  return placas.filter(p => p.cliente_id === clienteId)
}

module.exports = { buscarClientes, buscarPlacas, placasDoCliente }
