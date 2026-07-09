// ─── CONSULTA DE RECURSOS ────────────────────────────────────
// Uso: node index.js [--dry-run]
const readline = require('readline')
const S = require('./supabase.js')
const D = require('./detran.js')
const M = require('./mapeamento.js')
const R = require('./relatorio.js')
const Bloq = require('./bloqueios.js')
const Sel = require('./selecao.js')

const DRY = process.argv.includes('--dry-run')
const PAUSA_ENTRE_PLACAS_MS = 3000
const MAX_TROCAS_LIMITE = 10   // teto de trocas de conta antes de encerrar a rodada

const STATUS_LABEL = a =>
  `DP:${a.defesa_previa || '—'} | JARI:${a.jari || '—'} | 2ª:${a.segunda_instancia || '—'}`

const sleep = ms => new Promise(r => setTimeout(r, ms))

// Pergunta no console e devolve o que foi digitado
function perguntar(msg) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(res => rl.question(msg, resp => { rl.close(); res(resp) }))
}

// Espera o usuário teclar ENTER no console (gate de login / troca de conta)
const esperarEnter = msg => perguntar(msg)

// Menu inicial: todas as AITs, um cliente ou uma placa.
// → { ids: Set<placaId> | null (todas), rotulo }
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
      const n = parseInt(await perguntar('Número do cliente: '), 10)
      const cli = achados[n - 1]
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
        const n = parseInt(await perguntar('Número da placa: '), 10)
        alvo = achadas[n - 1]
        if (!alvo) { console.log('Opção inválida.'); continue }
      }
      console.log(`→ placa ${alvo.placa}`)
      return { ids: new Set([alvo.id]), rotulo: `placa ${alvo.placa}` }
    }
  }

  return { ids: null, rotulo: 'todas as AITs ativas' }
}

