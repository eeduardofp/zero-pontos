# Painel Visual da Consulta de Recursos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Painel web local (localhost:8321) com a identidade Zero Pontos que substitui o terminal: escolha de escopo com dropdown, dry-run como chave, progresso ao vivo via SSE, gates de login como botões.

**Architecture:** Motor da rodada extraído de `index.js` para `rodada.js` (EventEmitter-style via callbacks; pontos de espera viram promises externas). `painel.js` = servidor HTTP nativo (static + API + SSE) que roda o motor; `index.js` vira CLI fino usando o mesmo motor. `.bat` passa a abrir o painel.

**Tech Stack:** Node.js nativo (http, fs), HTML/CSS/JS vanilla (sem build), SSE. Zero dependências novas.

**Spec:** `docs/superpowers/specs/2026-07-08-painel-consulta-design.md`
**Working dir:** `C:\Users\eduar\dev\zero-pontos`

---

### Task 1: `rodada.js` — extrair o motor

**Files:**
- Create: `automacao/rodada.js` (lógica movida de `automacao/index.js`)
- Modify: `automacao/index.js` (vira CLI fino)

- [ ] **Step 1: Criar `automacao/rodada.js`** com a lógica do loop atual de `index.js`, parametrizada:

```js
// ─── RODADA ──────────────────────────────────────────────────
// Motor da consulta: percorre a fila de placas, consulta o Detran e
// atualiza o workspace. Sem I/O de console — quem chama (CLI ou painel)
// fornece callbacks de progresso e de espera.
const S = require('./supabase.js')
const D = require('./detran.js')
const M = require('./mapeamento.js')
const R = require('./relatorio.js')
const Bloq = require('./bloqueios.js')

const PAUSA_ENTRE_PLACAS_MS = 3000
const MAX_TROCAS_LIMITE = 10

const STATUS_LABEL = a =>
  `DP:${a.defesa_previa || '—'} | JARI:${a.jari || '—'} | 2ª:${a.segunda_instancia || '—'}`

const sleep = ms => new Promise(r => setTimeout(r, ms))

// opcoes: {
//   alvoIds: Set<placaId>|null,          // null = todas
//   dryRun: boolean,
//   emit: (evento, dados) => void,       // 'inicio'|'placa'|'aviso'|'fim'
//   aguardarConfirmacao: async (tipo, msg) => void,  // 'login'|'limite'
//   deveParar: () => boolean             // true => encerra após a placa atual
// }
// retorna { resumo, arqRelatorio, itens }
async function executar(opcoes) {
  const { alvoIds, dryRun, emit, aguardarConfirmacao, deveParar } = opcoes

  await S.login()
  const { aits, placas, clientes } = await S.carregarAtivas()
  const bloq = Bloq.carregar()

  const porPlaca = new Map()
  for (const a of aits) {
    if (!porPlaca.has(a.placa_id)) porPlaca.set(a.placa_id, [])
    porPlaca.get(a.placa_id).push(a)
  }
  const fila = [...porPlaca.keys()].filter(id => !alvoIds || alvoIds.has(id))

  // Login obrigatório e limpo a cada execução
  D.limparSessao()
  const { ctx, page } = await D.abrirBrowser()
  await D.irParaInicio(page)
  await aguardarConfirmacao('login', 'Faça login no Detran Digital na janela do Chrome e clique em Continuar.')

  const itens = []
  const arqRelatorio = R.novoCaminho()
  const flush = () => R.gerar(itens, dryRun, arqRelatorio)

  const nomeCliente = placa => {
    const c = clientes.find(x => x.id === placa.cliente_id)
    return c ? c.nome : '—'
  }
  const marcarTodas = (placa, tipo, detalhe) => {
    const novos = porPlaca.get(placa.id).map(a => ({
      cliente: nomeCliente(placa), placa: placa.placa, codigo: a.codigo, tipo, detalhe
    }))
    itens.push(...novos)
    return novos
  }

  emit('inicio', { total: fila.length, dryRun })
  let n = 0
  let trocasLimite = 0
  let parou = false

  for (const placaId of fila) {
    if (deveParar()) { parou = true; break }
    const aitsDaPlaca = porPlaca.get(placaId)
    const placa = placas.find(p => p.id === placaId)
    n++
    let novos = []

    if (!placa) {
      novos = aitsDaPlaca.map(a => ({ codigo: a.codigo, tipo: 'erro', detalhe: 'placa não encontrada no cadastro' }))
      itens.push(...novos)
      emit('placa', { n, total: fila.length, placa: '—', novos }); flush(); continue
    }

    if (bloq.estaBloqueada(placaId)) {
      novos = marcarTodas(placa, 'pulado-protegido', 'Bloqueada em rodada anterior — cliente sem autorização')
      emit('placa', { n, total: fila.length, placa: placa.placa, novos }); flush(); continue
    }

    const placaOk = M.placaValida(placa.placa)
    const renavamOk = M.renavamValido(placa.renavan)
    if (!placaOk || !renavamOk) {
      const falta = !placaOk && !renavamOk ? 'placa e renavam inválidos'
                  : !renavamOk ? `renavam ausente/inválido ("${placa.renavan}")`
                  : `placa inválida ("${placa.placa}")`
      novos = marcarTodas(placa, 'dados-invalidos', falta)
      emit('placa', { n, total: fila.length, placa: placa.placa, novos }); flush(); continue
    }

    const placaLimpa = M.limparPlaca(placa.placa)
    const renavamLimpo = M.limparRenavam(placa.renavan)

    let tentativaTecnica = 0
    let resolvido = false
    while (!resolvido) {
      let desfecho
      try {
        desfecho = await D.abrirDossie(page, placaLimpa, renavamLimpo)
      } catch (e) {
        tentativaTecnica++
        if (tentativaTecnica > 1) {
          const shot = await D.screenshotErro(page, placaLimpa)
          novos = marcarTodas(placa, 'erro', `${e.message} (screenshot: ${shot})`)
          break
        }
        continue
      }

      if (desfecho.status === 'ok') {
        novos = await processarDossie(page, placa, aitsDaPlaca, clientes, dryRun)
        itens.push(...novos)
        resolvido = true
      } else if (desfecho.status === 'protegido') {
        bloq.bloquear(placaId, { placa: placa.placa, motivo: 'protegido' })
        novos = marcarTodas(placa, 'sem-permissao', 'Veículo protegido — cliente não autorizou (flagada para próximas rodadas)')
        resolvido = true
      } else if (desfecho.status === 'limite') {
        trocasLimite++
        if (trocasLimite > MAX_TROCAS_LIMITE) {
          novos = marcarTodas(placa, 'limite', 'Limite persistente — placa não consultada nesta rodada')
          parou = true
          resolvido = true
        } else {
          emit('aviso', { tipo: 'limite', msg: `Limite de consultas atingido (troca ${trocasLimite}/${MAX_TROCAS_LIMITE}).` })
          await ctx.clearCookies().catch(() => {})
          await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear() } catch {} }).catch(() => {})
          await D.irParaInicio(page)
          await aguardarConfirmacao('limite', 'Limite atingido. Faça login com OUTRA conta na janela do Chrome e clique em Continuar.')
        }
      } else {
        const shot = await D.screenshotErro(page, placaLimpa)
        const semResposta = !/erro/i.test(desfecho.texto)
        const detalhe = semResposta
          ? `site não retornou o dossiê (veículo fora de SC?) (screenshot: ${shot})`
          : `desfecho não reconhecido: "${desfecho.texto.slice(0, 200)}" (screenshot: ${shot})`
        novos = marcarTodas(placa, 'erro', detalhe)
        resolvido = true
      }
    }

    emit('placa', { n, total: fila.length, placa: placa.placa, novos })
    flush()
    if (parou) break
    await sleep(PAUSA_ENTRE_PLACAS_MS)
  }

  await ctx.close()
  flush()
  const resumo = {}
  for (const i of itens) resumo[i.tipo] = (resumo[i.tipo] || 0) + 1
  emit('fim', { resumo, arqRelatorio, parou })
  return { resumo, arqRelatorio, itens }
}

// Consulta um dossiê aberto e devolve os itens de relatório das AITs da placa.
async function processarDossie(page, placa, aits, clientes, dryRun) {
  const cliente = clientes.find(c => c.id === placa.cliente_id)
  const nomeCliente = cliente ? cliente.nome : '—'
  const itens = []

  const recursos = await D.todosRecursos(page)
  const precisaDebitos = recursos.some(r => {
    const m = M.mapResultado(r.resultado)
    return m && m.precisaDataLimite
  })
  const debitos = precisaDebitos ? await D.todosDebitos(page) : []

  for (const ait of aits) {
    const achados = recursos
      .filter(r => r.instancia && M.contemCodigo(r.texto, ait.codigo))
      .sort((a, b) => (a.dataRequerimento || '').localeCompare(b.dataRequerimento || ''))
      .map(r => ({
        instancia: r.instancia,
        resultado: r.resultado,
        dataLimite: (debitos.find(d => M.contemCodigo(d.texto, ait.codigo)) || {}).data || null
      }))
    const up = M.montarUpdate(ait, achados)
    const antes = STATUS_LABEL(ait)

    const ROTULO = { defesa_previa: 'DP', jari: 'JARI', segunda_instancia: '2ª', encerrado: 'Encerrada', vencimento: 'Vencimento' }
    const mudancas = Object.keys(ROTULO)
      .filter(k => k in up && String(up[k] == null ? '' : up[k]) !== String(ait[k] == null ? '' : ait[k]))
    const alteracao = mudancas.map(k => `${ROTULO[k]}: ${ait[k] || '—'} → ${up[k]}`).join('; ')

    if (!dryRun) await S.updateAIT(ait.id, up)

    itens.push({
      cliente: nomeCliente, placa: placa.placa, codigo: ait.codigo,
      tipo: achados.length === 0 ? 'nao-encontrado' : (mudancas.length ? 'atualizado' : 'sem-mudanca'),
      alteracao,
      antes, depois: STATUS_LABEL({ ...ait, ...up }),
      vencimento: up.vencimento || '',
      detalhe: up.encerrado ? 'AIT encerrada' : ''
    })
  }
  return itens
}

module.exports = { executar }
```

