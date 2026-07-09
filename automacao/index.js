// ─── CONSULTA DE RECURSOS (CLI) ──────────────────────────────
// Uso: node index.js [--dry-run] [--so-status | --so-comercial]
// Interface de reserva; o painel (painel.js) é a principal. Ambos usam rodada.js.
const readline = require('readline')
const S = require('./supabase.js')
const Sel = require('./selecao.js')
const Rodada = require('./rodada.js')
const R = require('./relatorio.js')

const DRY = process.argv.includes('--dry-run')
const SO_STATUS = process.argv.includes('--so-status')
const SO_COMERCIAL = process.argv.includes('--so-comercial')

function perguntar(msg) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(res => rl.question(msg, resp => { rl.close(); res(resp) }))
}

// Menu inicial: todas as AITs, um cliente ou uma placa.
async function escolherAlvo(clientes, placas, porPlaca) {
  console.log('\nO que consultar?')
  console.log(' [1] Todas as placas cadastradas  (Enter = padrão)')
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
      if (!ids.size) { console.log(`${cli.nome} não tem placas cadastradas. Tente outro.`); continue }
      console.log(`→ ${cli.nome}: ${ids.size} placa(s)`)
      return { ids, rotulo: `cliente ${cli.nome}` }
    }
  }

  if (op === '3') {
    while (true) {
      const termo = await perguntar('\nPlaca (ou parte): ')
      const achadas = Sel.buscarPlacas(placas, termo).slice(0, 15)
      if (!achadas.length) { console.log('Nenhuma placa encontrada. Tente de novo.'); continue }
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

  return { ids: null, rotulo: 'todas as placas cadastradas' }
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
    consultarStatus: !SO_COMERCIAL,
    consultarComercial: !SO_STATUS,
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