// Consulta o dossiê e devolve os itens de relatório para as AITs desta placa.
// Lê recursos/débitos e monta o update de cada AIT. Grava no Supabase se !DRY.
async function processarDossie(page, placa, aits, clientes) {
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
    // cards do site que citam o código desta AIT e pertencem a uma etapa da esteira.
    // Ordena do mais antigo para o mais novo: com dois processos na mesma
    // instância, o mais recente sobrescreve por último no montarUpdate.
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

    // diff real: só é "atualizado" se algum valor de fato mudou —
    // regravar o mesmo status não conta (antes 130 falsos "atualizado")
    const ROTULO = { defesa_previa: 'DP', jari: 'JARI', segunda_instancia: '2ª', encerrado: 'Encerrada', vencimento: 'Vencimento' }
    const mudancas = Object.keys(ROTULO)
      .filter(k => k in up && String(up[k] == null ? '' : up[k]) !== String(ait[k] == null ? '' : ait[k]))
    const alteracao = mudancas
      .map(k => `${ROTULO[k]}: ${ait[k] || '—'} → ${up[k]}`)
      .join('; ')

    if (!DRY) await S.updateAIT(ait.id, up)

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

async function main() {
  console.log(DRY ? '== DRY-RUN: nada será gravado ==' : '== Execução real ==')
  await S.login()
  const { aits, placas, clientes } = await S.carregarAtivas()
  const bloq = Bloq.carregar()
  console.log(`${aits.length} AITs ativas em ${new Set(aits.map(a => a.placa_id)).size} placas`)

  const porPlaca = new Map()
  for (const a of aits) {
    if (!porPlaca.has(a.placa_id)) porPlaca.set(a.placa_id, [])
    porPlaca.get(a.placa_id).push(a)
  }

  // Escopo da rodada: tudo, um cliente ou uma placa
  const alvo = await escolherAlvo(clientes, placas, porPlaca)

  // Login obrigatório e limpo a cada execução: apaga a sessão anterior antes
  // de abrir o browser, para você poder entrar com a conta que quiser.
  D.limparSessao()
  const { ctx, page } = await D.abrirBrowser()
  await D.irParaInicio(page)
  await esperarEnter('\n>>> Faça login no Detran Digital na janela do Chrome e tecle ENTER para começar... ')

  const itens = []
  const arqRelatorio = R.novoCaminho()   // caminho fixo — regravado a cada placa
  const flush = () => R.gerar(itens, DRY, arqRelatorio)

  const nomeCliente = placa => {
    const c = clientes.find(x => x.id === placa.cliente_id)
    return c ? c.nome : '—'
  }
  const marcarTodas = (placa, tipo, detalhe) => {
    for (const a of porPlaca.get(placa.id)) itens.push({ cliente: nomeCliente(placa), placa: placa.placa, codigo: a.codigo, tipo, detalhe })
  }

  const fila = [...porPlaca.keys()].filter(id => !alvo.ids || alvo.ids.has(id))
  console.log(`\nModo: ${alvo.rotulo} — ${fila.length} placa(s) na fila`)
  let n = 0
  let trocasLimite = 0

  for (let idx = 0; idx < fila.length; idx++) {
    const placaId = fila[idx]
    const aitsDaPlaca = porPlaca.get(placaId)
    const placa = placas.find(p => p.id === placaId)
    n++

    if (!placa) {
      for (const a of aitsDaPlaca) itens.push({ codigo: a.codigo, tipo: 'erro', detalhe: 'placa não encontrada no cadastro' })
      flush(); continue
    }

    // (4) placa já sabidamente protegida → pula sem consultar
    if (bloq.estaBloqueada(placaId)) {
      console.log(`[${n}/${fila.length}] ${placa.placa} — pulada (protegida)`)
      marcarTodas(placa, 'pulado-protegido', 'Bloqueada em rodada anterior — cliente sem autorização')
      flush(); continue
    }

    // (2) dados inválidos no cadastro → pula sem consultar, não toca ultima_att.
    // Mensagem aponta o campo a corrigir (a maioria é renavam em falta).
    const placaOk = M.placaValida(placa.placa)
    const renavamOk = M.renavamValido(placa.renavan)
    if (!placaOk || !renavamOk) {
      const falta = !placaOk && !renavamOk ? 'placa e renavam inválidos'
                  : !renavamOk ? `renavam ausente/inválido ("${placa.renavan}")`
                  : `placa inválida ("${placa.placa}")`
      console.log(`[${n}/${fila.length}] ${placa.placa} — ${falta}, pulando`)
      marcarTodas(placa, 'dados-invalidos', falta)
      flush(); continue
    }

    // cadastro guarda "QJC8G88/SC" e renavam formatado — o site quer limpo
    const placaLimpa = M.limparPlaca(placa.placa)
    const renavamLimpo = M.limparRenavam(placa.renavan)
    console.log(`[${n}/${fila.length}] ${placaLimpa}...`)

    let tentativaTecnica = 0
    let resolvido = false
    while (!resolvido) {
      let desfecho
      try {
        desfecho = await D.abrirDossie(page, placaLimpa, renavamLimpo)
      } catch (e) {
        // erro técnico (navegação/timeout): 1 retry, depois marca erro
        tentativaTecnica++
        if (tentativaTecnica > 1) {
          const shot = await D.screenshotErro(page, placaLimpa)
          marcarTodas(placa, 'erro', `${e.message} (screenshot: ${shot})`)
          break
        }
        console.log(`  falhou (${e.message}), tentando de novo...`)
        continue
      }

      if (desfecho.status === 'ok') {
        const novos = await processarDossie(page, placa, aitsDaPlaca, clientes)
        itens.push(...novos)
        resolvido = true
      } else if (desfecho.status === 'protegido') {
        // (4) registra bloqueio para pular nas próximas rodadas
        bloq.bloquear(placaId, { placa: placa.placa, motivo: 'protegido' })
        marcarTodas(placa, 'sem-permissao', 'Veículo protegido — cliente não autorizou (flagada para próximas rodadas)')
        resolvido = true
      } else if (desfecho.status === 'limite') {
        // (3) limite atingido → oferece TROCAR DE CONTA e RETENTA a mesma placa.
        // Apaga a sessão para forçar novo login com outra conta.
        trocasLimite++
        if (trocasLimite > MAX_TROCAS_LIMITE) {
          console.log('\nLimite atingido em várias contas seguidas. Encerrando rodada.')
          marcarTodas(placa, 'limite', 'Limite persistente — placa não consultada nesta rodada')
          flush()
          await ctx.close()
          R.abrir(arqRelatorio)
          console.log(`\nRelatório parcial: ${arqRelatorio}`)
          console.log('Rode de novo mais tarde: placas já feitas saem rápido, protegidas são puladas.')
          return
        }
        console.log(`\n⚠  Limite de consultas atingido nesta conta (troca ${trocasLimite}/${MAX_TROCAS_LIMITE}).`)
        // desloga a conta atual sem fechar o Chrome
        await ctx.clearCookies().catch(() => {})
        await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear() } catch {} }).catch(() => {})
        await D.irParaInicio(page)
        await esperarEnter('>>> Faça login com OUTRA conta na janela e tecle ENTER para continuar de onde parou... ')
        // não marca resolvido → volta ao while e reconsulta a mesma placa
      } else {
        // desfecho desconhecido — guarda texto p/ refino e segue
        const shot = await D.screenshotErro(page, placaLimpa)
        const semResposta = !/erro/i.test(desfecho.texto)
        const detalhe = semResposta
          ? `site não retornou o dossiê (veículo fora de SC?) (screenshot: ${shot})`
          : `desfecho não reconhecido: "${desfecho.texto.slice(0, 200)}" (screenshot: ${shot})`
        marcarTodas(placa, 'erro', detalhe)
        resolvido = true
      }
    }

    flush()
    await sleep(PAUSA_ENTRE_PLACAS_MS)
  }

  await ctx.close()
  flush()
  R.abrir(arqRelatorio)
  console.log(`\nRelatório: ${arqRelatorio}`)
}

main().catch(e => { console.error(e); process.exit(1) })