- [ ] **Step 2: Reescrever `automacao/index.js` como CLI fino** (mantém menu e prompts; usa o motor):

```js
// ─── CONSULTA DE RECURSOS (CLI) ──────────────────────────────
// Uso: node index.js [--dry-run]  — interface de reserva; o painel
// (painel.js) é a interface principal. Ambos usam rodada.js.
const readline = require('readline')
const S = require('./supabase.js')
const Sel = require('./selecao.js')
const Rodada = require('./rodada.js')
const R = require('./relatorio.js')

const DRY = process.argv.includes('--dry-run')

function perguntar(msg) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(res => rl.question(msg, resp => { rl.close(); res(resp) }))
}

async function escolherAlvo(clientes, placas, porPlaca) {
  console.log('\nO que consultar?')
  console.log(' [1] Todas as AITs ativas  (Enter = padrão)')
  console.log(' [2] Cliente específico')
  console.log(' [3] Placa específica')
  const op = (await perguntar('Opção: ')).trim()

  if (op === '2') {
    while (true) {
      const termo = await perguntar('\nNome (ou parte) do cliente: ')
      const achados = Sel.buscarClientes(clientes, termo).slice(0, 15)
      if (!achados.length) { console.log('Nenhum cliente encontrado. Tente de novo.'); continue }
      achados.forEach((c, i) => console.log(` [${i + 1}] ${c.nome}`))
      const nEsc = parseInt(await perguntar('Número do cliente: '), 10)
      const cli = achados[nEsc - 1]
      if (!cli) { console.log('Opção inválida.'); continue }
      const ids = new Set(Sel.placasDoCliente(placas, cli.id).map(p => p.id))
      const ativas = [...ids].filter(id => porPlaca.has(id))
      if (!ativas.length) { console.log(`${cli.nome} não tem AITs ativas. Tente outro.`); continue }
      console.log(`→ ${cli.nome}: ${ativas.length} placa(s) com AITs ativas`)
      return { ids, rotulo: `cliente ${cli.nome}` }
    }
  }

  if (op === '3') {
    while (true) {
      const termo = await perguntar('\nPlaca (ou parte): ')
      const achadas = Sel.buscarPlacas(placas, termo).filter(p => porPlaca.has(p.id)).slice(0, 15)
      if (!achadas.length) { console.log('Nenhuma placa com AITs ativas encontrada. Tente de novo.'); continue }
      let alvo = achadas[0]
      if (achadas.length > 1) {
        achadas.forEach((p, i) => console.log(` [${i + 1}] ${p.placa}`))
        const nEsc = parseInt(await perguntar('Número da placa: '), 10)
        alvo = achadas[nEsc - 1]
        if (!alvo) { console.log('Opção inválida.'); continue }
      }
      console.log(`→ placa ${alvo.placa}`)
      return { ids: new Set([alvo.id]), rotulo: `placa ${alvo.placa}` }
    }
  }

  return { ids: null, rotulo: 'todas as AITs ativas' }
}

async function main() {
  console.log(DRY ? '== DRY-RUN: nada será gravado ==' : '== Execução real ==')
  await S.login()
  const { aits, placas, clientes } = await S.carregarAtivas()
  const porPlaca = new Map()
  for (const a of aits) {
    if (!porPlaca.has(a.placa_id)) porPlaca.set(a.placa_id, [])
    porPlaca.get(a.placa_id).push(a)
  }
  console.log(`${aits.length} AITs ativas em ${porPlaca.size} placas`)

  const alvo = await escolherAlvo(clientes, placas, porPlaca)
  console.log(`\nModo: ${alvo.rotulo}`)

  const { arqRelatorio } = await Rodada.executar({
    alvoIds: alvo.ids,
    dryRun: DRY,
    emit: (ev, d) => {
      if (ev === 'inicio') console.log(`${d.total} placa(s) na fila`)
      if (ev === 'placa') console.log(`[${d.n}/${d.total}] ${d.placa}`)
      if (ev === 'aviso') console.log(`\n⚠  ${d.msg}`)
      if (ev === 'fim') console.log('\nResumo:', JSON.stringify(d.resumo))
    },
    aguardarConfirmacao: (tipo, msg) => perguntar(`\n>>> ${msg} Depois tecle ENTER... `),
    deveParar: () => false
  })
  R.abrir(arqRelatorio)
  console.log(`\nRelatório: ${arqRelatorio}`)
}

main().catch(e => { console.error(e); process.exit(1) })
```

