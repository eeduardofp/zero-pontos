// ─── PAINEL ──────────────────────────────────────────────────
// Servidor local do painel visual. Só escuta em 127.0.0.1.
// Uso: node painel.js  (abre o navegador sozinho)
const http = require('http')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const S = require('./supabase.js')
const Rodada = require('./rodada.js')

const PORTA = 8321
const ESTATICOS = path.join(__dirname, 'painel')

// ── estado corrente da rodada (fonte de verdade para o SSE) ──
const estado = {
  fase: 'ocioso',            // ocioso | rodando | aguardando | fim
  dryRun: true,
  rotulo: '',
  total: 0,
  feitas: 0,
  contadores: {},
  ultimas: [],               // [{placa, novos:[{codigo,tipo,alteracao,detalhe}]}]
  espera: null,              // {tipo, msg}
  resumo: null,
  arqRelatorio: null,
  parou: false,
  erro: null
}
let clientesSSE = []
let resolverEspera = null
let pedirParada = false

function broadcast() {
  const linha = `event: estado\ndata: ${JSON.stringify(estado)}\n\n`
  clientesSSE = clientesSSE.filter(res => !res.writableEnded)
  for (const res of clientesSSE) res.write(linha)
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(obj))
}

async function lerCorpo(req) {
  let corpo = ''
  for await (const c of req) corpo += c
  return corpo ? JSON.parse(corpo) : {}
}

// Clientes e placas para o dropdown do painel. TODAS as placas cadastradas —
// o garimpo comercial acha multa nova também em veículo sem AIT ativa.
async function dados() {
  await S.login()
  const { placas, clientes } = await S.carregarAtivas()
  return {
    clientes: clientes
      .filter(c => placas.some(p => p.cliente_id === c.id))
      .map(c => ({ id: c.id, nome: c.nome, placas: placas.filter(p => p.cliente_id === c.id).length })),
    placas: placas.map(p => ({
      id: p.id,
      clienteId: p.cliente_id,
      placa: p.placa,
      cliente: (clientes.find(c => c.id === p.cliente_id) || {}).nome || '—'
    }))
  }
}

async function iniciar(corpo) {
  if (estado.fase === 'rodando' || estado.fase === 'aguardando') {
    throw Object.assign(new Error('Já existe uma rodada em andamento'), { code: 409 })
  }
  const consultarStatus = corpo.status !== false
  const consultarComercial = corpo.comercial !== false
  if (!consultarStatus && !consultarComercial) {
    throw Object.assign(new Error('Ative pelo menos uma consulta (status ou comercial)'), { code: 400 })
  }
  const d = await dados()
  let alvoIds = null
  let rotulo = consultarComercial ? 'todas as placas cadastradas' : 'todas as placas com AIT ativa'
  if (corpo.modo === 'cliente') {
    const cli = d.clientes.find(c => c.id === corpo.id)
    if (!cli) throw Object.assign(new Error('Cliente inválido'), { code: 400 })
    alvoIds = new Set(d.placas.filter(p => p.clienteId === corpo.id).map(p => p.id))
    rotulo = `cliente ${cli.nome}`
  } else if (corpo.modo === 'placa') {
    const pl = d.placas.find(p => p.id === corpo.id)
    if (!pl) throw Object.assign(new Error('Placa inválida'), { code: 400 })
    alvoIds = new Set([pl.id])
    rotulo = `placa ${pl.placa}`
  }

  const escopo = consultarStatus && consultarComercial ? 'status + comercial'
               : consultarComercial ? 'só garimpo comercial' : 'só status das AITs'
  Object.assign(estado, {
    fase: 'rodando', dryRun: !!corpo.dryRun, rotulo: `${rotulo} · ${escopo}`,
    total: 0, feitas: 0, contadores: {}, ultimas: [], espera: null,
    resumo: null, arqRelatorio: null, parou: false, erro: null
  })
  pedirParada = false
  broadcast()

  // roda em background; painel acompanha via SSE
  Rodada.executar({
    alvoIds,
    dryRun: !!corpo.dryRun,
    consultarStatus,
    consultarComercial,
    emit: (ev, dd) => {
      if (ev === 'inicio') estado.total = dd.total
      if (ev === 'placa') {
        estado.feitas = dd.n
        for (const item of dd.novos) estado.contadores[item.tipo] = (estado.contadores[item.tipo] || 0) + 1
        estado.ultimas.unshift({ placa: dd.placa, novos: dd.novos })
        estado.ultimas = estado.ultimas.slice(0, 20)
      }
      if (ev === 'fim') {
        estado.fase = 'fim'
        estado.resumo = dd.resumo
        estado.arqRelatorio = dd.arqRelatorio
        estado.parou = dd.parou
      }
      broadcast()
    },
    aguardarConfirmacao: (tipo, msg) => new Promise(resolve => {
      estado.fase = 'aguardando'
      estado.espera = { tipo, msg }
      resolverEspera = () => {
        estado.fase = 'rodando'
        estado.espera = null
        resolverEspera = null
        broadcast()
        resolve()
      }
      broadcast()
    }),
    deveParar: () => pedirParada
  }).catch(e => {
    estado.fase = 'fim'
    estado.erro = e.message
    broadcast()
  })
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${PORTA}`)
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      return res.end(fs.readFileSync(path.join(ESTATICOS, 'index.html')))
    }
    if (req.method === 'GET' && url.pathname === '/logo.svg') {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' })
      return res.end(fs.readFileSync(path.join(ESTATICOS, 'logo.svg')))
    }
    if (req.method === 'GET' && url.pathname === '/api/dados') return json(res, 200, await dados())
    if (req.method === 'GET' && url.pathname === '/api/eventos') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
      res.write(`event: estado\ndata: ${JSON.stringify(estado)}\n\n`)
      clientesSSE.push(res)
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/iniciar') {
      await iniciar(await lerCorpo(req))
      return json(res, 200, { ok: true })
    }
    if (req.method === 'POST' && url.pathname === '/api/continuar') {
      if (resolverEspera) resolverEspera()
      return json(res, 200, { ok: true })
    }
    if (req.method === 'POST' && url.pathname === '/api/parar') {
      pedirParada = true
      return json(res, 200, { ok: true })
    }
    if (req.method === 'POST' && url.pathname === '/api/reiniciar') {
      // "Nova consulta": só permitido fora de uma rodada ativa — evita
      // resetar o estado embaixo de uma execução em andamento
      if (estado.fase === 'rodando' || estado.fase === 'aguardando') {
        throw Object.assign(new Error('Rodada em andamento — pare antes de reiniciar'), { code: 409 })
      }
      Object.assign(estado, {
        fase: 'ocioso', dryRun: true, rotulo: '', total: 0, feitas: 0,
        contadores: {}, ultimas: [], espera: null, resumo: null,
        arqRelatorio: null, parou: false, erro: null
      })
      broadcast()
      return json(res, 200, { ok: true })
    }
    json(res, 404, { erro: 'não encontrado' })
  } catch (e) {
    json(res, e.code || 500, { erro: e.message })
  }
})

server.listen(PORTA, '127.0.0.1', () => {
  console.log(`Painel: http://localhost:${PORTA}`)
  if (!process.argv.includes('--sem-browser')) {
    try { execSync(`start "" "http://localhost:${PORTA}"`, { shell: 'cmd.exe' }) } catch {}
  }
})
server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.error(`Porta ${PORTA} ocupada — o painel já está aberto? Feche a outra janela e tente de novo.`)
    process.exit(1)
  }
  throw e
})
