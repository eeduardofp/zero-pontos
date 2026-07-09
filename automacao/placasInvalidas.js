// ─── PLACAS INVÁLIDAS ────────────────────────────────────────
// Lista dedicada, gerada em CSV, das placas puladas por dado de cadastro
// ruim (placa ou renavam inválidos) — pra revisão e correção manual depois
// da rodada. Separada do relatório grande pra ser fácil de ler direto.
const fs = require('fs')
const path = require('path')

function novoCaminho() {
  const dir = path.join(__dirname, 'logs')
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, `placas-invalidas-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`)
}

function campoCSV(v) {
  const s = String(v == null ? '' : v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// lista: [{ cliente, placa, renavam, motivo }]
function gerarCSV(lista) {
  const linhas = lista.map(l => [l.cliente, l.placa, l.renavam, l.motivo].map(campoCSV).join(','))
  return ['cliente,placa,renavam,motivo', ...linhas].join('\n')
}

function gerar(lista, arqFixo) {
  const arq = arqFixo || novoCaminho()
  fs.writeFileSync(arq, gerarCSV(lista))
  return arq
}

module.exports = { novoCaminho, gerarCSV, gerar }