- [ ] **Step 3: Rodar suíte + sintaxe**

Run: `cd automacao && npm test && node --check rodada.js && node --check index.js`
Expected: 41 testes PASS, sem erro de sintaxe.

- [ ] **Step 4: Commit**

```bash
git add automacao/rodada.js automacao/index.js
git commit -m "refactor(automacao): motor da rodada extraido para rodada.js (CLI vira casca)"
```

---

### Task 2: Logo + página do painel

**Files:**
- Create: `automacao/painel/logo.svg` (cópia de `C:\Users\eduar\OneDrive\Documents\Zero Pontos\Redes sociais\Geral\Logo vetorizada.svg`)
- Create: `automacao/painel/index.html`

- [ ] **Step 1: Copiar a logo**

Run (PowerShell): `Copy-Item "C:\Users\eduar\OneDrive\Documents\Zero Pontos\Redes sociais\Geral\Logo vetorizada.svg" "C:\Users\eduar\dev\zero-pontos\automacao\painel\logo.svg"`

- [ ] **Step 2: Criar `automacao/painel/index.html`** — página única, 3 estados (configuração/execução/fim), busca com dropdown, SSE. Código completo na implementação (estrutura obrigatória):
  - header com `<img src="/logo.svg">` + título "Consulta de Recursos"
  - cartões de modo: todas / cliente / placa (radio estilizado)
  - campo busca com lista de sugestões (`div.sugestoes`) alimentada por `/api/dados`, filtro client-side (minúsculas sem acento; placa: só alfanuméricos maiúsculos)
  - chave dry-run (`input type=checkbox` estilizado) — padrão LIGADA
  - botão Iniciar → `POST /api/iniciar`
  - `EventSource('/api/eventos')` → evento `estado` re-renderiza tudo (barra de progresso, contadores por tipo com as cores do relatório, feed das últimas 20 placas, banner de espera com botão Continuar → `POST /api/continuar`, botão Parar → `POST /api/parar`, tela final com resumo + tabela de itens)
  - paleta: fundo `#f4f5f2`, cartões brancos arredondados, verde `#15803d` (ações), vermelho `#b91c1c` (alertas), fonte system-ui

