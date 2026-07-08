// ─── CONSULTA DE RECURSOS ────────────────────────────────────
// Uso: node index.js [--dry-run]
const S = require('./supabase.js')
const D = require('./detran.js')
const M = require('./mapeamento.js')
const R = require('./relatorio.js')
const Bloq = require('./bloqueios.js')

const DRY = process.argv.includes('--dry-run')
const PAUSA_ENTRE_PLACAS_MS = 3000
const PAUSA_LIMITE_MS = 20 * 60 * 1000   // espera quando o Detran barra por limite
const MAX_PAUSAS_LIMITE = 6               // teto de pausas antes de encerrar a rodada

const STATUS_LABEL = a =>
  `DP:${a.defesa_previa || '—'} | JARI:${a.jari || '—'} | 2ª:${a.segunda_instancia || '—'}`

const sleep = ms => new Promise(r => setTimeout(r, ms))

// Pausa com contagem regressiva no console (usada no limite de consultas)
async function pausarComContagem(ms, motivo) {
  const fim = Date.now() + ms
  console.log(`\n⏸  ${motivo}`)
  while (Date.now() < fim) {
    const restaMin = Math.ceil((fim - Date.now()) / 60000)
    process.stdout.write(`\r   retomando em ~${restaMin} min...   `)
    await sleep(Math.min(30000, fim - Date.now()))
  }
  console.log('\n▶  retomando.\n')
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
    const soUltimaAtt = Object.keys(up).length === 1

    if (!DRY) await S.updateAIT(ait.id, up)

    itens.push({
      cliente: nomeCliente, placa: placa.placa, codigo: ait.codigo,
      tipo: achados.length === 0 ? 'nao-encontrado' : (soUltimaAtt ? 'sem-mudanca' : 'atualizado'),
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

  const { ctx, page } = await D.abrirBrowser()
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

  const fila = [...porPlaca.keys()]
  let n = 0
  let pausasLimite = 0

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
          const shot = await D.screenshotErro(page, placa.placa)
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
        // (3) limite atingido → pausa e RETENTA a mesma placa
        pausasLimite++
        if (pausasLimite > MAX_PAUSAS_LIMITE) {
          console.log('\nLimite de consultas persistente após várias pausas. Encerrando rodada.')
          marcarTodas(placa, 'limite', 'Limite persistente — placa não consultada nesta rodada')
          flush()
          await ctx.close()
          R.abrir(arqRelatorio)
          console.log(`\nRelatório parcial: ${arqRelatorio}`)
          console.log('Rode de novo mais tarde: placas já feitas saem rápido, protegidas são puladas.')
          return
        }
        await pausarComContagem(PAUSA_LIMITE_MS, `Limite de consultas do Detran atingido (pausa ${pausasLimite}/${MAX_PAUSAS_LIMITE}).`)
        // não marca resolvido → volta ao while e reconsulta a mesma placa
      } else {
        // desfecho desconhecido — guarda texto p/ refino e segue
        const shot = await D.screenshotErro(page, placa.placa)
        marcarTodas(placa, 'erro', `desfecho não reconhecido: "${desfecho.texto}" (screenshot: ${shot})`)
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
