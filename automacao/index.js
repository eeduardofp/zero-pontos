// ─── CONSULTA DE RECURSOS ────────────────────────────────────
// Uso: node index.js [--dry-run]
const S = require('./supabase.js')
const D = require('./detran.js')
const M = require('./mapeamento.js')
const R = require('./relatorio.js')

const DRY = process.argv.includes('--dry-run')
const PAUSA_ENTRE_PLACAS_MS = 3000

const STATUS_LABEL = a =>
  `DP:${a.defesa_previa || '—'} | JARI:${a.jari || '—'} | 2ª:${a.segunda_instancia || '—'}`

async function processarPlaca(page, placa, aits, itens, clientes) {
  const cliente = clientes.find(c => c.id === placa.cliente_id)
  const nomeCliente = cliente ? cliente.nome : '—'

  await D.abrirDossie(page, placa.placa, placa.renavan)

  if (await D.isPermissaoNegada(page)) {
    for (const a of aits) itens.push({ cliente: nomeCliente, placa: placa.placa, codigo: a.codigo, tipo: 'sem-permissao', detalhe: 'Cliente ainda não autorizou acesso' })
    return
  }

  const recursos = await D.todosRecursos(page)
  const precisaDebitos = recursos.some(r => {
    const m = M.mapResultado(r.resultado)
    return m && m.precisaDataLimite
  })
  const debitos = precisaDebitos ? await D.todosDebitos(page) : []

  for (const ait of aits) {
    // cards do site que citam o código desta AIT e pertencem a uma etapa da esteira
    const achados = recursos
      .filter(r => r.instancia && r.texto.includes(ait.codigo))
      .map(r => ({
        instancia: r.instancia,
        resultado: r.resultado,
        dataLimite: (debitos.find(d => d.texto.includes(ait.codigo)) || {}).data || null
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
}

async function main() {
  console.log(DRY ? '== DRY-RUN: nada será gravado ==' : '== Execução real ==')
  await S.login()
  const { aits, placas, clientes } = await S.carregarAtivas()
  console.log(`${aits.length} AITs ativas em ${new Set(aits.map(a => a.placa_id)).size} placas`)

  const porPlaca = new Map()
  for (const a of aits) {
    if (!porPlaca.has(a.placa_id)) porPlaca.set(a.placa_id, [])
    porPlaca.get(a.placa_id).push(a)
  }

  const { ctx, page } = await D.abrirBrowser()
  const itens = []
  let n = 0

  for (const [placaId, aitsDaPlaca] of porPlaca) {
    const placa = placas.find(p => p.id === placaId)
    n++
    if (!placa) {
      for (const a of aitsDaPlaca) itens.push({ codigo: a.codigo, tipo: 'erro', detalhe: 'placa não encontrada no cadastro' })
      continue
    }
    console.log(`[${n}/${porPlaca.size}] ${placa.placa}...`)
    let tentativa = 0
    while (true) {
      try {
        await processarPlaca(page, placa, aitsDaPlaca, itens, clientes)
        break
      } catch (e) {
        tentativa++
        if (tentativa > 1) {
          const shot = await D.screenshotErro(page, placa.placa)
          for (const a of aitsDaPlaca) itens.push({ placa: placa.placa, codigo: a.codigo, tipo: 'erro', detalhe: `${e.message} (screenshot: ${shot})` })
          break
        }
        console.log(`  falhou (${e.message}), tentando de novo...`)
      }
    }
    await page.waitForTimeout(PAUSA_ENTRE_PLACAS_MS)
  }

  await ctx.close()
  const arq = R.gerar(itens, DRY)
  R.abrir(arq)
  console.log(`\nRelatório: ${arq}`)
}

main().catch(e => { console.error(e); process.exit(1) })