- [ ] **Step 3: Commit**

```bash
git add automacao/painel/
git commit -m "feat(automacao): pagina do painel com logo Zero Pontos"
```

---

### Task 3: `painel.js` — servidor

**Files:**
- Create: `automacao/painel.js`

- [ ] **Step 1: Implementar `automacao/painel.js`**:

```js
// ─── PAINEL ──────────────────────────────────────────────────
// Servidor local do painel visual. Só escuta em 127.0.0.1.
// Uso: node painel.js  (abre o navegador sozinho)
const http = require('http')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const S = require('./supabase.js')
const Sel = require('./selecao.js')
const Rodada = require('./rodada.js')

const PORTA = 8321
const ESTATICOS = path.join(__dirname, 'painel')

// ── estado corrente da rodada (fonte de verdade para o SSE) ──
const estado = {
  fase: 'ocioso',            // ocioso | rodando | aguardando | fim
  dryRun: true,
  rotulo: '',
  total: 0, feitas: 0,
  contadores: {},
  ultimas: [],               // [{placa, novos:[{codigo,tipo,alteracao}]}]
  espera: null,              // {tipo, msg}
  resumo: null, arqRelatorio: null, parou: false,
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

async function dados() {
  await S.login()
  const { aits, placas, clientes } = await S.carregarAtivas()
  const ativas = new Set(aits.map(a => a.placa_id))
  const placasAtivas = placas.filter(p => ativas.has(p.id))
  const clientesComAtivas = clientes
    .filter(c => placasAtivas.some(p => p.cliente_id === c.id))
    .map(c => ({ id: c.id, nome: c.nome, placas: placasAtivas.filter(p => p.cliente_id === c.id).length }))
  return {
    clientes: clientesComAtivas,
    placas: placasAtivas.map(p => ({
      id: p.id, placa: p.placa,
      cliente: (clientes.find(c => c.id === p.cliente_id) || {}).nome || '—'
    }))
  }
}

async function iniciar(corpo) {
  if (estado.fase === 'rodando' || estado.fase === 'aguardando') throw Object.assign(new Error('Rodada em andamento'), { code: 409 })
  const d = await dados()
  let alvoIds = null
  let rotulo = 'todas as AITs ativas'
  if (corpo.modo === 'cliente') {
    const cli = d.clientes.find(c => c.id === corpo.id)
    if (!cli) throw Object.assign(new Error('Cliente inválido'), { code: 400 })
    alvoIds = new Set(Sel.placasDoCliente(d.placas.map(p => ({ ...p, cliente_id: null })), corpo.id).map(p => p.id))
    // placasDoCliente espera cliente_id — usar filtro direto:
    alvoIds = new Set(d.placas.filter(p => p.clienteId === corpo.id).map(p => p.id))
    rotulo = `cliente ${cli.nome}`
  } else if (corpo.modo === 'placa') {
    const pl = d.placas.find(p => p.id === corpo.id)
    if (!pl) throw Object.assign(new Error('Placa inválida'), { code: 400 })
    alvoIds = new Set([pl.id])
    rotulo = `placa ${pl.placa}`
  }

  Object.assign(estado, {
    fase: 'rodando', dryRun: !!corpo.dryRun, rotulo,
    total: 0, feitas: 0, contadores: {}, ultimas: [], espera: null,
    resumo: null, arqRelatorio: null, parou: false, erro: null
  })
  pedirParada = false
  broadcast()

  Rodada.executar({
    alvoIds,
    dryRun: !!corpo.dryRun,
    emit: (ev, dd) => {
      if (ev === 'inicio') { estado.total = dd.total }
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
    aguardarConfirmacao: (tipo, msg) => new Promise(res => {
      estado.fase = 'aguardando'
      estado.espera = { tipo, msg }
      resolverEspera = () => {
        estado.fase = 'rodando'
        estado.espera = null
        resolverEspera = null
        broadcast()
        res()
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

const MIME = { '.html': 'text/html', '.svg': 'image/svg+xml', '.css': 'text/css', '.js': 'text/javascript' }

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
    json(res, 404, { erro: 'não encontrado' })
  } catch (e) {
    json(res, e.code || 500, { erro: e.message })
  }
})

server.listen(PORTA, '127.0.0.1', () => {
  console.log(`Painel: http://localhost:${PORTA}`)
  try { execSync(`start "" "http://localhost:${PORTA}"`, { shell: 'cmd.exe' }) } catch {}
})
server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.error(`Porta ${PORTA} ocupada — o painel já está aberto? Feche a outra janela e tente de novo.`)
    process.exit(1)
  }
  throw e
})
```

Nota: corrigir na implementação o trecho de `alvoIds` de cliente — `dados()` deve expor `clienteId` em cada placa (`cliente_id` do banco) para o filtro direto funcionar; remover a linha morta com `Sel.placasDoCliente`.

- [ ] **Step 2: Sintaxe + smoke de API**

Run: `node --check painel.js`, subir servidor, `curl http://localhost:8321/api/dados` → JSON com clientes/placas.

- [ ] **Step 3: Commit**

```bash
git add automacao/painel.js
git commit -m "feat(automacao): servidor do painel (API + SSE)"
```

---

### Task 4: `.bat` e atalho

**Files:**
- Modify: `automacao/Consultar Recursos.bat`

- [ ] **Step 1: Atualizar o `.bat`**

```bat
@echo off
title Consulta de Recursos - Zero Pontos
cd /d "C:\Users\eduar\dev\zero-pontos\automacao"
node painel.js
echo.
pause
```

- [ ] **Step 2: Commit**

```bash
git add "automacao/Consultar Recursos.bat"
git commit -m "feat(automacao): atalho do desktop abre o painel"
```

---

### Task 5: Validação com usuário

- [ ] Abrir o atalho, painel carrega com logo; dry-run LIGADO por padrão.
- [ ] Modo placa → digitar `RYT` → dropdown mostra RYT0A74 → iniciar → gate de login → progresso → resultado na tela.
- [ ] Conferir que o CLI de reserva ainda funciona: `npm run dry-run`.
