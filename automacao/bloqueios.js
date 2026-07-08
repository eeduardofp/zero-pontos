// ─── BLOQUEIOS ───────────────────────────────────────────────
// Registro local (JSON) de placas que o Detran recusa consultar
// (veículo protegido — cliente não autorizou). Persistido entre
// execuções para que o robô pule essas placas nas próximas rodadas.
// Arquivo fica em logs/ (gitignored) — é estado local da máquina.
const fs = require('fs')
const path = require('path')

const PADRAO = path.join(__dirname, 'logs', 'placas-bloqueadas.json')

function carregar(arquivo = PADRAO) {
  let mapa = {}
  try {
    mapa = JSON.parse(fs.readFileSync(arquivo, 'utf8'))
  } catch { mapa = {} }

  function salvar() {
    fs.mkdirSync(path.dirname(arquivo), { recursive: true })
    fs.writeFileSync(arquivo, JSON.stringify(mapa, null, 1), 'utf8')
  }

  return {
    estaBloqueada(placaId) { return !!mapa[placaId] },
    bloquear(placaId, dados) {
      if (mapa[placaId]) return
      mapa[placaId] = { ...dados, em: new Date().toISOString() }
      salvar()
    },
    lista() { return Object.entries(mapa).map(([id, v]) => ({ placaId: id, ...v })) }
  }
}

module.exports = { carregar }
